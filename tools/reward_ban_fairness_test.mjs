// An honest visitor must not be locked out, and must not be called a cheater.
//
// THE FAILURE
//
//     "i decided to click on button that i alr have done those checkpoints
//      while it shows 0 before it wasnt doing anything prob unless u passed all
//      checkpoints but it just blacklisted me reason ad bypass make the timeout
//      to wait at least 1 minute only because i think 2 hours is too much + it
//      blacklisted me entirely like i cant go to my phone and redo it or in any
//      other browser"
//
// THREE HARMS, ALL IN ONE FLOW
//
// 1. NOT-VERIFIED WAS TREATED AS CHEATING. verifyProvider returns ok:false for
//    `no-click-id` (the provider has not posted back YET - every real provider
//    is asynchronous) and for `too-fast` (the visitor pressed Verify inside the
//    4s dwell floor, which is what pressing a button quickly looks like). Both
//    were answered with blacklistAdd().
//
// 2. THE BAN WAS WRITTEN AGAINST THE IP TOO. sh_rbl_ip_<ip> meant one person
//    tripping it locked out every device on that router - which is exactly
//    "i cant go to my phone and redo it or in any other browser". On residential
//    NAT an IP is a household, not a person.
//
// 3. TWO HOURS, DOUBLING TO SIXTEEN. For a misclick.
//
// WHAT THIS ASSERTS
//
// A visitor who presses Verify before the provider reports back is told it has
// not been confirmed yet, is NOT given a strike, is NOT banned, and is not told
// they are bypassing anything. The ban is a minute. Nothing is keyed on an IP.
// Only a genuine nonce replay - the one signal that is actual tampering with a
// signed capability - still earns a strike.
//
// Run: node tools/reward_ban_fairness_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = (await import(new URL('../For Cloudflare/worker.js', import.meta.url))).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');
const workerSrc = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v, o) { store.set(k, String(v)); if (o && o.expirationTtl) (store.get(k) + ''); return; },
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

console.log('[BF] an honest visitor is not locked out');
console.log('-'.repeat(72));

