// Reproduce VM_STATE_FRAME_OWNER: a host call that resumes a coroutine which itself
// unwinds frames.
//
// The first version of the host-spawn fix (commit e6bb799) made the GUI load but
// spammed `Error: -- VM_STATE_FRAME_OWNER` on the user's executor. It did not show up
// in the fengari suite, which is why it shipped - so the gap in the harness is the
// thing this file exists to close, not just the error.
//
// WHY IT NEEDS A DEEPER CASE
//
// SAVEVM snapshots the frames table BY REFERENCE. The host-call save/restore exists
// because a host function may resume a coroutine running VM code, and that nested run
// pops frames as it unwinds, running `FRAMES[FP] = nil` on the very table the snapshot
// points at. So when the caller restores, the slot it meant to resume into has
// legitimately been vacated, and LOADVM's self-check reports corruption that never
// happened. Every one of those pops is a real frame return, so reproducing it means
// driving enough nested returns - not merely one `task.spawn(function() end)`.
//
// AN HONEST LIMITATION
//
// The behavioural cases here PASS on the pre-fix emitter. They do not reproduce the
// error; fengari does not surface it, because reproducing it needs the real frame-pop
// pattern of a live executor, and stubbing that faithfully turned out to be the same
// problem in miniature. So those 8 cases are a floor, not the guard.
//
// The guard is the STRUCTURAL block at the bottom, and it is stronger than a count.
// It enumerates every LOADVM call site in the GENERATED VM and requires each to pass
// quiet. 43cb024 did the quiet flag for one restore path and left three others loud -
// all of them on a coroutine re-entry path (INVOKE, the _yt yield/continue pair, the
// root-state return) - and the user kept getting the same error spammed. A test that
// counted "is the check gated?" would have passed while the bug was live, because it
// only ever looked at the path it had already fixed.
//
// The behavioural cases remain a floor, not a guard. Saying so is better than leaving
// passing tests that look like they cover something they do not.
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

// The structural guard compiles a script to inspect its LOADVM call sites. It uses a
// small inline script rather than the user's real one, so it stays in `npm test` and
// does not depend on a path outside the repo.
const SRC = `local PlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = PlayerGui
task.spawn(function() local q = UDim.new(1, 0) end)
local m1 = Instance.new("Frame")
m1.Visible = true
m1.Parent = screenGui
`;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    const err = e ? to_jsstring(e) : '';
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
    return {
        ok: st === lua.LUA_OK, err, errTail: err.split('\n').slice(-3).join(' ').slice(0, 160),
        count: call0('COUNT').n, visible: call0('VISIBLES').s, spawn: call0('SPAWNERRORS').s || '',
    };
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
`;

// A helper that returns, so the nested run genuinely pops frames. A body that only
// assigns never pushes a frame, which is why the shallow case never reproduced this.
const NEST = (depth) => {
    let s = 'task.spawn(function()\n';
    for (let i = 0; i < depth; i++) s += '  local function d' + i + '() return UDim.new(' + i + ', 0) end\n  d' + i + '()\n';
    s += '  UDim.new(9, 9)\n';
    s += 'end)\n';
    return s;
};

const CASES = [
  ['spawn body makes one call', `task.spawn(function() local q = UDim.new(1, 0) end)\n`],
  ['spawn body returns through a helper', NEST(1)],
  ['spawn body returns through 3 helpers', NEST(3)],
  ['spawn body returns through 8 helpers', NEST(8)],
  ['nested spawn, inner unwinds', `task.spawn(function()\n  local function a() return UDim.new(1, 0) end\n  task.spawn(function() a() a() end)\n  a()\nend)\n`],
  ['two spawns each unwinding', NEST(3) + NEST(3)],
  // The stub's signal tables are created by mkSignal, which only wires Connect/Fire -
  // this case used a hand-rolled one and then called sig:Fire, which does not exist
  // on it, so the failure was the harness rather than the VM.
  ['spawn body unwinds inside a signal callback', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function()
  local function a() return UDim.new(1, 0) end
  local function b() return a() end
  b() b() b()
end)
t:Play()
`],
  ['spawn body yields then unwinds', `task.spawn(function()\n  local function a() return UDim.new(1, 0) end\n  task.wait(0.1)\n  a() a() a()\nend)\n`],
];

