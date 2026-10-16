// Proves the Add User / createKey sync actually reports failure.
//
// Reported: "when creating script that has key system and if you generate by
// using Add User button it doesnt work" - and then, precisely, "Key is created
// but the script rejects it".
//
// /sh/auth resolves a key out of the worker's sh_licenses map. A key that only
// exists in the owner's localStorage resolves to nothing, and the executor is
// told `SHERR invalid`. So the question is not "does the key appear in the
// list" - it always did - it is whether the owner is told the truth about
// whether the server has it.
//
// It was not. saveKeys() fired shSyncLicenses() without awaiting it, inside a
// try/catch that cannot catch an async rejection, and returned nothing. Both
// key-creating paths then showed a success notification immediately.
//
// These checks drive the real functions out of main.js and assert on what the
// owner is told, with the sync succeeding and with it failing.
//
// Run: node tools/license_sync_test.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// Pull the three functions under test out of main.js verbatim, so this test
// cannot drift from the source it is about.
function grab(name) {
    const lines = main.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => new RegExp('^(async )?function ' + name + '\\b').test(l));
    if (start < 0) throw new Error('cannot find ' + name + ' in main.js');
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) if (lines[i] === '}') { end = i; break; }
    if (end < 0) throw new Error('cannot find the end of ' + name);
    return lines.slice(start, end + 1).join('\n');
}

// loadKeys is included because shSyncLicenses calls it, and its try/catch turns
// a missing binding into { ok:false, error:'network' } - which looked exactly
// like a server refusal for the first two runs of this test.
const SRC = [grab('saveKeys'), grab('shSyncLicenses'), grab('loadKeys'), grab('normalizeKey')].join('\n');

// Build a sandbox in which saveKeys() can be driven.
// owner defaults to TRUE. Without the default, every harness that did not
// explicitly ask for a non-owner got a non-owner account - so "a refused sync
// is reported as not ok" was silently testing the skipped path instead. The
// failure read as a product bug when it was the harness.
function harness({ syncResult, syncThrows, owner = true }) {
    const store = {};
    const shown = [];
    const sb = {
        console,
        localStorage: {
            _d: store,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
            setItem(k, v) { this._d[k] = String(v); }
        },
        currentUser: owner ? { id: 'u1', username: 'Scripter', isAdmin: true } : { id: 'u2', username: 'Someone', isAdmin: false },
        shOwnerToken: () => 'CODE',
        shOwnerApi: async (p, body) => {
            if (syncThrows) throw new Error('network down');
            return syncResult;
        },
        showNotification: (t, m) => shown.push({ title: t, msg: m }),
        Promise, JSON, Object, String, Number, Math
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'main.js#subset' });
    return { sb, store, shown };
}

const keyList = () => ({ keys: [{ key: 'K' + 'x'.repeat(180), hwid: '', expires: null }], used: 0 });

// ---------------------------------------------------------------------------
console.log('saveKeys reports what the license server actually did');
// ---------------------------------------------------------------------------
{
    const h = harness({ syncResult: { ok: true, count: 1 } });
    const r = await h.sb.saveKeys(keyList());
    check('a successful sync is reported as ok', r && r.ok === true, JSON.stringify(r));
}
{
    const h = harness({ syncResult: { ok: false, error: 'network' } });
    const r = await h.sb.saveKeys(keyList());
    check('a REFUSED sync is reported as not ok', r && r.ok === false,
        'got ' + JSON.stringify(r) + ' - this is the Add User bug: success was claimed regardless');
}
{
    // The old shape: a rejected promise inside a try/catch that never awaits.
    // Reproduced to show the difference is observable, not theoretical.
    const h = harness({ syncThrows: true });
    const r = await h.sb.saveKeys(keyList());
    check('a THROWN sync is reported as not ok, not as a rejection that escapes',
        r && r.ok === false, JSON.stringify(r));
}
{
    const h = harness({ syncResult: { ok: true }, owner: false });
    const r = await h.sb.saveKeys(keyList());
    check('a non-owner account is reported as skipped, not as failed',
        r && r.skipped === true && r.ok === true,
        'these are different problems: "not applicable" vs "try again", and conflating them sends people to debug the wrong thing');
}

// ---------------------------------------------------------------------------
console.log('the local key list is still written when the server refuses');
// ---------------------------------------------------------------------------
{
    // Rolling the local write back would destroy the owner's whole key list
    // because of a network blip. A stale list is recoverable; a lost one is not.
    const h = harness({ syncResult: { ok: false, error: 'network' } });
    await h.sb.saveKeys(keyList());
    check('the key is still saved locally', !!h.store['keys_u1'],
        'store = ' + JSON.stringify(Object.keys(h.store)));
}

// ---------------------------------------------------------------------------
console.log('the sync sends scriptId, so the worker stops blanking it');
// ---------------------------------------------------------------------------
{
    const h = harness({ syncResult: { ok: true, count: 1 } });
    let sent = null;
    h.sb.shOwnerApi = async (p, body) => { sent = { p, body }; return { ok: true }; };
    await h.sb.saveKeys({ keys: [{ key: 'ABC', scriptId: 'ScripterHub123456', hwid: 'HW', expires: 123 }], used: 0 });
    check('the licenses payload reaches /sh/licenses', sent && sent.p === 'sh/licenses', JSON.stringify(sent && sent.p));
    const rec = sent && sent.body && sent.body.licenses && sent.body.licenses.ABC;
    check('the record carries scriptId', rec && rec.scriptId === 'ScripterHub123456',
        'record = ' + JSON.stringify(rec));
    check('the record still carries the other fields', rec && rec.hwid === 'HW' && rec.expiresAt === 123,
        'record = ' + JSON.stringify(rec));
}

// ---------------------------------------------------------------------------
console.log('the key-creating paths wait for the sync and say so');
// ---------------------------------------------------------------------------
{
    const norm = main.replace(/\r\n/g, '\n');
    // Extract the WHOLE function rather than a fixed character window.
    //
    // The window was 2600 chars, and adding a project picker to this
    // function pushed 'NOT Synced' past it - so the check failed on
    // correct code. A fixed window is a test that fails whenever the
    // function grows, which is a test that fails for reasons unrelated to
    // what it checks.
    function grabFn(name) {
        const start = norm.indexOf('async function ' + name);
        if (start < 0) return '';
        const close = norm.indexOf('\n}', start);
        return close < 0 ? norm.slice(start, start + 8000) : norm.slice(start, close + 2);
    }
    const addUser = grabFn('confirmAddUserUI');

    check('Add User awaits the sync', /await saveKeys\(/.test(addUser),
        'without an await it cannot know whether the server has the key');
    check('and does not claim success unconditionally',
        !/saveNotificationSave/.test(addUser) && addUser.includes('NOT Synced'),
        'the success notification must be conditional on the sync result');
    check('a local-only key says so', addUser.includes('Local Only'));

    const ck = grabFn('createKey');
    check('createKey awaits the sync too', /await saveKeys\(/.test(ck));
    check('and distinguishes local-only from failed', ck.includes('Local Only') && ck.includes('NOT Synced'));
}

console.log();
console.log('LICENSE SYNC   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);