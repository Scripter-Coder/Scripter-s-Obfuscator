// THE VAULT STAYS ON THE WORKER.
//
// The vault is every string and every number a script uses. It used to be
// inside the artifact, with the key that unpacks it, so copying the file and
// running one function was the entire deobfuscation - which is exactly what
// somebody did.
//
// This test drives the real obfuscator, the real worker module, and the real
// init layer, and asserts that:
//
//   1. the artifact no longer carries the vault
//   2. the vault comes out of the obfuscator and goes to the worker
//   3. the worker serves it, and only to a live session for that script
//   4. the init layer fetches it before the artifact runs
//
// Run: node tools/vault_test.mjs

import fs from 'node:fs';
import luaparse from 'luaparse';
import * as fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
import { makeD1 as makeD1Shape } from './d1_shape.mjs';
import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs';

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;

// The bytecode VM needs a parser.
vmBCSetLuaparse(luaparse);

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// ---------------------------------------------------------------------------
console.log('THE OBFUSCATOR LEAVES THE VAULT BEHIND');
// ---------------------------------------------------------------------------
const SOURCE = [
    'local Greeter = {}',
    'function Greeter.greet(who)',
    '  return "hello " .. tostring(who)',
    'end',
    'function Greeter.secret()',
    '  return "a very secret literal that must not travel in the file"',
    'end',
    'local _r = Greeter.greet("world") .. "|" .. Greeter.secret()',
    '_G.__SH_VAULT_RESULT = _r',
    'return _r'
].join('\n');

