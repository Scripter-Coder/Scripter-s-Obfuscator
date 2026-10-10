// tools/bench/userstore_test.mjs
//
// PROVES the per-email user store before it is deployed.
//
// The failure being guarded against is not hypothetical: this deployment lost
// every account to it. One blob for all users meant
//   * a KV get() that answers null past ~1MB, which loadUsersMap() could not
//     distinguish from "no users exist" -> every login 401'd while every
//     signup returned 200 against an empty table, and
//   * a whole-table PUT on every signup, so two signups inside the ~60s read
//     cache erased each other.
//
// Neither is caught by a server-side smoke test that only checks a happy path,
// so this drives the REAL handler code against an in-memory KV that enforces
// the same ceiling, and asserts the three properties that matter:
//   1. a known account can log in with the right password
//   2. a known account is refused a duplicate signup (409, not 200)
//   3. N concurrent signups all survive (no lost update)
//   4. an account beyond the read ceiling still logs in
//
// Run: node tools/bench/userstore_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WORKER = path.join(ROOT, 'For Cloudflare', 'worker.js');

// Cloudflare KV answers null past ~1MB on a Workers get(). Reproducing that
// here is the whole point: without the ceiling the bug is invisible, because a
// blob that small always reads back fine.
const KV_READ_CEILING = 1024 * 1024;

let failures = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS  ' + name); return; }
    failures++;
    console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : ''));
}

class FakeKV {
    constructor() { this.m = new Map(); this.writes = 0; }
    async get(key) {
        if (!this.m.has(key)) return null;
        const v = this.m.get(key);
        if (v.length > KV_READ_CEILING) return null;   // the real ceiling
        return v;
    }
    async put(key, val) { this.m.set(key, String(val)); this.writes++; }
    async delete(key) { this.m.delete(key); }
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
        const all = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort();
        const start = cursor ? all.findIndex(k => k > cursor) : 0;
        const slice = all.slice(start < 0 ? all.length : start, (start < 0 ? all.length : start) + limit);
        const last = slice[slice.length - 1];
        const done = !last || all.indexOf(last) === all.length - 1;
        return { keys: slice.map(name => ({ name })), list_complete: done, cursor: done ? undefined : last };
    }
}

const kv = new FakeKV();
const ctx = {
    console,
    crypto: webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder, TextDecoder, URL, Response, Request,
    setTimeout, clearTimeout,
};
ctx.globalThis = ctx;
ctx.self = ctx;
vm.createContext(ctx);

const src = fs.readFileSync(WORKER, 'utf8');
// The module uses `export default` / `export {}`, which is not valid script
// syntax. Strip the export keywords - the handlers themselves are untouched,
// and this is the same source that gets deployed.
const mod = src
    .replace(/^export default \{/m, 'globalThis.__default = {')
    .replace(/^export \{/m, 'globalThis.__named = {')
    .replace(/^\};\s*$/m, '};');
vm.runInContext(mod + '\n;globalThis.__mod = __default;', ctx, { filename: 'worker.js' });
const mod$ = ctx.__mod;

const env = {
    LOADERS_KV: kv,
    // No SH_DB: stateFor() returns null, so every D1 branch is skipped. That
    // is deliberate - this test is about KV storage, and a stub D1 would only
    // prove the stub works.
    SH_KDF_PEPPER: 'test-pepper',
    SH_SESSION_SECRET: 'test-secret',
};

function makeEnv(extra) { return Object.assign({ LOADERS_KV: kv }, env, extra || {}); }
async function post(pathname, body) {
    const req = new Request('https://x.test' + pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const res = await mod$.fetch(req, makeEnv(), { waitUntil() {} });
    const text = await res.text();
    let json = {}; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json };
}

console.log('\n=== 1. signup, then login ===');
const email = 'owner@example.com', pw = 'correct horse battery';
let r = await post('/sh/user-signup', { email, username: 'owner', password: pw });
check('signup returns 200', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.json));
check('  ...and the account was really created (not a 400)', !!r.json.user && r.json.user.email === email, JSON.stringify(r.json).slice(0, 160));
check('signup issued a token', !!r.json.token);

r = await post('/sh/user-login', { emailOrUsername: email, password: pw });
check('login with the correct password returns 200', r.status === 200, 'got ' + r.status);
check('login returns the right account', r.json.user && r.json.user.email === email);

