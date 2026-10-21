// tools/reward_security_test.mjs
//
// THE REWARD SYSTEM, TESTED AS AN ATTACKER AND AS A VISITOR.
//
// Two halves, and both matter:
//
//   LEGITIMATE  - a real visitor must be able to finish a reward, in order,
//                 without losing progress to a refresh, a retry, a second tab
//                 or a provider that was briefly down.
//
//   UNAUTHORISED - every way of getting a key WITHOUT the ads must fail:
//                 calling the completion endpoint directly, replaying a
//                 callback, guessing a click id, changing the checkpoint id,
//                 calling the claim endpoint early, replaying a callback url.
//
// The provider is stubbed AT THE NETWORK EDGE, so the worker's decision is what
// is under test and not the provider's uptime. The stub is switched between
// modes (confirm / refuse / time out) so both the honest and the dishonest
// paths can be driven.
//
// Run: node tools/reward_security_test.mjs
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeD1 } from './d1_shape.mjs';

const worker = (await import(new URL('../For Cloudflare/worker.js', import.meta.url))).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
};

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        async list(opts = {}) {
            const prefix = String(opts.prefix || '');
            const names = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
            const from = Math.max(0, names.indexOf(String(opts.cursor || '')));
            const slice = names.slice(from, from + 100);
            return { keys: slice.map(n => ({ name: n })), list_complete: true, cursor: null };
        },
        _store: store,
    };
}
// The D1 mock returns the SHAPE D1 returns - see tools/d1_shape.mjs.

console.log('REWARD SECURITY   legitimate progression and unauthorized progression');
console.log('-'.repeat(72));

// --- the world ---------------------------------------------------------------
const KV = makeKV();
const env = {
    LOADERS_KV: KV, SH_SETUP_TOKEN: 'SETUP', SH_BASE_URL: 'https://t.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH, SH_SESSION_SECRET: 'sess-secret', SH_DB: makeD1(),
};
const SITE = 'https://site.example/Scripter-s-Obfuscator';
const IP = '203.0.113.10';

let clock = Date.parse('2026-01-01T12:00:00Z');
const realNow = Date.now;
Date.now = () => clock;

// THE PROVIDER. Three modes, switched at will.
let providerMode = 'confirm';   // confirm | refuse | down | empty
const asked = [];
const realFetch = globalThis.fetch;
// THE CLICKS THE PROVIDER KNOWS ABOUT. The provider confirms one of these
// and says "FALSE" for anything else, which is what it does.
const KNOWN_CLICKS = new Set(['click-one', 'click-two', 'click-up', 'hash-with-publisher',
    'hash-that-came-with-the-page', 'click-concurrent', 'click-conc-claim-1', 'click-conc-claim-2',
    'click-for-a', 'a'.repeat(64), 'pb-2']);

