import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';
vmBCSetLuaparse(luaparse);
function build(src){ let b; const vm=applyBytecodeVm(src,{profile:'BALANCED',seedOverride:7001,rethrow:true,onBuild:x=>b=x}); return {vm,b}; }
function run(src){const {vm}=build(src); const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const st=lauxlib.luaL_dostring(L,to_luastring(vm));if(st!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_getglobal(L,to_luastring('RESULT'));return to_jsstring(lua.lua_tostring(L,-1));}
const enabled=`local function f() local a=VM_STACKALLOC(2); a[1]=4; return a[1] end RESULT=f()`;
const disabled=`-- VMATTR(STACKALLOC=false)\nlocal function f() local a=VM_STACKALLOC(2); a[1]=4; return a[1] end RESULT=f()`;
const siblingLeak=`-- VMATTR(VM=OPAL)\nlocal function add(a, b) return a + b end\n-- VMATTR(VM=NONE)\nlocal function trip(x) return x + 7 end\nlocal function outer(x) return add(trip(x), 1) end\nRESULT = tostring(outer(3))`;
const a=build(enabled), d=build(disabled);
const leak=build(siblingLeak);
const has=(b,name)=>Object.prototype.hasOwnProperty.call(b.OPCODES,name) && b.chunks.some(c=>c.code.includes(b.OPCODES[name]));
console.log('[PASS] enabled runtime',run(enabled));
console.log('[PASS] disabled runtime',run(disabled));
console.log('[PASS] enabled emits STACKNEW',has(a.b,'STACKNEW'));
console.log('[PASS] disabled omits STACKNEW',!has(d.b,'STACKNEW'));
console.log('[PASS] sibling attr leak regression',run(siblingLeak)==='11');
console.log('per-function output differs:',a.vm!==d.vm);
if(run(enabled)!=='4'||run(disabled)!=='4'||!has(a.b,'STACKNEW')||has(d.b,'STACKNEW')||a.vm===d.vm||run(siblingLeak)!=='11') process.exitCode=1;
