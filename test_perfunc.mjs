import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src = `
-- @VM SECURE
local function secureFunc(a,b)
  return a + b * 2
end
-- @VM FAST
local function fastFunc(a,b)
  return a + b * 2
end
RESULT=tostring(secureFunc(3,4) + fastFunc(3,4))
`;
const vm=applyBytecodeVm(src, {profile:'BALANCED'});
console.log('vm len', vm.length);
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
console.log('st',st);
if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)).slice(0,1000));
else { lua.lua_getglobal(L,to_luastring('RESULT')); console.log('RESULT', to_jsstring(lua.lua_tostring(L,-1))); }
// check per-func map via compile
import { _vmBcCompile } from './vm-bytecode.js';
const build=_vmBcCompile(src, {profile:'BALANCED'});
console.log('chunks', build.chunks.length);
build.chunks.forEach((c,i)=> console.log('chunk',i, 'profile',c.profile, 'code len',c.code.length));
