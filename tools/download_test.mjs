// File downloads: GET /sh/dl/<id>
//
// Requested behaviour, and the two requirements inside it that are easy to get
// wrong and expensive to discover late:
//
//   1. Aegis-style expiry - 30m / 1h / 1d / permanent - on the DOWNLOAD link.
//   2. "if the download link expires the scripts must still work"
//
// (2) is the one worth testing. The download route and the hosted delivery
// route share storage, so the obvious way to implement expiry is one flag read
// by both - and that would take every published script offline each time a
// download expired. So: the hosted path is exercised after the download link
// has already expired.
//
// Also pinned: a key-required script is REFUSED rather than served as
// ciphertext, because handing someone an encrypted blob labelled "your
// obfuscated script" is a broken download that looks like a bug.
//
// Run: node tools/download_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); }
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

const worker = (await import('../For Cloudflare/worker.js')).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

const env = {
    LOADERS_KV: makeKV(),
    SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret', SH_DB: makeD1()
};

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const BASE = 'https://sh.test';
async function call(method, path, { body, ip = '1.1.1.1', ua = 'Mozilla/5.0 Chrome/120', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    const send = body && method !== 'GET' && method !== 'HEAD';
    if (send) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(BASE + path, {
        method, headers, body: send ? JSON.stringify(body) : undefined
    }), env, { waitUntil(p) { try { p && p.catch(() => {}); } catch (e) {} } });
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { __raw: t.slice(0, 200) }; } };

const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN } }));
const ownerTok = login.token;
const SPLIT = { paddedKey: Array.from({ length: 64 }, (_, i) => (i * 7) & 0xFF), t0: 1700000000000, chk: 123456 };

const PAYLOAD = '-- obfuscated\nlocal x = 1\n' + 'A'.repeat(50000);

// ---------------------------------------------------------------------------
console.log('a keyless script downloads as a file attachment');
// ---------------------------------------------------------------------------
let id;
{
    const up = await j(await call('POST', '/sh/upload', {
        token: ownerTok,
        body: { name: 'My Cool Script', user: 't', cipher: 'Zm9v', keyHash: 'h', normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: PAYLOAD }
    }));
    check('it published', up.ok === true, JSON.stringify(up).slice(0, 160));
    id = up.id;

    const res = await call('GET', '/sh/dl/' + id);
    const body = await res.text();
    check('the download succeeds', res.status === 200, 'status ' + res.status);
    check('and carries the real obfuscated code', body === PAYLOAD,
        'got ' + body.length + ' chars, wanted ' + PAYLOAD.length);
    check('with an attachment disposition',
        /^attachment;/.test(res.headers.get('Content-Disposition') || ''),
        res.headers.get('Content-Disposition'));

    const cd = res.headers.get('Content-Disposition') || '';
    const name = (/filename="([^"]*)"/.exec(cd) || [])[1] || '';
    check('the filename follows the agreed pattern',
        name === 'My Cool Script-ScripterHub(' + id.replace(/^ScripterHub/, '') + ').lua',
        'got ' + JSON.stringify(name));
}

// ---------------------------------------------------------------------------
console.log('the filename cannot be used to inject headers');
// ---------------------------------------------------------------------------
{
    const up = await j(await call('POST', '/sh/upload', {
        token: ownerTok,
        body: {
            name: 'evil"\r\nX-Injected: yes\r\n<script>', user: 't', cipher: 'Zm9v', keyHash: 'h',
            normalCode: 'print(1)', keyless: true, splitKey: SPLIT, plainCode: 'X'
        }
    }));
    const res = await call('GET', '/sh/dl/' + up.id);
    const cd = res.headers.get('Content-Disposition') || '';
    // The property is "no quote survives into the quoted-string", not "the
    // word evil is absent" - sanitising keeps ordinary letters, so the word
    // itself legitimately appears. The first version of this assertion
    // matched /filename="[^"]*evil/ and failed on a correctly sanitised name.
    check('a quote in the name cannot break out of filename=""',
        !/"/.test((/filename="([^"]*)"/.exec(cd) || [])[1] || ''), cd.slice(0, 140));
    check('CR and LF are stripped, not encoded',
        cd.indexOf('\r') === -1 && cd.indexOf('\n') === -1, JSON.stringify(cd.slice(0, 120)));
    check('the injected header does not exist',
        res.headers.get('X-Injected') === null);
    check('the name is otherwise preserved', /evil/.test(cd), cd.slice(0, 120));
}