globalThis.fetch = async (u, o) => {
    const url = String(u);
    if (url.indexOf('linkvertise.com') !== -1) {
        asked.push(url);
        // The outage comes FIRST: a provider that is down answers nothing on
        // any address, which is the difference between "not verified yet" and
        // "the endpoint is wrong".
        if (providerMode === 'down') throw new Error('provider down');
        // Only the REAL route answers:
        //
        //     POST publisher.linkvertise.com/api/v1/anti_bypassing
        //          ?token=<64 char token>&hash=<64 char hash>
        //
        // Anything else on the API host answers the way the real API does for
        // an unknown route, so a wrong verification url is diagnosed as a
        // wrong url and not as a working one.
        if (url.indexOf('publisher.linkvertise.com/api/v1/anti_bypassing') === -1) {
            return new Response(JSON.stringify({ success: false, error: true, messages: ['Not Found!'], state: 404 }),
                { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        if (providerMode === 'refuse') return new Response(JSON.stringify({ status: false }), { status: 200 });
        if (providerMode === 'empty') return new Response('{}', { status: 200 });
        // THE REAL SHAPE. Linkvertise's anti-bypass API answers in JSON:
        //
        //     {"status":true}    the hash was found and deleted
        //     {"status":false}   the hash was not found
        //
        // A diagnostic probe carries a hash that cannot exist, and gets the
        // false that proves the endpoint and the token are right.
        //
        // IT ONLY CONFIRMS A CLICK IT HAS SEEN. The stub used to say yes to
        // everything, which is not how a provider behaves and it hid the
        // question this test exists to answer.
        const m = url.match(/[?&]hash=([^&]+)/);
        const hash = m ? decodeURIComponent(m[1]) : '';
        if (hash.indexOf('sh-diagnostic') === 0) return new Response(JSON.stringify({ status: false }), { status: 200 });
        if (KNOWN_CLICKS.has(hash)) return new Response(JSON.stringify({ status: true }), { status: 200 });
        return new Response(JSON.stringify({ status: false }), { status: 200 });
    }
    return realFetch(u, o);
};

const call = async (method, path, body, headers = {}) => {
    const res = await worker.fetch(new Request('https://t.workers.dev' + path, {
        method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP, ...headers },
        body: body ? JSON.stringify(body) : undefined,
    }), env, { waitUntil() { } });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = {}; }
    return { status: res.status, headers: res.headers, text, ...json };
};
const raw = async (path, ip) => worker.fetch(new Request('https://t.workers.dev' + path, {
    headers: ip ? { 'CF-Connecting-IP': ip } : {},
}), env, { waitUntil() { } });

// --- the owner publishes a two-checkpoint reward ------------------------------
const OWNER = {};
{
    const lr = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: OWNER_CODE_PLAIN }),
    }), env, { waitUntil() { } });
    OWNER.token = JSON.parse(await lr.text()).token;
}
const save = await call('POST', '/sh/reward/save', {
    token: OWNER.token,
    reward: {
        name: 'SecurityReward', keyDurationH: 2, maxKeys: 1, cooldownH: 0,
        checkpoints: [
            { id: 'cp_one', name: 'One', provider: 'linkvertise', shortUrl: 'https://direct-link.net/one', settings: { authToken: 'tok' } },
            { id: 'cp_two', name: 'Two', provider: 'linkvertise', shortUrl: 'https://direct-link.net/two', settings: { authToken: 'tok' } },
        ],
    },
});
const RID = save.rid;
check('the owner can publish a two-checkpoint reward', save.ok === true && !!RID, JSON.stringify(save).slice(0, 160));

// A provider click, the way the provider reports one.
async function providerClick(index, clickId, ip) {
    return raw('/sh/cp/linkvertise?r=' + RID + '&i=' + index + '&site=' + encodeURIComponent(SITE)
        + '&click_id=' + encodeURIComponent(clickId) + (ip ? '&ip=' + encodeURIComponent(ip) : ''), ip);
}
async function openSession(fp) {
    const s = await call('POST', '/sh/reward/start', { rid: RID, fp });
    return s;
}
async function submit(fp, clickId, sid) {
    return call('POST', '/sh/reward/complete', { rid: RID, fp, sid: sid || '', clickId });
}
const FP = 'fpvisitor0000001';

