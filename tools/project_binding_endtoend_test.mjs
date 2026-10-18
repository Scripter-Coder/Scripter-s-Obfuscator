// A key bound to a project must open exactly that project's scripts.
//
// THE BUG THE OWNER REPORTED
//
//     "from users keys the user key from project the script itself doesnt
//      accept that key"
//
// THE MECHANISM (three defects, all confirmed against the real worker)
//
// 1. STALE PROJECT ON RE-UPLOAD. confirmEditScript re-publishes through
//    shUploadLoader but never set window.__shUploadProject, so it inherited
//    whatever the last CREATE had left there. The worker replaces
//    sh_meta_<loaderId> wholesale on every upload, so the edit restamped the
//    script with a DIFFERENT project's id. A key bound to the real project was
//    then refused.
//
// 2. FAIL-OPEN WHEN ABSENT. With the global undefined, projectId was written as
//    '' and classifyLicense's check requires a non-empty `asked`, so the binding
//    silently did nothing. The panel shows a project column and the binding does
//    not exist - worse than refusing.
//
// 3. UNREADABLE DENIAL. The project case had no branch in the loader's message
//    table, so it fell through to `return "Denied: "..r` and printed the literal
//    internal code to the user.
//
// WHAT THIS ASSERTS
//
// The GATE behaviour is exercised against the real worker routes - a key bound
// to a project opens that project's script, and is refused for another. The
// CLIENT behaviour (that every upload path sets its own project) is asserted by
// source inspection, because that is where the defect was.
//
// Run: node tools/project_binding_endtoend_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = (await import(new URL('../For Cloudflare/worker.js', import.meta.url))).default;
const mainSrc = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        async list(opts = {}) {
            const prefix = String(opts.prefix || '');
            const limit = Math.max(1, Number(opts.limit) || 1000);
            const names = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
            const from = opts.cursor ? Math.max(0, names.indexOf(String(opts.cursor))) : 0;
            const slice = names.slice(from, from + limit);
            const next = from + limit;
            return { keys: slice.map(name => ({ name })), list_complete: next >= names.length, cursor: next >= names.length ? null : names[next] };
        },
        _store: store,
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}
async function call(env, method, path, body, headers = {}) {
    const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
        method, headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    }), env, { waitUntil() { } });
    const text = await res.text();
    return { status: res.status, text, _json: (() => { try { return JSON.parse(text); } catch { return {}; } })() };
}

console.log('[PB] a project-bound key opens only that project');
console.log('-'.repeat(72));

// --- the gate, against the real worker -------------------------------------
console.log('');
console.log('the gate distinguishes its own project from another');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev',
        SH_SESSION_SECRET: 's', SH_DB: makeD1(),
    };

    const ID = 'ScripterHub1000000001';
    // the script's own project
    KV._store.set('sh_meta_' + ID, JSON.stringify({
        name: 'gated', user: 'owner', at: Date.now(), authRequired: true,
        visibility: 'anyone', projectId: 'proj_AAA', projectName: 'Alpha',
    }));
    // a key bound to proj_AAA
    KV._store.set('sh_licenses', JSON.stringify({
        KEYALPHA: { hwid: '', expiresAt: 0, banned: false, scriptId: 'all', projectId: 'proj_AAA', projectName: 'Alpha', executions: 0 },
    }));

    // /sh/auth is executor-facing: it refuses anything without an executor UA
    // (worker.js EXECUTOR_UA check), which answers 405 before it ever looks at a
    // key. Without the right UA this test was asserting against a route that had
    // already said no.
    const EXEC = { 'User-Agent': 'Roblox/570 Delta Executor' };

    // 1. the right key for the right script is accepted
    const goodAuth = await call(env, 'GET', '/sh/auth/' + ID + '?k=KEYALPHA&h=HW1&t=' + Date.now(), null, EXEC);
    check('a key bound to the script\'s own project is accepted',
        !/SHERR/.test(goodAuth.text), goodAuth.text.slice(0, 120));

    // 2. a key bound to ANOTHER project is refused, and refused specifically
    KV._store.set('sh_licenses', JSON.stringify({
        KEYALPHA: { hwid: '', expiresAt: 0, banned: false, scriptId: 'all', projectId: 'proj_AAA', projectName: 'Alpha', executions: 0 },
        KEYBETA: { hwid: '', expiresAt: 0, banned: false, scriptId: 'all', projectId: 'proj_BBB', projectName: 'Beta', executions: 0 },
    }));
    const wrongAuth = await call(env, 'GET', '/sh/auth/' + ID + '?k=KEYBETA&h=HW1&t=' + Date.now(), null, EXEC);
    check('a key bound to a DIFFERENT project is refused',
        /SHERR/.test(wrongAuth.text), wrongAuth.text.slice(0, 120));
    check('and it is refused as a project mismatch, not as an invalid key',
        /project/.test(wrongAuth.text), 'got: ' + wrongAuth.text.slice(0, 80));
}

