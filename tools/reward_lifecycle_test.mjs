// The parts of the key system that were quietly not working, and the four
// things the owner asked for on top of them.
//
//   1. THE KEY GATE. A script the owner marked "Require Key" was published
//      with NO GATE AT ALL, so any key - or no key - ran it. The upload took
//      the "free for everyone" branch, and that branch never carried the
//      gate.
//
//   2. THE PANEL SYNC DELETED EVERY REWARD KEY. The license route is a full
//      replace, and the panel's list never contained the keys a visitor
//      earned, so touching the Keys tab silently killed them.
//
//   3. A REPEATED FORGERY WAS NOT BLOCKED. The owner asked for a bypass
//      attempt to cost something; it cost an error message.
//
//   4. THE HAMMER. An expired key could not be brought back, and the owner
//      could not see the keys the reward had issued.
//
// This drives the real worker module over HTTP with a mocked KV and a
// D1-shaped database, and asserts the DECISIONS the worker makes.
//
// Run: node tools/reward_lifecycle_test.mjs

import { DatabaseSync } from 'node:sqlite';
import { makeD1 as makeD1Shape } from './d1_shape.mjs';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        _store: store
    };
}

const workerSrc = await import('../For Cloudflare/worker.js');
const worker = workerSrc.default;

const KV = makeKV();
const env = {
    LOADERS_KV: KV,
    SH_SETUP_TOKEN: 'TESTTOKEN123',
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1Shape()
};

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// THE PROVIDER.
//
// The real Linkvertise anti-bypass API, stubbed at the documented address,
// answering exactly what it answers:
//
//     {"status":true}    the hash was found and deleted
//     {"status":false}   the hash was not found
//
// The tests below need it to say FALSE - the provider does not know these
// proofs - and the network must not be involved.
const realFetch = globalThis.fetch;
globalThis.fetch = async function (u, o) {
    const url = String(u);
    if (url.indexOf('publisher.linkvertise.com/api/v1/anti_bypassing') !== -1) {
        return new Response(JSON.stringify({ status: false }), { status: 200 });
    }
    if (url.indexOf('linkvertise.com') !== -1) {
        return new Response(JSON.stringify({ success: false, error: true, messages: ['Not Found!'] }),
            { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(u, o);
};

// THE CLOCK.
//
// The dwell floor is four seconds, and a test that waited for it would take
// a minute. The clock is moved instead - the same thing the other reward
// tests do.
const realNow = Date.now;
let clock = realNow();
Date.now = function () { return clock; };

const BASE = 'https://sh.test';
async function call(method, path, { body, ip = '1.2.3.4', ua = 'Mozilla/5.0', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    const sendBody = body && method !== 'GET' && method !== 'HEAD';
    if (sendBody) headers['Content-Type'] = 'application/json';
    const req = new Request(BASE + path, {
        method, headers, body: sendBody ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil(p) { try { p && p.catch(() => {}); } catch (e) { } } });
}
async function j(res) {
    const t = await res.text();
    try { return { status: res.status, ...JSON.parse(t) }; } catch (e) { return { status: res.status, ok: false, _text: t }; }
}

const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
const owner = { token: login.token };
if (!owner.token) { console.error('owner login failed'); process.exit(1); }

// ---------------------------------------------------------------------------
console.log('');
console.log('A SCRIPT THAT DEMANDS A KEY IS A GATED SCRIPT');
// ---------------------------------------------------------------------------
//
// The owner ticked BOTH "Require Key" and "Free For Everyone" - the panel
// offers them side by side and never said they contradict each other. The
// upload took the free branch, and the free branch never wrote authRequired,
// so the loader asked the visitor for a key and nobody ever checked it.
{
    const id = 'ScripterHub0000000777';
    const up = await j(await call('POST', '/sh/upload', {
        token: owner.token,
        body: {
            name: 'Gated', user: 'tester', cipher: 'U0hPS0Zha2U=', keyHash: 'cafe',
            wantId: id, keyless: true, authRequired: true,
            splitKey: { paddedKey: [11, 22, 33, 44], t0: Date.now(), chk: 4242 }
        }
    }));
    check('the upload is accepted', up.ok === true, JSON.stringify(up).slice(0, 160));
    const meta = JSON.parse(KV._store.get('sh_meta_' + id) || '{}');
    check('and the script is NOT published as a free one', meta.keyless !== true,
        'keyless = ' + meta.keyless);
    check('and the gate is recorded', meta.authRequired === true,
        'authRequired = ' + meta.authRequired);
}

// A WRONG KEY MUST NOT GET A SESSION.
{
    await j(await call('POST', '/sh/licenses', {
        token: owner.token,
        body: { licenses: { 'REALKEY-1111': { hwid: '', expiresAt: 0, banned: false } } }
    }));
    const bad = await j(await call('POST', '/sh/session', {
        body: { id: 'ScripterHub0000000777', k: 'TEST', h: 'hwid-1' },
        ua: 'Roblox/570 Delta Executor'
    }));
    check('a wrong key is refused', String(bad._text || '').indexOf('SHERR') === 0,
        JSON.stringify(bad).slice(0, 160));
    const good = await j(await call('POST', '/sh/session', {
        body: { id: 'ScripterHub0000000777', k: 'REALKEY-1111', h: 'hwid-1' },
        ua: 'Roblox/570 Delta Executor'
    }));
    check('and the right key gets a session', String(good._text || '').indexOf('SHS') === 0,
        JSON.stringify(good).slice(0, 160));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE PANEL SYNC MUST NOT DELETE THE KEYS A VISITOR EARNED');
// ---------------------------------------------------------------------------
let RID = '';
let earnedKey = '';
{
    const saved = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: {
            reward: {
                name: 'Ad Key', keyDurationH: 6, maxKeys: 2, cooldownH: 0,
                allowExtending: true, extHours: 2, maxHours: 10,
                checkpoints: [
                    { id: 'cp1', name: 'Test', provider: 'test', shortUrl: 'https://example.invalid/t' }
                ]
            }
        }
    }));
    RID = saved.rid;
    check('the reward is saved', !!RID, JSON.stringify(saved).slice(0, 160));

    // The visitor finishes the checkpoint and claims a key.
    const st = await j(await call('POST', '/sh/reward/start', { body: { rid: RID, fp: 'fp_visitor_1' } }));
    check('the reward opens a session', !!st.sid, JSON.stringify(st).slice(0, 160));
    // The visitor comes back through the signed verify url the worker minted.
    const cbUrl = st.step.verifyUrl + '&confirmed=1';
    const cb = await worker.fetch(new Request(cbUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'CF-Connecting-IP': '1.2.3.4' }
    }), env, { waitUntil() { } });
    const cbHtml = await cb.text();
    check('the checkpoint verifies', /All checkpoints complete|Checkpoint done/.test(cbHtml),
        cbHtml.slice(0, 200));
    const claim = await j(await call('POST', '/sh/reward/claim', { body: { rid: RID, sid: st.sid, fp: 'fp_visitor_1' } }));
    earnedKey = claim.key || '';
    check('the visitor earns a key', earnedKey.length === 192, 'len = ' + earnedKey.length);

    // The key is a real license: the gate accepts it.
    const lic = await j(await call('GET', '/sh/licenses', { token: owner.token }));
    check('and it is in the license map', !!(lic.licenses && lic.licenses[earnedKey]),
        'the key is missing from sh_licenses');

    // NOW THE OWNER TOUCHES THE KEYS TAB. The panel sends its own list, and
    // the route used to replace the whole map with it.
    const synced = await j(await call('POST', '/sh/licenses', {
        token: owner.token,
        body: { licenses: { 'REALKEY-1111': { hwid: '', expiresAt: 0, banned: false } } }
    }));
    check('the panel sync is accepted', synced.ok === true, JSON.stringify(synced).slice(0, 160));
    const after = await j(await call('GET', '/sh/licenses', { token: owner.token }));
    check('and the earned key SURVIVES it', !!(after.licenses && after.licenses[earnedKey]),
        'the sync deleted the reward key');
    check('and the panel is told how many it kept', synced.keptRewardKeys === 1,
        'keptRewardKeys = ' + synced.keptRewardKeys);

    // And the key still opens the gate.
    const sess = await j(await call('POST', '/sh/session', {
        body: { id: 'ScripterHub0000000777', k: earnedKey, h: 'hwid-9' },
        ua: 'Roblox/570 Delta Executor'
    }));
    check('and the earned key still opens the gate', String(sess._text || '').indexOf('SHS') === 0,
        JSON.stringify(sess).slice(0, 160));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE OWNER CAN SEE THE KEYS THE REWARD HAS ISSUED');
// ---------------------------------------------------------------------------
{
    const listed = await j(await call('POST', '/sh/reward/keys', {
        token: owner.token, body: { rid: RID }
    }));
    check('the owner route answers', listed.ok === true, JSON.stringify(listed).slice(0, 160));
    check('and the earned key is in the list',
        !!(listed.keys && listed.keys.some(function (k) { return k.key === earnedKey; })),
        JSON.stringify(listed.keys || []).slice(0, 160));
    const noAuth = await j(await call('POST', '/sh/reward/keys', { body: { rid: RID } }));
    check('and it is not open to the public', noAuth.status === 401, 'status ' + noAuth.status);
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE HAMMER: AN EXPIRED KEY CAN BE BROUGHT BACK');
// ---------------------------------------------------------------------------
{
    // Age the key out: the ledger row and the mirror both.
    const db = env.SH_DB;
    await db.prepare('UPDATE reward_keys SET expires=? WHERE key_text=?').bind(1000, earnedKey).run();
    const map = JSON.parse(KV._store.get('sh_licenses') || '{}');
    if (map[earnedKey]) { map[earnedKey].expiresAt = 1000; KV._store.set('sh_licenses', JSON.stringify(map)); }

    const before = Date.now();
    const ext = await j(await call('POST', '/sh/reward/extend', {
        body: { rid: RID, fp: 'fp_visitor_1', key: earnedKey }
    }));
    check('the extend is accepted', ext.ok === true, JSON.stringify(ext).slice(0, 200));
    check('and it adds the owner\'s hours', ext.hours === 2, 'hours = ' + ext.hours);
    check('and the new expiry is in the future', Number(ext.expires) > before,
        'expires = ' + ext.expires);
    // IT ADDS TO WHAT IS LEFT, IT DOES NOT REPLACE IT.
    check('and it does not take the time the visitor already had',
        Number(ext.expires) >= Number(ext.expires) && ext.hours === 2,
        'expires = ' + ext.expires);
    const ledger = await env.SH_DB.prepare('SELECT expires FROM reward_keys WHERE key_text=?').bind(earnedKey).all();
    const rows = ledger.results || ledger;
    check('and the LEDGER moved', Number(rows[0].expires) === Number(ext.expires),
        'ledger = ' + rows[0].expires + ' vs ' + ext.expires);
    const mirror = JSON.parse(KV._store.get('sh_licenses') || '{}');
    check('and the LICENSE MIRROR moved', Number(mirror[earnedKey].expiresAt) === Number(ext.expires),
        'mirror = ' + mirror[earnedKey].expiresAt);

    // THE HAMMER ADDS TO WHAT IS LEFT.
    //
    // It used to buy the hours "from now", so a visitor with five hours left
    // would press it and be left with two. Time they already had is not
    // taken away from them.
    {
        const fiveHours = Date.now() + 5 * 3600000;
        await env.SH_DB.prepare('UPDATE reward_keys SET expires=? WHERE key_text=?').bind(fiveHours, earnedKey).run();
        const mapA = JSON.parse(KV._store.get('sh_licenses') || '{}');
        if (mapA[earnedKey]) { mapA[earnedKey].expiresAt = fiveHours; KV._store.set('sh_licenses', JSON.stringify(mapA)); }
        const add = await j(await call('POST', '/sh/reward/extend', {
            body: { rid: RID, fp: 'fp_visitor_1', key: earnedKey }
        }));
        check('a key that still has time is given MORE time, not less',
            add.ok === true && Number(add.expires) >= fiveHours,
            'expires = ' + add.expires + ', had ' + fiveHours);
        check('and the amount added is the owner\'s amount',
            Number(add.expires) >= fiveHours + 2 * 3600000 - 5000,
            'expires = ' + add.expires);
    }

    // The cap.
    await env.SH_DB.prepare('UPDATE reward_keys SET expires=? WHERE key_text=?').bind(1000, earnedKey).run();
    const map2 = JSON.parse(KV._store.get('sh_licenses') || '{}');
    if (map2[earnedKey]) { map2[earnedKey].expiresAt = 1000; KV._store.set('sh_licenses', JSON.stringify(map2)); }
    const capped = await j(await call('POST', '/sh/reward/extend', {
        body: { rid: RID, fp: 'fp_visitor_1', key: earnedKey }
    }));
    check('and the cap is respected', capped.ok === true && Number(capped.expires) <= before + 10 * 3600000 + 5000,
        JSON.stringify(capped).slice(0, 200));

    // Somebody else's key.
    const other = await j(await call('POST', '/sh/reward/extend', {
        body: { rid: RID, fp: 'fp_someone_else', key: earnedKey }
    }));
    check('and a stranger cannot extend it', other.ok === false, JSON.stringify(other).slice(0, 160));

    // A reward that does not allow it.
    const saved2 = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: {
            reward: {
                name: 'No Extend', keyDurationH: 6, maxKeys: 2, cooldownH: 0,
                allowExtending: false,
                checkpoints: [{ id: 'cp1', name: 'Test', provider: 'test', shortUrl: 'https://example.invalid/t' }]
            }
        }
    }));
    const noExt = await j(await call('POST', '/sh/reward/extend', {
        body: { rid: saved2.rid, fp: 'fp_visitor_1', key: earnedKey }
    }));
    check('and a reward with extending off refuses', noExt.ok === false,
        JSON.stringify(noExt).slice(0, 160));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('A REPEATED FORGERY IS BLOCKED, A SINGLE ONE IS NOT');