console.log('');
console.log('LEGITIMATE PROGRESSION');
{
    const s = await openSession(FP);
    check('a new session starts at checkpoint 1', s.ok === true && s.step && s.step.i === 0, JSON.stringify(s).slice(0, 160));

    // The visitor watches the ad and the provider sends them back.
    clock += 30000;
    const pb = await providerClick(0, 'click-one', IP);
    check('the provider callback answers with a redirect to the reward page',
        pb.status === 302 && (pb.headers.get('Location') || '').indexOf('resume=click-one') > 0,
        'status ' + pb.status);

    const done = await submit(FP, 'click-one', s.sid);
    check('the reported click completes the checkpoint', done.ok === true, JSON.stringify(done).slice(0, 160));
    check('and the progress says 1 of 2', done.done === 1 && done.total === 2, JSON.stringify(done).slice(0, 160));

    // THE REFRESH. Progress must survive it.
    const st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP);
    check('a refresh keeps the progress', st.ok === true && st.done === 1 && st.doneList.indexOf(0) !== -1,
        JSON.stringify(st).slice(0, 160));

    // THE SECOND CHECKPOINT UNLOCKS.
    const s2 = await openSession(FP);
    check('the next checkpoint is offered', s2.ok === true && s2.step && s2.step.i === 1, JSON.stringify(s2).slice(0, 160));

    // THE SECOND TAB. Another /start must not undo the first checkpoint.
    const s3 = await openSession(FP);
    check('a second visit does not roll the first checkpoint back', s3.done === 1, JSON.stringify(s3).slice(0, 160));

    clock += 30000;
    await providerClick(1, 'click-two', IP);
    const done2 = await submit(FP, 'click-two', s2.sid);
    check('the second checkpoint completes', done2.ok === true && done2.done === 2, JSON.stringify(done2).slice(0, 160));

    // THE KEY. And then it must be VISIBLE.
    const claim = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP });
    check('the key is issued once every checkpoint is verified',
        claim.ok === true && !!(claim.key || (claim.keys || []).length), JSON.stringify(claim).slice(0, 160));
    check('and it is a real server-minted license key', typeof claim.key === 'string' && claim.key.length >= 32,
        'key length ' + (claim.key || '').length);

    // THE STATE MUST SHOW THE KEY.
    //
    // This is the exact bug that was found by running the real thing in a real
    // browser against the deployed worker: the key was minted, the claim said
    // so, and the visitor's table said "no keys yet" - because D1's .all()
    // returns {results:[...]} and the code called .map on it. The test mock
    // used node:sqlite, whose .all() returns an array, so it passed. The mock
    // now returns the shape D1 returns (tools/d1_shape.mjs), and this
    // assertion is here so it cannot come back.
    const after = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP);
    check('the state route shows the key that was just issued',
        after.ok === true && (after.keys || []).length === 1 && after.keys[0].key === claim.key,
        'keys=' + JSON.stringify(after.keys || []).slice(0, 120));

    // AND ONLY ONCE - because the key SPENT the checkpoints.
    //
    // The second claim is refused outright: the visitor is back at 0/N, so
    // the ad has to be watched again. That is a stronger guarantee than a
    // cap - there is no path from "one ad" to "a second key" at all - and it
    // is how every other key system works.
    const claim2 = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP });
    check('a second claim does not mint a second key',
        claim2.ok === false && /checkpoints are complete/.test(String(claim2.error || '')),
        JSON.stringify(claim2).slice(0, 160));
    const after2 = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP);
    check('and the progress is back at zero',
        after2.ok === true && after2.done === 0,
        JSON.stringify(after2).slice(0, 140));
    check('while the key they earned is still theirs',
        (after2.keys || []).length === 1,
        'keys=' + JSON.stringify(after2.keys || []).slice(0, 120));
}

console.log('');
console.log('A PROVIDER THAT IS HAVING A BAD DAY');
{
    const FP2 = 'fpvisitor0000002';
    const s = await openSession(FP2);
    check('the session opens', s.ok === true);

    // The provider is DOWN when the visitor comes back.
    providerMode = 'down';
    const pb = await providerClick(0, 'click-down', IP);
    const body = await pb.text();
    check('a provider outage does not complete the checkpoint', body.indexOf('Not verified yet') !== -1,
        body.slice(0, 120));
    const st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP2);
    check('and the progress is still 0', st.done === 0, JSON.stringify(st).slice(0, 120));

    // The provider comes back, and the visitor watches the ad again.
    providerMode = 'confirm';
    clock += 30000;
    await providerClick(0, 'click-up', IP);
    const done = await submit(FP2, 'click-up', s.sid);
    check('the retry counts once the provider answers', done.ok === true && done.done === 1,
        JSON.stringify(done).slice(0, 160));

    // A RETRY of the same submit must not count twice.
    const again = await submit(FP2, 'click-up', s.sid);
    const st2 = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP2);
    check('a repeated submit does not count twice', st2.done === 1,
        'done=' + st2.done + ' reply=' + JSON.stringify(again).slice(0, 120));
}

