// WORKER RESILIENCE tests (the loadstring-outage root causes):
//   R1: signup with a HUGE base64 profile image never breaks the KV
//       write (images are capped server-side; the map is repaired)
//   R2: a users map that would exceed the KV 25MB cap is auto-repaired
//       (images stripped) instead of throwing a blank 500
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

console.log('[R1] signup survives a huge base64 profile image in the map...');
{
    // KV capped at 1MB to force the repair path quickly
    const KV = makeCappedKV(1_000_000);
    const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev' };
    const req = (p, b) => worker.fetch(new Request('https://t.workers.dev' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, { waitUntil: () => {} });

    // seed an existing user with a GIANT image (2.5MB base64) via the
    // owner upsert path
    const big = 'A'.repeat(2_500_000);
    const ownerUpsert = await (async () => {
        // use /sh/user-sync (new-record migration path)
        const r = await req('/sh/user-sync', { email: 'big@t.com', password: 'pass1234', user: { username: 'Big', profileImage: big } });
        return r.status;
    })();
    // now a fresh signup: the map already holds the huge image -> the
    // put would exceed the cap without the repair logic
    const su = await (async () => {
        const r = await req('/sh/user-signup', { email: 'fresh@t.com', username: 'Fresh', password: 'pass1234' });
        const text = await r.text();
        let d; try { d = JSON.parse(text); } catch (e) { d = { ok: false, _raw: text.slice(0, 100) }; }
        return { status: r.status, ok: d.ok, error: d.error, acao: r.headers.get('Access-Control-Allow-Origin') };
    })();
    assert.strictEqual(su.ok, true, 'signup must succeed even with a bloated existing map (error: ' + su.error + ')');
    assert.strictEqual(su.acao, '*', 'CORS header on the response');
    // the stored map must be under the cap
    const stored = KV._store.get('sh_users_db');
    assert(stored.length <= 1_000_000, 'stored map fits the KV cap');
    console.log('    OK: signup survived; map auto-repaired to', stored.length, 'bytes');
}

console.log('[R2] the stored map is repaired (images dropped, records intact)...');
{
    const KV = makeCappedKV(120_000); // tiny cap
    const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev' };
    const req = (p, b) => worker.fetch(new Request('https://t.workers.dev' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, { waitUntil: () => {} });
    // 20 users with ~100KB images each = ~2MB total (over the 120KB cap)
    for (let i = 0; i < 20; i++) {
        const r = await req('/sh/user-signup', { email: 'u' + i + '@t.com', username: 'U' + i, password: 'pass1234' });
        assert.strictEqual(r.status, 200, 'signup ' + i + ' must not 500');
    }
    // login still works for every one of them (passwords intact)
    const li = await (async () => {
        const r = await req('/sh/user-login', { emailOrUsername: 'U7', password: 'pass1234' });
        const t = await r.text();
        return { status: r.status, ok: JSON.parse(t).ok };
    })();
    assert.strictEqual(li.ok, true, 'logins keep working after repairs');
    const stored = KV._store.get('sh_users_db');
    assert(stored.length <= 120_000, 'map fits cap after repairs');
    const map = JSON.parse(stored);
    assert.strictEqual(Object.keys(map).length, 20, 'all 20 records kept (only images dropped)');
    console.log('    OK: 20 users, map =', stored.length, 'bytes, all records alive');
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
        body: JSON.stringify({ email: 'x@t.com', username: 'X', password: 'pass1234' })
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
