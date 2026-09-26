import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
function run(src, opts={}) { const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:31337,staticEnv:true,hardCodeGlobals:true,rethrow:true,...opts}); const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L); const st=lauxlib.luaL_dostring(L,to_luastring(vm)); if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1))); lua.lua_getglobal(L,to_luastring('RESULT')); return to_jsstring(lua.lua_tostring(L,-1)); }
const cases=[
 ['builtin-read','RESULT=tostring(12)', '12'],
 ['shadowed-builtin','local tostring=function(x) return "local" end; RESULT=tostring(12)', 'local'],
 ['reassigned-builtin','tostring=function(x) return "changed" end; RESULT=tostring(12)', 'changed'],
 ['nested-global','local function f(x) return tostring(x) end; RESULT=f(9)', '9'],
 ['math-global','RESULT=tostring(math.floor(4.9))','4'],
];
let pass=0;
for(const [name,src,exp] of cases){ try{const r=run(src); if(r!==exp) throw Error(`got ${r}, expected ${exp}`); console.log('[PASS]',name,r); pass++;}catch(e){console.log('[FAIL]',name,String(e.message||e).slice(0,220));}}
const vm=applyBytecodeVm('RESULT=tostring(7)',{profile:'BALANCED',seedOverride:31337,staticEnv:true,hardCodeGlobals:true,rethrow:true});
console.log('HGLOB active:', vm.includes('HGLOB') ? 'source marker present' : 'runtime opcode emitted');
if(pass!==cases.length) process.exitCode=1;
