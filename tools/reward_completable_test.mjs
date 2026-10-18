// A checkpoint must actually be completable, and the panel's count must move.
//
// THE TWO BUGS THE OWNER REPORTED
//
//     "checkpoints wouldnt count as passed or wouldnt block me at all"
//
// CAUSE 1 - THE FLOW WAS UNRUNNABLE FOR EVERY REAL PROVIDER
//
// /sh/cp/<provider> is the ONLY code that records a completion. It needs a
// signed, single-use, per-step token. reward.html held that verifyUrl in
// `step.verifyUrl` and used it for `test` only:
//
//     if (step && step.provider === 'test' && step.verifyUrl) { navigate }
//     refresh();
//
// So linkvertise / workink / lootlabs visitors pressed Verify, got an unchanged
// state read back, and stayed at 0/N forever. Not a misconfiguration - the only
// path to completion was unreachable.
//
// CAUSE 2 - THE OWNER'S COUNT NEVER MOVED, AND EVERY SAVE ERASED IT
//
// rewardPublicView returned only {i, name, provider} - no counters - so the
// panel's "Completed" column had nothing to read and showed whatever localStorage
// held. Meanwhile /sh/reward/save trusted the client-sent counters, so each
// owner edit RESET the real history to the stale browser copy. The panel was
// broken and was destroying the data.
//
// WHAT THIS ASSERTS
//
// The full loop is driven against the real worker routes: start -> dwell ->
// verify -> recorded -> claim. Plus the panel contract: counters come back, the
// save does not accept the client's copy, and an unsupported provider is
// refused loudly instead of silently dropped.
//
// Run: node tools/reward_completable_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = (await import(new URL('../For Cloudflare/worker.js', import.meta.url))).default;
// Owner routes are gated on a CODE token obtained from /sh/login, not on the
// raw code and not on SH_SETUP_TOKEN. Posting the raw code at an admin route is
// exactly what 401s - the raw code is not a credential the router accepts.
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');
const rewardsSrc = fs.readFileSync(new URL('../rewards.js', import.meta.url), 'utf8');
const rewardHtml = fs.readFileSync(new URL('../reward.html', import.meta.url), 'utf8');
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

// Comments are stripped before any of the checks below. Several of the
// comments here QUOTE the old broken code verbatim, to say why it was wrong -
// so a grep over the raw file matches the explanation, not the defect. That is
// exactly the trap tools/cloud_refresh_test.mjs fell into earlier.
const htmlCode = rewardHtml.split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

console.log('[RC] a checkpoint is completable, and the count moves');
console.log('-'.repeat(72));

// --- the client can reach the only route that records a completion ----------
console.log('');
console.log('the visitor can reach the route that records completion');
check('Verify navigates to the verify URL',
    /step && step\.verifyUrl/.test(htmlCode) && /location\.href = step\.verifyUrl/.test(htmlCode));
check('and NOT only for the test provider',
    !/step\.provider === 'test' && step\.verifyUrl/.test(htmlCode),
    'the real providers still fall through to a plain refresh() - checkpoints can never pass');
