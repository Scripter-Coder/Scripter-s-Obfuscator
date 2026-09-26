import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
const src=`local x=0; for i=1,10 do if i%2==0 then x=x+i else x=x+1 end end; RESULT=x`;
function build(cfgRewrite){let b;const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:1234,cfgRewrite,rethrow:true,onBuild:x=>b=x});return{vm,b};}
function run(vm){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const st=lauxlib.luaL_dostring(L,to_luastring(vm));if(st!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_getglobal(L,to_luastring('RESULT'));return to_jsstring(lua.lua_tostring(L,-1));}
const a=build(true), b=build(false); const jmp=a.b.OPCODES.JMP; const count=c=>c.reduce((n,x)=>n+(x===jmp?1:0),0); console.log('[PASS] rewritten runtime',run(a.vm)); console.log('[PASS] baseline runtime',run(b.vm)); console.log('JMP count rewrite/baseline',a.b.chunks.reduce((n,c)=>n+count(c.code),0),b.b.chunks.reduce((n,c)=>n+count(c.code),0)); console.log('output differs',a.vm!==b.vm); if(run(a.vm)!=='35'||run(b.vm)!=='35'||a.vm===b.vm) process.exitCode=1;
