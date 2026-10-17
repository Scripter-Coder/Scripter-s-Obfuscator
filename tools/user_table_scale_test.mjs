// The user table must stay reachable as the account count grows.
//
// THE BUG
//
// The user table is one KV key per account. Reading the whole table therefore
// costs ONE SUBREQUEST PER ACCOUNT, and a Worker on the free plan is allowed
// 50 subrequests per request.
//
// So from the 51st account onwards, every route that read the table stopped
// working - and it stopped SILENTLY, because the platform kills the request
// before the worker can answer. The user got an empty 503 and no message.
//
// The live site has 120 accounts. These four routes were reading all 120 to
// use ONE of them:
//
//     POST /sh/user-get        your own record
//     POST /sh/user-sync       the client calls this on every login
//     POST /sh/user-delete     delete your own account
//     POST /sh/user-password   change your own password
//
// and these owner routes read every RECORD to build a listing:
//
//     GET  /sh/users           the admin panel's user list
//     GET  /sh/user-images     the admin panel's avatars
//
// All of them answered 503. The admin panel - where the owner manages keys -
// had quietly stopped listing users.
//
// WHAT THIS ASSERTS
//
// 1. The single-account routes cost ONE get, not one per account. Measured, not
//    read: the mock KV counts its calls.
// 2. The listing costs one list call plus one get per account IN THE PAGE,
//    and the page size is clamped so the total stays inside the platform's
//    budget.
// 3. The listing says whether there is more, so the client can walk the pages.
// 4. A table of 120 accounts - more than the platform's subrequest budget -
//    is served, not refused.
//
// Run: node tools/user_table_scale_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = (await import('../For Cloudflare/worker.js')).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

// The platform's limit. A Worker on the free plan may make 50 subrequests.
const SUBREQUEST_BUDGET = 50;

function makeKV(counter) {
    const store = new Map();
    return {
        async get(k) {
            counter.get++;
            return store.has(k) ? store.get(k) : null;
        },
        async put(k, v) { counter.put++; store.set(k, String(v)); },
        async delete(k) { counter.delete++; store.delete(k); },
        async list(opts = {}) {
            counter.list++;
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
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    }), env, { waitUntil() {} });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch (e) { json = { _raw: text }; }
    return { status: res.status, ...json, _text: text };
}

// A table with MORE accounts than the platform's subrequest budget.
const ACCOUNT_COUNT = 120;

async function buildEnv(accountCount) {
    const counter = { get: 0, put: 0, delete: 0, list: 0 };
    const KV = makeKV(counter);
    const db = makeD1();
    const env = {
        LOADERS_KV: KV,
        SH_SETUP_TOKEN: 'T',
        SH_BASE_URL: 'https://t.workers.dev',
        SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'test-secret',
        SH_DB: db,
    };
    for (let i = 0; i < accountCount; i++) {
        const email = 'user' + i + '@example.com';
        KV._store.set('sh_user_' + email, JSON.stringify({
            id: email, email, username: 'User' + i, password: 'pbkdf2$1$x$y',
            plan: 'Basic', createdAt: new Date().toISOString(),
        }));
    }
    return { env, KV, counter, db };
}

console.log('[UT] the user table stays reachable as it grows');
console.log('-'.repeat(72));

// --- the single-account routes ---------------------------------------------
console.log('');
console.log('a single account costs ONE read, not one per account');
{
    const { env, counter } = await buildEnv(ACCOUNT_COUNT);
    // A REAL account, with a REAL password record - created through the signup
    // route so the stored credential is a proper PBKDF2 record. A hand-written
    // one is not base64, and verifyPassword cannot read it.
    const email = 'real' + Date.now() + '@example.com';
    const password = 'RealPass12345';
    const su = await call(env, 'POST', '/sh/user-signup', { email, username: 'Real', password });
    check('the account was created', su.ok === true, JSON.stringify(su).slice(0, 80));

    const before = counter.get;
    const r = await call(env, 'POST', '/sh/user-get', { email, password: 'wrongPassword' });
    // The password is wrong, so this is refused - but it must be REFUSED, not
    // 503ed, and the refusal must not have read the table.
    check('the route answers instead of failing', r.status !== 503, 'HTTP ' + r.status);
    check('it says the credentials are wrong', r.status === 401, 'HTTP ' + r.status + ' ' + JSON.stringify(r).slice(0, 80));
    const reads = counter.get - before;
    check('it read ONE key, not ' + ACCOUNT_COUNT, reads <= 2, 'read ' + reads + ' keys');
    check('and it stayed inside the subrequest budget', reads <= SUBREQUEST_BUDGET, reads + ' subrequests');

    // And the happy path, which is what the client actually does.
    const okRes = await call(env, 'POST', '/sh/user-get', { email, password });
    check('the right password gets the record', okRes.ok === true && okRes.user && okRes.user.email === email,
        JSON.stringify(okRes).slice(0, 100));
}

