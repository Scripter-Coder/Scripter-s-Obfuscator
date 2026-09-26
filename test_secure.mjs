import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src, profile){
  const vm=applyBytecodeVm(src, {profile});
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==0) return to_jsstring(lua.lua_tostring(L,-1)).slice(0,500);
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const v=lua.lua_tostring(L,-1);
  return v?to_jsstring(v):'nil';
}
const src=`local x=5; if x>3 then RESULT="yes" else RESULT="no" end`;
console.log('FAST', run(src,'FAST'));
console.log('BALANCED', run(src,'BALANCED'));
console.log('SECURE', run(src,'SECURE'));
console.log('test loop');
const src2=`local s=0; for i=1,5 do s=s+i end; RESULT=tostring(s)`;
for(let i=0;i<5;i++) console.log('SECURE run',i, run(src2,'SECURE'));
