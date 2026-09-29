// The VM's frame-owner self-check must report ONCE, not once per re-entry.
//
// The user's executor renders and retains every raised error, and a GUI script re-enters
// the interpreter on every coroutine boundary - thousands of times per run. One signal
// buried in 10,000 identical copies is worse than none, because it reads as noise, and
// the client visibly lags before the script has finished.
//
// This asserts the RATE, which is the property that matters. Asserting that the string is
// present in the artifact would be worthless - it always is.
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
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
}

// Count how many times the interpreter's own error surface reports a state message.
// getglobal + tostring, with NO lua_pcall: lua_pcall in this fengari build fails with
// "attempt to call a string value" for a plain zero-arg call, and every readback that
// used it produced nothing - which once made this file report five silent failures that
// were purely a broken instrument.
function countStateReports(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { err: 'STUB' };
    const wrapped = `
local __hits = 0
local _real_pcall = pcall
pcall = function(f, ...)
  local ok, err = _real_pcall(f, ...)
  if not ok and type(err) == "string" and err:find("VM_STATE_", 1, true) then __hits = __hits + 1 end
  return ok, err
end
` + code + `
REPORTS = __hits
`;
    const st = lauxlib.luaL_dostring(L, to_luastring(wrapped));
    for (let i = 0; i < 8; i++) { lua.lua_getglobal(L, to_luastring('PUMP')); lua.lua_pushinteger(L, 1); lua.lua_pcall(L, 1, 0, 0); }
    lua.lua_getglobal(L, to_luastring('REPORTS'));
    const n = lua.lua_tointeger(L, -1);
    return { ok: st === lua.LUA_OK, reports: n === undefined ? 0 : n };
}

const HEAVY = `
local PlayerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = PlayerGui
for i = 1, 12 do
  local b = Instance.new("TextButton")
  b.Parent = screenGui
  b.MouseButton1Click:Connect(function() task.spawn(function() UDim.new(i, 0) end) end)
  b.MouseEnter:Connect(function() UDim.new(i, 0) end)
end
for i = 1, 12 do
  local t = TweenService:Create(screenGui, TweenInfo.new(0.01), {BackgroundTransparency = 1})
  t.Completed:Connect(function() UDim.new(i, 0) end)
  t:Play()
end
`;

console.log('the self-check must not report once per re-entry:\n');
{
    const g = applyBytecodeVm(HEAVY, { profile: 'FAST' });
    if (!g) { no('the build failed'); }
    else {
        const r = countStateReports(canary(g) + g);
        if (r.reports <= 1) ok('state reports: ' + r.reports + ' (bounded to at most 1)');
        else no('state reports: ' + r.reports + ' - the check still reports on every re-entry');
    }
}

console.log('\nthe once-guard is in the emitted code, and nothing else is:\n');
{
    const src = fs.readFileSync('vm-bytecode.js', 'utf8');
    if (/OWNERREPORTED/.test(src)) ok('the emitter carries a reported-once flag');
    else no('no reported-once flag found in the emitter');
    if (/if not '\s*\+?\s*OWNERREPORTED|if not \+OWNERREPORTED/.test(src)) ok('the frame-owner raise is guarded, so it cannot repeat');
    else no('the frame-owner raise is not guarded by the once-flag');
    // The scheduler's own check is a different site and must stay loud, or genuine
    // corruption would go unreported everywhere.
    if (/if ' \+ CUR \+ '\.owner~=' \+ OWNER \+ ' then error\("VM_STATE_FRAME_OWNER"/.test(src)) {
        ok('the scheduler owner check is still unconditional');
    } else {
        no('the scheduler owner check was also limited - corruption would go unreported');
    }
    // The native-callback pass was reverted: it made the reported GUI's dragging worse,
    // so it must not come back silently.
    if (!/markInlineConnectCallbacks/.test(src)) ok('the native :Connect pass is absent (it broke dragging and was reverted)');
    else no('the native :Connect pass is present - it was reverted because it broke dragging');
}

console.log('');
console.log(fail ? 'ONCE-ONLY REPORT   ' + pass + ' passed, ' + fail + ' FAILED' : 'ONCE-ONLY REPORT   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
