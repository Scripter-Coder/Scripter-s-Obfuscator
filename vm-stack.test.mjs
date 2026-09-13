// Regression: VM-only builds against the user's REAL Clone Kingdom Tycoon
// script (the reported crash: "399: attempt to index boolean with number")
import fs from 'fs';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const src = fs.readFileSync('C:/Users/Ryzen 9 5900x/Desktop/Mine Scripts/Clone Kingdom Tycoon/Full Script.txt', 'utf8');

const ENV = `
getgenv = function() return _G end
loadstring = load
unpack = table.unpack
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
game = setmetatable({ PlaceId = 118396261129211, JobId = "job-1" }, {__index=function(t,k) return svc(k) end})
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
UDim2 = { new = function(...) return U() end, fromOffset = function(...) return U() end }
Enum = U()
table.find = function(t, v) for i=1,#t do if t[i]==v then return i end end return nil end
task = { spawn=function(f) end, wait=function() return 0 end, delay=function() end, defer=function() end, cancel=function() end }
os = { time=function() return 1700000000 end, date=function() return {hour=1} end, clock=function() return 0 end }
tick = function() return 0 end
wait = function() return 0 end
warn = function() end
print = function() end
setclipboard = function() end
isfile = function() return false end
readfile = function() return "" end
writefile = function() end
makefolder = function() end
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
        if (!firstFail) { firstFail = err; fs.writeFileSync('crash-vm.lua', vm); }
    }
}
console.log('\nRESULT:', pass + '/' + N, 'passed', fail ? ('- first: ' + firstFail.slice(0, 180)) : '');
process.exit(fail ? 1 : 0);