// ---------------------------------------------------------------------------
{
    const saved = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: {
            reward: {
                name: 'Forgery', keyDurationH: 6, maxKeys: 2, cooldownH: 0,
                checkpoints: [{ id: 'cp1', name: 'LV', provider: 'linkvertise', shortUrl: 'https://direct-link.net/a',
                    settings: { authToken: 'TOKEN' } }]
            }
        }
    }));
    const rid = saved.rid;
    await call('POST', '/sh/reward/start', { body: { rid: rid, fp: 'fp_cheater' } });
    // Past the dwell floor, so the check reaches the provider.
    clock += 5000;

    // The provider says "I do not know this click" for every proof the
    // cheater invents. The stub in the other tests answers that.
    const fp = 'fp_cheater';
    const first = await j(await call('POST', '/sh/reward/complete', {
        body: { rid: rid, fp: fp, clickId: 'a'.repeat(64) }
    }));
    check('the first invented proof is refused', first.ok === false, JSON.stringify(first).slice(0, 160));
    check('and it is NOT a block', first.error !== 'blacklisted', JSON.stringify(first).slice(0, 160));
    const blAfterFirst = [...KV._store.keys()].filter(function (k) { return k.indexOf('sh_rbl_') === 0; });
    check('and nothing was written against the visitor', blAfterFirst.length === 0,
        'wrote: ' + blAfterFirst.join(', '));

    clock += 1000;
    const second = await j(await call('POST', '/sh/reward/complete', {
        body: { rid: rid, fp: fp, clickId: 'b'.repeat(64) }
    }));
    check('the second one is still only a refusal', second.error !== 'blacklisted',
        JSON.stringify(second).slice(0, 200));

    clock += 1000;
    const third = await j(await call('POST', '/sh/reward/complete', {
        body: { rid: rid, fp: fp, clickId: 'd'.repeat(64) }
    }));
    check('the third one is a block', third.error === 'blacklisted', JSON.stringify(third).slice(0, 200));
    const blAfterThird = [...KV._store.keys()].filter(function (k) { return k.indexOf('sh_rbl_') === 0; });
    check('and the block is stored', blAfterThird.length === 1, 'wrote: ' + blAfterThird.join(', '));
    check('and it is a MINUTE, not hours', Number(third.until) - Date.now() <= 90 * 1000,
        'until - now = ' + (Number(third.until) - Date.now()));
    check('and it is on the FINGERPRINT, never the address',
        blAfterThird.length === 1 && blAfterThird[0].indexOf('ip_') === -1,
        'wrote: ' + blAfterThird.join(', '));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE KEY CHECK SPEAKS PLAIN TEXT, BECAUSE SOME EXECUTORS CANNOT DO JSON');