// --- constants and the ban path, by inspection -----------------------------
console.log('');
console.log('the penalty is one minute and is never keyed on an address');
{
    const ms = (workerSrc.match(/REWARD_BLACKLIST_MS\s*=\s*([^;]+);/) || [])[1] || '';
    check('the base penalty is 60 seconds', /60\s*\*\s*1000/.test(ms) || /^\s*60\b/.test(ms.trim()),
        'REWARD_BLACKLIST_MS is ' + ms.trim() + ' - the owner asked for at least a minute');
    check('no 2-hour constant remains', !/2\s*\*\s*3600\s*\*\s*1000/.test(ms));

    // Nothing may WRITE an ip_ entry any more.
    const addFn = (workerSrc.match(/async function blacklistAdd[\s\S]*?\n\}/) || [''])[0];
    check('blacklistAdd never writes an ip_ entry',
        !/RBLK_PREFIX \+ ['"]ip_/.test(addFn),
        'it still blocks the whole address');
    check('and blacklistAdd is called with an empty ip',
        /blacklistAdd\(env, ses\.fp, ['"]{2}/.test(workerSrc),
        'the call still passes an IP through');

    // And nothing may READ one either, or stale 2-hour entries keep biting.
    const getFn = (workerSrc.match(/async function blacklistGet[\s\S]*?\n\}/) || [''])[0];
    check('blacklistGet ignores old ip_ entries',
        !/blacklistReadKey\(env, ['"]ip_/.test(getFn),
        'legacy 2-hour IP blocks would keep locking households out');
}

// --- not-verified is not cheating ------------------------------------------
console.log('');
console.log('"not verified yet" is its own outcome, and carries no penalty');
{
    check('no-click-id is treated as transient',
        /TRANSIENT = \[[^\]]*['"]no-click-id['"]/.test(workerSrc),
        'a provider that has not posted back yet still bans the visitor');
    check('too-fast is treated as transient',
        /TRANSIENT = \[[^\]]*['"]too-fast['"]/.test(workerSrc),
        'pressing Verify quickly still bans the visitor');
    check('the unreachable-provider reasons are transient too',
        /lv-unreachable/.test(workerSrc) && /wi-unreachable/.test(workerSrc) && /ll-unreachable/.test(workerSrc));
    check('a transient result writes no strike',
        /isTransient && verdict\.reason !== ['"]replayed['"][\s\S]{0,400}unverified/.test(workerSrc),
        'the transient branch still reaches blacklistAdd');
    check('and the page says so without accusing anyone',
        /return rewardCallbackPage\(origin, ['"]unverified['"]/.test(workerSrc));
    check('the visitor is told they were NOT penalised',
        /you have NOT been penalised/.test(workerSrc),
        'the page does not reassure, so it reads as an accusation');
    check('a replay still earns a strike - the one real tamper signal',
        /isTransient && verdict\.reason !== ['"]replayed['"]/.test(workerSrc),
        'the strike path must still exist for nonce replays');
}

// --- the flow, end to end, against the real routes -------------------------
console.log('');
console.log('pressing Verify early is not punished');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev',
        SH_OWNER_CODE_HASH: OWNER_CODE_HASH, SH_SESSION_SECRET: 's', SH_DB: makeD1(),
    };
    const call = async (method, path, body) => {
        const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
            method, headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        }), env, { waitUntil() { } });
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { json = {}; }
        return { status: res.status, text, ...json };
    };

    const login = JSON.parse((await (async () => {
        const r = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
        }), env, { waitUntil() { } });
        return await r.text();
    })()));
    if (!login.token) { console.log('  (owner login unavailable - flow checks skipped)'); }
    else {
        const OWNER = { token: login.token };
        const save = await call('POST', '/sh/reward/save', {
            token: OWNER.token,
            reward: {
                name: 'BanTest', keyDurationH: 1, maxKeys: 1,
                checkpoints: [{ id: 'cp1', name: 'Ad', provider: 'linkvertise', shortUrl: 'https://e.com/a', settings: { authToken: 'tok' } }],
            },
        });
        const rid = save.rid;
        const started = await call('POST', '/sh/reward/start', { rid, fp: 'fp_honest_user' });

        // stepAt is deliberately NOT backdated: the visitor presses Verify
        // immediately. linkvertise will also report no click id, because the
        // provider has not called back yet. Both are the honest case.
        const tok = new URL(started.step.verifyUrl).searchParams.get('t');
        const cb = await call('GET', '/sh/cp/linkvertise?t=' + encodeURIComponent(tok) + '&confirmed=1', null);

        check('the visitor gets a verdict page', cb.status === 200, 'HTTP ' + cb.status);
        check('they are NOT banned', !/blocked|blacklist/i.test(cb.text),
            cb.text.slice(0, 200));
        check('they are not accused of bypassing',
            !/bypass/i.test(cb.text), cb.text.slice(0, 200));
        check('they are told it is not verified yet',
            /not verified yet/i.test(cb.text), cb.text.slice(0, 200));
        check('and they are not penalised', /NOT been penalised/i.test(cb.text));
        check('and they can retry', /any device|press Verify again/i.test(cb.text));

        // Nothing was written against the fingerprint OR the address.
        const blKeys = [...KV._store.keys()].filter(k => k.startsWith('sh_rbl_'));
        check('no strike was recorded at all', blKeys.length === 0,
            'wrote: ' + blKeys.join(', '));

        // And a second device / another browser is unaffected.
        const pub = await call('GET', '/sh/reward/pub?rid=' + rid + '&fp=fp_honest_user');
        check('the visitor is not locked out on a later visit',
            !pub.blacklisted, JSON.stringify(pub).slice(0, 140));

        // The checkpoint is still completable afterwards.
        const st = await call('GET', '/sh/reward/state?rid=' + rid + '&fp=fp_honest_user');
        check('the reward is still in progress, not blocked',
            st.ok === true && st.complete !== true, JSON.stringify(st).slice(0, 120));
    }
}

console.log('');
console.log('BAN FAIRNESS   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);