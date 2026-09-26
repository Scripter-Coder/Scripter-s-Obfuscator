import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
let src=`local t=setmetatable({x=1}, {__index={y=2}})
RESULT=tostring(t.y)
`;
console.log("meta index table", run(applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0})));
console.log("native", run(src));

let src2=`local t=setmetatable({}, {__index=function(_,k) return k.."!" end})
RESULT=t.foo
`;
console.log("meta index func", run(applyBytecodeVm(src2,{profile:'BALANCED', seedOverride:0})));
console.log("native2", run(src2));
