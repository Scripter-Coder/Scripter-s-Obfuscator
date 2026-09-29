// A host function that resumes VM code must not corrupt the caller's frame.
//
// THE DEFECT THIS GUARDS
//
// Found on a real 44KB Roblox GUI script. Obfuscated, it produced an empty ScreenGui:
// the loading overlay was built, its own teardown tween then destroyed it on schedule,
// and the player saw a GUI blink and vanish. No error reached them, because the fault
// was not a fault - the chunk simply stopped executing early, which is indistinguishable
// from "the script finished" unless you check what it built.
//
// The cause was in the VM's host-call path. It guarded the interpreter's registers
// with a save/restore, but only when the callee was literally `coroutine.resume` or
// `coroutine.yield`. `task.spawn` is an ordinary host function - neither test matches -
// but its body calls `coroutine.resume` on a coroutine that is running VM code. That
// nested run leaves PC, SP, FP, BASE, CUR and the operand registers pointing at the
// spawned frame, and nothing put them back, so the caller continued from a stale
// program counter. The rest of the chunk silently never ran.
//
// The trigger is startlingly small: a bare `task.spawn(function() end)` anywhere in a
// top-level chunk cut a 63-object GUI build off after ONE object. The body does not
// matter, the position does not matter, and the bug is invisible in any test that only
// checks "did it throw".
//
// So this asserts the OBSERVABLE thing - the statements after a spawn still run - which
// is the only property that was actually broken.
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
const generate = (text) => applyBytecodeVm(text, { profile: 'FAST' });

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    for (let i = 0; i < 6; i++) { lua.lua_getglobal(L, to_luastring('PUMP')); lua.lua_pushinteger(L, 1); lua.lua_pcall(L, 1, 0, 0); }
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

const HEAD = `local PlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = PlayerGui
`;
const TAIL = `local m1 = Instance.new("Frame")
m1.Visible = true
m1.Parent = screenGui
local m2 = Instance.new("Frame")
m2.Visible = true
m2.Parent = screenGui
local m3 = Instance.new("Frame")
m3.Visible = true
m3.Parent = screenGui
`;

const CASES = [
  ['no spawn at all (control)', ''],
  ['task.spawn with an EMPTY body', `task.spawn(function() end)\n`],
  ['body assigns a literal', `task.spawn(function() local q = 1 end)\n`],
  ['body makes one call', `task.spawn(function() local q = UDim.new(1, 0) end)\n`],
  ['body discards a call result', `task.spawn(function() UDim.new(1, 0) end)\n`],
  ['body calls a method', `task.spawn(function() screenGui:GetChildren() end)\n`],
  ['body calls task.wait then more', `task.spawn(function() UDim.new(1, 0) task.wait(0.1) UDim.new(2, 0) end)\n`],
  ['body creates and parents an instance', `task.spawn(function() local o = Instance.new("Frame") o.Parent = screenGui end)\n`],
  ['two spawns, only the first has a body', `task.spawn(function() UDim.new(1, 0) end)\ntask.spawn(function() end)\n`],
  ['task.defer instead of task.spawn', `task.defer(function() UDim.new(1, 0) end)\n`],
  ['spawn AFTER some real work', `local pre = Instance.new("Frame")
pre.Visible = true
pre.Parent = screenGui
task.spawn(function() UDim.new(1, 0) end)\n`],
  ['spawn with a nested spawn inside', `task.spawn(function() task.spawn(function() UDim.new(1, 0) end) end)\n`],
];

console.log('statements after a host-spawned thread must still execute:\n');
for (const [name, body] of CASES) {
    const src = HEAD + body + TAIL;
    const base = run(src);
    if (!base.ok || base.spawn) { no(name + ' - the STUB cannot run the plain script (' + (base.err || base.spawn).slice(0, 60) + ')'); continue; }
    let out;
    try { out = generate(src); } catch (e) { no(name + ' - generator threw ' + e.message.slice(0, 60)); continue; }
    const r = run(canary(out) + out);
    if (!r.ok) { no(name + ' - compiled build errored: ' + r.err.split('\n')[0].slice(0, 70)); continue; }
    if (r.spawn) { no(name + ' - compiled build faulted in a thread: ' + r.spawn.split('\n')[0].slice(0, 60)); continue; }
    if (r.count === base.count && r.visible === base.visible) ok(name + ' (' + r.count + ' objects)');
    else no(name + ': built ' + r.count + ' of ' + base.count + ' objects - execution stopped at the spawn');
}

console.log('\nthe fix is in the host-call path, not the bytecode format:\n');
{
    const src = fs.readFileSync('vm-bytecode.js', 'utf8');
    // The save must be UNCONDITIONAL on the unguarded path. Keying it on the callee
    // being coroutine.resume is the original bug: task.spawn never matches that test.
    const saveAt = src.indexOf("if not _co and not _yt then ' + XS + '={} ' + SAVEVM");
    if (saveAt >= 0) ok('the host-call path saves interpreter state when neither _co nor _yt applies');
    else no('no unconditional state save on the host-call path - a host call that resumes VM code will still clobber the caller');

    // The restore has to be emitted AFTER the call, and BEFORE the result is stored.
    // Restoring early would mean the subsequent SP/SP+1 update writes the call result
    // into the spawned frame's stack slot.
    const callAt = src.indexOf("local r=' + PK + '(f(");
    const restoreAt = src.indexOf("if ' + XS + ' then ' + LOADVM");
    if (callAt >= 0 && restoreAt > callAt) ok('the restore is emitted after the host call, so the result lands in the caller\'s frame');
    else no('restore ordering is wrong (call at ' + callAt + ', restore at ' + restoreAt + ')');
}

console.log('');
console.log(fail ? 'HOST SPAWN   ' + pass + ' passed, ' + fail + ' FAILED' : 'HOST SPAWN   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
