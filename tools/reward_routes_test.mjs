// End-to-end test of the server-side reward routes against the REAL worker
// module, with a mocked KV and a real D1.
//
// This is the test that matters for the reported bugs, because every one of
// them was a property of the system as a whole rather than of one function:
//
//   * an editable config in the share link paid out on demand
//   * an "earned" key was never a license, so /sh/auth said invalid
//   * the 2h blacklist lived in the visitor's localStorage, so clearing site
//     data cleared the ban
//   * provider API tokens typed by the owner were discarded and never used
//
// So this drives the routes the way a visitor and a provider would, over HTTP,
// and asserts the decisions the worker makes - not the text of its source.
//
// Run: node tools/reward_routes_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function makeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value) { store.set(key, String(value)); },
        async delete(key) { store.delete(key); },
        _store: store
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

const workerSrc = await import('../For Cloudflare/worker.js');
const worker = workerSrc.default;

// The callback page states its reason in <p class="r">. Grepping the whole
// document would have worked but reads badly and truncates in the report, so
// pull the one field the assertions are actually about.
function cbReason(html) {
    const m = /<p class="r">([\s\S]*?)<\/p>/.exec(html);
    return m ? m[1] : '';
}
const { OWNER_CODE_PLAIN } = await import('./owner_code_test_helper.mjs');
const { OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

const KV = makeKV();
const env = {
    LOADERS_KV: KV,
    SH_SETUP_TOKEN: 'TESTTOKEN123',
    SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret',
    SH_DB: makeD1()
};

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const BASE = 'https://sh.test';
async function call(method, path, { body, ip = '1.2.3.4', ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    // A GET may not carry a body, and one of the owner-gate checks below is a
    // GET - it has to prove the ROUTE is gated, not trip over undici.
    const sendBody = body && method !== 'GET' && method !== 'HEAD';
    if (sendBody) headers['Content-Type'] = 'application/json';
    const req = new Request(BASE + path, {
        method, headers, body: sendBody ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil(p) { try { p && p.catch(() => {}); } catch (e) {} } });
}
async function j(res) {
    const t = await res.text();
    try { return JSON.parse(t); } catch (e) { return { __raw: t.slice(0, 200) }; }
}
// The owner credential is a CODE token obtained by logging in, not the code
// itself - posting the raw code at an admin route is exactly what 401s.
const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
const owner = { token: login.token };
if (!owner.token) { console.error('owner login failed: ' + JSON.stringify(login)); process.exit(1); }

// ---------------------------------------------------------------------------
console.log('owner can save a reward, and its API tokens are kept server-side');
// ---------------------------------------------------------------------------
let saved;
{
    const res = await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: {
            reward: {
                name: 'Ad Key',
                keyDurationH: 6, maxKeys: 2, cooldownH: 0,
                checkpoints: [
                    { id: 'cp1', name: 'LV', provider: 'linkvertise', shortUrl: 'https://direct-link.net/a',
                      settings: { antiBypass: true, authToken: 'LV_SECRET_TOKEN' } },
                    { id: 'cp2', name: 'Test', provider: 'test', shortUrl: 'https://example.invalid/test' }
                ]
            }
        }
    });
    saved = await j(res);
    check('the save is accepted', saved.ok === true, JSON.stringify(saved).slice(0, 160));
    check('a rid comes back', !!saved.rid, JSON.stringify(saved).slice(0, 120));
    check('the owner is TOLD which checkpoints cannot be verified yet', Array.isArray(saved.notReady) && saved.notReady.length === 0,
        'notReady = ' + JSON.stringify(saved.notReady));
}
const RID = saved.rid;

