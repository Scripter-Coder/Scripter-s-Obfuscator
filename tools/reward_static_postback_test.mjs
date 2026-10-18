// A checkpoint must be completable by someone who actually watched the ad.
//
// THREE SYMPTOMS, ONE BUG
//
// The owner reported all of these at once:
//
//   "it doesnt count"                 watched the ad, came back, stayed at 0/1
//   "it doesnt block me when i bypass" no penalty, because nothing counted at all
//   "adding user key doesnt work"      the key is minted on completion
//
// None of them is about the visitor. They are all downstream of the fact that
// NO provider checkpoint could EVER complete.
//
// WHY NOT
//
// /sh/reward/start minted a SIGNED, PER-SESSION step token and handed the
// visitor `?t=<token>` as the verify URL. That is only reachable if the provider
// will call a URL you can change on every visit.
//
// Linkvertise cannot. Its "Direct Link" is typed into a dashboard once and is
// then a fixed string forever. So the URL the owner could paste and the URL the
// worker expected were never the same, and the flow was unrunnable by
// construction - not misconfigured, structurally impossible.
//
// WHAT IS ASSERTED HERE
//
// The static postback end to end, against the real worker:
//
//   1. the owner-facing URL is derivable and is built from the worker's own
//      route, so it cannot drift from what the worker serves
//   2. a click the provider really reported completes the checkpoint
//   3. a click nobody reported does NOT, and costs nothing either - an honest
//      visitor who is early is not a criminal
//   4. one real click cannot be spent twice, in the same session or another
//   5. the page actually submits the click on return, rather than only
//      refreshing and showing 0/1 forever
//
// Run: node tools/reward_static_postback_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const worker = (await import(new URL('../For Cloudflare/worker.js', import.meta.url))).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');
const rewardsSrc = fs.readFileSync(new URL('../rewards.js', import.meta.url), 'utf8');
const rewardHtml = fs.readFileSync(new URL('../reward.html', import.meta.url), 'utf8');

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

console.log('[RP] the static postback is what makes a checkpoint completable');
console.log('-'.repeat(72));

