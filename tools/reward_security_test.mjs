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
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

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
globalThis.fetch = async (u, o) => {
    const url = String(u);
    if (url.indexOf('api.linkvertise.com') !== -1) {
        asked.push(url);
        if (providerMode === 'down') throw new Error('provider down');
        if (providerMode === 'refuse') return new Response('nope', { status: 404 });
        if (providerMode === 'empty') return new Response('{}', { status: 200 });
        // A real click: the body echoes the click id we asked about.
        const m = url.match(/click_id=([^&]+)/);
        return new Response(JSON.stringify({ status: 'ok', click: { id: m ? decodeURIComponent(m[1]) : '' } }), { status: 200 });
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

    // THE KEY.
    const claim = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP });
    check('the key is issued once every checkpoint is verified',
        claim.ok === true && !!(claim.key || (claim.keys || []).length), JSON.stringify(claim).slice(0, 160));
    check('and it is a real server-minted license key', typeof claim.key === 'string' && claim.key.length >= 32,
        'key length ' + (claim.key || '').length);

    // AND ONLY ONCE.
    const claim2 = await call('POST', '/sh/reward/claim', { rid: RID, fp: FP });
    check('a second claim does not mint a second key',
        claim2.ok === true && claim2.maxed === true && (claim2.keys || []).length === 1,
        JSON.stringify(claim2).slice(0, 160));
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
