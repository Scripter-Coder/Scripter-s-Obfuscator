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
let src=`local a=4
local b=6
local c=9
local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
// try with seed 0 and different profiles
for(let seed of [0,1,42,123,999]){
  const vm=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: seed});
  const native=run(src);
  const prot=run(vm);
  console.log(`seed ${seed} native ${JSON.stringify(native)} prot ${JSON.stringify(prot)} match=${native.res===prot.res}`);
  if(!prot.ok) console.log(prot.err.slice(0,500));
}
console.log("--- testing with no transforms ---");
for(let i=0;i<5;i++){
  const vm=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 100+i});
  const prot=run(vm);
  console.log(`try ${i} ok=${prot.ok} ${prot.err?prot.err.slice(0,200):prot.res}`);
}