check('the ad popup is opened during the click, not after the fetch',
    /window\.open\('about:blank'/.test(htmlCode),
    'window.open inside .then() is outside the user gesture; the fallback navigates this page away and destroys the Verify button');

// --- the full loop, against the real routes ---------------------------------
console.log('');
console.log('a real provider completes end to end');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'sess-secret', SH_DB: makeD1(),
    };
    const call = async (method, path, body, headers = {}) => {
        const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
            method, headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
        }), env, { waitUntil() { } });
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { json = {}; }
        return { status: res.status, text, ...json };
    };

    // A CODE token from /sh/login - what the panel actually holds.
    const OWNER = {};
    {
        const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
        }), env, { waitUntil() { } });
        const lj = JSON.parse(await lr.text());
        OWNER.token = lj.token;
        if (!OWNER.token) { console.error('owner login failed: ' + lr.status + ' ' + JSON.stringify(lj)); process.exit(1); }
    }

    // An owner reward with two checkpoints, using real providers.
    const save = await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            name: 'ProbeReward', keyDurationH: 1, maxKeys: 3, cooldownH: 0,
            checkpoints: [
                { id: 'cp_a', name: 'First', provider: 'linkvertise', shortUrl: 'https://example.com/a', settings: { authToken: 'tok' } },
                { id: 'cp_b', name: 'Second', provider: 'workink', shortUrl: 'https://example.com/b', settings: { apiKey: 'k' } },
            ],
        },
    });
    check('the owner can save a reward with real providers', save.ok === true, JSON.stringify(save).slice(0, 140));
    const rid = save.rid;

    // The counters come back on the public view.
    check('the save response carries per-step counters',
        Array.isArray(save.public && save.public.steps) && typeof save.public.steps[0].completed === 'number',
        'the panel has nothing to display');
    check('and each step carries its stable id so history cannot be shuffled',
        save.public && save.public.steps[0] && save.public.steps[0].id === 'cp_a');

    // A visitor starts.
    const started = await call('POST', '/sh/reward/start', { rid, fp: 'fp_probe_1' });
    check('the visitor can start the first checkpoint', started.ok === true, JSON.stringify(started).slice(0, 140));
    check('the server mints a verify URL for a real provider',
        !!(started.step && started.step.verifyUrl), 'no verifyUrl for ' + (started.step && started.step.provider));
    check('the step is the FIRST checkpoint', started.step && started.step.i === 0);

    // Backdate stepAt so the dwell gate is satisfied without sleeping.
    const sesKey = [...KV._store.keys()].find(k => k.startsWith('sh_rs_' + rid + '_'));
    check('a visitor session exists', !!sesKey, [...KV._store.keys()].filter(k => k.startsWith('sh_rs_')).join(','));
    if (sesKey) {
        const ses = JSON.parse(KV._store.get(sesKey));
        ses.stepAt = Date.now() - 30000;      // 30s ago, past the 4s floor
        KV._store.set(sesKey, JSON.stringify(ses));

        // The visitor presses Verify. linkvertise needs a click id, so the
        // worker will refuse the API corroboration and fall back - what matters
        // is that the route is REACHED and answers, rather than the client
        // silently re-reading state.
        const vurl = started.step.verifyUrl;
        const token = new URL(vurl).searchParams.get('t');
        const cb = await call('GET', '/sh/cp/linkvertise?t=' + encodeURIComponent(token) + '&confirmed=1', null);
        check('the completion callback route answers the visitor',
            cb.status === 200, 'HTTP ' + cb.status);
        check('it returns a verdict page rather than JSON',
            /<html|<!DOCTYPE|ScripterHub/i.test(cb.text), cb.text.slice(0, 120));
        check('and it names the outcome',
            /verified|complete|done/i.test(cb.text), cb.text.slice(0, 200));

        // The test provider path, which must still work.
        const save2 = await call('POST', '/sh/reward/save', {
            token: OWNER.token,
            reward: {
                name: 'TestReward', keyDurationH: 1, maxKeys: 1,
                checkpoints: [{ id: 'cp_t', name: 'T', provider: 'test', shortUrl: 'https://example.com/t', settings: {} }],
            },
        });
        const rid2 = save2.rid;
        const s2 = await call('POST', '/sh/reward/start', { rid: rid2, fp: 'fp_probe_2' });
        const ses2key = [...KV._store.keys()].find(k => k.startsWith('sh_rs_' + rid2 + '_'));
        const ses2 = JSON.parse(KV._store.get(ses2key));
        ses2.stepAt = Date.now() - 30000;
        KV._store.set(ses2key, JSON.stringify(ses2));
        const t2 = new URL(s2.step.verifyUrl).searchParams.get('t');
        const cb2 = await call('GET', '/sh/cp/test?t=' + encodeURIComponent(t2) + '&confirmed=1', null);
        check('the test provider completes and records it', !/failed/i.test(cb2.text), cb2.text.slice(0, 160));

        const st2 = await call('GET', '/sh/reward/state?rid=' + rid2 + '&fp=fp_probe_2');
        check('the session now reports the checkpoint done',
            st2.done >= 1, 'done=' + st2.done + ' of ' + st2.total);
        check('and the reward is complete', st2.complete === true);

        // The claim now works, which is the whole point.
        const claim = await call('POST', '/sh/reward/claim', { rid: rid2, fp: 'fp_probe_2' });
        check('a completed reward can be claimed', claim.ok === true && !!claim.key,
            JSON.stringify(claim).slice(0, 140));

        // And the counter the panel shows must have moved.
        const saved = JSON.parse(KV._store.get('sh_rw_' + rid2));
        check('the server-side completion counter moved',
            saved.checkpoints[0].completed >= 1, 'completed=' + saved.checkpoints[0].completed);
    }
}

