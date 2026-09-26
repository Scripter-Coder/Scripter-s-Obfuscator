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
console.log('vm len', vm.length);
// Check for host f(unpack) in VM path vs isVM
const hasIsVM = vm.includes('isVM');
const hasHostUnpack = (vm.match(/f\(.*?unpack/g) || []).length;
console.log('has isVM marker:', hasIsVM, 'host f(unpack) occurrences (via variable):', hasHostUnpack);
// Simple run
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
let out='';
lua.lua_pushcfunction(L, (LL)=>{
  const n=lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):'nil'); }
  const line=parts.join('\t');
  console.log('PRINT:', line);
  out+=line;
  return 0;
});
lua.lua_setglobal(L, to_luastring('print'));
const st = lauxlib.luaL_dostring(L, to_luastring(vm));
console.log('st', st);
if(st!==0){
  const e=lua.lua_tostring(L,-1);
  console.log('err', e?to_jsstring(e).slice(0,2000):'null');
} else {
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const r=lua.lua_tostring(L,-1);
  console.log('RESULT', r?to_jsstring(r):'nil');
  console.log('expected 10, got', r?to_jsstring(r):'nil', r && to_jsstring(r)==='10' ? 'PASS' : 'FAIL');
}
