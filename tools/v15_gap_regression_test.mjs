import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function execute(source) {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const p = lua.lua_tostring(L, -1);
  return p ? to_jsstring(p) : String(lua.lua_tonumber(L, -1));
}
function generated(source, opts = {}) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 6060, rethrow: true, onBuild: (b) => { build = b; }, ...opts });
  return { result: execute(artifact), build };
}
let pass = 0;
function check(name, source, expected, opts = {}) { const got = generated(source, opts); if (got.result !== expected) throw new Error(`${name}: expected ${expected}, got ${got.result}`); pass++; console.log(JSON.stringify({ name, result: got.result, inline: got.build.inline, unroll: got.build.unroll, stackalloc: got.build.stackalloc })); }
check('inline-bare-side-effect', 'local n=0 local function s() n=n+1 return 10 end local function f(a) return a+s() end f(s()) RESULT=n', '2');
check('inline-extra-argument', 'local n=0 local function s() n=n+1 return 1 end local function f(a) return a end f(1,s()) RESULT=n', '1');
check('inline-member-name', 'local t={a=7} local function f(a) return t.a+a end RESULT=f(3)', '10');
check('inline-reassigned-callee', 'local function f(a) return a end f=function(a) return a+100 end RESULT=f(1)', '101');
check('inline-shadowing', 'local function f(a) return a+1 end do local function f(a) return a+2 end RESULT=f(3) end', '5');
check('inline-direct-vararg-return', 'local function f(...) return ... end local a,b=f(2,3) RESULT=a+b', '5');
check('inline-stack-alias', 'local a=VM_STACKALLOC(2) a[1]=7 local function id(x) return x end local b=id(a) RESULT=b[1]', '7');
check('inline-stack-mutator', 'local a=VM_STACKALLOC(2) local function set(x) x[1]=9 return x end set(a) RESULT=a[1]', '9');
check('unroll-member-name', 'local t={i=10} local s=0 for i=1,2 do s=s+t.i end RESULT=s', '20');
check('unroll-mutation-guard', 'local s=0 for i=1,2 do i=i+1 s=s+1 end RESULT=s', '2', { unroll: true });
check('unroll-nested', 'local s=0 for i=1,2 do for j=1,2 do s=s+i*10+j end end RESULT=s', '66');
check('inline-disabled', 'local function f(a)return a+1 end local s=0 for i=1,2 do s=s+f(i) end RESULT=s', '5', { inline: false });
check('unroll-disabled', 'local s=0 for i=1,3 do s=s+i end RESULT=s', '6', { unroll: false });
check('stack-shadow-fallback', 'local a=VM_STACKALLOC(2) a[1]=7 do local a={9} RESULT=a[1] end RESULT=RESULT..":"..tostring(a[1])', '9:7');
check('stack-rebind-fallback', 'local a=VM_STACKALLOC(2) a[1]=7 a={9} RESULT=a[1]', '9');
let nestedAttributeRejected = false;
try { applyBytecodeVm('local function f() do LPH_ATTRIBUTES(VM(NONE)) end return 1 end RESULT=f()', { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
catch (error) { nestedAttributeRejected = /first statement/.test(String(error)); }
if (!nestedAttributeRejected) throw new Error('nested LPH_ATTRIBUTES was accepted');
pass++; console.log(JSON.stringify({ name: 'attributes-first-only', rejected: true }));
let transformBuild = null;
const transformResult = applyBytecodeVm('local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT)) return 1 end RESULT=f()', { target: 'lua51', profile: 'BALANCED', rethrow: true, onBuild: (b) => { transformBuild = b; } });
if (execute(transformResult) !== '1' || !transformBuild.extract?.[0]?.changed) throw new Error('TRANSFORM(EXTRACT) did not execute a real transformation');
pass++; console.log(JSON.stringify({ name: 'transform-extract-real', result: '1', extract: transformBuild.extract }));
console.log(`V15 focused gap regression: ${pass}/17 passed`);
