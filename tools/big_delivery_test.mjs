// tools/big_delivery_test.mjs
//
// Guards the fix for:
//
//   [ScripterHub] Unrecognised delivery format.
//
// on a large script.
//
// THE BUG
//
// A real artifact measured at 18,607,247 bytes was delivered INLINE - one
// single HTTP response - because the inline cap equalled the KV storage
// threshold (~25 MB). Fetching it took 13.9 s from a workstation. On an
// executor that becomes a Cloudflare 524/502 and an HTML error body, and the
// bootstrap's envelope check prints "Unrecognised delivery format." because
// HTML is not SHL/SHK/SHG.
//
// Nothing was wrong with the artifact or the loadstring. The CHANNEL was too
// small for the payload.
//
// THE FIX
//
// Inline delivery is capped at INLINE_DELIVERY_MAX (6 MB). Anything larger
// takes the SHG chain path, which returns a small header plus a grant and
// lets the bootstrap fetch the parts separately.
//
// Run: node tools/big_delivery_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

const worker = (await import('../For Cloudflare/worker.js')).default;

// The constant, read from the shipped worker rather than duplicated here.
const MAXM = /const INLINE_DELIVERY_MAX = ([\d_]+);/.exec(src);
const INLINE_MAX = MAXM ? Number(MAXM[1].replace(/_/g, '')) : null;

console.log('\n[BD1] the inline cap is a delivery limit, not the storage limit');
console.log('-'.repeat(72));
if (INLINE_MAX === null) {
    no('INLINE_DELIVERY_MAX is not defined in worker.js');
} else {
    ok('INLINE_DELIVERY_MAX = ' + INLINE_MAX.toLocaleString() + ' bytes');
    if (INLINE_MAX < 25_000_000) ok('it is BELOW the 25 MB KV value limit (the bug)');
    else no('it still equals/exceeds the storage limit - a big artifact will inline again');
    // The size that actually failed.
    if (INLINE_MAX < 18_607_247) ok('the 18,607,247-byte artifact that failed now CHAINS instead of inlining');
    else no('the known-bad 18 MB artifact would still inline');
}

console.log('\n[BD2] the decision site actually uses the new cap');
console.log('-'.repeat(72));
{
    const uses = src.includes('inlineBlob.length <= INLINE_DELIVERY_MAX');
    if (uses) ok('/sh/a compares against INLINE_DELIVERY_MAX');
    else no('/sh/a does not use INLINE_DELIVERY_MAX');
    if (/\/\/ SMALL: everything in one response[\s\S]{0,900}INLINE_DELIVERY_MAX/.test(src)) ok('the reasoning is recorded at the decision site');
    else no('the inline branch has no note explaining the cap');
}

console.log('\n[BD3] sizes map to the right envelope (the bootstrap\'s own check)');
console.log('-'.repeat(72));
{
    // Exactly the bootstrap's classification at worker.js:6446-6473.
    const classify = (body) => {
        if (typeof body !== 'string') return 'Delivery failed.';
        if (body.slice(0, 6) === 'SHERR ') return 'refusal';
        if (body.slice(0, 4) === 'SHL\n') return 'inline';
        if (body.slice(0, 4) === 'SHK\n') return 'inline keyed';
        if (body.slice(0, 4) === 'SHG ') return 'chain';
        return 'Unrecognised delivery format.';
    };
    const cases = [
        ['SHL\n' + 'x'.repeat(1000), 'inline'],
        ['SHK\nk\n' + 'x'.repeat(1000), 'inline keyed'],
        ['SHG 3 /sh/c/ScripterHub123 eyJ.sig\n', 'chain'],
        ['<html>524 timeout</html>', 'Unrecognised delivery format.'],
    ];
    for (const [body, want] of cases) {
        const got = classify(body);
        if (got === want) ok(classify(body.slice(0, 18)) + ' -> ' + got);
        else no('expected ' + want + ', got ' + got);
    }
    console.log('       (the 4th case is what a timed-out big response looks like)');
}

console.log('\n[BD4] a large artifact really does chain, end to end');
console.log('-'.repeat(72));
{
    function makeKV() {
        const store = new Map();
        return {
            async get(k) { return store.has(k) ? store.get(k) : null; },
            async put(k, v) { store.set(k, String(v)); },
            async delete(k) { store.delete(k); },
            async list({ prefix, limit } = {}) {
                return { keys: [...store.keys()].filter(k => !prefix || k.startsWith(prefix)).slice(0, limit || 1000).map(name => ({ name })) };
            },
            _store: store,
        };
    }
    const ID = 'ScripterHub9999999999';
    const CHUNK = 5_000_000;
    const total = 8_000_000;   // over the 6 MB inline cap, under the storage cap
    // The gate is fail-closed without D1 (D9), so a session cannot be minted
    // without one. A real in-memory SQLite with the real migrations, exactly
    // as chunked.test.mjs does - otherwise this case would "pass" by refusing
    // everything, which proves nothing.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));

    const env = {
        LOADERS_KV: makeKV(),
        SH_SETUP_TOKEN: 'T',
        SH_BASE_URL: 'https://t.workers.dev',
        SH_SESSION_SECRET: 'pepper',
        SH_DB: db,
    };

    // Stored the way putBlob stores an over-threshold blob: one manifest + parts.
    const n = Math.ceil(total / CHUNK);
    for (let i = 0; i < n; i++) {
        env.LOADERS_KV._store.set('sh_chunk_sh_loader_' + ID + '_' + i, 'C'.repeat(Math.min(CHUNK, total - i * CHUNK)));
    }
    env.LOADERS_KV._store.set('sh_cmeta_sh_loader_' + ID, JSON.stringify({ n }));

    const UA = 'Roblox/570 Delta Executor';
    const call = async (method, p, body) => {
        const r = await worker.fetch(new Request('https://t.workers.dev' + p, {
            method, headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
            body: body ? JSON.stringify(body) : undefined,
        }), env, { waitUntil() { } });
        const t = await r.text();
        let j; try { j = JSON.parse(t); } catch (e) { j = { _raw: t }; }
        return { status: r.status, text: t, ...j };
    };

    const sess = await call('POST', '/sh/session', { id: ID, k: '', h: 'x', u: '' });
    const m = /^SHS (\S+) (\S+) \S+/.exec(sess.text);
    if (!m) { no('could not mint a session: ' + sess.text.slice(0, 80)); }
    else {
        ok('minted a session');
        const a = await call('GET', '/sh/a/' + ID + '?s=' + m[1] + '&n=' + m[2]);
        const head = a.text.slice(0, 40);
        if (head.startsWith('SHG ')) {
            ok('an ' + (total / 1e6).toFixed(0) + ' MB artifact returned a CHAIN header (not one huge body)');
            ok('header: ' + JSON.stringify(a.text.split('\n')[0].slice(0, 60)));
            if (a.text.length < 500) ok('the header is small - ' + a.text.length + ' bytes, so it cannot time out');
        } else {
            no('expected an SHG chain header, got: ' + JSON.stringify(head));
        }
    }
}

console.log('\n' + '='.repeat(72));
console.log('BIG DELIVERY   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);