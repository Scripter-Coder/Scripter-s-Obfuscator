import luaparse from 'luaparse';
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
import { vmBCSetLuaparse, applyBytecodeVm, _vmBcCompile } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
// patch to compare
// Test unroll separately
let src=`local a=4
local b=6
local c=9
local t={}; for i=1,4 do t[i]=i*i end
local s=0; for _,v in ipairs(t) do s=s+v end
RESULT=tostring(s)
`;
// Try with BALANCED but manual compile bypassing transforms
// We'll temporarily monkey patch applyAstTransforms and walkUnroll
import * as vmBytecode from './vm-bytecode.js';
console.log("original BALANCED");
let vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:0});
console.log("vm length",vm.length, run(vm));
console.log("FAST");
let vmFast=applyBytecodeVm(src,{profile:'FAST',seedOverride:0});
console.log("fast vm", run(vmFast));

// Try to disable unroll by passing profile FAST for unroll part?
// We can directly test compile's walkUnroll effect by checking ast

import { shouldUnroll, unrollLoop } from './src/transform/unroll.js';
console.log("shouldUnroll for i=1,4 FAST", shouldUnroll({type:'ForNumericStatement', start:{type:'NumericLiteral',value:1}, end:{type:'NumericLiteral',value:4}, step:null, variable:{name:'i'}},'FAST'));
console.log("shouldUnroll BALANCED", shouldUnroll({type:'ForNumericStatement', start:{type:'NumericLiteral',value:1}, end:{type:'NumericLiteral',value:4}, step:null, variable:{name:'i'}},'BALANCED'));
console.log("shouldUnroll SECURE", shouldUnroll({type:'ForNumericStatement', start:{type:'NumericLiteral',value:1}, end:{type:'NumericLiteral',value:4}, step:null, variable:{name:'i'}},'SECURE'));
