// Run the ACTUAL reported script, unobfuscated and obfuscated, and compare the GUI
// tree each one builds.
//
// HISTORY, because it changes how much this file is worth
//
// An earlier run of this same comparison reported that the bytecode VM was broken:
// "attempt to call a nil value (local 'f')" with the VM's own CALL handler
// instrumented, giving n=3 type(n)=number top=8 calleeSlot=5, i.e. a nil callee
// register. That was a HARNESS DEFECT. The stub defined TweenService only for
// game:GetService, never as a global, so every `TweenService:Create(...)` in the
// script hit nil - and the resulting error was reported as a VM fault. Once the
// stub was made faithful, the same probe the VM "failed" passes.
//
// The lesson is encoded in the assertions below: a run is only a finding if the
// UNOBFUSCATED source runs clean in the same stub first. Otherwise the stub is
// being blamed for the code, and every conclusion drawn from it is worthless.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const SRC = process.argv[2];
if (!SRC) { console.log('usage: node tools/real_script_test.mjs <script.lua>'); process.exit(2); }
const src = fs.readFileSync(SRC, 'utf8');

function run(code, pumps) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const s1 = lauxlib.luaL_dostring(L, to_luastring(STUB));
    if (s1 !== lua.LUA_OK) return { ok: false, err: 'STUB: ' + to_jsstring(lua.lua_tostring(L, -1)) };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    // The script hides its panel behind a spawned thread and a tween, so let the
    // queued coroutines run before asking what the tree looks like.
    for (let i = 0; i < (pumps || 0); i++) {
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
    return {
        ok: st === lua.LUA_OK,
        err: e ? to_jsstring(e) : '',
        count: call0('COUNT').n,
        visible: call0('VISIBLES').s,
        tree: call0('TREE').s || '',
        missing: call0('MISSINGNAMES').s || '',
        spawn: call0('SPAWNERRORS').s || '',
    };
}

function canary(obf) {
    const cm = String(obf).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return cm ? '_G.' + cm[1] + '=' + cm[2] + '\n' : '';
}

const OPTS_BASE = { antiTamper: true, antiSkid: false, antiLogger: true };

console.log('script: ' + SRC);
console.log('size:   ' + src.length + ' bytes\n');

const base = run(src, 8);
console.log('=== BASELINE (unobfuscated) ===');
if (!base.ok || base.spawn) {
    if (!base.ok) console.log('  run FAILED: ' + base.err.split('\n')[0]);
    if (base.spawn) console.log('  faulted inside a spawned thread: ' + base.spawn.split('\n')[0].slice(0, 160));
    console.log('  undefined globals read: ' + base.missing.slice(0, 300));
    console.log('\n  The stub cannot run this script, so NOTHING below is a finding about the');
    console.log('  obfuscator. Fix the stub first - this is exactly the trap this file exists to');
    console.log('  document.');
    process.exit(1);
}
console.log('  ok  instances=' + base.count + '  visible=' + JSON.stringify(base.visible));
if (base.missing) console.log('  note: undefined globals read -> ' + base.missing.slice(0, 300));
console.log('\n  the source tree, in creation order:');
base.tree.split('\n').slice(0, 12).forEach(l => console.log('    ' + l));
console.log('    ... (' + base.tree.split('\n').length + ' lines total)');

const BASE_KEY = base.count + '|' + base.visible;
console.log('\n=== OBFUSCATED ===');
for (const vmPass of [false, true]) {
    for (const intensity of [3, 5, 8]) {
        const dbg = {};
        let obf;
        const label = 'intensity ' + intensity + (vmPass ? '  VM ON ' : '  VM off');
        try {
            obf = applyCustomObfuscator(src, { ...OPTS_BASE, intensity, vmPass }, dbg);
        } catch (e) {
            console.log('  ' + label + ' : GENERATOR THREW ' + e.message);
            continue;
        }
        const r = run(canary(obf) + (dbg.payload || obf), 8);
        if (!r.ok) {
            console.log('  ' + label + ' : ERROR ' + r.err.split('\n')[0].slice(0, 90));
            if (r.spawn) console.log('        faulted in a spawned thread: ' + r.spawn.split('\n')[0].slice(0, 120));
            if (r.missing) console.log('        undefined globals read -> ' + r.missing.slice(0, 200));
            continue;
        }
        if (r.spawn) {
            console.log('  ' + label + ' : faulted in a spawned thread: ' + r.spawn.split('\n')[0].slice(0, 110));
            continue;
        }
        const key = r.count + '|' + r.visible;
        console.log('  ' + label + ' : ' + (key === BASE_KEY ? 'IDENTICAL to source' : 'DIFFERS -> ' + key + ' (source ' + BASE_KEY + ')'));
        if (key !== BASE_KEY && r.tree) {
            console.log('        the VM build stopped after:');
            r.tree.split('\n').forEach(l => console.log('          ' + l));
        }
    }
}

// A partial GUI that reports "ok" is the most misleading possible result, and it is
// what this run produces. The anti-crack wrapper evaluates the payload inside
// pcall(), so a fault in the payload is swallowed and the chunk simply stops early -
// no error reaches the player, which is precisely why the symptom presents as "the
// GUI blinks and vanishes" rather than as a crash. Re-running with the wrapper off
// is the only way to see what the payload actually threw.
console.log('\n=== DIAGNOSTIC: the same VM build with the anti-crack wrapper removed ===');
{
    const dbg = {};
    let obf;
    try {
        obf = applyCustomObfuscator(src, { ...OPTS_BASE, antiTamper: false, intensity: 5, vmPass: true }, dbg);
    } catch (e) { console.log('  generator threw: ' + e.message); }
    if (obf) {
        const r = run(dbg.payload || obf, 8);
        console.log('  ran: ' + (r.ok ? 'ok' : 'ERROR'));
        if (!r.ok) {
            const line = r.err.split('\n')[0];
            console.log('  error: ' + line.slice(0, 200));
            const m = /attempt to (?:call|index)[^\n]*/.exec(r.err);
            if (m) console.log('  kind: ' + m[0].slice(0, 160));
            const ln = /:(\d+): attempt/.exec(r.err);
            if (ln) console.log('  at generated line: ' + ln[1]);
        }
        console.log('  instances=' + r.count + ' visible=' + JSON.stringify(r.visible.slice(0, 160)));
    }
}