console.log('');
console.log('UNAUTHORISED PROGRESSION');
{
    const FP3 = 'fpvisitor0000003';
    const s = await openSession(FP3);
    check('a session opens', s.ok === true);

    // 1. THE COMPLETION ENDPOINT, CALLED DIRECTLY, WITH NO CLICK.
    const direct = await submit(FP3, '', s.sid);
    check('a completion with no click id is refused', direct.ok === false,
        JSON.stringify(direct).slice(0, 160));
    let st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP3);
    check('and the progress did not move', st.done === 0, JSON.stringify(st).slice(0, 120));

    // 2. A GUESSED CLICK ID.
    const guessed = await submit(FP3, 'click-i-made-up', s.sid);
    check('a click id nobody reported is refused', guessed.ok === false,
        JSON.stringify(guessed).slice(0, 160));

    // 3. success=true IN THE URL, AND EVERY OTHER CLIENT-CONTROLLED FLAG.
    const flags = await call('POST', '/sh/reward/complete',
        { rid: RID, fp: FP3, sid: s.sid, clickId: '', success: true, done: 1, completed: true, verified: true });
    check('success=true in the body does not complete anything', flags.ok === false,
        JSON.stringify(flags).slice(0, 160));

    // 4. A CALLBACK URL OPENED BY HAND, WITH A REAL CLICK ID SOMEONE ELSE MADE.
    const stolen = await providerClick(0, 'click-one', IP);
    check('a click that was already spent is not accepted again',
        (await stolen.text()).indexOf('click-replayed') !== -1 || stolen.status === 200,
        'status ' + stolen.status);

    // 5. THE CLAIM BEFORE THE CHECKPOINTS ARE DONE.
    const early = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP3 });
    check('a claim before the checkpoints are done is refused', early.ok === false,
        JSON.stringify(early).slice(0, 160));

    // 6. A CALLBACK FOR THE WRONG CHECKPOINT.
    clock += 30000;
    await providerClick(1, 'click-wrong-step', IP);
    const wrongStep = await submit(FP3, 'click-wrong-step', s.sid);
    check('a click for a different checkpoint is refused', wrongStep.ok === false,
        JSON.stringify(wrongStep).slice(0, 160));

    // 7. A CALLBACK MADE FROM A DIFFERENT NETWORK.
    await providerClick(0, 'click-elsewhere', '198.51.100.7');
    const otherNet = await submit(FP3, 'click-elsewhere', s.sid);
    check('a click made on another network is refused', otherNet.ok === false,
        JSON.stringify(otherNet).slice(0, 160));

    // 8. A CALLBACK WITH A MODIFIED CHECKPOINT ID.
    const tampered = await raw('/sh/cp/linkvertise?r=' + RID + '&i=99&site=' + encodeURIComponent(SITE) + '&click_id=click-tampered');
    check('a callback naming a checkpoint that does not exist is refused',
        tampered.status === 200 && (await tampered.text()).indexOf('unknown-step') !== -1,
        'status ' + tampered.status);

    // 9. THE PROVIDER SAYING NO.
    providerMode = 'refuse';
    const refused = await providerClick(0, 'click-refused', IP);
    check('a click the provider does not confirm is not counted',
        (await refused.text()).indexOf('could not be verified') !== -1 || refused.status !== 302,
        'status ' + refused.status);
    providerMode = 'confirm';

    // 10. THE PROVIDER ANSWERING WITH NOTHING.
    providerMode = 'empty';
    const empty = await providerClick(0, 'click-empty', IP);
    check('an empty answer from the provider is not counted',
        (await empty.text()).indexOf('could not be verified') !== -1 || empty.status !== 302,
        'status ' + empty.status);
    providerMode = 'confirm';

    st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP3);
    check('after every one of those, the progress is STILL 0', st.done === 0,
        JSON.stringify(st).slice(0, 160));
    const early2 = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP3 });
    check('and no key can be claimed', early2.ok === false, JSON.stringify(early2).slice(0, 160));
}

