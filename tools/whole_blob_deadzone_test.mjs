// tools/whole_blob_deadzone_test.mjs
//
// Guards a dead zone I created and shipped.
//
// THE BUG
//
// Capping inline delivery at INLINE_DELIVERY_MAX (6 MB) fixed one problem -
// an 18 MB single response times out on an executor and comes back as an HTML
// error page - and introduced another.
//
//     const needsChain = isGithub || isChunked || isKeeper;
//
// A script stored ONLY on the PC Storage Keeper has none of those three, so
// needsChain is false. An 18 MB artefact from such a script:
//
//   18,592,590 >  6,000,000  ->  the inline branch is skipped
//   needsChain === false    ->  the chain branch is skipped too
//   -> refuse(NO_SCRIPT)
//
// Measured on the live deployment: the worker spent 11.7 s SUCCESSFULLY
// fetching all 18 MB from the keeper and then reported "SHERR gone" - "this
// script does not exist" - for a script that existed, was stored, and had just
// been fully retrieved. The 11.7 s was the fetch succeeding.
//
// That is the exact dead zone the CHUNK_THRESHOLD comment warns about, hit
// from the other direction: there is no third path, so a value that matches
// neither branch is refused.
//
// Run: node tools/whole_blob_deadzone_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');
const worker = (await import('../For Cloudflare/worker.js')).default;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('\n[WD1] an over-cap, whole-stored blob is NOT reported as "gone"');
console.log('-'.repeat(72));
{
    // The trap itself: over the inline cap, with no parts to chain.
    if (/!needsChain && inlineBlob && inlineBlob\.length > INLINE_DELIVERY_MAX/.test(src)) {
        ok('an over-cap whole blob has its own branch before the chain');
    } else {
        no('the over-cap whole-blob branch is MISSING - such a script is still refused as "gone"');
    }
    if (/refuse\('toobig'\)|refuse\(DENY\.TOO_BIG_WHOLE\)/.test(src)) {
        ok('it refuses with the dedicated code, not NO_SCRIPT');
    } else {
        no('it does not use a dedicated refusal code');
    }
    // The lie this fixed: "gone" claims the script does not exist.
    const deadZoneOrder = src.indexOf("!needsChain && inlineBlob && inlineBlob.length > INLINE_DELIVERY_MAX");
    const goneReturn = src.indexOf("return refuse(DENY.NO_SCRIPT);", deadZoneOrder);
    if (deadZoneOrder > 0 && (goneReturn < 0 || goneReturn > src.indexOf('if (needsChain && total > 0)', deadZoneOrder))) {
        ok('the new branch comes BEFORE the chain branch, so the gap is closed');
    } else {
        no('the new branch is ordered after the chain branch and cannot help');
    }
}

console.log('\n[WD2] the two caps are distinct and both are used');
console.log('-'.repeat(72));
{
    const MAXM = /const INLINE_DELIVERY_MAX = ([\d_]+);/.exec(src);
    const CHUNK = /const CHUNK_THRESHOLD = ([^;]+);/.exec(src);
    if (MAXM) ok('INLINE_DELIVERY_MAX = ' + Number(MAXM[1].replace(/_/g, '')).toLocaleString());
    else no('INLINE_DELIVERY_MAX is undefined');
    if (CHUNK) ok('CHUNK_THRESHOLD still defined separately: ' + CHUNK[1].trim());
    else no('CHUNK_THRESHOLD is gone');
}

console.log('\n[WD3] end to end: a big PC-stored script gets an HONEST answer');
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
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));

    const ID = 'ScripterHub1234567890';
    const env = {
        LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'T',
        SH_BASE_URL: 'https://t.workers.dev', SH_SESSION_SECRET: 'pepper', SH_DB: db,
    };
    // meta exists, no chunks, no github, no keeper manifest: exactly the state
    // that produced SHERR gone.
    env.LOADERS_KV._store.set('sh_meta_' + ID, JSON.stringify({ name: 'big', keyless: true, at: Date.now() }));
    // a whole blob over the cap, as the PC keeper path would have produced
    env.LOADERS_KV._store.set('sh_loader_' + ID, 'X'.repeat(7_000_000));

    const UA = 'Roblox/570 Delta Executor';
    const call = async (m, p, b) => {
        const r = await worker.fetch(new Request('https://t.workers.dev' + p, {
            method: m, headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
            body: b ? JSON.stringify(b) : undefined,
        }), env, { waitUntil() { } });
        const t = await r.text();
        let j; try { j = JSON.parse(t); } catch (e) { j = { _raw: t }; }
        return { status: r.status, text: t, ...j };
    };

    const s = await call('POST', '/sh/session', { id: ID, k: '', h: 'x', u: '' });
    const m = /^SHS (\S+) (\S+) \S+/.exec(s.text);
    if (!m) { no('could not mint a session: ' + s.text.slice(0, 80)); }
    else {
        ok('minted a session (the record exists)');
        const a = await call('GET', '/sh/a/' + ID + '?s=' + m[1] + '&n=' + m[2]);
        if (a.text.startsWith('SHERR gone')) {
            no('still reports "gone" for a script that exists', 'a 7 MB whole blob must not be refused as missing');
        } else if (a.text.startsWith('SHERR toobig')) {
            ok('reports toobig - honest: the script exists, it is just too big whole');
        } else if (/^SH[LGK]/.test(a.text)) {
            ok('delivered: ' + a.text.slice(0, 4));
        } else {
            no('unexpected answer: ' + JSON.stringify(a.text.slice(0, 60)));
        }
    }
}

console.log('\n[WD4] a small whole blob still inlines normally');
console.log('-'.repeat(72));
{
    const inlinesAfter = src.indexOf('inlineBlob.length <= INLINE_DELIVERY_MAX');
    const bigBranch = src.indexOf('inlineBlob.length > INLINE_DELIVERY_MAX');
    if (inlinesAfter > 0 && bigBranch > inlinesAfter) ok('the inline branch runs first, so small blobs are unaffected');
    else no('ordering is wrong - small blobs may be affected');
}

console.log('\n' + '='.repeat(72));
console.log('WHOLE-BLOB DEAD ZONE   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);