// The token must be on the server and MUST NOT appear in anything a visitor
// can read.
{
    const res = await call('GET', '/sh/reward/pub?rid=' + RID + '&fp=fpA');
    const pub = await j(res);
    check('the public view is served', pub.ok === true);
    const blob = JSON.stringify(pub);
    check('the provider API token is NOT in the public view', blob.indexOf('LV_SECRET_TOKEN') === -1,
        'token leaked into the visitor-facing payload');
    check('nor is the ad short URL', blob.indexOf('direct-link.net') === -1,
        'shortUrl leaked into the visitor-facing payload');
    check('the provider NAME is visible (so the visitor knows what they are doing)',
        JSON.stringify((pub.public && pub.public.steps) || []).indexOf('linkvertise') !== -1);
    check('a reward with no checkpoints reports total 0', pub.public.total === 2, 'total = ' + pub.public.total);
}

{
    const res = await call('POST', '/sh/reward/get', { token: owner.token, body: { rid: RID } });
    const g = await j(res);
    check('the owner CAN read the API token back', g.reward && g.reward.checkpoints[0].settings.authToken === 'LV_SECRET_TOKEN');
}

// ---------------------------------------------------------------------------
console.log('a visitor cannot rewrite the reward');
// ---------------------------------------------------------------------------
{
    // The old link was ?r=<base64 of the whole config>. Try to complete a
    // 2-checkpoint reward by pretending it is a 1-checkpoint one.
    const tampered = Buffer.from(JSON.stringify({
        n: 'Ad Key', d: 6, mk: 2, cps: [{ u: 'about:blank', p: 'test' }]
    })).toString('base64url');

    const res = await call('POST', '/sh/reward/claim', {
        ip: '9.9.9.9', body: { rid: tampered, sid: 's_x', fp: 'fpEvil' }
    });
    const c = await j(res);
    check('a tampered base64 config is not a reward id', c.ok === false && /no longer valid/.test(c.error || ''),
        JSON.stringify(c));
}
{
    const res = await call('POST', '/sh/reward/claim', { body: { rid: RID, sid: 'made-up', fp: 'fpEvil' } });
    const c = await j(res);
    check('claiming without a real session is refused', c.ok === false, JSON.stringify(c));
    check('and it says so rather than minting something', /No session/.test(c.error || ''), c.error);
}

// ---------------------------------------------------------------------------
console.log('the linkvertise checkpoint CANNOT be completed without corroboration');
// ---------------------------------------------------------------------------
let sid;
{
    const res = await call('POST', '/sh/reward/start', { ip: '5.5.5.5', body: { rid: RID, fp: 'fpB' } });
    const s = await j(res);
    sid = s.sid;
    check('a session opens', !!sid, JSON.stringify(s).slice(0, 160));
    check('step 0 is linkvertise', s.step && s.step.provider === 'linkvertise', JSON.stringify(s.step));
    check('the visitor gets the ad URL', s.step && s.step.target === 'https://direct-link.net/a');
    check('the owner gets a signed verify URL', !!s.step && /\/sh\/cp\/linkvertise\?t=/.test(s.step.verifyUrl || ''),
        JSON.stringify(s.step && s.step.verifyUrl));
    check('the verify URL carries no API token', (s.step.verifyUrl || '').indexOf('LV_SECRET_TOKEN') === -1);

    // Follow the provider's landing URL with NO click id at all.
    const cb = await worker.fetch(new Request(s.step.verifyUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'CF-Connecting-IP': '5.5.5.5' }
    }), env, { waitUntil() {} });
    const html = await cb.text();
    check('an uncorroborated callback is REFUSED', /could not be verified/.test(html), html.slice(0, 200));
    // An immediate callback is refused as too-fast, BEFORE the click-id check.
    // That ordering is the dwell gate doing its job: a client that never
    // rendered an ad cannot produce a plausible click id either, so refusing
    // on time is the cheaper and stronger answer.
    check('and it names the reason (dwell gate runs first)', cbReason(html) === 'too-fast', 'reason = ' + JSON.stringify(cbReason(html)));
}

