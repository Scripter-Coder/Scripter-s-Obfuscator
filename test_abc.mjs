import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
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
RESULT = tostring(a())
print(RESULT)
`;
const vm = applyBytecodeVm(src, {profile:'BALANCED'});
// Write vm to file for inspection
import fs from 'fs';
fs.writeFileSync('test_abc_vm.lua', vm);
console.log('vm len', vm.length);
console.log(vm.slice(0, 2000));
// Run
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
lua.lua_pushcfunction(L, (LL)=>{
  const n = lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){
    const s=lua.lua_tostring(LL,i);
    parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i)));
  }
  console.log('PRINT:', parts.join('\t'));
  return 0;
});
lua.lua_setglobal(L, to_luastring('print'));
const st = lauxlib.luaL_dostring(L, to_luastring(vm));
console.log('st', st);
if(st!==0) {
  const e = lua.lua_tostring(L,-1);
  console.log('err', e ? to_jsstring(e).slice(0,2000) : 'null');
} else {
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const r = lua.lua_tostring(L,-1);
  console.log('RESULT', r ? to_jsstring(r) : 'nil (RESULT not set)');
  // also check print was called
  lua.lua_getglobal(L, to_luastring('_G'));
  console.log('has RESULT global?', r ? 'yes' : 'no');
}
// Check for f(unpack) in VM path
const hasHostCall = vm.includes('f(') && vm.includes('unpack');
console.log('has f(unpack) in vm (should be only for host, not VM path):', hasHostCall);
const hasVMM = vm.includes('isVM');
console.log('has isVM marker:', hasVMM);
// Check for FRAMES
console.log('has FRAMES:', vm.includes('FRAMES') || vm.includes('FP'));
