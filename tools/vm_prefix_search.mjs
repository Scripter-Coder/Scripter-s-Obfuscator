// Find the SMALLEST prefix of the real script that the VM build gets wrong.
//
// Truncating on a line number does not work: a cut lands mid-function and the file
// will not parse, which reads as "harness problem" and tells you nothing. So the
// boundaries come from the parser - the end offset of each top-level statement - and
// every candidate is guaranteed to be syntactically complete.
//
// The result is a small, self-contained failing file, which is the only thing worth
// handing to anyone who has to fix the VM.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const SRC = process.argv[2];
const src = fs.readFileSync(SRC, 'utf8');

// The compiler is called directly rather than through applyCustomObfuscator. Two
// reasons: `vmPass: false` sets `vmCode = code`, so there is NO separate transform to
// test - every earlier "the transform is fine" result was really the identity
// function, and it exonerated nothing. And vm-pass.js now routes `lite` here too, so
// both tiers share this one compiler, which is where the defect must be.
const generate = (text) => applyBytecodeVm(text, { profile: 'FAST' });

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    for (let i = 0; i < 8; i++) { lua.lua_getglobal(L, to_luastring('PUMP')); lua.lua_pushinteger(L, 1); lua.lua_pcall(L, 1, 0, 0); }
    const call0 = (name) => {
        lua.lua_getglobal(L, to_luastring(name));
        if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) return { err: name + ' missing' };
        if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) return { err: to_jsstring(lua.lua_tostring(L, -1)) };
        const t = lua.lua_type(L, -1);
        if (t === lua.LUA_TNUMBER) return { n: lua.lua_tointeger(L, -1) };
        if (t === lua.LUA_TSTRING) return { s: to_jsstring(lua.lua_tostring(L, -1)) };
        return { err: 'type ' + t };
    };
    return { ok: st === lua.LUA_OK, err: e ? to_jsstring(e) : '', count: call0('COUNT').n, visible: call0('VISIBLES').s, spawn: call0('SPAWNERRORS').s || '' };
}
function canary(obf) {
    const cm = String(obf).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return cm ? '_G.' + cm[1] + '=' + cm[2] + '\n' : '';
}
const OPTS = { intensity: 5, antiTamper: true, antiSkid: false, antiLogger: false, vmPass: true };

// top-level statement boundaries, from the parser
const ast = luaparse.parse(src, { ranges: true, comments: false });
const ends = ast.body.map(s => s.range[1]);
console.log('top-level statements: ' + ends.length);

function vmFailsUpTo(k) {
    const text = src.slice(0, ends[k - 1]) + '\n';
    const base = run(text);
    if (!base.ok || base.spawn) return 'harness';            // the stub cannot run it
    const dbg = {};
    let obf;
    try { obf = generate(text); } catch (e) { return 'generator'; }
    if (!obf) return 'generator';
    const r = run(canary(obf) + (dbg.payload || obf));
    if (!r.ok || r.spawn) return 'error';
    return (r.count + '|' + r.visible) === (base.count + '|' + base.visible) ? null : 'differs';
}

console.log('\nfull file: ' + (vmFailsUpTo(ends.length) || 'VM matches source'));

// binary search for the first failing k, assuming failure is monotonic in k
let lo = 1, hi = ends.length, firstBad = -1;
const memo = new Map();
const probe = (k) => { if (memo.has(k)) return memo.get(k); const v = vmFailsUpTo(k); memo.set(k, v); return v; };
while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = probe(mid);
    process.stdout.write('  k=' + mid + ' -> ' + (v || 'match') + '\n');
    if (v && v !== 'harness' && v !== 'generator') { firstBad = mid; hi = mid - 1; }
    else lo = mid + 1;
}

if (firstBad < 0) {
    console.log('\nno failing prefix found - the defect is not monotone in length, so the');
    console.log('desync is about something a prefix cannot capture (a later chunk, or a');
    console.log('whole-program property).');
} else {
    const out = src.slice(0, ends[firstBad - 1]) + '\n';
    fs.mkdirSync('tools/_cases', { recursive: true });
    fs.writeFileSync('tools/_cases/minimal_failing.lua', out, 'utf8');
    const line = src.slice(0, ends[firstBad - 1]).split('\n').length;
    console.log('\nSMALLEST FAILING PREFIX: ' + firstBad + ' statements, ' + out.length + ' bytes, ends at source line ' + line);
    console.log('written to tools/_cases/minimal_failing.lua');
    console.log('\nlast 6 statements of the failing prefix:');
    out.split('\n').slice(-7).forEach(l => console.log('  ' + l));
    console.log('\nand the statement immediately AFTER it in the real script:');
    const rest = src.slice(ends[firstBad - 1]);
    console.log('  ' + rest.split('\n').slice(0, 3).join('\n  '));
}