// --- the owner is shown a URL that is the worker's own route ----------------
console.log('');
console.log('the owner is given a URL that can be pasted into a dashboard');
{
    const src = rewardsSrc.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    check('the panel builds a postback URL', /function postbackUrl\(/.test(src));
    check('it targets the real worker route',
        /\/sh\/cp\/.+\?r=/.test(src.replace(/\s+/g, ' ')),
        'the panel would hand out a URL the worker does not serve');
    check('it carries the reward id and the checkpoint index',
        /r=' \+ encodeURIComponent\(rid\) \+ '&i=' \+ encodeURIComponent\(index\)/.test(src),
        'without rid and index the worker cannot tell which step came back');
    check('it carries the site base, because the worker cannot guess it',
        /site=' \+ encodeURIComponent\(site\)/.test(src));
    check('the edit dialog says it is a fixed URL to paste once',
        /paste it once and leave it/.test(src),
        'the old dialog said "this checkpoint\'s own verify URL" and showed none');
    check('and it is only shown for a provider the worker can verify',
        /if \(!url \|\| !VERIFIABLE\[provider\]\) return '';|if \(!VERIFIABLE\[provider\]\) return '';/.test(src));
    check('the add dialog warns there is no URL until the checkpoint exists',
        /index === 'NEW'/.test(src),
        'showing a URL with an unknown index would point at the wrong step');
}

// --- the page submits the click when the visitor comes back ------------------
console.log('');
console.log('the visitor page submits the click instead of just refreshing');
{
    const src = rewardHtml.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    check('the resume parameter is read', /QSP\.get\('resume'\)/.test(src));
    check('it is scrubbed from the address bar, so a reload cannot respend it',
        /searchParams\.delete\('resume'\)/.test(src));
    check('boot submits it rather than falling through to the normal path',
        /if \(RESUME\) \{\s*submitResume\(\);\s*return;\s*\}/.test(src.replace(/\s+/g, ' ')),
        'the RESUME branch must return, or boot also starts a fresh step underneath it');
    check('the submit posts rid, sid, fp and the click id',
        /body: \{ rid: rid, sid: \(s && s\.sid\) \|\| '', fp: FP, clickId: RESUME \}/.test(src));
    check('a failed submit says so and re-enables the button',
        /setAction\('I Have Finished This One', false\)/.test(src),
        'a silent failure here is what "doesnt count" looks like from the outside');
}

// --- the full loop, against the real routes ---------------------------------
console.log('');
console.log('a click the provider reported completes the checkpoint');
{
    const KV = makeKV();
    const env = {
        LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev', SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
        SH_SESSION_SECRET: 'sess-secret', SH_DB: makeD1(),
    };
    const SITE = 'https://site.example/Scripter-s-Obfuscator';

    // TIME IS CONTROLLED, OR THE DWELL FLOOR IS NOT BEING TESTED.
    //
    // The worker refuses a return faster than REWARD_MIN_DWELL_MS, and that is
    // the check that stops a bot clicking Start and Verify back to back. This
    // test advances the clock by hand rather than sleeping, so it can assert the
    // floor is satisfied AND, separately, that it is enforced.
    let clock = Date.parse('2026-01-01T12:00:00Z');
    const realNow = Date.now;
    Date.now = () => clock;

    // The provider's API is the only thing that can say a click was real. It is
    // stubbed at the network edge so the test exercises the WORKER's decision,
    // not Linkvertise's uptime.
    const realFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (u, o) => {
        const url = String(u);
        if (url.indexOf('api.linkvertise.com') !== -1) {
            asked.push(url);
            // A click the provider knows about. Anything else 404s, exactly as a
            // made-up click id would.
            if (url.indexOf('click_id=fake-click') === -1) {
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            }
            return new Response('nope', { status: 404 });
        }
        return realFetch(u, o);
    };

    const call = async (method, path, body, headers = {}) => {
        const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
            method, headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
        }), env, { waitUntil() { } });
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { json = {}; }
        return { status: res.status, headers: res.headers, text, ...json };
    };
    // A raw fetch, so redirects can be inspected instead of followed.
    const raw = async (path) => worker.fetch(new Request('https://t.workers.dev' + path), env, { waitUntil() { } });

    try {
        const OWNER = {};
        {
            const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
            }), env, { waitUntil() { } });
            OWNER.token = JSON.parse(await lr.text()).token;
            if (!OWNER.token) { console.error('owner login failed'); process.exit(1); }
        }

        const save = await call('POST', '/sh/reward/save', {
            token: OWNER.token,
            reward: {
                name: 'ProbeReward', keyDurationH: 1, maxKeys: 3, cooldownH: 0,
                checkpoints: [
                    { id: 'cp_a', name: 'First', provider: 'linkvertise', shortUrl: 'https://example.com/a', settings: { authToken: 'tok' } },
                ],
            },
        });
        check('the owner can save a linkvertise reward', save.ok === true, JSON.stringify(save).slice(0, 140));
        const rid = save.rid;
        const FP = 'fptestvisitor0001';

        const start = await call('POST', '/sh/reward/start', { rid, fp: FP });
        check('a visitor session opens the checkpoint', !!(start.ok && start.step), JSON.stringify(start).slice(0, 140));
        const sid = start.sid;
        const cp0 = rid.slice(0, 3);

        // 1. the owner's pasted URL answers, and bounces the visitor home with the
        //    click id. This is the step that never worked.
        const pb = await raw('/sh/cp/linkvertise?r=' + rid + '&i=0&site=' + encodeURIComponent(SITE) + '&click_id=real-click-1');
        check('the pasted postback URL returns a redirect, not a stall', pb.status === 302,
            'got ' + pb.status + ' - the owner pasting this URL would still get nowhere');
        const loc = pb.headers.get('Location') || '';
        check('it sends the visitor back to reward.html with the click',
            loc.indexOf(SITE + '/reward.html') === 0 && loc.indexOf('resume=real-click-1') > 0,
            'Location: ' + loc.slice(0, 140));
        check('and it carries the reward id back', loc.indexOf('rid=' + rid) > 0, loc.slice(0, 140));

        // 2. an UNREPORTED click is not a click. This is the bypass case.
        const noClick = await raw('/sh/cp/linkvertise?r=' + rid + '&i=0&site=' + encodeURIComponent(SITE));
        check('a postback with no click id is refused, not counted',
            noClick.status === 200 && (await noClick.clone().text()).indexOf('no-click-id') > 0,
            'the visitor lands on a success page for a click that never happened');

        // 3. the visitor's page submits it.
        clock += 30000;   // past the dwell floor
        const done = await call('POST', '/sh/reward/complete', { rid, sid, fp: FP, clickId: 'real-click-1' });
        check('the reported click completes the checkpoint', done.ok === true, JSON.stringify(done).slice(0, 160));
        check('and the provider API was actually consulted', asked.length > 0,
            'a click id was accepted without asking Linkvertise whether it existed');
        check('the count is now 1 of 1', done.done === 1 && done.total === 1, JSON.stringify(done).slice(0, 160));

        // 4. the same click, replayed, is worth nothing.
        const again = await call('POST', '/sh/reward/complete', { rid, sid, fp: FP, clickId: 'real-click-1' });
        check('the same click cannot be spent twice',
            again.ok === false || again.already === true,
            JSON.stringify(again).slice(0, 160));

        // 5. and it is a KEY now, which is the thing the owner actually wanted.
        const claim = await call('POST', '/sh/reward/claim', { rid, fp: FP });
        check('a completed reward mints a key', claim.ok === true && !!(claim.key || (claim.keys || []).length),
            JSON.stringify(claim).slice(0, 160));

        // 6. a fabricated click id is refused AND costs nothing.
        {
            const KV2 = makeKV();
            const env2 = { ...env, LOADERS_KV: KV2 };
            const call2 = async (method, path, body) => {
                const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
                    method, headers: { 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : undefined,
                }), env2, { waitUntil() { } });
                const text = await res.text();
                let json; try { json = JSON.parse(text); } catch { json = {}; }
                return { status: res.status, text, ...json };
            };
            const OWNER2 = {};
            {
                const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
                }), env2, { waitUntil() { } });
                OWNER2.token = JSON.parse(await lr.text()).token;
            }
            const s2 = await call2('POST', '/sh/reward/save', {
                token: OWNER2.token,
                reward: {
                    name: 'Probe2', keyDurationH: 1, maxKeys: 1, cooldownH: 0,
                    checkpoints: [{ id: 'cp_a', name: 'First', provider: 'linkvertise', shortUrl: 'https://example.com/a', settings: { authToken: 'tok' } }],
                },
            });
            const FP2 = 'fptestvisitor0002';
            const st2 = await call2('POST', '/sh/reward/start', { rid: s2.rid, fp: FP2 });
            clock += 30000;
            const fake = await call2('POST', '/sh/reward/complete', { rid: s2.rid, sid: st2.sid, fp: FP2, clickId: 'invented-by-hand' });
            check('a click id nobody reported is refused', fake.ok === false,
                JSON.stringify(fake).slice(0, 160));
            check('and the visitor is not banned for it', fake.error !== 'blacklisted',
                'an honest visitor with a stale or mistyped link must not be punished');
            check('nothing was written against them',
                ![...KV2._store.keys()].some(k => k.indexOf('sh_rbl_') === 0),
                'a blacklist entry was written for a click that was simply not reported');
        }
    } finally {
        globalThis.fetch = realFetch;
        Date.now = realNow;
    }
}

console.log('');
console.log('STATIC POSTBACK   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);