// --- the loader message -------------------------------------------------
console.log('');
console.log('the user is told what is actually wrong');
{
    const loader = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');
    const hasProjectMsg = /r==\\"project\\" then return/.test(loader) || /r=="project" then return/.test(loader);
    check('the loader has a message for a project mismatch', hasProjectMsg,
        'it falls through to the generic "Denied: " line, printing an internal code');
    check('that message is actionable',
        /different project/i.test(loader), 'no mention of the project mismatch in the loader text');
    // the generic fall-through must still exist for unknown codes
    check('the generic fall-through is still there for other codes',
        /return "Denied: "\.\.r/.test(loader));
}

// --- the client: every upload path sets its own project --------------------
console.log('');
console.log('every upload path sets its own project');
{
    // Find the three shUploadLoader call sites and the project assignment that
    // must immediately precede each. A call that does not set it inherits
    // whatever ran before - that is the whole defect.
    const callSites = [];
    const lines = mainSrc.split('\n');
    lines.forEach((l, i) => {
        if (/^\s*shUploadLoader\(/.test(l)) callSites.push(i);
    });
    check('all three upload call sites were found', callSites.length === 3, callSites.length + ' found');

    for (const idx of callSites) {
        // look back up to 30 lines for an assignment to __shUploadProject
        const window = lines.slice(Math.max(0, idx - 30), idx + 1).join('\n');
        const sets = /window\.__shUploadProject\s*=/.test(window);
        check('the upload at main.js:' + (idx + 1) + ' sets its project first', sets,
            'it inherits __shUploadProject from an earlier call in the session');
    }

    check('the create path sets it from the real project object',
        /window\.__shUploadProject\s*=\s*\{\s*id:\s*projectId,\s*name:\s*projects\[projectIndex\]\.name\s*\}/.test(mainSrc));
    check('the generate-loadstring path no longer reads an undeclared `project`',
        !/\(project && project\.name\)/.test(mainSrc),
        '`project` is not in scope there - it threw ReferenceError before uploading');
    check('the edit path sets it too',
        /editProjectName/.test(mainSrc), 'the re-upload path still inherits a stale project');
}

// --- the worker writes the meta ------------------------------------------
console.log('');
console.log('the worker stores what it is given');
{
    const workerSrc = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');
    check('the upload route writes projectId into the script meta',
        /projectId: String\(body\.projectId/.test(workerSrc));
    // The call contains a nested call, so [^)]* would stop at Date.now( and
    // miss the argument that matters. Match across the whole call instead.
    check('and the gate reads the project from that meta',
        /classifyLicense\(lic\[key\][\s\S]{0,80}meta\.projectId/.test(workerSrc),
        'the /sh/auth gate does not pass the script meta projectId to classifyLicense');
}

console.log('');
console.log('PROJECT BINDING   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);