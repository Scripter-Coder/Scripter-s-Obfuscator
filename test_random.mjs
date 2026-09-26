import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
const src='GLOBAL_MARKER="RAN_OK"; local x=0; for i=1,10 do x=x+i end; assert(x==55, "math broken")';
for(let i=0;i<10;i++){
 const vm=applyBytecodeVm(src, { profile: 'BALANCED' });
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(vm));
 const err= st!==lua.LUA_OK? to_jsstring(lua.lua_tostring(L,-1)).slice(0,400):'ok';
 console.log('run',i,'st',st,'err',err);
 if(st!==0) { console.log(vm.slice(0,500)); break; }
}