let artifact = '';
let vault = '';
{
    const dbg = {};
    const code = applyCustomObfuscator(SOURCE, {
        intensity: 12, target: 'luau', serverVault: true, splitKey: false
    }, dbg);
    artifact = String(code || '');
    vault = String(dbg.vaultB64 || '');
    check('the obfuscator produced an artifact', artifact.length > 0, 'empty');
    check('and the vault came out with it', vault.length > 0, 'the vault is empty');
    check('the artifact asks for the vault instead of carrying it',
        artifact.indexOf('__SH_VAULT_B64') !== -1,
        'the artifact does not reference the vault');
    check('and it does NOT carry the vault inline',
        artifact.indexOf(vault) === -1,
        'the vault is still in the file');
    // The secret literal must not be readable in the artifact.
    check('and the string it protects is not in the file',
        artifact.indexOf('a very secret literal') === -1,
        'the literal is in the file');
    // The constant TABLE must not be in the file either: it said how many
    // strings the script has and how long each one is.
    const constTables = [...artifact.matchAll(/^local\s+\w+\s*=\s*(\{.*\})\s*$/gm)]
        .filter(t => [...t[1].matchAll(/\{(\d+),(\d+)\}/g)].length >= 3);
    check('and the constant table is not in the file',
        constTables.length === 0,
        constTables.length + ' table(s) of {start,len} pairs are still there');
    // And the artifact must be useless without the payload.
    check('and the artifact cannot run without it',
        artifact.indexOf('__SH_VAULT_B64') !== -1 &&
        !/local\s+\w+\s*=\s*_b64dec\("[A-Za-z0-9+/=]{100,}"/.test(artifact),
        'the file still carries a payload of its own');
    // Without the option, the vault stays in the file - that is the old
    // behaviour, and it has to stay that way for the scripts that are
    // already published.
    const dbg2 = {};
    const plain = String(applyCustomObfuscator(SOURCE, { intensity: 12, target: 'luau' }, dbg2) || '');
    check('and without the option the behaviour is unchanged',
        !dbg2.vaultB64 && plain.indexOf('__SH_VAULT_B64') === -1,
        'the option leaked');
}

// ---------------------------------------------------------------------------
console.log('');
console.log('THE WORKER KEEPS IT AND SERVES IT TO A LIVE SESSION');
// ---------------------------------------------------------------------------
{
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

    // Publish a script with a vault.
    const id = 'ScripterHub0000001234';
    const up = await worker.fetch(new Request('https://t.workers.dev/sh/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SH-Token': owner },
        body: JSON.stringify({
            name: 'Vaulted', user: 'tester', cipher: 'U0hPS0Zha2U=', keyHash: 'cafe',
            wantId: id, plainCode: 'print("hi")', vault: vault,
            splitKey: { paddedKey: [11, 22, 33, 44], t0: Date.now(), chk: 4242 }
        })
    }), env, { waitUntil() { } });
    const upJson = await up.json();
    check('the upload is accepted', upJson.ok === true, JSON.stringify(upJson).slice(0, 140));
    check('the vault is in the worker, not in the artifact',
        String(KV._store.get('sh_vault_' + id) || '') === vault,
        'the vault is not where it should be');
    const meta = JSON.parse(KV._store.get('sh_meta_' + id) || '{}');
    check('and the meta says there is one', meta.hasVault === true, JSON.stringify(meta).slice(0, 140));

    // The route refuses without a session.
    const noSession = await worker.fetch(new Request('https://t.workers.dev/sh/vault/' + id + '?s=nope&n=nope'),
        env, { waitUntil() { } });
    const noBody = (await noSession.text()).trim();
    check('the vault is not served to nobody', noBody === 'SHERR no-session', noBody.slice(0, 80));

    // With a live session it comes.
    const ses = await worker.fetch(new Request('https://t.workers.dev/sh/session?id=' + id + '&h=hwid-1',
        { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } }), env, { waitUntil() { } });
    const sesText = (await ses.text()).trim();
    check('a session is minted', sesText.indexOf('SHS ') === 0, sesText.slice(0, 80));
    const m = sesText.match(/^SHS (\S+) (\S+)/);
    const served = await worker.fetch(new Request(
        'https://t.workers.dev/sh/vault/' + id + '?s=' + m[1] + '&n=' + m[2],
        { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } }), env, { waitUntil() { } });
    const servedBody = await served.text();
    check('and the vault is served to that session', servedBody === vault,
        'got ' + servedBody.length + ' chars, wanted ' + vault.length);

    // A wrong nonce is refused.
    const wrong = await worker.fetch(new Request(
        'https://t.workers.dev/sh/vault/' + id + '?s=' + m[1] + '&n=wrong',
        { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } }), env, { waitUntil() { } });
    const wrongBody = (await wrong.text()).trim();
    check('and a wrong nonce is refused', wrongBody === 'SHERR no-session', wrongBody.slice(0, 80));

    // The init layer asks for it before the artifact.
    const init = await worker.fetch(new Request('https://t.workers.dev/sh/' + id,
        { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } }), env, { waitUntil() { } });
    const initBody = await init.text();
    check('the init layer fetches the vault', initBody.indexOf('/sh/vault/') !== -1,
        'the init layer does not fetch the vault');
    check('and it does so BEFORE the artifact',
        initBody.indexOf('/sh/vault/') < initBody.indexOf('"?s="..S.."&n="..N)'),
        'the vault is fetched after the artifact');
    check('and it hands it to the artifact', initBody.indexOf('__SH_VAULT_B64=VB') !== -1,
        'the init layer does not set the global');
    check('and the init layer itself carries no vault',
        initBody.indexOf(vault) === -1,
        'the vault is in the init layer');

    // THE WHOLE PATH, END TO END.
    //
    // The payload the worker served is handed to the artifact exactly the
    // way the init layer hands it over, and the artifact runs. This is the
    // proof that moving the script out of the file did not move it out of
    // reach: the script still runs, and it still runs off the worker's copy.
    {
        const st = AUX.luaL_newstate();
        LIB.luaL_openlibs(st);
        LUA.lua_pushstring(st, fengari.to_luastring(servedBody));
        LUA.lua_setglobal(st, '__SH_VAULT_B64');
        const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(artifact));
        check('the artifact compiles', chunk === 0,
            chunk === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1)));
        const rc = chunk === 0 ? LUA.lua_pcall(st, 0, 0, 0) : -1;
        check('and it runs on the payload the worker served', rc === 0,
            rc === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1)));
        LUA.lua_getglobal(st, '__SH_VAULT_RESULT');
        const got = LUA.lua_isnil(st, -1) ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_pop(st, 1);
        LUA.lua_close(st);
        check('and it produces the script\'s own output',
            got === 'hello world|a very secret literal that must not travel in the file',
            JSON.stringify(got));
    }

    // And without the payload it is not a script at all.
    {
        const st = AUX.luaL_newstate();
        LIB.luaL_openlibs(st);
        const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(artifact));
        const rc = chunk === 0 ? LUA.lua_pcall(st, 0, 0, 0) : -1;
        const msg = rc === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_close(st);
        check('without the payload the artifact refuses to run', rc !== 0,
            'it ran anyway - the file is self-contained');
        check('and it says why', /encryption key is missing/.test(msg), JSON.stringify(msg.slice(0, 90)));
    }
}

console.log('');
console.log(fails === 0 ? 'VAULT   all checks passed' : ('VAULT   ' + fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
