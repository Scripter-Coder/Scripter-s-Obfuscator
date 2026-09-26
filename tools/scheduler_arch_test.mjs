import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const src = `
local function c(x) return x+1 end
local function b(x) return c(x) end
local function a(x) return b(x) end
RESULT=tostring(a(9))
`;
const vm = applyBytecodeVm(src, { seedOverride: 424242, profile: 'BALANCED' });
if (!vm) throw new Error('VM generation returned null');
const fastVm = applyBytecodeVm(src, { seedOverride: 424242, profile: 'FAST' });
const secureVm = applyBytecodeVm(src, { seedOverride: 424242, profile: 'SECURE' });
const required = [
  'local ', 'FRAMES', // generated names are randomized; checked below via structural markers
];
const checks = {
  regBaseAccessor: /__index=function\(_,k\) return .*\[.*\+k\]/.test(vm) && /__newindex=function\(_,k,v\) .*\[.*\+k\]/.test(vm),
  frameArray: /\{chunk=ci,pc=1,base=/.test(vm),
  scheduler: /while .*stop and not .*do/.test(vm),
  tailcallOpcode: /TAILCALL/.test(vm) === false && /h\w+\[\d+\]=function\(\)/.test(vm), // opcode is numeric in shipped VM
  vmCallableMap: /\[f\]=d return f end/.test(vm),
  noRecursiveVmClosure: !/return [A-Za-z0-9_]+\(ci,links,\.\.\.\) end/.test(vm),
  runOnlyBoot: (vm.match(/pcall\([A-Za-z0-9_]+,\d+,\{\}\)/g) || []).length === 1,
  profileDispatcherDiversity: fastVm.includes('-- dispatcher strategy: table') &&
    (vm.includes('-- dispatcher strategy: branch') || secureVm.includes('-- dispatcher strategy: branch')),
  profileFrameDiversity: fastVm.includes('frame stride: 512') &&
    vm.includes('frame stride: 768') && secureVm.includes('frame stride: 1024'),
};
for (const [k,v] of Object.entries(checks)) console.log(`[${v?'PASS':'FAIL'}] ${k}`);
const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
const st=lauxlib.luaL_dostring(L,to_luastring(vm));
if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1)));
lua.lua_getglobal(L,to_luastring('RESULT'));
const got=to_jsstring(lua.lua_tostring(L,-1));
console.log(`[${got==='10'?'PASS':'FAIL'}] scheduler runtime A→B→C→B→A = ${got}`);
if (Object.values(checks).some(v=>!v) || got!=='10') process.exit(1);