// ---------------------------------------------------------------------------
console.log('a key-required script is refused, not served as ciphertext');
// ---------------------------------------------------------------------------
{
    const up = await j(await call('POST', '/sh/upload', {
        token: ownerTok,
        body: {
            name: 'Paid', user: 't', cipher: 'Q0lQSEVS', keyHash: 'h', normalCode: 'print(1)',
            authRequired: true, splitKey: 'SPLITKEYSPLITKEYSPLIT'
        }
    }));
    check('it published', up.ok === true, JSON.stringify(up).slice(0, 140));
    const res = await call('GET', '/sh/dl/' + up.id);
    const body = await res.text();
    check('the download is refused with a clear status', res.status === 501, 'status ' + res.status);
    check('and says why, rather than serving an unrunnable file',
        /encrypted|cannot be downloaded/i.test(body), body.slice(0, 160));
    check('and definitely does not hand over the ciphertext',
        body.indexOf('Q0lQSEVS') === -1);
}

// ---------------------------------------------------------------------------
console.log('expiry kills the DOWNLOAD and nothing else');
// ---------------------------------------------------------------------------
{
    const past = Math.floor(Date.now() / 1000) - 60;
    const res = await call('GET', '/sh/dl/' + id + '?e=' + past);
    check('an expired download link is refused', res.status === 410, 'status ' + res.status);
    check('with a message that says how to fix it',
        /expired/i.test(await res.text()));

    const live = Math.floor(Date.now() / 1000) + 3600;
    const ok = await call('GET', '/sh/dl/' + id + '?e=' + live);
    check('a live one works', ok.status === 200, 'status ' + ok.status);
    check('and advertises its own expiry', ok.headers.get('X-Download-Expires') === String(live),
        ok.headers.get('X-Download-Expires'));

    const none = await call('GET', '/sh/dl/' + id);
    check('no ?e= means permanent', none.status === 200 && none.headers.get('X-Download-Expires') === null);
}

// ---------------------------------------------------------------------------
console.log('THE IMPORTANT ONE: the hosted script still runs after the link dies');
// ---------------------------------------------------------------------------
{
    // This is the requirement: "if the download link expires the scripts must
    // still work". The download is already expired. The hosted path must not
    // care.
    const expired = Math.floor(Date.now() / 1000) - 6000;

    const dl = await call('GET', '/sh/dl/' + id + '?e=' + expired);
    check('the download link is dead', dl.status === 410);

    // Hosted delivery, exactly as an executor does it.
    const s = await call('POST', '/sh/session', { ip: '9.9.9.9', ua: 'Roblox/570 Delta', body: { id: id } });
    const st = await s.text();
    check('the hosted path still mints a session', /^SHS /.test(st), 'body = ' + st.slice(0, 140));
    const parts = st.trim().split(/\s+/);
    const d = await call('POST', '/sh/a/' + id + '?s=' + parts[1] + '&n=' + parts[2], { ip: '9.9.9.9', ua: 'Roblox/570 Delta' });
    const dt = await d.text();
    check('and still delivers the artifact',
        d.status === 200 && dt.indexOf('AAAA') !== -1,
        'status ' + d.status + ' body = ' + dt.slice(0, 140));
}

// ---------------------------------------------------------------------------
console.log('unknown and malformed ids');
// ---------------------------------------------------------------------------
{
    const r1 = await call('GET', '/sh/dl/ScripterHub999999999');
    check('an unknown id is 404', r1.status === 404, 'status ' + r1.status);
    const r2 = await call('GET', '/sh/dl/not-an-id');
    check('a malformed id does not reach the route', r2.status === 404 || r2.status === 405, 'status ' + r2.status);
    const r3 = await call('GET', '/sh/dl/' + id + '?e=abc');
    check('a non-numeric expiry is treated as permanent, not as an error',
        r3.status === 200, 'status ' + r3.status);
    const r4 = await call('GET', '/sh/dl/' + id + '?e=-5');
    check('a negative expiry is treated as permanent', r4.status === 200, 'status ' + r4.status);
}

console.log();
console.log('DOWNLOAD   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);