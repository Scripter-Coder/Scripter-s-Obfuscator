// A LOCAL reproduction of the dragging bug, from the user's minimal demo.
//
// This is the first case in the whole investigation that can be run and MEASURED here.
// The 44KB script was always clean under fengari; this 12-line drag is the smallest
// thing that isolates the construct, and the stub can simulate the input sequence
// directly, so "does dragging work" becomes an assertion instead of a screenshot.
//
// The construct under test is a signal callback that WRITES a captured local:
//
//     local function makeDraggable(guiObject, dragHandle)
//       local dragging = false
//       local dragStart, startPos
//       dragHandle.InputBegan:Connect(function(input)
//         dragging = true
//         dragStart = input.Position      <-- writes an upvalue from inside a callback
//         ...
//       end)
//       dragHandle.InputChanged:Connect(function(input)
//         if dragging then update(input) end   <-- reads it
//       end)
//     end
//
// The two callbacks live in different coroutine contexts and share a captured local.
// That is a genuine VM case, and it is the one every previous repro in this repo missed
// because the stub had no way to drive InputBegan/InputChanged.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const generate = (t) => applyBytecodeVm(t, { profile: 'FAST' });
function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
}

// The user's minimal demo, trimmed to the parts that matter. Kept close to their
// original so a fix here is a fix for the real script.
const DEMO = `
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local LocalPlayer = Players.LocalPlayer
local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "DragDemo"
ScreenGui.Parent = PlayerGui

local Frame = Instance.new("Frame")
Frame.Name = "DraggableFrame"
Frame.Size = UDim2.new(0, 300, 0, 200)
Frame.Position = UDim2.new(0.5, -150, 0.5, -100)
Frame.Active = true
Frame.Parent = ScreenGui

local TitleBar = Instance.new("Frame")
TitleBar.Name = "TitleBar"
TitleBar.Size = UDim2.new(1, 0, 0, 32)
TitleBar.Parent = Frame

local function makeDraggable(guiObject, dragHandle)
    dragHandle = dragHandle or guiObject
    local dragging = false
    local dragStart, startPos

    local function update(input)
        local delta = input.Position - dragStart
        guiObject.Position = UDim2.new(
            startPos.X.Scale, startPos.X.Offset + delta.X,
            startPos.Y.Scale, startPos.Y.Offset + delta.Y)
    end

    dragHandle.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 then
            dragging = true
            dragStart = input.Position
            startPos = guiObject.Position
            input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then
                    dragging = false
                end
            end)
        end
    end)

    dragHandle.InputChanged:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseMovement then
            if dragging then update(input) end
        end
    end)
end

makeDraggable(Frame, TitleBar)
DRAGFRAME = Frame
DRAGTITLE = TitleBar
`;

// Drive the input sequence and report where the frame ended up.
const SIMULATE = `
local function mkInput(kind, x, y)
  local i = { Position = Vector2.new(x, y), UserInputType = kind, UserInputState = "None", Changed = { Conn = {} } }
  i.Changed.Connect = function(self, f) table.insert(self.Conn, f) return {Disconnect=function() end} end
  i.Changed.Fire = function(self) for _, f in ipairs(self.Conn) do pcall(f) end end
  return i
end
local function POSX() return tostring(DRAGFRAME.Position.X.Offset) end
-- button down at (0,0)
local down = mkInput(Enum.UserInputType.MouseButton1, 0, 0)
DRAGTITLE.InputBegan:Fire(down)
-- drag to (40, 25)
local move = mkInput(Enum.UserInputType.MouseMovement, 40, 25)
DRAGTITLE.InputChanged:Fire(move)
DRAGRESULT = POSX()
-- release
down.UserInputState = Enum.UserInputState.End
down.Changed:Fire()
-- move again after release; the frame must NOT follow
local move2 = mkInput(Enum.UserInputType.MouseMovement, 400, 400)
DRAGTITLE.InputChanged:Fire(move2)
DRAGAFTER = POSX()
`;

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB: ' + to_jsstring(lua.lua_tostring(L, -1)) };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    const str = (g) => { lua.lua_getglobal(L, to_luastring(g)); const r = lua.lua_tostring(L, -1); return r ? to_jsstring(r) : ''; };
    return { ok: st === lua.LUA_OK, err: e ? to_jsstring(e) : '', errTail: e ? to_jsstring(e).split('\n')[0].slice(0, 110) : '', moved: str('DRAGRESULT'), after: str('DRAGAFTER'), erro: str('CYCLE_ERRS'), cycle: str('CYCLE_LAST') };
}

