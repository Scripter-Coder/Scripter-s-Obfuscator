// The key card that runs INSIDE the game.
//
// It is a separate thing from the website, and it has two properties that
// are easy to lose and impossible to miss:
//
//   1. IT DOES NOT USE JSON.
//
//      Some executors cannot do JSON. Not "badly" - cannot: Opiumware and a
//      few others have no HttpService:JSONEncode, so a key system that
//      speaks JSON is dead on them, and it dies on a nil index long before
//      the key is ever checked.
//
//   2. IT TALKS TO THE OWNER'S OWN SERVER.
//
//      The key is checked against the ScripterHub worker - the same gate the
//      published scripts use - and the answer is one line of plain text.
//
// This test asserts the properties, and it runs the REAL worker route so the
// two halves are checked against each other rather than against a comment.
//
// Run: node tools/keycard_test.mjs

import fs from 'node:fs';
import luaparse from 'luaparse';
import { makeD1 as makeD1Shape } from './d1_shape.mjs';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

// The card lives in public/, because that is what the BUILD copies into the
// site: the published site is the built one, and public/ is the one folder
// the build copies verbatim. A file that only exists in the repository root
// is not on the site.
const LUA_PATH = 'public/scripterhub_keycard.lua';
const src = fs.readFileSync(LUA_PATH, 'utf8');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// The real worker, a mocked KV, a real D1 shape. It is set up FIRST, because
// the card's own routes are checked against it.
const store = new Map();
const KV = {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); },
    _store: store
};
const env = {
    LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://t.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH, SH_SESSION_SECRET: 's', SH_DB: makeD1Shape()
};
const worker = (await import('../For Cloudflare/worker.js')).default;

