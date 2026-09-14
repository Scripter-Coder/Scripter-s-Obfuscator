// Focused: VM-only builds (the crash surface) x N attempts, realistic env.
import fs from 'fs';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const src = fs.readFileSync('C:/Users/Ryzen 9 5900x/Desktop/Mine Scripts/Plants VS Brainrots/Full Script.txt', 'utf8');

const ENV = `
getgenv = function() return _G end
loadstring = load
local U
U = function()
  return setmetatable({}, {
    __index = function(t,k)
      if k == "Name" or k == "Text" or k == "UserId" then return "mock" end
      rawset(t, k, U())
      return rawget(t, k)
    end,
    __call = function(self, ...) return U() end,
    __tostring = function(s) return "mock" end,
    __concat = function(a,b) return tostring(a)..tostring(b) end,
  })
end
local function svc(name) return U() end
game = setmetatable({ PlaceId = 127742093697776, JobId = "job-1" }, {__index=function(t,k) return svc(k) end})
game.HttpGet = function(self, url)
  return [[
  local U2
  U2 = function()
    return setmetatable({}, {
      __index = function(t,k)
        if k == "Name" or k == "Text" or k == "UserId" then return "mock" end
        rawset(t, k, U2())
        return rawget(t, k)
      end,
      __call = function(self, ...) return U2() end,
      __tostring = function(s) return "mock" end,
      __concat = function(a,b) return tostring(a)..tostring(b) end,
    })
  end
  return U2()
  ]]
end
workspace = U()
Instance = { new = function(cls) return U() end }
Vector2 = { new = function() return U() end }
Vector3 = { new = function() return U() end }
CFrame = { new = function(...) return U() end }
Color3 = { fromRGB = function(...) return U() end }
UDim = { new = function(...) return U() end }
UDim2 = { new = function(...) return U() end }
Enum = U()
task = { spawn=function(f) end, wait=function() return 0 end, delay=function() end, defer=function() end }
os = { time=function() return 1700000000 end, date=function() return {hour=1} end, clock=function() return 0 end }
tick = function() return 0 end
wait = function() return 0 end
warn = function() end
print = function() end
setclipboard = function() end
fireproximityprompt = function() end
`;

let pass = 0, fail = 0, firstFail = null;
const N = 10;
for (let attempt = 1; attempt <= N; attempt++) {
    const vm = applyBytecodeVm(src);
    if (vm === null) { console.log('attempt', attempt, 'FELL BACK (ok - not a crash)'); pass++; continue; }
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(ENV));
    const st = lauxlib.luaL_dostring(L, to_luastring(vm));
    if (st === lua.LUA_OK) { pass++; console.log('attempt', attempt, 'OK'); }
    else {
        fail++;
        const err = to_jsstring(lua.lua_tostring(L, -1));
        console.log('attempt', attempt, 'CRASH:', err.slice(0, 140));
        if (!firstFail) { firstFail = err; require('fs').writeFileSync('crash-vm.lua', vm); }
    }
}
console.log('\nVM-ONLY RESULT:', pass + '/' + N, 'passed', fail ? ('- first: ' + firstFail.slice(0, 180)) : '');
