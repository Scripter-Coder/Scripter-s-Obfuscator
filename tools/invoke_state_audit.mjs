// Find which host call the executor's VM_STATE_FRAME_OWNER comes from.
//
// The user still gets the error after 43cb024, and that commit only quieted ONE of the
// two restore paths. The other is INVOKE, and it is a much better suspect:
//
//     L.push('  if ' + FRAMES + '==st.fr and ' + FP + '>0 then ' + SAVEVM + '(st) end ' + LOADVM + '(st)');
//
// INVOKE runs when coroutine.running() is not the root thread - i.e. whenever VM code
// is re-entered from inside a coroutine that Roblox created (task.spawn, task.defer, a
// signal callback, a Tween Completed handler). It loads a per-coroutine state `st` with
// NO quiet flag, and `st` is keyed by tostring(thr). If two coroutines stringify alike,
// or if the state's saved FP points at a frame a previous unwinding already nil'd, that
// LOADVM trips VM_STATE_FRAME_OWNER on every re-entry - which is exactly the observed
// pattern: repeated, not once, and only in a script full of task.spawn and tweens.
//
// The signal here is that the stub DOES model coroutines (task.spawn -> coroutine.create
// -> resume), so fengari should be able to reach this. If it cannot, the difference
// between the stub and Solara is the thing to find, not the VM.
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
if (!SRC) { console.log('usage: node tools/invoke_state_audit.mjs <script.lua>'); process.exit(2); }
const src = fs.readFileSync(SRC, 'utf8');

let out;
try { out = applyBytecodeVm(src, { profile: 'FAST' }); } catch (e) { console.log('generator threw: ' + e.message); process.exit(1); }
if (!out) { console.log('generator returned nothing'); process.exit(1); }

// Classify every LOADVM call by whether it passes quiet. The counts are the finding:
// an unquieted LOADVM on the coroutine-reentry path is a live spam source.
const loadvmCalls = out.match(/(\w+)\((\w+)\)/g) || [];
const defMatch = out.match(/local (\w+)=function\(st,quiet\)/);
if (!defMatch) { console.log('no quiet-capable LOADVM in this build'); process.exit(1); }
const LV = defMatch[1];

const re = new RegExp(LV + '\\(([^()]*)\\)', 'g');
const calls = [];
let m;
while ((m = re.exec(out)) !== null) calls.push(m[1].trim());
const quiet = calls.filter(a => /,\s*true\s*$/.test(a)).length;
const loud = calls.filter(a => !/,\s*true\s*$/.test(a));

console.log('LOADVM call sites in the generated VM: ' + calls.length);
console.log('  quiet (restore path, check skipped): ' + quiet);
console.log('  loud  (check enforced):              ' + loud.length);
if (loud.length) {
    console.log('\nthe loud sites - each of these can still raise VM_STATE_FRAME_OWNER:');
    const seen = new Set();
    for (const a of loud) {
        if (seen.has(a)) continue;
        seen.add(a);
        console.log('  LOADVM(' + a + ')');
    }
}

// Now try to actually trigger it. Drive re-entry from a coroutine the way Roblox does.
function run(code, extra) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code + '\n' + (extra || '')));
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
    return { ok: st === lua.LUA_OK, err, errTail: err.split('\n').slice(-2).join(' ').slice(0, 140), count: call0('COUNT').n, spawn: call0('SPAWNERRORS').s || '' };
}
function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
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

// Each case re-enters the VM from a coroutine, which is the INVOKE precondition.
const CASES = [
  ['task.spawn with a body', `task.spawn(function() local q = UDim.new(1, 0) end)\n`],
  ['signal callback (Tween Completed)', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() local function a() return UDim.new(1, 0) end a() a() end)
t:Play()
`],
  ['task.defer with a body', `task.defer(function() local q = UDim.new(1, 0) end)\n`],
  ['spawn inside a signal callback', `local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() task.spawn(function() UDim.new(1, 0) end) end)
t:Play()
`],
  ['many spawns in sequence', Array.from({ length: 8 }, (_, i) => `task.spawn(function() UDim.new(${i}, 0) end)\n`).join('')],
  ['spawn that yields then unwinds', `task.spawn(function() task.wait(0.1) local function a() return UDim.new(1, 0) end a() a() end)\n`],
];

console.log('\nre-entry from a coroutine, against the current build:\n');
for (const [name, body] of CASES) {
    const code = HEAD + body + TAIL;
    const base = run(code);
    if (!base.ok || base.spawn) { console.log('  ' + name.padEnd(34) + ' HARNESS-BAD'); continue; }
    const r = run(canary(out) + code);
    const stateErr = /VM_STATE|VM_FRAME_MISSING|VM_CRASH/.test(r.err + ' ' + (r.spawn || ''));
    console.log('  ' + name.padEnd(34) + (stateErr ? 'STATE ERROR: ' + ((r.err + ' ' + (r.spawn || '')).match(/VM_[A-Z_]+/g) || []).join(',') : r.ok && !r.spawn ? (r.count === base.count ? 'ok (' + r.count + ' objects)' : 'ok but ' + r.count + '/' + base.count) : 'error: ' + r.errTail.slice(0, 60)));
}
