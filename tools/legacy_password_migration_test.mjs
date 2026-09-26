// Legacy btoa() -> PBKDF2 migration, end to end.
//
// The claim under test: for an EXISTING account whose stored credential is
// still legacy base64, a successful login transparently replaces that record
// with a PBKDF2 hash, and the old value is GONE rather than shadowed.
//
// The failure this guards against is subtle and easy to ship by accident: an
// implementation that writes the new hash to a new field while leaving
// `password` holding the base64, which would look migrated while the
// credential is still fully recoverable from the database.

import assert from 'assert';

const workerSrc = await import('../For Cloudflare/worker.js');
const worker = workerSrc.default;

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        _store: store
    };
}
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

async function call(env, method, path, body, ip) {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA };
    if (ip) headers['CF-Connecting-IP'] = ip;
    const r = await worker.fetch(new Request('https://t.workers.dev' + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined
    }), env, { waitUntil() {} });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
    return { status: r.status, ...json };
}

function readRec(env, email) {
    const raw = env.LOADERS_KV._store.get('sh_users_db');
    if (!raw) return null;
    return JSON.parse(raw)[email] || null;
}

let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  OK   ' + name); }
function bad(name, why) { fail++; console.log('  FAIL ' + name + '\n         ' + why); }

// ---------------------------------------------------------------------------
console.log('[M1] a legacy btoa record is replaced in place on successful login...');
{
    const env = { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper' };
    const EMAIL = 'legacy@t.com', PW = 'legacyPass123';

    // Seed exactly what the pre-Phase-1 worker wrote.
    const map = { [EMAIL]: { id: 'user_legacy', email: EMAIL, username: 'Legacy', password: b64(PW), plan: 'Basic', createdAt: new Date().toISOString(), stats: { projects: { used: 0, max: 1 } } } };
    env.LOADERS_KV._store.set('sh_users_db', JSON.stringify(map));

    // Sanity: the credential really is recoverable BEFORE the migration.
    const before = readRec(env, EMAIL).password;
    if (before === b64(PW)) ok('precondition: the seeded record is legacy base64 (recoverable)');
    else bad('precondition', 'the seed is not legacy base64, so this test proves nothing');

    const li = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: PW }, '198.51.100.1');
    if (li.ok && li.token) ok('the correct password still authenticates'); else bad('login', 'login failed: ' + JSON.stringify(li).slice(0, 120));

    const after = readRec(env, EMAIL);
    const stored = String(after.password);
    if (/^pbkdf2\$\d+\$/.test(stored)) ok('the record now holds a PBKDF2 hash');
    else bad('rehash', 'stored value is not a PBKDF2 record: ' + stored.slice(0, 40));

    // THE POINT: the legacy value must be gone, not shadowed.
    const raw = env.LOADERS_KV._store.get('sh_users_db');
    if (!raw.includes(b64(PW))) ok('the legacy base64 value is GONE from storage (not shadowed)');
    else bad('shadowing', 'the legacy base64 value is still present in the users map');

    if (!JSON.stringify(after).includes(PW)) ok('the plaintext password appears nowhere in the record');
    else bad('plaintext', 'the plaintext password is present in the stored record');
}

// ---------------------------------------------------------------------------
console.log('[M2] a WRONG password must not trigger the migration...');
{
    const env = { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper' };
    const EMAIL = 'legacy2@t.com', PW = 'correctPass123';
    const map = { [EMAIL]: { id: 'u2', email: EMAIL, username: 'L2', password: b64(PW), plan: 'Basic', createdAt: new Date().toISOString() } };
    env.LOADERS_KV._store.set('sh_users_db', JSON.stringify(map));

    const li = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: 'wrongPass123' }, '198.51.100.2');
    if (!li.ok) ok('a wrong password is rejected'); else bad('auth', 'a wrong password was accepted');
    const stored = String(readRec(env, EMAIL).password);
    if (stored === b64(PW)) ok('a failed attempt does NOT upgrade the record');
    else bad('upgrade-on-failure', 'the record was rewritten by a failed login attempt');
}