// ---------------------------------------------------------------------------
{
    const res = await call('GET', '/sh/keycheck?k=' + encodeURIComponent(earnedKey) + '&h=hwid-9');
    const body = (await res.text()).trim();
    check('it answers 200', res.status === 200, 'status ' + res.status);
    check('and the answer is TEXT, not JSON', body.indexOf('{') !== 0, body.slice(0, 80));
    check('and it says the key is good', body.indexOf('SHOK ') === 0, body.slice(0, 80));
    check('and it gives the expiry', /SHOK \d+ \d/.test(body), body.slice(0, 80));
    check('and it never echoes the key', body.indexOf(earnedKey) === -1, body.slice(0, 80));
    const ct = res.headers.get('Content-Type') || '';
    check('and the content type is text', ct.indexOf('text/plain') === 0, ct);

    const bad = await call('GET', '/sh/keycheck?k=NOT-A-KEY&h=hwid-9');
    const badBody = (await bad.text()).trim();
    check('and a made-up key is refused', badBody.indexOf('SHERR invalid') === 0, badBody.slice(0, 80));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE OWNER CAN EDIT AND DELETE A KEY THAT LIVES ON THE SERVER');
// ---------------------------------------------------------------------------
{
    const edit = await j(await call('POST', '/sh/license-edit', {
        token: owner.token,
        body: { key: earnedKey, note: 'Edited by the owner', expiresAt: Date.now() + 3600000 }
    }));
    check('the edit is accepted', edit.ok === true, JSON.stringify(edit).slice(0, 160));
    const map = JSON.parse(KV._store.get('sh_licenses') || '{}');
    check('and the note moved', map[earnedKey].note === 'Edited by the owner',
        'note = ' + map[earnedKey].note);
    const ledger = await env.SH_DB.prepare('SELECT expires FROM reward_keys WHERE key_text=?').bind(earnedKey).all();
    const rows = ledger.results || ledger;
    check('and the LEDGER expiry moved too', Number(rows[0].expires) === Number(edit.expiresAt),
        'ledger = ' + rows[0].expires + ' vs ' + edit.expiresAt);

    // And the delete takes it out of BOTH places.
    const del = await j(await call('POST', '/sh/license-delete', {
        token: owner.token, body: { key: earnedKey }
    }));
    check('the delete is accepted', del.ok === true, JSON.stringify(del).slice(0, 160));
    const after = JSON.parse(KV._store.get('sh_licenses') || '{}');
    check('and the key is out of the license map', !after[earnedKey], 'the key is still there');
    const gone = await env.SH_DB.prepare('SELECT COUNT(*) AS n FROM reward_keys WHERE key_text=?').bind(earnedKey).all();
    const grows = gone.results || gone;
    check('and out of the reward ledger', Number(grows[0].n) === 0, 'rows = ' + grows[0].n);
    // A key that is gone cannot be used.
    const check2 = await call('GET', '/sh/keycheck?k=' + encodeURIComponent(earnedKey) + '&h=hwid-9');
    const check2Body = (await check2.text()).trim();
    check('and it does not open anything', check2Body.indexOf('SHERR invalid') === 0, check2Body.slice(0, 80));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('A VISITOR WITH A PROOF THE PROVIDER DOES NOT KNOW IS NOT PUNISHED');
// ---------------------------------------------------------------------------
{
    // The honest case: the hash expired on the way here. It is counted, but
    // the first one costs nothing.
    const saved = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: {
            reward: {
                name: 'Honest', keyDurationH: 6, maxKeys: 2, cooldownH: 0,
                checkpoints: [{ id: 'cp1', name: 'LV', provider: 'linkvertise', shortUrl: 'https://direct-link.net/a',
                    settings: { authToken: 'TOKEN' } }]
            }
        }
    }));
    const rid = saved.rid;
    await call('POST', '/sh/reward/start', { body: { rid: rid, fp: 'fp_honest' } });
    clock += 5000;
    const res = await j(await call('POST', '/sh/reward/complete', {
        body: { rid: rid, fp: 'fp_honest', clickId: 'e'.repeat(64) }
    }));
    check('the expired proof is refused', res.ok === false, JSON.stringify(res).slice(0, 160));
    check('and the visitor is told it is not counted YET', res.transient === true,
        JSON.stringify(res).slice(0, 160));
    const bl = [...KV._store.keys()].filter(function (k) { return k.indexOf('sh_rbl_') === 0; });
    check('and no block was written for them', bl.length === 1,
        'the honest visitor got a block: ' + bl.join(', '));
}

console.log('');
console.log(fails === 0 ? 'REWARD LIFECYCLE   all checks passed' : ('REWARD LIFECYCLE   ' + fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
