// Run the LIVE hosted artifact against the Roblox stub and report what it builds.
//
// This is the decisive test, and it is a different question from the ones asked
// before. Earlier rounds compared the obfuscator's output on a local file. This one
// takes the exact bytes a player downloads and executes them, so there is no gap
// between "the fix works locally" and "the fix is in the artifact people are running".
//
// The artifact cannot be inspected by grep: the VM dispatcher is vaulted, so neither
// the fix marker nor the pre-fix guard is greppable. Running it is the only way to
// tell which build it is.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const ART = process.argv[2];
if (!ART) { console.log('usage: node tools/live_artifact_test.mjs <artifact.txt>'); process.exit(2); }
let src = fs.readFileSync(ART, 'utf8');

// The delivery envelope: keyless artifacts are "SHL\n" + the source.
if (src.slice(0, 4) === 'SHL\n') src = src.slice(4);
else if (src.slice(0, 3) === 'SHL') src = src.slice(3).replace(/^\r?\n/, '');
console.log('artifact: ' + ART);
console.log('payload:  ' + src.length + ' bytes');

// The anti-crack wrapper verifies a canary that the genuine loader registers. Without
// it the wrapper concludes it was tampered with, prints its decoy, and returns - which
// looks exactly like "the script built nothing".
let canary = '';
const cm = src.match(/g\.(_shc[0-9a-f]+)\s*=\s*(\d+)/);
if (cm) { canary = '_G.' + cm[1] + ' = ' + cm[2] + '\n'; console.log('canary:   ' + cm[1] + ' = ' + cm[2]); }
else console.log('canary:   none found - the payload may not be wrapped, or it uses another scheme');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) {
    console.log('STUB FAILED: ' + to_jsstring(lua.lua_tostring(L, -1)));
    process.exit(1);
}

console.log('\nrunning...');
const t0 = Date.now();
const st = lauxlib.luaL_dostring(L, to_luastring(canary + src));
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('compile+run: ' + (st === lua.LUA_OK ? 'ok' : 'ERROR') + '  (' + secs + 's)');
const e = lua.lua_tostring(L, -1);
if (e) console.log('error: ' + to_jsstring(e).split('\n').slice(0, 3).join(' | ').slice(0, 300));

for (let i = 0; i < 8; i++) {
    lua.lua_getglobal(L, to_luastring('PUMP'));
    lua.lua_pushinteger(L, 1);
    lua.lua_pcall(L, 1, 0, 0);
}

const call0 = (name) => {
    lua.lua_getglobal(L, to_luastring(name));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) return { err: name + ' missing' };
    if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) return { err: to_jsstring(lua.lua_tostring(L, -1)) };
    const t = lua.lua_type(L, -1);
    if (t === lua.LUA_TNUMBER) return { n: lua.lua_tointeger(L, -1) };
    if (t === lua.LUA_TSTRING) return { s: to_jsstring(lua.lua_tostring(L, -1)) };
    return { err: 'type ' + t };
};

const count = call0('COUNT');
const vis = call0('VISIBLES');
const spawn = call0('SPAWNERRORS');
const miss = call0('MISSINGNAMES');

console.log('\ninstances built : ' + (count.n === undefined ? count.err : count.n) + '   (the source builds 63)');
console.log('visible objects : ' + (vis.s === undefined ? vis.err : JSON.stringify(vis.s).slice(0, 160)));
console.log('thread faults   : ' + (spawn.s === undefined ? '(none)' : spawn.s.slice(0, 200)));
console.log('undefined globals read: ' + ((miss.s || '(none)').slice(0, 200)));

const n = count.n || 0;
if (n === 0) { console.log('\nVERDICT: built NOTHING - the chunk did not get past its early statements'); process.exit(1); }
if (n < 60) { console.log('\nVERDICT: built ' + n + ' of 63 - execution stopped partway through'); process.exit(1); }
if ((vis.s || '') === '') { console.log('\nVERDICT: built the full tree but nothing is visible - the panel was never revealed'); process.exit(1); }
console.log('\nVERDICT: the artifact builds the whole GUI and reveals it');