// ---------------------------------------------------------------------------
console.log('[M3] the migrated account still works on subsequent logins...');
{
    const env = { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper' };
    const EMAIL = 'legacy3@t.com', PW = 'thirdPass123';
    const map = { [EMAIL]: { id: 'u3', email: EMAIL, username: 'L3', password: b64(PW), plan: 'Basic', createdAt: new Date().toISOString() } };
    env.LOADERS_KV._store.set('sh_users_db', JSON.stringify(map));

    await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: PW }, '198.51.100.3');
    const second = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: PW }, '198.51.100.3');
    if (second.ok && second.token) ok('the second login (now against PBKDF2) succeeds'); else bad('second login', 'second login failed: ' + JSON.stringify(second).slice(0, 120));

    const third = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: 'nope12345' }, '198.51.100.3');
    if (!third.ok) ok('a wrong password is still rejected after migration');
    else bad('post-migration auth', 'a wrong password was accepted after migration');

    const raw = env.LOADERS_KV._store.get('sh_users_db');
    if (!raw.includes(b64(PW))) ok('the legacy value never reappears');
    else bad('resurrect', 'the legacy base64 value reappeared in storage');
}

// ---------------------------------------------------------------------------
console.log('[M4] the other password-gated routes migrate too...');
{
    for (const route of ['/sh/user-get', '/sh/user-sync']) {
        const env = { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper' };
        const EMAIL = 'lg' + route.replace(/\W/g, '') + '@t.com', PW = 'routePass123';
        const map = { [EMAIL]: { id: 'u4', email: EMAIL, username: 'L4', password: b64(PW), plan: 'Basic', createdAt: new Date().toISOString() } };
        env.LOADERS_KV._store.set('sh_users_db', JSON.stringify(map));

        const body = route === '/sh/user-get'
            ? { email: EMAIL, password: PW }
            : { email: EMAIL, password: PW, user: { theme: 'dark' } };
        const r = await call(env, 'POST', route, body, '198.51.100.4');
        const rec = readRec(env, EMAIL);
        const stored = String(rec && rec.password);
        if (r.ok && /^pbkdf2\$/.test(stored)) ok(route + ' authenticates and upgrades the record');
        else bad(route, 'status=' + r.status + ' stored=' + stored.slice(0, 40));
    }
}

// ---------------------------------------------------------------------------
console.log('[M5] a password change writes PBKDF2 and never base64...');
{
    const env = { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper' };
    const EMAIL = 'chg@t.com', OLD = 'oldPass123', NEW = 'newPass456';
    const map = { [EMAIL]: { id: 'u5', email: EMAIL, username: 'L5', password: b64(OLD), plan: 'Basic', createdAt: new Date().toISOString() } };
    env.LOADERS_KV._store.set('sh_users_db', JSON.stringify(map));

    const badPw = await call(env, 'POST', '/sh/user-password', { email: EMAIL, oldPassword: 'wrongOld1', newPassword: NEW }, '198.51.100.5');
    if (!badPw.ok) ok('a wrong current password cannot change it'); else bad('change auth', 'the password was changed with a wrong current password');

    const r = await call(env, 'POST', '/sh/user-password', { email: EMAIL, oldPassword: OLD, newPassword: NEW }, '198.51.100.5');
    if (r.ok) ok('the password change succeeds'); else bad('change', 'change failed: ' + JSON.stringify(r).slice(0, 100));

    const stored = String(readRec(env, EMAIL).password);
    if (/^pbkdf2\$/.test(stored)) ok('the new password is stored as PBKDF2');
    else bad('new password format', 'stored value is not PBKDF2: ' + stored.slice(0, 40));
    if (stored !== b64(NEW)) ok('the new password is NOT stored as base64'); else bad('base64 write', 'the new password was written as base64');

    const withNew = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: NEW }, '198.51.100.5');
    if (withNew.ok) ok('login with the NEW password works'); else bad('new password login', 'the new password does not work');
    const withOld = await call(env, 'POST', '/sh/user-login', { emailOrUsername: EMAIL, password: OLD }, '198.51.100.5');
    if (!withOld.ok) ok('login with the OLD password is refused'); else bad('old password', 'the old password still works');
}

console.log('');
if (fail) { console.log('LEGACY MIGRATION TEST: ' + fail + ' FAILED, ' + pass + ' passed'); process.exit(1); }
console.log('LEGACY MIGRATION TEST: PASS (' + pass + ' checks)');
