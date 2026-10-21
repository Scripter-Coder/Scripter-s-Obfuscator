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

const LUA_PATH = 'scripterhub_keycard.lua';
const src = fs.readFileSync(LUA_PATH, 'utf8');

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
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
console.log('THE ANSWER THE WORKER GIVES IS THE ANSWER THE CARD PARSES');
// ---------------------------------------------------------------------------
{
    // The real worker, a mocked KV, a real D1 shape.
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
