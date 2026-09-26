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
let cases=[
  {name:'__call VM', src:`local t=setmetatable({}, {__call=function(_,x) return x*2 end}); RESULT=tostring(t(3))`, expect:'6'},
  {name:'__call native', src:`local t=setmetatable({}, {__call=function(_,x) return x*2 end}); RESULT=tostring(t(3))`, expect:'6'},
  {name:'__index VM', src:`local t=setmetatable({}, {__index=function(_,k) return k.."!" end}); RESULT=t.foo`, expect:'foo!'},
  {name:'__newindex VM', src:`local t=setmetatable({}, {__newindex=function(_,k,v) rawset(_,k,v*2) end}); t.x=3; RESULT=tostring(t.x)`, expect:'6'},
  {name:'__add', src:`local a=setmetatable({x=1}, {__add=function(a,b) return a.x+b.x end}); local b={x=2}; setmetatable(b,getmetatable(a)); RESULT=tostring((a+b))`, expect:'3'},
];
for(let c of cases){
  const vm=applyBytecodeVm(c.src,{profile:'BALANCED', seedOverride:0});
  const res=run(vm);
  console.log(`${res.ok && res.res===c.expect?'PASS':'FAIL'} ${c.name} expect=${c.expect} got=${res.res} ${res.err||''}`);
}