console.log('a host-spawned thread that UNWINDS must not corrupt the caller:\n');
console.log('  (these pass on the pre-fix emitter too - fengari cannot reproduce the');
console.log('   user-facing error. The structural checks below are the real guard;');
console.log('   see the honesty note in the file header.)\n');
for (const [name, body] of CASES) {
    const src = HEAD + body + TAIL;
    const base = run(src);
    if (!base.ok || base.spawn) { no(name + ' - the STUB cannot run the plain script (' + (base.err || base.spawn).slice(0, 50) + ')'); continue; }
    let out;
    try { out = generate(src); } catch (e) { no(name + ' - generator threw ' + e.message.slice(0, 50)); continue; }
    const r = run(canary(out) + out);
    const frameErr = /VM_STATE_FRAME|VM_STATE_FP|VM_STATE_CODE|VM_FRAME_MISSING/.test(r.err + ' ' + (r.spawn || ''));
    if (frameErr) { no(name + ' - VM state assertion: ' + ((r.err + ' ' + (r.spawn || '')).match(/VM_[A-Z_]+/g) || []).join(',')); continue; }
    if (!r.ok) { no(name + ' - errored: ' + r.errTail); continue; }
    if (r.spawn) { no(name + ' - faulted in a thread: ' + r.spawn.split('\n')[0].slice(0, 50)); continue; }
    if (r.count === base.count && r.visible === base.visible) ok(name + ' (' + r.count + ' objects, no state assertion)');
    else no(name + ': built ' + r.count + ' of ' + base.count);
}

// THE ACTUAL GUARD.
//
// The behavioural cases above cannot reproduce the user's error, so this block
// enumerates the generated VM's LOADVM call sites and asserts the ones that restore a
// snapshot all pass quiet. It is deliberately exhaustive over call sites rather than
// counting occurrences: 43cb024 quieted ONE restore path and left three others loud,
// every one of them on a coroutine re-entry path, and the user kept getting spammed.
// A count would have read "the check is gated" and passed while the bug was live.
console.log('\nevery restore path in the emitted VM must skip the false-positive check:\n');
{
    let out;
    try { out = generate(SRC); } catch (e) { no('generator threw: ' + e.message.slice(0, 60)); }
    if (out) {
        const def = /local (\w+)=function\(st,quiet\)/.exec(out);
        if (!def) { no('the emitted VM has no quiet-capable LOADVM at all'); }
        else {
            const LV = def[1];
            ok('the emitted VM defines a quiet-capable LOADVM');
            const re = new RegExp(LV + '\\(([^()]*)\\)', 'g');
            const calls = [];
            let m;
            while ((m = re.exec(out)) !== null) calls.push(m[1].trim());
            const loud = calls.filter(a => !/,\s*true\s*$/.test(a));
            if (loud.length === 0) ok('all ' + calls.length + ' LOADVM call sites restore quietly');
            else no(loud.length + ' LOADVM site(s) still loud: ' + [...new Set(loud)].join(', '));
        }
    }
}

console.log('\nthe check itself is still there, and the scheduler is untouched:\n');
{
    const src = fs.readFileSync('vm-bytecode.js', 'utf8');
    const loadvm = /function\(st,quiet\)([\s\S]*?)end'\);/.exec(src);
    const gated = /not quiet then local q=/.test(src);
    const throwsInLoadvm = loadvm ? /VM_STATE_FRAME_OWNER/.test(loadvm[1]) : false;
    if (gated && throwsInLoadvm) ok('LOADVM still asserts on its own when quiet is not passed');
    else no('LOADVM no longer asserts (gated=' + gated + ', throw present=' + throwsInLoadvm + ')');
    if (/if ' \+ CUR \+ '\.owner~=' \+ OWNER \+ ' then error\("VM_STATE_FRAME_OWNER"/.test(src)) ok('the scheduler owner check is unchanged');
    else no('the scheduler owner check was altered - it should not have been touched');
}

console.log('');
console.log(fail ? 'FRAME OWNER   ' + pass + ' passed, ' + fail + ' FAILED' : 'FRAME OWNER   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