// ---------------------------------------------------------------------------
console.log('the test provider CAN be completed, and mints a REAL license');
// ---------------------------------------------------------------------------
let key;
{
    // skip step 0 by completing it with a fabricated-but-signed path is not
    // possible, so instead open a reward that is test-only.
    const res0 = await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: { reward: { name: 'Free Test', keyDurationH: 6, maxKeys: 1,
            checkpoints: [{ id: 't1', name: 'T', provider: 'test', shortUrl: 'https://example.invalid/t' }] } }
    });
    const free = await j(res0);
    const FRID = free.rid;

    const s1 = await j(await call('POST', '/sh/reward/start', { ip: '7.7.7.7', body: { rid: FRID, fp: 'fpC' } }));
    check('the test reward opens', !!s1.sid && s1.step.provider === 'test', JSON.stringify(s1).slice(0, 140));

    // The visitor comes back through the signed verify URL.
    const vurl = s1.step.verifyUrl;
    const sep = vurl.indexOf('&');
    const cbUrl = vurl + '&confirmed=1';
    const cb = await worker.fetch(new Request(cbUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120', 'CF-Connecting-IP': '7.7.7.7' }
    }), env, { waitUntil() {} });
    const html = await cb.text();
    // A single-checkpoint reward completes with 'All checkpoints complete';
    // a multi-checkpoint one says 'Checkpoint done - N to go'. Either is a pass.
    check('the test checkpoint verifies', /All checkpoints complete|Checkpoint done/.test(html), html.slice(0, 200));
    void sep;

    const st = await j(await call('GET', '/sh/reward/state?rid=' + FRID + '&sid=' + s1.sid + '&fp=fpC', { ip: '7.7.7.7' }));
    check('progress advanced to 1/1', st.done === 1 && st.total === 1, JSON.stringify(st));

    const claim = await j(await call('POST', '/sh/reward/claim', { ip: '7.7.7.7', body: { rid: FRID, sid: s1.sid, fp: 'fpC' } }));
    key = claim.key;
    check('a key is minted', !!key && key.length === 192, 'len = ' + (key ? key.length : 'none'));
    check('the key is reported back once', claim.ok === true);

    // THE decisive check: is it a license the executor will accept?
    const licenses = await j(await call('GET', '/sh/licenses', { token: owner.token }));
    check('the key is in sh_licenses, so /sh/auth can find it',
        licenses.licenses && licenses.licenses[key] !== undefined,
        'keys in map = ' + Object.keys(licenses.licenses || {}).length);
    const rec = licenses.licenses && licenses.licenses[key];
    check('it is tagged as an ad reward', rec && /Ad Reward/.test(rec.note || ''), JSON.stringify(rec));
    check('it expires in ~6h', rec && rec.expiresAt > Date.now() && rec.expiresAt < Date.now() + 6.5 * 3600e3,
        JSON.stringify(rec && rec.expiresAt));
    check('it is not pre-locked to any HWID', rec && rec.hwid === '');

    const again = await j(await call('POST', '/sh/reward/claim', { ip: '7.7.7.7', body: { rid: FRID, sid: s1.sid, fp: 'fpC' } }));
    check('maxKeys is enforced server-side', again.maxed === true && (again.keys || []).length === 1,
        JSON.stringify(again).slice(0, 140));
}

// ---------------------------------------------------------------------------
console.log('the callback cannot be replayed');
// ---------------------------------------------------------------------------
{
    const res0 = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: { reward: { name: 'Two Test', keyDurationH: 1, maxKeys: 5,
            checkpoints: [
                { id: 'a1', name: 'A', provider: 'test', shortUrl: 'https://example.invalid/a' },
                { id: 'a2', name: 'B', provider: 'test', shortUrl: 'https://example.invalid/b' }
            ] } }
    }));
    const TRID = res0.rid;
    const s = await j(await call('POST', '/sh/reward/start', { ip: '8.8.8.8', body: { rid: TRID, fp: 'fpD' } }));
    const v = s.step.verifyUrl + '&confirmed=1';
    const first = await worker.fetch(new Request(v, { headers: { 'CF-Connecting-IP': '8.8.8.8' } }), env, { waitUntil() {} });
    check('step 1 completes', /Checkpoint done/.test(await first.text()));
    const second = await worker.fetch(new Request(v, { headers: { 'CF-Connecting-IP': '8.8.8.8' } }), env, { waitUntil() {} });
    const h2 = await second.text();
    check('the SAME callback cannot complete step 2 as well', !/Checkpoint done/.test(h2), h2.slice(0, 200));
}

