import luaparse from 'luaparse'; import fengari from 'fengari'; import fs from 'fs';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js'; vmBCSetLuaparse(luaparse);
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
const src=`local function add(a,b) return a.v+b.v end local mt={__add=add} local co=coroutine.create(function() local a=setmetatable({v=2},mt) local b=setmetatable({v=3},mt) local x=a+b return x end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)`;
let vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:424242,rethrow:true});
let m=vm.match(/local (\w+)=\{\} local (\w+)=\{\} local (\w+)=0 local (\w+)=0 local (\w+)=0 local (\w+)/); console.log(m?.slice(1));
// inject just before scheduler SP validation using exact emitted text shape
vm=vm.replace(/(   local (\w+)=\1\[(\w+)\]\[(\w+)\] (\w+)=\4\.pc\+1\n   if )/, '$1');
vm=vm.replace(/(   if [^\n]+ then error\("VM_STATE_SP",0\) end)/, (all)=>{ const [REG,FR,FP,BA,TO]=m.slice(1,6); const spGuess=(vm.match(/local (\w+)=0 local \w+=0 local \w+=0 local \w+=0/)||[])[1]; return `   print("DBGSP",${FP},${BA},${TO},${spGuess})\n${all}`; });
fs.writeFileSync('/tmp/repro_vm.lua',vm);
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L); const st=lauxlib.luaL_dostring(L,to_luastring(vm)); console.log('status',st); if(st!==lua.LUA_OK) console.log(to_jsstring(lua.lua_tostring(L,-1))); else {lua.lua_getglobal(L,to_luastring('RESULT')); console.log('RESULT',to_jsstring(lua.lua_tostring(L,-1)));}
