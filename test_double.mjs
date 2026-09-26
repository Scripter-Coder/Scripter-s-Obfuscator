import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const src = `local function add(x) return x + 10 end; local function double(x) return add(x) * 2 end; RESULT=tostring(double(5))`;
const vm = applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 123});
console.log("vm len", vm.length);
const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st = lauxlib.luaL_dostring(L, to_luastring(vm));
console.log("st", st);
if(st!==0) console.log("err", to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else { lua.lua_getglobal(L, to_luastring('RESULT')); console.log("RESULT", to_jsstring(lua.lua_tostring(L,-1))); }