console.log('');
console.log('THE REAL LINKVERTISE SHAPE');
{
    // Linkvertise's anti-bypass does not send a click id. It appends
    // `?hash=<64 characters>` to the target url, the hash lives for TEN
    // SECONDS, and it is deleted when it is verified.
    //
    // The parameter list used to be click_id / clickid / clickId / unique_id /
    // c. The hash was invisible, so no evidence was ever found and NO
    // Linkvertise checkpoint could complete - for the owner, for a visitor, or
    // for a test.
    const FPH = 'fpvisitorhash00001';
    const s = await openSession(FPH);
    check('a session opens', s.ok === true);
    clock += 30000;
    const askedBefore = asked.length;
    const pb = await raw('/sh/cp/linkvertise?r=' + RID + '&i=0&site=' + encodeURIComponent(SITE)
        + '&hash=' + 'a'.repeat(64));
    check('the provider redirect with ?hash= is accepted', pb.status === 302,
        'status ' + pb.status + ' - the hash is the evidence and it was not found');
    const done = await submit(FPH, 'a'.repeat(64), s.sid);
    check('and the checkpoint completes', done.ok === true, JSON.stringify(done).slice(0, 160));
    check('and the provider was asked about the hash',
        asked.some(u => u.indexOf('hash=' + 'a'.repeat(64)) !== -1),
        'the hash was never sent to the provider');
    // The endpoint is documented, so it is known, and a KNOWN address is asked
    // on its own. The search is a burst, and a burst next to the one request
    // that matters is how a provider starts rate limiting.
    check('and it was asked at the documented address',
        asked.slice(askedBefore).some(u => u.indexOf('publisher.linkvertise.com/api/v1/anti_bypassing') !== -1),
        'asked at ' + (asked.slice(askedBefore)[0] || 'nothing'));
    check('and it was asked ONCE',
        asked.length - askedBefore === 1,
        'the provider was asked ' + (asked.length - askedBefore) + ' times');
}

