import luaparse from 'luaparse';
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
// Monkey patch compile to skip optimizer
import * as vmBC from './vm-bytecode.js';
let orig = vmBC._vmBcCompile;
console.log("testing with manual compile bypass");
// We will directly call compile and then manually emit without optimizer? Instead patch file temporarily
// For now just test applyBytecodeVm with FAST (no transforms) vs BALANCED
import { applyBytecodeVm } from './vm-bytecode.js';
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
for(let prof of ['FAST','BALANCED','SECURE']){
  for(let seed of [0,1,2]){
    let vm=applyBytecodeVm(src,{profile:prof,seedOverride:seed});
    let native=run(src);
    let prot=run(vm);
    console.log(`${prof} seed ${seed} ${native.res} vs ${prot.ok?prot.res:prot.err.slice(0,100)} match=${native.res===prot.res}`);
  }
}