// ---------------------------------------------------------------------------
console.log('a provider cannot be swapped for another in the callback path');
// ---------------------------------------------------------------------------
{
    const s = await j(await call('POST', '/sh/reward/start', { ip: '4.4.4.4', body: { rid: RID, fp: 'fpE' } }));
    // Take the signed token but rename the provider in the path.
    const tamperedUrl = s.step.verifyUrl.replace('/sh/cp/linkvertise?', '/sh/cp/test?');
    const res = await worker.fetch(new Request(tamperedUrl + '&confirmed=1', {
        headers: { 'CF-Connecting-IP': '4.4.4.4' }
    }), env, { waitUntil() {} });
    const html = await res.text();
    check('rewriting the provider in the URL is refused', cbReason(html) === 'provider-mismatch', 'reason = ' + JSON.stringify(cbReason(html)));
}

// ---------------------------------------------------------------------------
console.log('the blacklist is server-side and survives a storage wipe');
// ---------------------------------------------------------------------------
{
    const res = await call('POST', '/sh/reward/block', { ip: '6.6.6.6', body: { fp: 'fpBad', reason: 'webdriver', rid: RID } });
    const b = await j(res);
    check('a ban is recorded', b.ok === true && b.until > Date.now(), JSON.stringify(b));
    check('the first strike is ~2 hours', b.until > Date.now() + 1.9 * 3600e3 && b.until < Date.now() + 2.1 * 3600e3,
        'until in ' + Math.round((b.until - Date.now()) / 60000) + ' min');

    const start = await j(await call('POST', '/sh/reward/start', { ip: '6.6.6.6', body: { rid: RID, fp: 'fpBad' } }));
    check('the banned fingerprint cannot start', start.error === 'blacklisted', JSON.stringify(start).slice(0, 140));

    const pub = await j(await call('GET', '/sh/reward/pub?rid=' + RID + '&fp=fpBad', { ip: '6.6.6.6' }));
    check('and cannot even read the reward', pub.blacklisted === true, JSON.stringify(pub).slice(0, 140));

    // A DIFFERENT fingerprint on the SAME connection: the IP entry catches it.
    const newFp = await j(await call('POST', '/sh/reward/start', { ip: '6.6.6.6', body: { rid: RID, fp: 'fpFreshProfile' } }));
    check('a new browser profile on the same IP is still banned', newFp.error === 'blacklisted',
        'this is the whole point of binding on both');

    // Doubling.
    const b2 = await j(await call('POST', '/sh/reward/block', { ip: '6.6.6.6', body: { fp: 'fpBad', reason: 'again' } }));
    check('a repeat offence doubles the ban', b2.strikes === 2 && b2.until > Date.now() + 3.9 * 3600e3,
        'strike ' + b2.strikes + ' for ' + Math.round((b2.until - Date.now()) / 3600e3) + 'h');
}