console.log('');
console.log('THE OWNER CAN ASK THE PROVIDER WHETHER IT IS CONFIGURED');
{
    const probe = await call('POST', '/sh/reward/test-provider', { rid: RID, index: 0, token: OWNER.token });
    check('the test route answers', probe.ok === true, JSON.stringify(probe).slice(0, 160));
    check('and it says the provider is usable', probe.usable === true,
        'verdict=' + probe.verdict + ' answer=' + String(probe.answer).slice(0, 80));
    // The provider's own answer is shown, so the owner sees exactly what the
    // API said. Linkvertise's anti-bypass answers in JSON.
    check('and it shows the provider\'s own answer', String(probe.answer).indexOf('status') !== -1,
        'answer=' + String(probe.answer).slice(0, 80));
    check('and it names the address that answered',
        String(probe.url).indexOf('/api/v1/anti_bypassing') !== -1, 'url=' + String(probe.url));

    // A wrong endpoint must be diagnosed, not swallowed.
    const saved = await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            rid: RID,
            name: 'SecurityReward', keyDurationH: 2, maxKeys: 1, cooldownH: 0,
            checkpoints: [
                { id: 'cp_one', name: 'One', provider: 'linkvertise', shortUrl: 'https://direct-link.net/one', settings: { authToken: 'tok', verifyUrl: 'https://api.linkvertise.com/api/v1/nonsense' } },
                { id: 'cp_two', name: 'Two', provider: 'linkvertise', shortUrl: 'https://direct-link.net/two', settings: { authToken: 'tok' } },
            ],
        },
    });
    check('a checkpoint with a wrong verification url saves', saved.ok === true, JSON.stringify(saved).slice(0, 160));
    const bad = await call('POST', '/sh/reward/test-provider', { rid: RID, index: 0, token: OWNER.token });
    // A SAVED ADDRESS IS A PREFERENCE, NOT A LOCK-OUT. A checkpoint that was
    // once pointed at a wrong address used to stay wrong forever, and the only
    // way out was to edit the field by hand. Now the documented address is
    // tried as well, so a stale one cannot wedge the checkpoint.
    check('and a wrong saved address does not wedge it', bad.usable === true,
        'verdict=' + bad.verdict);
    check('and the address that answered is the documented one',
        String(bad.url || '').indexOf('anti_bypassing') !== -1, 'url=' + String(bad.url));
    // Put it back.
    await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            rid: RID,
            name: 'SecurityReward', keyDurationH: 2, maxKeys: 1, cooldownH: 0,
            checkpoints: [
                { id: 'cp_one', name: 'One', provider: 'linkvertise', shortUrl: 'https://direct-link.net/one', settings: { authToken: 'tok' } },
                { id: 'cp_two', name: 'Two', provider: 'linkvertise', shortUrl: 'https://direct-link.net/two', settings: { authToken: 'tok' } },
            ],
        },
    });
}

console.log('');
console.log('THE PUBLISHER ID IS SENT WITH THE VERIFICATION');
{
    // The publisher id comes from the Full Script API snippet on the
    // Linkvertise dashboard: linkvertise(1294304, {...}).
    const FPP = 'fpvisitorpubid0001';
    await call('POST', '/sh/reward/save', {
        token: OWNER.token,
        reward: {
            rid: RID,
            name: 'SecurityReward', keyDurationH: 2, maxKeys: 1, cooldownH: 0,
            checkpoints: [
                { id: 'cp_one', name: 'One', provider: 'linkvertise', shortUrl: 'https://direct-link.net/one', settings: { authToken: 'tok', publisherId: '1294304' } },
                { id: 'cp_two', name: 'Two', provider: 'linkvertise', shortUrl: 'https://direct-link.net/two', settings: { authToken: 'tok' } },
            ],
        },
    });
    const s = await openSession(FPP);
    clock += 30000;
    await providerClick(0, 'hash-with-publisher', IP);
    const done = await submit(FPP, 'hash-with-publisher', s.sid);
    check('the checkpoint still completes', done.ok === true, JSON.stringify(done).slice(0, 160));
    check('and the publisher id travelled with the request',
        asked.some(u => u.indexOf('publisher_id=1294304') !== -1),
        'the provider was asked without the publisher id');
}

console.log('');
console.log('A PROOF THAT ARRIVED AT THE PAGE, NOT THROUGH THE POSTBACK');
{
    // The owner's Linkvertise link can point at the REWARD PAGE, and then the
    // provider's proof arrives at the page instead of at the worker's
    // postback. The page hands it over and the worker verifies it with the
    // provider - a proof that was never parked is not automatically a
    // forgery.
    const FPP = 'fpvisitorpageproof';
    const s = await openSession(FPP);
    clock += 30000;
    const done = await submit(FPP, 'hash-that-came-with-the-page', s.sid);
    check('the proof is verified with the provider and it counts', done.ok === true,
        JSON.stringify(done).slice(0, 160));
    check('and the progress moved', done.done === 1, JSON.stringify(done).slice(0, 160));

    // The same proof a second time must not count twice: the provider deletes
    // it when it verifies it, and the worker parks it as spent.
    const again = await submit(FPP, 'hash-that-came-with-the-page', s.sid);
    const st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FPP);
    check('the same proof cannot be spent twice', st.done === 1,
        'done=' + st.done + ' reply=' + JSON.stringify(again).slice(0, 100));
}

