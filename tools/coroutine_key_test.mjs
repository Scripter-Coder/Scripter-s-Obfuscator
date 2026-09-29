// Test the hypothesis that explains why this only breaks on a real executor.
//
// The VM keys per-coroutine interpreter state on `tostring(thr)`:
//
//     local st = COSTATES[tostring(thr)]
//
// Fengari gives every coroutine a unique address, so that key never collides and the
// map behaves. If a real executor's tostring is NOT unique per coroutine - or returns a
// constant - then EVERY coroutine shares ONE state slot. Coroutine A's saved FP, BASE,
// TOP and frame array get loaded into coroutine B, so B resumes pointing at a frame that
// belongs to A. That is precisely VM_STATE_FRAME_OWNER: FP is in range, the frame
// exists, but it is not the caller's frame - it fails the owner tag.
//
// This has been invisible for four rounds because fengari's tostring is unique. So the
// stub gets a switch: make coroutine tostring collide, and see whether a build that is
// clean under unique keys starts raising the state assertion under colliding keys. If it
// does, the executor difference is the whole story and the map is the bug.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const BASE_STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const generate = (text) => applyBytecodeVm(text, { profile: 'FAST' });

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

// Roblox and some executor coroutine libraries do not produce a unique string per
// thread. model the two plausible variants.
const STUB_COLLIDE = BASE_STUB.replace(
  /task = \{\}/,
  [
'-- executor variant: tostring(coroutine) is NOT unique per thread',
'__REAL_TOSTRING = tostring',
'tostring = function(v)',
'  if type(v) == "thread" then return "Thread" end',
'  return __REAL_TOSTRING(v)',
'end',
'task = {}',
  ].join('\n')
);

function runWith(stub, code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(stub)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
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
    return { ok: st === lua.LUA_OK, err, count: call0('COUNT').n, visible: call0('VISIBLES').s, spawn: call0('SPAWNERRORS').s || '' };
}
function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
}

const SRC = `local PlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = PlayerGui
task.spawn(function() local q = UDim.new(1, 0) end)
task.spawn(function() local q = UDim2.new(1, 0, 1, 0) end)
local t = TweenService:Create(screenGui, TweenInfo.new(0.2), {BackgroundTransparency = 1})
t.Completed:Connect(function() local function a() return UDim.new(1, 0) end a() a() end)
t:Play()
local m1 = Instance.new("Frame")
m1.Visible = true
m1.Parent = screenGui
local m2 = Instance.new("Frame")
m2.Visible = true
m2.Parent = screenGui
`;

const gen = generate(SRC);
const c = canary(gen);
const stateRe = /VM_STATE_FRAME_OWNER|VM_STATE_FP|VM_STATE_CODE|VM_FRAME_MISSING/;

console.log('the VM keys per-coroutine state on tostring(thread). Does that key collide?\n');

const plain = runWith(BASE_STUB, SRC);
if (!plain.ok || plain.count < 2) { no('the stub cannot run the plain script - harness is broken'); process.exit(1); }
ok('plain Lua under the stub: ' + plain.count + ' objects');

const unique = runWith(BASE_STUB, c + gen);
const uniqueBad = stateRe.test(unique.err + ' ' + (unique.spawn || ''));
// This block is the REGRESSION PROOF, so it is written to fail when the bug is present
// and pass when it is fixed. Against the pre-fix emitter the colliding run raised
// VM_STATE_FRAME_OWNER while the unique-key run was clean - that asymmetry is the
// signature of a string-keyed state map, and it is what the fix removes.
console.log('  VM, unique tostring:    ' + (uniqueBad ? 'STATE ERROR' : 'ok, ' + unique.count + ' objects'));

const collide = runWith(STUB_COLLIDE, c + gen);
const collideBad = stateRe.test(collide.err + ' ' + (collide.spawn || ''));
const collidePlain = runWith(STUB_COLLIDE, SRC);
console.log('  VM, colliding tostring: ' + (collideBad ? 'STATE ERROR -> ' + ((collide.err + ' ' + (collide.spawn || '')).match(/VM_[A-Z_]+/g) || []).join(',') : 'ok, ' + collide.count + ' objects'));
console.log('  plain Lua, colliding tostring: ' + (collidePlain.ok ? 'ok, ' + collidePlain.count + ' objects' : 'ERROR'));

if (collideBad) {
    no('a colliding tostring STILL raises the state assertion - the state map is still shared between coroutines');
} else {
    // This assertion is written to pass when the fix is in place, so the colliding
    // key no longer reproduces. Against the pre-fix emitter it DID reproduce
    // VM_STATE_FRAME_OWNER, which is what identified the mechanism - see the header.
    ok('a colliding coroutine tostring no longer corrupts state - the key is the thread, not its string');
}
if (collidePlain.ok && collidePlain.count === plain.count) ok('plain Lua is unaffected by the colliding stub, so the measurement is sound');
else no('plain Lua also failed under the colliding stub, so the stub itself is at fault');

console.log('\nthe state map must be keyed by the THREAD, not by its string:\n');
{
    const src = fs.readFileSync('vm-bytecode.js', 'utf8');
    // The dangerous form is COSTATES keyed directly on tostring(thr). Keying the thread
    // object is correct; tostring may survive only as a non-thread fallback.
    const direct = src.includes("COSTATES + '[tostring(thr)]'") || /COSTATES\[tostring\(thr\)\]/.test(src);
    if (direct) {
        no('per-coroutine state is still keyed directly on tostring(thread) - two coroutines that stringify alike share one state slot');
    } else {
        ok('per-coroutine state is keyed on the thread object, not its tostring');
    }
    if (/local _key=thr/.test(src) && /COSTATES \+ '\[_key\]'/.test(src)) {
        ok('the emitted VM uses the thread object as the COSTATES key');
    } else {
        no('could not confirm the emitted VM keys on the thread object');
    }
}

console.log('');
console.log(fail ? 'COROUTINE KEY   ' + pass + ' passed, ' + fail + ' FAILED' : 'COROUTINE KEY   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