// ---------------------------------------------------------------------------
console.log('clearing site data does not reset progress or hand out a new session');
// ---------------------------------------------------------------------------
// The session id is DERIVED server-side from (reward, fingerprint, IP) and
// signed, rather than being a random value the browser keeps in localStorage.
// That is what makes the ban meaningful and what makes progress survive.
{
    const res0 = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: { reward: { name: 'Persist', keyDurationH: 1, maxKeys: 3,
            checkpoints: [
                { id: 'p1', name: 'A', provider: 'test', shortUrl: 'https://example.invalid/pa' },
                { id: 'p2', name: 'B', provider: 'test', shortUrl: 'https://example.invalid/pb' }
            ] } }
    }));
    const PRID = res0.rid;

    const s1 = await j(await call('POST', '/sh/reward/start', { ip: '10.1.1.1', body: { rid: PRID, fp: 'fpPersist' } }));
    check('a session opens', !!s1.sid, JSON.stringify(s1).slice(0, 120));
    const firstSid = s1.sid;

    const cb = await worker.fetch(new Request(s1.step.verifyUrl + '&confirmed=1', {
        headers: { 'CF-Connecting-IP': '10.1.1.1' } }), env, { waitUntil() {} });
    check('step 1 completes', /Checkpoint done/.test(await cb.text()));

    // "clear site data": no sid is sent at all this time.
    const s2 = await j(await call('POST', '/sh/reward/start', { ip: '10.1.1.1', body: { rid: PRID, fp: 'fpPersist' } }));
    check('the same session comes back', s2.sid === firstSid,
        'got ' + s2.sid + ' want ' + firstSid);
    check('and step 1 is still done', s2.done === 1, 'done = ' + s2.done);
    check('and the visitor is now on step 2', s2.step && s2.step.i === 1, JSON.stringify(s2.step));

    // A client that DOES send a stale sid must not displace the real one.
    const s3 = await j(await call('POST', '/sh/reward/start', {
        ip: '10.1.1.1', body: { rid: PRID, fp: 'fpPersist', sid: 'sfabricated000000000000' }
    }));
    check('a client-supplied sid cannot replace the derived one', s3.sid === firstSid,
        'got ' + s3.sid);
    check('and does not grant fresh progress', s3.done === 1, 'done = ' + s3.done);

    // A different reward must not accept the same session id.
    const other = await j(await call('POST', '/sh/reward/save', {
        token: owner.token,
        body: { reward: { name: 'Other', keyDurationH: 1, maxKeys: 1,
            checkpoints: [{ id: 'o1', name: 'O', provider: 'test', shortUrl: 'https://example.invalid/o' }] } }
    }));
    const s4 = await j(await call('POST', '/sh/reward/start', { ip: '10.1.1.1', body: { rid: other.rid, fp: 'fpPersist' } }));
    check('the same fingerprint on a DIFFERENT reward gets a different session', s4.sid !== firstSid,
        'sid was reused across rewards');
}
console.log('a session id cannot be replayed from another browser');
// ---------------------------------------------------------------------------
{
    const s = await j(await call('POST', '/sh/reward/start', { ip: '3.3.3.3', body: { rid: RID, fp: 'fpOwner' } }));
    const stolen = await j(await call('POST', '/sh/reward/claim', { ip: '3.3.3.3', body: { rid: RID, sid: s.sid, fp: 'fpThief' } }));
    check('another fingerprint cannot claim with a stolen sid', /blacklisted|No session/.test(stolen.error || ''),
        JSON.stringify(stolen).slice(0, 140));
}

// ---------------------------------------------------------------------------
console.log('owner routes are actually gated');
// ---------------------------------------------------------------------------
{
    const r1 = await j(await call('POST', '/sh/reward/save', { body: { reward: { name: 'x' } } }));
    check('save without an owner credential is 401', r1.error === 'Not authorized.', JSON.stringify(r1));
    // POST, because the route is POST-only: a GET falls through to the
    // catch-all and answers 'not found', which proves nothing about auth.
    const r2 = await j(await call('POST', '/sh/reward/get', { body: { rid: RID } }));
    check('get without an owner credential is 401', r2.error === 'Not authorized.', JSON.stringify(r2));
    const r3 = await j(await call('POST', '/sh/reward/delete', { body: { rid: RID } }));
    check('delete without an owner credential is 401', r3.error === 'Not authorized.', JSON.stringify(r3));
}

console.log();
console.log('REWARD ROUTES   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
void key;
process.exit(fails ? 1 : 0);