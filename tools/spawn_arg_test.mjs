// Isolate which construct in the failing script breaks the VM, using the working
// script as the control.
//
// The user supplied a script that runs clean on the same executor with the same build.
// That is the first real control this investigation has had, and the diff is stark:
//
//     :Connect(              0 in WORKS,  32 in FAILS
//     task.spawn(fn, ARG)    0 in WORKS,   5 in FAILS
//     task.defer             0 in WORKS,   2 in FAILS
//
// Two candidates, and both are things the stub does not model correctly - which is
// exactly why four rounds of fengari testing missed this:
//
//   1. task.spawn(fn, arg) FORWARDS ITS ARGUMENTS. The stub's task.spawn takes only `f`
//      and drops the rest, so a spawn that passes a closure over an upvalue never
//      exercised the argument path at all.
//   2. :Connect callbacks are VM functions invoked BY THE HOST, later, from outside
//      any VM frame. That is the deepest re-entry the VM can be asked to survive.
//
// Each case is run twice: once with fengari's unique coroutine tostring, and once with
// a colliding one, because the user's executor is known to collide and that changes
// the answer.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const BASE = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const generate = (t) => applyBytecodeVm(t, { profile: 'FAST' });

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

// The shared stub now forwards task.spawn arguments, so it is used as-is. An earlier
// version of this file tried to patch the forwarding in with a string replace, and the
// patch produced a stub that failed to load - which showed up as every case reporting
// "error" and looked like a VM failure. Patching the shared stub is the only place this
// belongs.
const STUB = BASE;

// Colliding coroutine tostring, matching the executor.
const STUB_COLLIDE = STUB.replace(/task = \{\}/, [
  '__REAL_TOSTRING = tostring',
  'tostring = function(v) if type(v) == "thread" then return "Thread" end return __REAL_TOSTRING(v) end',
  'task = {}',
].join('\n'));

function run(stub, code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(stub)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    const err = e ? to_jsstring(e) : '';
    for (let i = 0; i < 8; i++) { lua.lua_getglobal(L, to_luastring('PUMP')); lua.lua_pushinteger(L, 1); lua.lua_pcall(L, 1, 0, 0); }
    const call0 = (n) => {
        lua.lua_getglobal(L, to_luastring(n));
        if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) return { err: n + ' missing' };
        if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) return { err: to_jsstring(lua.lua_tostring(L, -1)) };
        const t = lua.lua_type(L, -1);
        if (t === lua.LUA_TNUMBER) return { n: lua.lua_tointeger(L, -1) };
        if (t === lua.LUA_TSTRING) return { s: to_jsstring(lua.lua_tostring(L, -1)) };
        return { err: 'type ' + t };
    };
    return { ok: st === lua.LUA_OK, err, errTail: err.split('\n').slice(-2).join(' ').slice(0, 120), count: call0('COUNT').n, visible: call0('VISIBLES').s, spawn: call0('SPAWNERRORS').s || '' };
}
function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
}
const STATE = /VM_STATE_FRAME_OWNER|VM_STATE_FP|VM_STATE_CODE|VM_FRAME_MISSING|LPH_CRASH/;

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

// Each case: a construct the WORKING script has none of.
const CASES = [
  ['control: one spawn, no args, no Connect', `task.spawn(function() local q = UDim.new(1, 0) end)\n`],
  ['task.spawn(fn) with NO argument', `task.spawn(function() local q = UDim.new(1, 0) end)\n`],
  ['task.spawn(fn, ARG) - forwards an argument', `local function work(x) return UDim.new(x, 0) end
task.spawn(work, 7)\n`],
  ['task.spawn(fn, ARG) where ARG is a local', `local payload = 5
local function work(x) return UDim.new(x, 0) end
task.spawn(work, payload)\n`],
  ['task.spawn(fn, ARG) that calls back into a VM closure', `local acc = 0
local function work(x) acc = acc + x return acc end
task.spawn(work, 3)
task.spawn(function() work(4) end)\n`],
  ['a Connect callback that runs host work', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() local q = UDim.new(1, 0) end)
t:Play()
`],
  ['a Connect callback that itself spawns', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() task.spawn(function() UDim.new(1, 0) end) end)
t:Play()
`],
  ['a Connect callback that spawns WITH an arg', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
local function work(x) return UDim.new(x, 0) end
t.Completed:Connect(function() task.spawn(work, 9) end)
t:Play()
`],
  ['several Connect callbacks, then a spawn with arg', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
local function work(x) return UDim.new(x, 0) end
for i = 1, 4 do t.Completed:Connect(function() work(i) end) end
t:Play()
task.spawn(work, 2)
`],
];

console.log('constructs the working script has none of. plain / VM-unique / VM-colliding:\n');
for (const [name, body] of CASES) {
    const code = HEAD + body + TAIL;
    const plain = run(STUB, code);
    const g = generate(code);
    const c = canary(g);
    const u = run(STUB, c + g);
    const k = run(STUB_COLLIDE, c + g);
    const bad = (r) => STATE.test(r.err + ' ' + (r.spawn || ''));
    const label = (r) => bad(r) ? 'STATE-ERR' : r.ok ? (r.spawn ? 'thread-fault' : r.count + 'obj') : 'error';
    console.log('  ' + name.padEnd(48) + label(plain).padEnd(12) + label(u).padEnd(10) + label(k));
}

console.log('\nverdict on each candidate:\n');
{
    // Re-run the two candidates explicitly and assert.
    const check = (name, body) => {
        const code = HEAD + body + TAIL;
        const plain = run(STUB, code);
        if (!plain.ok || plain.spawn) { no(name + ' - the STUB cannot run the plain script (' + (plain.err || plain.spawn).slice(0, 50) + ')'); return; }
        const g = generate(code);
        const c = canary(g);
        const k = run(STUB_COLLIDE, c + g);
        if (STATE.test(k.err + ' ' + (k.spawn || ''))) {
            no(name + ' -> RAISES under a colliding coroutine tostring: ' + ((k.err + ' ' + (k.spawn || '')).match(/(VM_[A-Z_]+|LPH_CRASH)/g) || []).join(','));
        } else if (!k.ok) {
            no(name + ' -> errored: ' + k.errTail);
        } else if (k.count !== plain.count) {
            no(name + ' -> built ' + k.count + ' of ' + plain.count);
        } else {
            ok(name + ' -> clean, and plain Lua agrees (' + k.count + ' objects)');
        }
    };
    check('task.spawn(fn, ARG)', `local function work(x) return UDim.new(x, 0) end
task.spawn(work, 7)\n`);
    check('a Connect callback', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() local q = UDim.new(1, 0) end)
t:Play()
`);
    check('a Connect callback that spawns with an arg', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
local function work(x) return UDim.new(x, 0) end
t.Completed:Connect(function() task.spawn(work, 9) end)
t:Play()
`);
}

console.log('');
console.log(fail ? 'SPAWN ARG / CONNECT   ' + pass + ' passed, ' + fail + ' FAILED' : 'SPAWN ARG / CONNECT   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
