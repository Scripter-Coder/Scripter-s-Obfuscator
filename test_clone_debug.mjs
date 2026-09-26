import fs from 'fs';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const src = fs.readFileSync('C:/Users/Ryzen 9 5900x/Desktop/Mine Scripts/Clone Kingdom Tycoon/Full Script.txt', 'utf8');
console.log('src len', src.length);
const vm = applyBytecodeVm(src);
if(!vm){ console.log('fallback'); process.exit(0); }
fs.writeFileSync('crash-vm.lua', vm);
console.log('vm len', vm.length, 'chunks line?', (vm.match(/local _b[0-9a-f]+=\{/g)||[]).length);
// try run with fengari but capture line number
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
game.HttpGet = function(self, url) return "return U()" end
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
`;
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
lauxlib.luaL_dostring(L,to_luastring(ENV));
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('status',st);
if(st!==lua.LUA_OK) console.log(to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else console.log('OK');
