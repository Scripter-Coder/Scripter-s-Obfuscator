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
// The guard is the STRUCTURAL block at the bottom: it asserts the shape of the emitted
// code - that LOADVM accepts a quiet flag, that the host-call restore passes it, that
// the non-restore callers still assert, and that the scheduler check is untouched.
// Those 4 assertions fail on e6bb799 and pass here, which is the property that
// actually changed. Saying so is better than leaving 8 passing tests that look like
// they cover something they do not.
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

console.log('\nthe self-check is skipped ONLY on the restore path:\n');
{
    const src = fs.readFileSync('vm-bytecode.js', 'utf8');
    if (/function\(st,quiet\)/.test(src)) ok('LOADVM takes a quiet flag');
    else no('LOADVM has no quiet flag - the restore cannot skip its own false-positive assertion');
    const quietCall = src.indexOf("LOADVM + '(' + XS + ',true)");
    const callSite = src.indexOf("local r=' + PK + '(f(");
    if (quietCall > 0 && quietCall > callSite) ok('the host-call restore passes quiet=true');
    else no('the host-call restore does not pass quiet=true (quiet at ' + quietCall + ', call at ' + callSite + ')');
    // The scheduler / coroutine paths must still assert, or a real corruption goes
    // silent. Counting occurrences is not the test: the scheduler check at ~3251 is a
    // SEPARATE assertion on CUR and always fired, so the count is 2 whether or not
    // LOADVM's own check is gated. What matters is that LOADVM's check is still
    // reachable when quiet is not passed.
    const loadvm = /function\(st,quiet\)([\s\S]*?)end'\);/.exec(src);
    const gated = /if ' \+ FP \+ '>0 and not quiet then/.test(src) || /and not quiet then local q=/.test(src);
    const throwsInLoadvm = loadvm ? /VM_STATE_FRAME_OWNER/.test(loadvm[1]) : false;
    if (gated && throwsInLoadvm) ok('LOADVM still asserts on its own when quiet is not passed');
    else no('LOADVM no longer asserts for the non-restore callers (gated=' + gated + ', throw present=' + throwsInLoadvm + ')');
    // ...and the scheduler path must be untouched by this change.
    if (/if ' \+ CUR \+ '\.owner~=' \+ OWNER \+ ' then error\("VM_STATE_FRAME_OWNER"/.test(src)) ok('the scheduler owner check is unchanged');
    else no('the scheduler owner check was altered - it should not have been touched');
}

console.log('');
console.log(fail ? 'FRAME OWNER   ' + pass + ' passed, ' + fail + ' FAILED' : 'FRAME OWNER   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