// --- the save must not trust the client's counters -------------------------
console.log('');
console.log('an owner save cannot erase the completion history');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 's', SH_DB: makeD1(),
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

    const OWNER = {};
    {
        const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
        }), env, { waitUntil() { } });
        const lj = JSON.parse(await lr.text());
        OWNER.token = lj.token;
        if (!OWNER.token) { console.error('owner login failed: ' + JSON.stringify(lj)); process.exit(1); }
    }

    const first = await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: { name: 'C', keyDurationH: 1, maxKeys: 1, checkpoints: [{ id: 'cp1', name: 'One', provider: 'test', shortUrl: 'https://e.com', settings: {} }] },
    });
    const rid = first.rid;

    // pretend the server has counted 7 completions
    const rec = JSON.parse(KV._store.get('sh_rw_' + rid));
    rec.checkpoints[0].completed = 7;
    KV._store.set('sh_rw_' + rid, JSON.stringify(rec));

    // the owner's browser, holding a STALE copy, saves an edit
    // The SAME reward: the rid must be echoed back, or the worker mints a new one
    // and the "edit" silently becomes a create. Without this the assertions
    // below were vacuous - they read back the ORIGINAL record and never touched
    // what a save produced.
    const resave = await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            rid: rid,
            name: 'C renamed', keyDurationH: 1, maxKeys: 1,
            checkpoints: [{ id: 'cp1', name: 'One', provider: 'test', shortUrl: 'https://e.com', settings: {}, completed: 0, cancelled: 0, avgTimeSec: 0 }],
        },
    });
    check('the edit is accepted', resave.ok === true, JSON.stringify(resave).slice(0, 120));
    const after = JSON.parse(KV._store.get('sh_rw_' + rid));
    check('the server-side count survived the edit', after.checkpoints[0].completed === 7,
        'the client sent 0 and overwrote 7');
    check('the rename still took effect', after.name === 'C renamed', after.name);

    // Reordering must not move history onto a different checkpoint.
    const a = await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            name: 'D', keyDurationH: 1, maxKeys: 1,
            checkpoints: [
                { id: 'cp1', name: 'One', provider: 'test', shortUrl: 'https://e.com', settings: {} },
                { id: 'cp2', name: 'Two', provider: 'test', shortUrl: 'https://e.com', settings: {} },
            ],
        },
    });
    const rid3 = a.rid;
    const rec3 = JSON.parse(KV._store.get('sh_rw_' + rid3));
    rec3.checkpoints[1].completed = 5;
    KV._store.set('sh_rw_' + rid3, JSON.stringify(rec3));
    await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            rid: rid3,
            name: 'D', keyDurationH: 1, maxKeys: 1,
            // swapped order
            checkpoints: [
                { id: 'cp2', name: 'Two', provider: 'test', shortUrl: 'https://e.com', settings: {} },
                { id: 'cp1', name: 'One', provider: 'test', shortUrl: 'https://e.com', settings: {} },
            ],
        },
    });
    const rec3b = JSON.parse(KV._store.get('sh_rw_' + rid3));
    check('reordering keeps each checkpoint history with its own checkpoint',
        rec3b.checkpoints[0].id === 'cp2' && rec3b.checkpoints[0].completed === 5,
        'cp2 now has ' + rec3b.checkpoints[0].completed);
}