async function call(method, path, { body, ip = '1.2.3.4', ua = 'Mozilla/5.0', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    const sendBody = body && method !== 'GET' && method !== 'HEAD';
    if (sendBody) headers['Content-Type'] = 'application/json';
    const req = new Request('https://t.workers.dev' + path, {
        method, headers, body: sendBody ? JSON.stringify(body) : undefined
    });
    return worker.fetch(req, env, { waitUntil(p) { try { p && p.catch(() => { }); } catch (e) { } } });
}
async function ping() {
    return call('GET', '/sh/ping', { ua: 'Roblox/570' });
}

// ---------------------------------------------------------------------------
console.log('THE KEY CARD PARSES');
// ---------------------------------------------------------------------------
{
    let ok = true, err = '';
    try { luaparse.parse(src, { luaVersion: '5.1' }); } catch (e) { ok = false; err = e.message; }
    check('the Lua is valid', ok, err);
}

// ---------------------------------------------------------------------------
console.log('');
console.log('IT DOES NOT USE JSON, BECAUSE SOME EXECUTORS CANNOT');
// ---------------------------------------------------------------------------
{
    // The COMMENTS are allowed to say "no JSON" - the check is about the
    // code, so the comments are stripped first. A check that trips over the
    // word in a comment is a check nobody trusts.
    const code = src.split('\n').filter(l => !/^\s*(--|\/\/|\*|\/\*)/.test(l)).join('\n');
    check('no JSONEncode', code.indexOf('JSONEncode') === -1, 'it encodes JSON');
    check('no JSONDecode', code.indexOf('JSONDecode') === -1, 'it decodes JSON');
    check('no HttpService at all', code.indexOf('HttpService') === -1,
        'it asks for HttpService, which is what JSON needs');
    check('no request with a body', !/Method\s*=\s*["']POST["']/.test(code),
        'it posts a body');
    check('it only ever GETs', /Method = "GET"/.test(code) || code.indexOf('_HTTPGET(url)') !== -1,
        'it does not use HttpGet');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('IT TALKS TO THE OWNER\'S OWN SERVER');
// ---------------------------------------------------------------------------
{
    check('the worker address is in it',
        src.indexOf('https://scripterhub-stats.dubovikstanislav51.workers.dev') !== -1,
        'the API url is missing');
    check('and it asks the plain-text key check', /\/sh\/keycheck\?k=/.test(src),
        'it does not use /sh/keycheck');
    check('and it sends the hardware id', /&h=" \.\. urlEncode\(hwid\)/.test(src),
        'the hwid is not sent');
    check('and the old json api is gone', src.indexOf('vietpolua.cc.cd/api/v1') === -1,
        'it still talks to the old api');
    check('and the old checkpoint calls are gone',
        src.indexOf('startCheckpoint') === -1 && src.indexOf('getKeyFromCheckpoint') === -1,
        'it still calls the old checkpoint api');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE AD LINKS ARE STILL THE OWNER\'S');
// ---------------------------------------------------------------------------
{
    // The owner said: keep the ad link buttons the same, they will change
    // them later. So the three links have to still be there.
    for (const u of [
        'https://vietpolua.cc.cd/checkpoint/linkvertise?script=ScripterHub',
        'https://vietpolua.cc.cd/checkpoint/lootlabs?script=ScripterHub',
        'https://vietpolua.cc.cd/checkpoint/workink?script=ScripterHub'
    ]) {
        check('the link is kept: ' + u.replace('https://vietpolua.cc.cd', ''),
            src.indexOf(u) !== -1, 'the link is gone');
    }
    check('and the three ad buttons are there',
        /GET KEY FROM LINKVERTISE/.test(src) && /GET KEY FROM LOOTLABS/.test(src)
        && /GET KEY FROM WORKINK/.test(src), 'a button is missing');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE FOUR FILES ARE STILL THERE');
// ---------------------------------------------------------------------------
{
    for (const f of ['KEY_FILE', 'HWID_FILE', 'EXPIRY_FILE', 'TIMESTAMP_FILE']) {
        check('the ' + f + ' is there', src.indexOf(f) !== -1, f + ' is gone');
    }
    check('and they are per-user', /ScripterHub_Key_" \.\. userId/.test(src),
        'the files are not per user');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE SOURCE IS PURE ASCII, AND THE EMOJI SURVIVE IT');
// ---------------------------------------------------------------------------
//
// A .lua file is served as "text/x-lua" with NO charset, and an executor
// that decodes the response with the charset it guessed - and the guess for
// an unknown text type is usually Latin-1 - turns every emoji into "a-oe..."
// garbage. GitHub Pages does the same for a file it cannot place.
//
// So the source is pure ASCII: every emoji is written as its UTF-8 bytes in
// decimal escapes ("\240\159\148\151" is a chain link), and Roblox renders
// the bytes as UTF-8 exactly as before.
//
// THE ESCAPES HAVE TO ROUND-TRIP. The first attempt walked the file by code
// unit, so every emoji was split in half and each half encoded to the
// replacement character - the card would have shown nothing at all where the
// emoji were, and the source would still have been "pure ASCII", so the
// check that said "pure ASCII" was happy while the card was broken.
{
    const pureAscii = ![...src].some(c => c.codePointAt(0) > 127);
    check('the source is pure ASCII', pureAscii,
        'the file still has non-ascii characters in it');

    // The escapes, decoded back to BYTES and then read as UTF-8.
    const asBytes = src.replace(/\\(\d{1,3})/g, (m, n) => String.fromCharCode(Number(n)));
    const decoded = Buffer.from(asBytes, 'latin1').toString('utf8');
    const emoji = [...decoded].filter(c => c.codePointAt(0) > 127);
    check('and there are emoji in it', emoji.length > 40, 'found ' + emoji.length);
    check('and none of them is the replacement character',
        !emoji.some(c => c.codePointAt(0) === 0xFFFD),
        'an emoji was split in half and lost');
    // The ones that matter, by name.
    for (const [name, ch] of [['the house', '\u{1F3E0}'], ['the tick', '\u{2705}'],
        ['the cross', '\u{274C}'], ['the chain', '\u{1F517}'], ['the key', '\u{1F511}'],
        ['the infinity', '\u{221E}']]) {
        check('and ' + name + ' is still there', emoji.indexOf(ch) !== -1,
            'the escape for it is wrong');
    }
}

// ---------------------------------------------------------------------------
console.log('');
console.log('NO KEY IS NOT THE SAME AS A LIFETIME KEY');
// ---------------------------------------------------------------------------
{
    // The card used to show "Days: inf" on a fresh install, because the
    // formatter returned LIFETIME for a missing expiry. Infinity means
    // "this key never expires" - showing it when there is no key at all is
    // a lie, and it reads like a lifetime key that was already earned.
    check('the formatter knows the difference', /NOKEY/.test(src),
        'there is no state for "there is no key"');
    check('and it is told whether there is a key',
        /formatTimeLeft\(expiryTimestamp, hasKey\)/.test(src),
        'the formatter cannot tell a missing key from a lifetime one');
    check('and no key shows a dash, not infinity',
        /"NOKEY", "-", "-", "-", "-"/.test(src),
        'a missing key still shows infinity');
    check('and infinity is still there for a lifetime key',
        /"LIFETIME", "\\226\\136\\158", "\\226\\136\\158"/.test(src),
        'a lifetime key does not show infinity');
    check('and the no-key state is used when there is no key',
        /updateCountdownDisplay\(countdownElements, nil, false\)/.test(src),
        'the card never asks for the no-key state');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE FORGET BUTTON SAYS WHAT IT DID');
// ---------------------------------------------------------------------------
{
    // It used to call the delete functions and say nothing, so a key that
    // could not be deleted - no delfile, or a read-only file - looked
    // exactly like a key that had been deleted.
    check('the delete reports whether it worked',
        /local function deleteFile[\s\S]{0,400}return (ok == true|false)/.test(src),
        'the delete does not report anything');
    check('and the button counts what it removed',
        /local gone = deleteAll4Files\(\)/.test(src) && /gone == 4/.test(src),
        'the button does not count');
    check('and it says so when the executor cannot delete files',
        /cannot delete files/.test(src),
        'the button does not explain a failure');
    check('and the state is cleared either way',
        /keyVerified = false/.test(src) && /updateCountdownDisplay\(countdownElements, nil, false\)/.test(src),
        'the card still thinks the key is there');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE CARD CAN ASK WHETHER THE WORKER IS THERE');
// ---------------------------------------------------------------------------
{
    const res = await ping();
    const body = (await res.text()).trim();
    check('the ping answers', res.status === 200, 'status ' + res.status);
    check('and it is plain text', body.indexOf('SHPONG') === 0, body.slice(0, 60));
    check('and the card asks for it', /\/sh\/ping/.test(src), 'the card has no ping');
    check('and the card has a button for it', /TEST THE CONNECTION/.test(src),
        'the card has no connection test');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE CARD SAYS WHAT WENT WRONG, NOT JUST "IT DID NOT WORK"');
// ---------------------------------------------------------------------------
{
    // "Could not reach the key server" and nothing else is not a diagnosis.
    check('the card tries more than one http function',
        /game:HttpGet/.test(src) && /request/.test(src) && /syn\.request/.test(src)
        && /http\.request/.test(src) && /httpget/.test(src),
        'a fallback is missing');
    check('and it keeps the last error', /LAST_HTTP_ERROR/.test(src),
        'the card does not keep the error');
    check('and it shows it', /Tried: /.test(src), 'the card does not show the error');
}
// ---------------------------------------------------------------------------
console.log('');
console.log('THE ANSWER THE WORKER GIVES IS THE ANSWER THE CARD PARSES');
// ---------------------------------------------------------------------------
{
    const login = await worker.fetch(new Request('https://t.workers.dev/sh/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: OWNER_CODE_PLAIN })
    }), env, { waitUntil() { } });
    const owner = (await login.json()).token;

    await worker.fetch(new Request('https://t.workers.dev/sh/licenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SH-Token': owner },
        body: JSON.stringify({
            licenses: {
                'GOODKEY-123': { hwid: '', expiresAt: Date.now() + 3600000, banned: false },
                'LIFEKEY-456': { hwid: '', expiresAt: 0, banned: false },
                'DEADKEY-789': { hwid: '', expiresAt: Date.now() - 1000, banned: false },
                'BANNEDKEY-000': { hwid: '', expiresAt: 0, banned: true, banReason: 'no' }
            }
        })
    }), env, { waitUntil() { } });

    // The patterns the card uses, in JavaScript, so the two are checked
    // against each other.
    const okPat = /^SHOK (\d+) (\d+)/;
    const errPat = /^SHERR (.+)$/;

    async function ask(k, h) {
        const url = 'https://t.workers.dev/sh/keycheck?k=' + encodeURIComponent(k) + '&h=' + encodeURIComponent(h);
        const req = new Request(url, { headers: { 'User-Agent': 'Roblox/570' } });
        const res = await worker.fetch(req, env, { waitUntil() { } });
        return (await res.text()).trim();
    }

    const good = await ask('GOODKEY-123', 'hwid-1');
    check('the worker answers SHOK for a good key', okPat.test(good), good);
    const m = good.match(okPat);
    check('with the expiry in milliseconds', m && Number(m[1]) > Date.now(), good);
    check('and the card can read that pattern', src.indexOf('^SHOK (%d+) (%d+)') !== -1,
        'the card does not parse SHOK');
    check('and a timed key is not a lifetime key', m && m[2] === '0', good);

    const life = await ask('LIFEKEY-456', 'hwid-1');
    check('a lifetime key says SHOK 0 1', life === 'SHOK 0 1', life);
    check('and the card reads it as lifetime', /lifetime == "1"/.test(src),
        'the card does not look at the lifetime flag');

    const dead = await ask('DEADKEY-789', 'hwid-1');
    check('an expired key says SHERR expired', dead === 'SHERR expired', dead);

    const banned = await ask('BANNEDKEY-000', 'hwid-1');
    check('a banned key says SHERR banned', banned === 'SHERR banned', banned);

    const nope = await ask('NOPE', 'hwid-1');
    check('a made-up key says SHERR invalid', nope === 'SHERR invalid', nope);
    check('and the card can read that pattern', src.indexOf('^SHERR (.+)$') !== -1,
        'the card does not parse SHERR');

    // And the card understands every word the worker can send.
    for (const code of ['invalid', 'expired', 'hwid', 'banned', 'killswitch']) {
        check('the card has a message for "' + code + '"',
            new RegExp(code + '\\s*=').test(src), 'no message for ' + code);
    }
}

console.log('');
console.log(fails === 0 ? 'KEY CARD   all checks passed' : ('KEY CARD   ' + fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
