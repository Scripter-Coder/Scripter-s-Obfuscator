// The client's UPLOAD path must run, not merely look right.
//
// THE BUG
//
//     ReferenceError: approxBody is not defined
//
// A size check in shUploadLoader was rewritten - the keeper's part-count
// ceiling became the worker's request-body limit - and the line that COMPUTED
// the number was left behind in the rewrite. The check survived; its input did
// not.
//
// The result was that EVERY publish threw, in every browser, on every script.
// The panel caught the throw and reported it as:
//
//     Loadstring Warning: Hidden host upload failed: approxBody is not
//     defined (deploy the worker + KV first)
//
// which blames the deployment for a fault in this file. The script itself was
// created and saved, so the panel said "Script created" - and the loadstring,
// the thing the user came for, never existed. Reported as "obfuscation does
// not work", because from the panel there is no way to tell that the build
// succeeded and the PUBLISH failed.
//
// WHY A STATIC CHECK WAS NOT ENOUGH
//
// Every test in this repo checked the client by reading its source. A deleted
// variable and a reference to it both look fine in source: there is no
// "approxBody is defined here" to grep for, and the reference is perfectly
// valid JavaScript that throws only when it executes.
//
// So this test EXECUTES the function. It lifts shUploadLoader out of main.js
// and calls it with stubbed collaborators, and asserts that it reaches the
// worker with a real payload.
//
// A dangling reference in the upload path now fails the suite.
//
// Run: node tools/upload_path_test.mjs

import fs from 'node:fs';

const src = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

console.log('[UP] the client upload path RUNS');
console.log('-'.repeat(72));

// --- lift the function ------------------------------------------------------
const lifted = src.match(/async function shUploadLoader\([\s\S]*?\n\}\r?\n/);
if (!lifted) {
    check('shUploadLoader is present in main.js', false);
    console.log('\nUPLOAD PATH   ' + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
}
check('shUploadLoader is present in main.js', true);

// --- the collaborators it needs, stubbed ------------------------------------
//
// Every dependency is a name the function body refers to. They are passed in
// as parameters of the generated function, so an unstubbed dependency is a
// ReferenceError too - which is the point: if the body grows a new
// dependency and this test is not updated, it fails loudly instead of
// silently publishing nothing.
//
// The NAMES and the VALUES are listed as one ordered array, on purpose. Passing
// the values in the order of Object.keys() and the names in a different order
// is a silent mis-wiring: the function still runs, it just calls the wrong
// things, and the failure looks like a product bug.
const STUBS = [
    ['shRateGuard', () => false],
    ['SH_RATE', { upload: { max: 99, window: 60 } }],
    ['shGetRawToken', () => 'owner-token'],
    ['shEnsureUserToken', async () => 'user-token'],
    ['shEnsureUserTokenReason', ''],
    ['currentUser', { username: 'tester', email: 'tester@example.com' }],
    ['shLoginRaw', async () => true],
    ['shClearUserToken', () => {}],
    ['shEncryptPayload', (code, key) => { encryptCalls++; return 'CIPHER:' + key + ':' + String(code).length; }],
    ['shServerVisibility', () => 'anyone'],
    ['shApi', async (endpoint, body) => { sent = { endpoint, body }; return { ok: true, id: 'ScripterHub0000000001', loadstring: 'loadstring' }; }],
    ['sessionStorage', { removeItem: () => {} }],
    ['window', { __shUploadProject: { id: 'proj_1', name: 'Probe' } }],
    ['crypto', globalThis.crypto],
];

let sent = null;
let encryptCalls = 0;

const shUploadLoader = new Function(
    STUBS.map(s => s[0]).join(', '),
    lifted[0] + '; return shUploadLoader;'
)(...STUBS.map(s => s[1]));

// --- run it -----------------------------------------------------------------
const CODE = 'print("hello")';
const KEY = '0123456789abcdef';

async function upload(opts = {}) {
    sent = null;
    encryptCalls = 0;
    const res = await shUploadLoader(
        'MyScript', 'tester',
        { code: CODE, splitKey: { paddedKey: [1, 2, 3], t0: 1700000000, chk: 42 }, wantId: 'ScripterHub0000000001' },
        'print("hello")', KEY, '', true, false
    );
    return { res, sent, encryptCalls };
}

let out;
try {
    out = await upload();
    check('the upload does not throw', true);
} catch (e) {
    // A thrown error here IS the bug this file exists for. The function has its
    // own try/catch, so an exception escaping it means the catch itself was
    // broken - and a ReferenceError inside it is returned as {ok:false} instead,
    // which is checked below.
    check('the upload does not throw', false, String((e && e.message) || e));
    out = { res: { ok: false, error: String((e && e.message) || e) }, sent: null, encryptCalls: 0 };
}

check('the upload SUCCEEDS', out.res && out.res.ok === true,
    out.res && out.res.error ? out.res.error : 'no result');

check('it reached the worker', !!out.sent, 'nothing was sent');
check('it posted to the upload endpoint', out.sent && out.sent.endpoint === 'sh/upload',
    out.sent && out.sent.endpoint);

// --- the payload ------------------------------------------------------------
if (out.sent) {
    const p = out.sent.body;
    check('the payload carries the obfuscated source', p.plainCode === CODE);
    check('the payload carries the encrypted browser view', typeof p.cipher === 'string' && p.cipher.length > 0);
    check('the payload carries the split key', !!(p.splitKey && p.splitKey.paddedKey && p.splitKey.paddedKey.length));
    check('the payload carries the script id', p.wantId === 'ScripterHub0000000001');
    check('the payload carries the keyless flag', p.keyless === true);
    check('the Special Key was used to encrypt', encryptCalls === 1, 'encryptCalls=' + encryptCalls);
}

// --- the project binding, on the path it exists for --------------------------
//
// The project travels on a KEYED upload, because that is the only kind of
// script a license can open. A keyless script has no licence, so there is
// nothing for a project to bind - and the worker stores an empty projectId for
// it, which is correct.
console.log('');
console.log('a keyed upload carries the project a license binds to');
{
    let keyed = null;
    try {
        keyed = await shUploadLoader(
            'KeyedScript', 'tester',
            { code: CODE, splitKey: { paddedKey: [1, 2, 3], t0: 1700000000, chk: 42 }, wantId: 'ScripterHub0000000002' },
            'print("hello")', KEY, '', false, true
        );
        check('the keyed upload succeeds', keyed && keyed.ok === true, keyed && keyed.error);
    } catch (e) {
        check('the keyed upload succeeds', false, String((e && e.message) || e));
    }
    if (sent && sent.body) {
        check('it carries the project id', sent.body.projectId === 'proj_1',
            'a license bound to a project has nothing to compare against without it');
        check('it carries the project name', sent.body.projectName === 'Probe');
        check('it says the key is required', sent.body.authRequired === true);
        check('and it is not keyless', sent.body.keyless === undefined);
    }
}

// --- the size check, which is where the bug was -----------------------------
console.log('');
console.log('the size check has the number it measures');
{
    // The check itself, lifted and run on its own, so a dangling reference is
    // reported as exactly that rather than as "the upload failed".
    const body = src.match(/const approxBody = [\s\S]*?\n\s*\};/);
    check('the size is computed from the payload', !!body,
        'the line that computes approxBody is missing - the check that uses it throws');

    // And the check must actually reject something enormous.
    check('the ceiling is declared before it is used',
        /var SH_BODY_CAP = 68 \* 1000 \* 1000;/.test(src) &&
        src.indexOf('var SH_BODY_CAP') < src.indexOf('if (approxBody > SH_BODY_CAP)'));
}

