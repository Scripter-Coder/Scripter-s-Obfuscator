import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const vm=applyBytecodeVm(src);
  console.log('vm?',!!vm);
  if(!vm) return;
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  console.log('st',st);
  if(st!==0) console.log(to_jsstring(lua.lua_tostring(L,-1)).slice(0,500));
  else { lua.lua_getglobal(L,to_luastring('RESULT')); console.log('RESULT', to_jsstring(lua.lua_tostring(L,-1))); }
}
run(`RESULT=tostring(1)`);
run(`RESULT=tostring(nil)`);
run(`RESULT=tostring(true)`);
run(`RESULT=tostring(false)`);