console.log('');
console.log('CONCURRENCY');
{
    const FP4 = 'fpvisitor0000004';
    const s = await openSession(FP4);
    clock += 30000;
    await providerClick(0, 'click-concurrent', IP);
    // Two submits of the SAME click at the same time.
    const [a, b] = await Promise.all([submit(FP4, 'click-concurrent', s.sid), submit(FP4, 'click-concurrent', s.sid)]);
    const okCount = [a, b].filter(r => r.ok === true).length;
    check('two simultaneous submits of one click count ONCE', okCount >= 1, 'ok=' + okCount);
    const st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP4);
    check('and the progress is 1, not 2', st.done === 1, JSON.stringify(st).slice(0, 160));

    // Two simultaneous CLAIMS must not mint two keys. The reward allows ONE
    // key, so the pair has to finish every checkpoint first.
    const FP5 = 'fpvisitor0000005';
    const s5 = await openSession(FP5);
    clock += 30000;
    await providerClick(0, 'click-conc-claim-1', IP);
    await submit(FP5, 'click-conc-claim-1', s5.sid);
    const s5b = await openSession(FP5);
    clock += 30000;
    await providerClick(1, 'click-conc-claim-2', IP);
    await submit(FP5, 'click-conc-claim-2', s5b.sid);
    const [c1, c2] = await Promise.all([
        call('POST', '/sh/reward/claim', { rid: RID, fp: FP5 }),
        call('POST', '/sh/reward/claim', { rid: RID, fp: FP5 })
    ]);
    const minted = [c1, c2].filter(r => r.key).length;
    check('two simultaneous claims mint ONE key', minted === 1, 'minted=' + minted);
}

console.log('');
console.log('THE PROVIDER POSTBACK (server to server)');
{
    // LootLabs' documented mechanism: the provider calls us with click_id, ip
    // and unique_id, and the url carries a shared secret.
    const FP6 = 'fpvisitor0000006';
    const s6 = await openSession(FP6);
    clock += 30000;
    // A postback with the WRONG secret is refused.
    const bad = await call('GET', '/sh/reward/postback?rid=' + RID + '&step=0&key=wrong&click_id=pb-1&ip=' + IP);
    check('a postback with the wrong secret is refused', bad.ok === false, JSON.stringify(bad).slice(0, 160));
    // The provider calls us with the right secret.
    const pbKey = 'tok';
    const good = await call('GET', '/sh/reward/postback?rid=' + RID + '&step=0&key=' + pbKey + '&click_id=pb-2&ip=' + IP);
    check('a postback with the right secret is accepted', good.ok === true, JSON.stringify(good).slice(0, 160));
    // The visitor's own poll picks it up, bound by the IP.
    const st = await call('GET', '/sh/reward/state?rid=' + RID + '&fp=' + FP6);
    check('and the visitor\'s poll counts it', st.done === 1, JSON.stringify(st).slice(0, 160));
}

console.log('');
console.log('SESSION ISOLATION');
{
    // A different fingerprint must not be able to spend somebody else\'s click.
    const FPA = 'fpvisitor000000a';
    const FPB = 'fpvisitor000000b';
    const sa = await openSession(FPA);
    clock += 30000;
    await providerClick(0, 'click-for-a', IP);
    const b = await submit(FPB, 'click-for-a', sa.sid);
    check('a click cannot be spent by a different browser', b.ok === false, JSON.stringify(b).slice(0, 160));
    const a = await submit(FPA, 'click-for-a', sa.sid);
    check('but the browser it belongs to can spend it', a.ok === true, JSON.stringify(a).slice(0, 160));
}

Date.now = realNow;
globalThis.fetch = realFetch;

console.log('');
console.log('='.repeat(72));
console.log('REWARD SECURITY   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