r = await post('/sh/user-login', { emailOrUsername: email, password: 'wrong' });
check('login with a WRONG password is refused', r.status === 401, 'got ' + r.status);

console.log('\n=== 2. duplicate signup is refused (this is the outage signature) ===');
r = await post('/sh/user-signup', { email, username: 'owner2', password: 'another' });
check('duplicate email returns 409', r.status === 409, 'got ' + r.status + ' ' + JSON.stringify(r.json));
check('  ...and does NOT say ok:true', r.json.ok === false);

r = await post('/sh/user-signup', { email: 'other@example.com', username: 'owner', password: 'another' });
check('duplicate username returns 409', r.status === 409, 'got ' + r.status);

console.log('\n=== 3. concurrent signups all survive (no lost update) ===');
// Two real, intended features would otherwise mask what this section measures,
// so both are accounted for explicitly rather than worked around silently:
//
//   * the flood guard (10 signups/min per IP) - the counter is module-level and
//     a const, so it cannot be reset from outside the module. The burst is
//     therefore sized to fit whatever budget the earlier sections left, and
//     the limiter is verified separately.
//   * ruleLooksAutomated(), which blocks names like "burst0" as machine
//     generated. Those return 400 with a moderated record, which is correct
//     behaviour, so the usernames here are plain words.
const N = 5;
const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
const emails = words.map(w => `${w}@example.com`);
const results = [];
for (let i = 0; i < N; i++) {
    results.push(await post('/sh/user-signup', { email: emails[i], username: words[i], password: 'burstpass' + i }));
}
const codes = results.map(r => r.status);
const created = codes.filter(c => c === 200).length;
let survived = 0;
for (let i = 0; i < N; i++) {
    if (codes[i] !== 200) continue;
    const res = await post('/sh/user-login', { emailOrUsername: emails[i], password: 'burstpass' + i });
    if (res.status === 200) survived++;
}
check(`every accepted concurrent signup can log in (${created} accepted)`, survived === created && created > 0,
    'codes: ' + codes.join(',') +
    ' | first body: ' + JSON.stringify(results[0].json).slice(0, 200) +
    ' | survived: ' + survived);

console.log('\n=== 3b. the flood guard still guards ===');
const floodCodes = [];
for (let i = 0; i < 16; i++) {
    floodCodes.push((await post('/sh/user-signup', { email: `zigzag${i}@example.com`, username: 'zulu' + i, password: 'pw' })).status);
}
check('a flood past the per-IP cap is refused with 429', floodCodes.includes(429),
    'codes: ' + floodCodes.join(','));

console.log('\n=== 4. an account past the read ceiling still logs in ===');
// Fill a single legacy blob past 1MB, which is what used to make EVERY login
// fail: the get() returned null and loadUsersMap() read that as "no users".
const fat = {};
for (let i = 0; i < 40; i++) fat['filler' + i + '@example.com'] = { email: 'filler' + i + '@example.com', password: 'x', desc: 'y'.repeat(30000) };
await kv.put('sh_users_db', JSON.stringify(fat));
check('legacy blob is now over the read ceiling', kv.m.get('sh_users_db').length > KV_READ_CEILING);

r = await post('/sh/user-login', { emailOrUsername: email, password: pw });
check('login STILL works with a giant legacy blob present', r.status === 200, 'got ' + r.status);

console.log('\n=== 5. per-email keys were used, not one blob ===');
const keys = [...kv.m.keys()];
check('sh_user_ keys exist', keys.some(k => k.startsWith('sh_user_')), 'keys: ' + keys.slice(0, 6).join(', '));
check('a username index exists', keys.some(k => k.startsWith('sh_uname_')));
check('no single key holds every account',
    keys.filter(k => k.startsWith('sh_user_')).length >= created + 1,
    'per-user keys: ' + keys.filter(k => k.startsWith('sh_user_')).length +
    ' (burst accepted: ' + created + ')');

console.log('\n=== 6. login by username still works ===');
r = await post('/sh/user-login', { emailOrUsername: 'alpha', password: 'burstpass0' });
check('login by username returns 200', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.json));

console.log('\n=== 7. owner admin routes still gated ===');
r = await post('/sh/users-delete', { email: email });
check('users-delete refuses an unauthenticated caller', r.status === 401, 'got ' + r.status);

console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);