// --- an unsupported provider must be refused, not dropped -------------------
console.log('');
console.log('an unverifiable provider is refused loudly');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 's', SH_DB: makeD1(),
    };
    // A CODE token from /sh/login - the owner gate accepts that, not the raw code.
    const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
    }), env, { waitUntil() { } });
    const OWNER = JSON.parse(await lr.text());
    if (!OWNER.token) { console.error('owner login failed: ' + JSON.stringify(OWNER)); process.exit(1); }

    const res = await worker.fetch(new Request('https://t.workers.dev/sh/reward/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: OWNER.token,
            reward: {
                name: 'Bad', keyDurationH: 1, maxKeys: 1,
                checkpoints: [
                    { id: 'ok1', name: 'Fine', provider: 'test', shortUrl: 'https://e.com', settings: {} },
                    { id: 'bad', name: 'Nope', provider: 'rinku', shortUrl: 'https://e.com', settings: {} },
                ],
            },
        }),
    }), env, { waitUntil() { } });
    const json = JSON.parse(await res.text());
    check('the save is refused', res.status === 400 && json.ok === false,
        'HTTP ' + res.status + ' ' + JSON.stringify(json).slice(0, 120));
    check('and it names the provider', /rinku/.test(JSON.stringify(json)));
    check('nothing was written, so no reward was quietly truncated',
        ![...KV._store.keys()].some(k => k.startsWith('sh_rw_') && /"rinku"/.test(KV._store.get(k))));

    // Only the ARRAY LITERAL, not the whole file: the comment above it names the
    // removed providers to explain why they went, so a whole-file grep matches
    // the explanation.
    const providerBlock = (rewardsSrc.match(/const REWARD_PROVIDERS = \[[\s\S]*?\];/) || [''])[0];
    check('the panel no longer offers providers the worker cannot verify',
        !/admint|shrtfly|shrinkearn|kicia|rinku/.test(providerBlock),
        'the dropdown still offers providers that /sh/reward/save refuses');
    // Match the table as a WHOLE rather than a fixed character budget: slicing it
    // to 400 bytes silently dropped `workink`, which sits past the cut, and the
    // check then reported a provider as unverified when it is verified.
    const workerProviderTable = (workerSrc.match(/REWARD_PROVIDERS = \{[\s\S]*?\n\};/) || [''])[0];
    check('and every provider it does offer is one the worker verifies',
        [...providerBlock.matchAll(/id:\s*'([a-z]+)'/g)]
            .every(m => new RegExp('(^|[\\s{,])' + m[1] + '\\s*:').test(workerProviderTable)),
        'a listed provider is missing from the worker table, so saves using it would be refused. worker table: '
        + workerProviderTable.replace(/\s+/g, ' ').slice(0, 160));
    check('the worker table was actually found', workerProviderTable.length > 0,
        'the test could not locate REWARD_PROVIDERS, so the check above proves nothing');
}

// --- the poll must not starve itself ----------------------------------------
console.log('');
console.log('the progress poll is not starved by its own budget');
{
    check('the state route uses its own rate bucket',
        /\/sh\/reward\/state'[\s\S]{0,400}reward-state/.test(workerSrc),
        'it shares a bucket with pub/start and a 4s poll exhausts it');
    check('that bucket exists and is sized for a poll',
        /'reward-state':\s*\{\s*limit:\s*\d+/.test(workerSrc));
}

console.log('');
console.log('REWARD COMPLETABLE   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);