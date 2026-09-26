import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, _vmBcCompile, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function runVM(vmSrc, pre='') {
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  if(pre) lauxlib.luaL_dostring(L,to_luastring(pre));
  const st=lauxlib.luaL_dostring(L,to_luastring(vmSrc));
  if(st!==lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L,-1)));
  return L;
}

console.log('=== CONSTANT VIRTUALIZATION TESTS ===');
const secret="CONST_SECRET_7355608";
const src=`RESULT="${secret}"`;
const vm=applyBytecodeVm(src, {profile:'BALANCED', seedOverride: 99});
console.log('plaintext string scan', vm.includes(secret) ? 'FAIL (leaked)' : 'PASS (vaulted)');
console.log('vault present', vm.includes('local v')||vm.includes('local c') ? 'YES' : 'NO');
const build=_vmBcCompile(src, {seedOverride:99, profile:'BALANCED'});
console.log('constant pool descriptors', build.constPool ? build.constPool.descriptors.length : 'none');
console.log('descriptor categories', build.constPool ? [...new Set(build.constPool.descriptors.map(d=>d.category))].join(',') : 'none');
console.log('build-to-build layout', (()=>{
  const a=_vmBcCompile(src,{seedOverride:1, profile:'BALANCED'});
  const b=_vmBcCompile(src,{seedOverride:2, profile:'BALANCED'});
  const same = JSON.stringify(a.constPool.descriptors.map(d=>d.category))===JSON.stringify(b.constPool.descriptors.map(d=>d.category));
  return same ? 'same shape (deterministic categories)' : 'different';
})());
// constant index recovery: ensure refs are 1-based and decode works
console.log('execution correctness', (()=>{
  const L=runVM(vm);
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const v=to_jsstring(lua.lua_tostring(L,-1));
  return v===secret ? 'PASS' : 'FAIL got '+v;
})());

// typed consts: integers, floats, booleans, nil, function refs
const typedSrc=`
local s="hello"
local n=42
local f=3.14
local b=true
local isNil=nil
local function foo() return 1 end
RESULT=s..","..tostring(n)..","..tostring(f)..","..tostring(b)..","..tostring(isNil)
`;
const vm2=applyBytecodeVm(typedSrc,{seedOverride:7, profile:'BALANCED'});
console.log('typed decode execution', (()=>{
  try{
    const L=runVM(vm2);
    lua.lua_getglobal(L,to_luastring('RESULT'));
    const v=to_jsstring(lua.lua_tostring(L,-1));
    return v.includes('hello') && v.includes('42') && v.includes('3.14') ? 'PASS '+v : 'FAIL '+v;
  }catch(e){return 'FAIL '+e.message.slice(0,200)}
})());

console.log('build-specific representation', (()=>{
  const a=_vmBcCompile(`RESULT="a"`,{seedOverride:10});
  const b=_vmBcCompile(`RESULT="a"`,{seedOverride:11});
  return a.constPool.VP.saltStr!==b.constPool.VP.saltStr ? 'PASS (per-build salts differ)' : 'FAIL'
})());