// --- the message the user sees ----------------------------------------------
console.log('');
console.log('a publish failure names the real cause');
{
    // The old text blamed the deployment for a fault in the browser, and
    // called the upload a "Hidden host upload" - a name for a component that
    // no longer exists.
    //
    // Checked against the CODE, not the source: main.js deliberately quotes
    // the old message in a comment, because the comment records why it
    // changed. A grep over the raw file cannot tell that apart from the
    // message itself.
    const code = src
        .split('\n')
        .filter(line => !/^\s*\/\//.test(line))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    check('it does not blame the deployment', !/deploy the worker \+ KV first/.test(code),
        'a browser-side fault is reported as a deployment fault');
    check('it does not say "Hidden host upload"', !/Hidden host upload failed/.test(code));
    check('it says the script was saved but not published', /Publish Failed/.test(code) && /was created and saved, but its loadstring was not published/.test(code));
}

// --- the OBFUSCATION path, run too ------------------------------------------
//
// The same class of fault, one step earlier: a reference to something that no
// longer exists, in the function that builds the script. A broken build is
// reported as "obfuscation does not work", which is what the owner said, and
// the error was never shown because the panel had already saved the script.
//
// obfuscateScriptCode is the function every create/edit/re-generate path goes
// through, so running it covers all of them.
console.log('');
console.log('the OBFUSCATION path RUNS');
{
    const obf = src.match(/function obfuscateScriptCode\([\s\S]*?\n\}\r?\n/);
    check('obfuscateScriptCode is present in main.js', !!obf);
    if (obf) {
        const OBF_STUBS = [
            ['shServerKeyOpts', (keyless, wantId) => ({ serverKey: { keyUrl: 'https://x/sh/k', scriptRef: wantId } })],
            ['shNewScriptId', () => 'ScripterHub0000000009'],
            ['shObfuscateInWorker', async (code, engine, opts) => ({
                result: 'OBFUSCATED:' + code.length,
                dbgInfo: { splitKey: { paddedKey: [1, 2, 3], t0: 1, chk: 2 } },
            })],
            ['shShowVMFallbackNotice', () => {}],
            ['shAegis', async () => 'aegis'],
            ['showNotification', () => {}],
            ['applyCustomObfuscator', () => 'direct'],
        ];
        const obfuscateScriptCode = new Function(
            OBF_STUBS.map(s => s[0]).join(', '),
            obf[0] + '; return obfuscateScriptCode;'
        )(...OBF_STUBS.map(s => s[1]));

        let res = null, err = null;
        try {
            res = await obfuscateScriptCode('print("hello")', 'default', { keyless: true, scriptName: 'probe' });
        } catch (e) { err = e; }
        check('it does not throw', !err, err && String((err && err.message) || err));
        check('it resolves with the built script', !!res, 'nothing was resolved');
        check('the result carries the obfuscated code', !!(res && res.code && res.code.startsWith('OBFUSCATED:')), res && JSON.stringify(res).slice(0, 80));
        check('and the split key the upload needs', !!(res && res.splitKey && res.splitKey.paddedKey));
        check('and the script id the key is bound to', !!(res && res.wantId === 'ScripterHub0000000009'));
    }
}

console.log('');
console.log('UPLOAD PATH   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);