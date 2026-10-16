// WORKER RESILIENCE tests (the loadstring-outage root causes):
//   R1: signup with a HUGE base64 profile image never breaks the KV
//       write (oversized images are dropped server-side)
//   R2: twenty accounts with huge images all survive, and every one of them
//       can still log in
//   R3: any uncaught worker error still returns JSON WITH CORS headers
//       (browsers used to swallow the blank 500 as "fetch failed")
//   R4: user-signup + user-login return readable JSON errors on failure
import assert from 'assert';

const workerSrc = await import('./For Cloudflare/worker.js');
const worker = workerSrc.default;

// KV mock with a hard value cap like real Cloudflare (25MB)
function makeCappedKV(cap) {
    const store = new Map();
    const kv = {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value, opts) {
            if (String(value).length > cap) throw new Error('KV PUT: value too large (' + String(value).length + ' > ' + cap + ')');
            store.set(key, String(value));
        },
        async delete(key) { store.delete(key); },
        async list(opts) { const keys = []; for (const k of store.keys()) if (!opts || !opts.prefix || k.startsWith(opts.prefix)) keys.push({ name: k }); return { keys, list_complete: true }; },
        _store: store
    };
    return kv;
}

const EXECUTOR_UA = 'Roblox/570 Delta Executor';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';

async function call(method, path, body, ua) {
    const req = new Request('https://test.workers.dev' + path, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json', 'User-Agent': ua || BROWSER_UA } : { 'User-Agent': ua || BROWSER_UA },
        body: body ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, { waitUntil: () => {} });
}
async function j(method, path, body, ua) {
    const r = await call(method, path, body, ua);
    const text = await r.text();
    try { return { status: r.status, acao: r.headers.get('Access-Control-Allow-Origin'), ...JSON.parse(text), _text: text }; }
    catch (e) { return { status: r.status, acao: r.headers.get('Access-Control-Allow-Origin'), ok: false, _text: text }; }
}

// ACCOUNTS ARE SEPARATE KEYS NOW, NOT ONE MAP.
//
// R1 and R2 used to read `sh_users_db` - a single map every account shared, so
// one enormous profile image could push the whole table over the KV value cap
// and take every login with it. Each account is now its own `sh_user_<email>`
// key, so the question changed shape rather than disappearing:
//
//   * one huge account can no longer affect a different account's signup, and
//   * an oversized image is dropped at write time (capImageFields), so the
//     record still fits and the account still works.
//
// The assertions below check those two properties directly. Reading a map that
// no longer exists could only ever assert `undefined.length`, which is how this
// block was silently measuring nothing.
const USER_PREFIX = 'sh_user_';
function userRecords(KV) {
    return [...KV._store.entries()].filter(([k]) => k.startsWith(USER_PREFIX));
}