// --- the listing ------------------------------------------------------------
console.log('');
console.log('the listing is a PAGE, and it says there is more');
{
    const { env, counter } = await buildEnv(ACCOUNT_COUNT);
    const before = counter.get;

    // The owner token. The listing is owner-gated, and the gate runs BEFORE
    // the table is touched, so this is the real path.
    const login = await call(env, 'POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    check('the owner can sign in', login.ok === true, JSON.stringify(login).slice(0, 80));
    const token = login.token;

    const page1 = await call(env, 'GET', '/sh/users?token=' + encodeURIComponent(token) + '&offset=0&limit=25');
    check('the listing answers', page1.status === 200, 'HTTP ' + page1.status);
    check('it returns a page of users', page1.ok === true && Object.keys(page1.users || {}).length === 25,
        'got ' + Object.keys(page1.users || {}).length);
    check('it reports the true total', page1.total === ACCOUNT_COUNT, 'total ' + page1.total);
    check('it says there is more to come', page1.hasMore === true);
    check('and it says where the next page starts', page1.offset === 0 && page1.limit === 25);

    const reads = counter.get - before;
    // One get per account in the page, plus the owner session's own read.
    check('the page cost one get per account IN THE PAGE', reads <= 30, 'read ' + reads + ' keys');
    check('and stayed inside the subrequest budget', reads <= SUBREQUEST_BUDGET, reads + ' subrequests');

    // The last page ends the walk.
    const last = await call(env, 'GET', '/sh/users?token=' + encodeURIComponent(token) + '&offset=100&limit=25');
    check('the last page says there is no more', last.hasMore === false);
    check('and it holds the remaining accounts', Object.keys(last.users || {}).length === 20,
        'got ' + Object.keys(last.users || {}).length);
}

// --- a page size is clamped -------------------------------------------------
console.log('');
console.log('a page size cannot be asked past the budget');
{
    const { env } = await buildEnv(ACCOUNT_COUNT);
    const login = await call(env, 'POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const token = login.token;
    const r = await call(env, 'GET', '/sh/users?token=' + encodeURIComponent(token) + '&limit=5000');
    check('the page size is clamped', r.limit <= SUBREQUEST_BUDGET, 'limit ' + r.limit);
    check('and the listing still answers', r.status === 200 && r.ok === true);
}

// --- the images route -------------------------------------------------------
console.log('');
console.log('the images route is bounded too');
{
    const { env } = await buildEnv(ACCOUNT_COUNT);
    const login = await call(env, 'POST', '/sh/login', { code: OWNER_CODE_PLAIN });
    const token = login.token;
    const r = await call(env, 'GET', '/sh/user-images?token=' + encodeURIComponent(token) + '&limit=500');
    check('it answers', r.status === 200 && r.ok === true, 'HTTP ' + r.status);
    check('its page size is bounded', r.limit <= SUBREQUEST_BUDGET, 'limit ' + r.limit);
    check('and it reports the total', r.total === ACCOUNT_COUNT, 'total ' + r.total);
}

// --- a deleted account is gone from the GATE's mirror too ------------------
// syncUsersToD1 only adds and updates rows, so deleting an account from KV
// used to leave its row behind. The gate's live account check is
//
//     EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.disabled = 0)
//
// so the row that outlived the account was still answering for it.
console.log('');
console.log('a deleted account is gone from the gate, not just from KV');
{
    const { env, KV, db } = await buildEnv(ACCOUNT_COUNT);
    const email = 'gone' + Date.now() + '@example.com';
    const password = 'GonePass12345';
    const su = await call(env, 'POST', '/sh/user-signup', { email, username: 'Gone', password });
    check('the account was created', su.ok === true, JSON.stringify(su).slice(0, 80));

    const rowCount = () => db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(email.toLowerCase()).n;
    check('the gate can see the account', Number(rowCount()) === 1, 'rows: ' + rowCount());

    const del = await call(env, 'POST', '/sh/user-delete', { email, password });
    check('it can be deleted', del.ok === true, JSON.stringify(del).slice(0, 80));
    check('its record is out of the store', !KV._store.has('sh_user_' + email.toLowerCase()));
    check('and the GATE can no longer find it', Number(rowCount()) === 0, 'rows: ' + rowCount());

    // The owner is not deletable, and a missing owner row would take the gate
    // with it, so the mirror refuses to remove it.
    check('the mirror never removes the owner row',
        /id === d1UserId\(OWNER_EMAIL\)\) return;/.test(await fs.promises.readFile(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8')),
        'the owner row is protected by an email comparison that is not there');
}

console.log('');
console.log('USER TABLE SCALE   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
