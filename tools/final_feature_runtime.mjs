import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
function run(src){
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(src));
 if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1)));
 lua.lua_getglobal(L,to_luastring('RESULT'));
 return lua.lua_type(L,-1)===lua.LUA_TSTRING ? to_jsstring(lua.lua_tostring(L,-1)) : String(lua.lua_tonumber(L,-1));
}
function check(name, src, opts={}){
 const native=run(src), vm=run(applyBytecodeVm(src,{profile:'BALANCED',seedOverride:77,...opts}));
 console.log(`[${native===vm?'PASS':'FAIL'}] ${name}: ${native} == ${vm}`);
 return native===vm;
}
let ok=true;
ok &= check('inline', 'local function add(a,b) return a+b end RESULT=add(2,3)', {inline:true});
ok &= check('unroll', 'RESULT=0; for i=1,4 do RESULT=RESULT+i end', {unroll:true});
ok &= check('unroll-nested-call', 'local z=0; for i=1,3 do z=z+i*2 end RESULT=z', {unroll:true});
ok &= check('compatibility', 'local a=2; local b=3; RESULT=a+b', {compatibility:true});
ok &= check('static-env', 'RESULT=tonumber("4")+1', {staticEnv:true});
const normal=applyBytecodeVm('RESULT=debug.getinfo and "ok" or "bad"',{profile:'BALANCED',seedOverride:77,debugProtect:false});
const protectedVm=applyBytecodeVm('local ok=pcall(function() return debug.getinfo(1) end); RESULT=tostring(ok)',{profile:'SECURE',seedOverride:77});
console.log(`[${run(normal)==='ok'?'PASS':'FAIL'}] debug normal`);
console.log(`[${run(protectedVm)==='false'?'PASS':'FAIL'}] debug protected: ${run(protectedVm)}`);
process.exit(ok?0:1);