console.log('[R1] a huge profile image is dropped, and cannot affect another account...');
{
    // KV capped at 1MB, the same trick the original test used to force the
    // failure quickly. Real Cloudflare allows 25MB per value.
    const KV = makeCappedKV(1_000_000);
    const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev' };
    const req = (p, b) => worker.fetch(new Request('https://t.workers.dev' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, { waitUntil: () => {} });

    // 2.5 MB of base64 - over the 2 MB per-image cap, so it must be dropped
    // rather than written. The cap is enforced at write, so the account is
    // created and simply has no image.
    const big = 'A'.repeat(2_500_000);
    await req('/sh/user-signup', { email: 'big@t.com', username: 'Big', password: 'pass1234', user: { profileImage: big } });

    const su = await (async () => {
        const r = await req('/sh/user-signup', { email: 'fresh@t.com', username: 'Fresh', password: 'pass1234' });
        const text = await r.text();
        let d; try { d = JSON.parse(text); } catch (e) { d = { ok: false, _raw: text.slice(0, 100) }; }
        return { status: r.status, ok: d.ok, error: d.error, acao: r.headers.get('Access-Control-Allow-Origin') };
    })();
    assert.strictEqual(su.ok, true, 'signup must succeed alongside a bloated account (error: ' + su.error + ')');
    assert.strictEqual(su.acao, '*', 'CORS header on the response');

    // every stored record fits, and the oversized image is gone from it
    const recs = userRecords(KV);
    assert.ok(recs.length >= 2, 'both accounts exist as their own keys, got ' + recs.length);
    for (const [key, val] of recs) {
        assert.ok(val.length <= 1_000_000, key + ' fits the KV cap (' + val.length + ')');
        const rec = JSON.parse(val);
        assert.ok(!rec.profileImage, key + ' kept a 2.5 MB image that should have been dropped');
    }
    console.log('    OK: signup survived; image dropped, ' + recs.length + ' records, all under the cap');
}

console.log('[R2] twenty accounts with huge images all survive, and all still log in...');
{
    const KV = makeCappedKV(1_000_000);
    const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev' };
    // This block exercises the image cap, not the signup flood guard. The worker
    // deliberately answers 429 after SIGNUP_FLOOD_LIMIT (10) signups per minute
    // from one CF-Connecting-IP, and this loop fires 20 in a tight burst, so
    // every signup after the tenth would be rejected before any write. Give each
    // signup its own source IP so the two features do not mask each other. The
    // production limit is unchanged.
    const reqFrom = (ip) => (p, b) => worker.fetch(new Request('https://t.workers.dev' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(b) }), env, { waitUntil: () => {} });
    const req = reqFrom('203.0.113.7');
    // 20 users, each carrying an image over the per-field cap
    for (let i = 0; i < 20; i++) {
        const r = await reqFrom('203.0.113.' + (100 + i))('/sh/user-signup', {
            email: 'u' + i + '@t.com', username: 'U' + i, password: 'pass1234',
            user: { profileImage: 'A'.repeat(2_500_000) }
        });
        assert.strictEqual(r.status, 200, 'signup ' + i + ' must not 500');
    }
    // login still works for every one of them (passwords intact)
    const li = await (async () => {
        const r = await req('/sh/user-login', { emailOrUsername: 'U7', password: 'pass1234' });
        const t = await r.text();
        return { status: r.status, ok: JSON.parse(t).ok };
    })();
    assert.strictEqual(li.ok, true, 'logins keep working after oversized images are dropped');
    const recs = userRecords(KV);
    assert.strictEqual(recs.length, 20, 'all 20 records kept (only images dropped)');
    for (const [key, val] of recs) assert.ok(val.length <= 1_000_000, key + ' fits the KV cap');
    // and every one of them can still log in, not just one
    for (let i = 0; i < 20; i++) {
        const r = await req('/sh/user-login', { emailOrUsername: 'U' + i, password: 'pass1234' });
        const d = JSON.parse(await r.text());
        assert.strictEqual(d.ok, true, 'U' + i + ' must still be able to log in');
    }
    console.log('    OK: 20 accounts, all records alive, all logins work');
}

console.log('[R3] uncaught worker errors return JSON + CORS (no blank 500)...');
{
    // KV whose .put throws a non-size error -> the global net catches it
    const KV = {
        async get() { return null; },
        async put() { throw new Error('KV unavailable (simulated outage)'); },
        async delete() {}
    };
    const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev' };
    const r = await worker.fetch(new Request('https://t.workers.dev/sh/user-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // The username must clear the worker's shape guard (length >= 2,
        // MAX_USERNAME_LEN) or the request is rejected with 400 before the
        // KV write, and the simulated outage below is never reached.
        body: JSON.stringify({ email: 'x@t.com', username: 'Xavier', password: 'pass1234' })
    }), env, { waitUntil: () => {} });
    const text = await r.text();
    assert.strictEqual(r.status >= 500, true, 'error status propagated');
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), '*', 'CORS header present on the error');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {}
    assert(parsed && parsed.ok === false && /error/i.test(parsed.error || ''), 'readable JSON error body: ' + text.slice(0, 120));
    console.log('    OK: outage -> JSON error + CORS (browser shows the real message)');
}

console.log('\nALL WORKER RESILIENCE TESTS PASSED - no more blank 500s / dead signups.');