console.log('dragging must move the frame, and must stop when the button is released.\n');
console.log('  (the frame starts at X.Offset = -150)\n');

const plain = run(DEMO + '\n' + SIMULATE);
console.log('  plain Lua : moved to ' + plain.moved + ', after release ' + plain.after + (plain.ok ? '' : '  ERR ' + plain.errTail));

const g = generate(DEMO);
if (!g) { no('the generator failed'); }
else {
    const obf = run(canary(g) + g + '\n' + SIMULATE);
    console.log('  obfuscated: moved to ' + obf.moved + ', after release ' + obf.after + (obf.ok ? '' : '  ERR ' + obf.errTail));

    if (!plain.ok) { no('the STUB cannot run the plain demo - the harness is broken, not the code'); }
    else if (plain.moved !== '-110') {
        no('the plain demo did not drag either (expected -110 = -150 + 40), so the measurement is invalid');
    } else {
        if (obf.ok && obf.moved === plain.moved) ok('obfuscated drag matches plain: frame moved to ' + obf.moved);
        else no('obfuscated drag did NOT match: got ' + obf.moved + (obf.errTail ? '  err=' + obf.errTail : ''));

        if (obf.after === plain.after) ok('release stops the drag in both (' + obf.after + ')');
        else no('after release the obfuscated frame moved to ' + obf.after + ' but plain stayed at ' + plain.after);
    }
}

console.log('\nrepeated drags must not degrade or raise:\n');
{
    // The user reported the error repeating on EVERY mouse move while dragging, and
    // never stopping even after release. A single drag may pass while the third fails,
    // because the imbalance only shows once the stack has unwound more than once - which
    // is why the original single-drag check was not enough to catch it.
    const CYCLES = `
local function mkInput(kind, x, y, st)
  local i = { Position = Vector2.new(x, y), UserInputType = kind, UserInputState = st or "None", Changed = { Conn = {} } }
  i.Changed.Connect = function(self, f) table.insert(self.Conn, f) return {Disconnect=function() end} end
  i.Changed.Fire = function(self) for _, f in ipairs(self.Conn) do pcall(f) end end
  return i
end
local errs = 0
local real_pcall = pcall
pcall = function(f, ...)
  local ok, e = real_pcall(f, ...)
  if not ok and type(e) == "string" and (e:find("nil with 'base'", 1, true) or e:find("VM_", 1, true)) then errs = errs + 1 end
  return ok, e
end
local last = DRAGFRAME.Position.X.Offset
for c = 1, 6 do
  local down = mkInput(Enum.UserInputType.MouseButton1, 0, 0)
  DRAGTITLE.InputBegan:Fire(down)
  for m = 1, 4 do
    DRAGTITLE.InputChanged:Fire(mkInput(Enum.UserInputType.MouseMovement, c * 10 + m, m))
  end
  down.UserInputState = Enum.UserInputState.End
  down.Changed:Fire()
  DRAGTITLE.InputChanged:Fire(mkInput(Enum.UserInputType.MouseMovement, 999, 999))
  last = DRAGFRAME.Position.X.Offset
end
CYCLE_ERRS = tostring(errs)
CYCLE_LAST = tostring(last)
`;
    const p2 = run(DEMO + '\n' + CYCLES);
    const g2 = generate(DEMO);
    const o2 = run(canary(g2) + g2 + '\n' + CYCLES);
    console.log('  plain      : errors=' + p2.erro + '  final X=' + p2.cycle);
    if (p2.ok && p2.erro === '0') ok('the plain demo survives 6 drag cycles with no state error');
    else if (p2) no('the plain demo itself raised (' + p2.erro + ') - the harness is not measuring the VM');
    if (o2.ok && o2.erro === '0') ok('the obfuscated build survives 6 drag cycles with no state error');
    else if (o2) no('the obfuscated build raised ' + o2.erro + ' state errors across 6 drag cycles');
    if (p2.cycle && o2.cycle) {
        if (p2.cycle === o2.cycle) ok('both end at the same position after 6 cycles (' + o2.cycle + ')');
        else no('after 6 cycles plain ended at ' + p2.cycle + ' but obfuscated at ' + o2.cycle);
    }
}

console.log('');
console.log(fail ? 'DRAG   ' + pass + ' passed, ' + fail + ' FAILED' : 'DRAG   ' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);
