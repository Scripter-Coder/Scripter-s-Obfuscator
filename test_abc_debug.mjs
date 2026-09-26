import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

// Patch emit to add debug prints for frame operations
// We'll just run the VM and try to see why RESULT not set

const src = `
local function c()
  return 10
end
local function b()
  return c()
end
local function a()
  return b()
end
RESULT = a()
print("RESULT="..tostring(RESULT))
`;

const vm = applyBytecodeVm(src, {profile:'BALANCED'});
import fs from 'fs';
fs.writeFileSync('test_abc_debug_vm.lua', vm);
console.log('vm written len', vm.length);
// Try to run with print capturing
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
let printOut = '';
lua.lua_pushcfunction(L, (LL)=>{
  const n = lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){
    const s=lua.lua_tostring(LL,i);
    parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i)));
  }
  const line = parts.join('\t');
  console.log('PRINT:', line);
  printOut += line + '\n';
  return 0;
});
lua.lua_setglobal(L, to_luastring('print'));
const st = lauxlib.luaL_dostring(L, to_luastring(vm));
console.log('st', st);
if(st!==0){
  const e = lua.lua_tostring(L,-1);
  console.log('err', e ? to_jsstring(e).slice(0,3000) : 'null');
} else {
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const r = lua.lua_tostring(L,-1);
  console.log('RESULT', r ? to_jsstring(r) : 'nil');
  console.log('printOut', JSON.stringify(printOut));
}
// Check for host call in VM path
// Count occurrences of f(unpack in VM for isVM path vs host
const vmHostCalls = (vm.match(/f\(.*?unpack/g) || []).length;
console.log('host f(unpack) occurrences in vm:', vmHostCalls);
// Check for VM_MARKS
console.log('has isVM', vm.includes('isVM'));
// Try to find FRAMES variable name
const m = vm.match(/local (\w+)=\{\} local (\w+)=0/);
console.log('possible FRAMES/FP vars', m ? m.slice(1) : 'not found');
