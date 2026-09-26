import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(source) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const p = lua.lua_tostring(L, -1);
  return p ? to_jsstring(p) : String(lua.lua_tonumber(L, -1));
}

function compile(source, options = {}) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 7007, rethrow: true, onBuild: (value) => { build = value; }, ...options });
  return { artifact, build };
}

const baseline = compile('local function f() return 40+2 end RESULT=f()');
const transformed = compile('local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) return 40+2 end RESULT=f()');
if (transformed.build.extract?.[0]?.changed !== true || transformed.build.extract[0].constants !== 2) throw new Error('EXTRACT did not report an actual AST transformation');
const baselineLnew = baseline.build.chunks[0].code.filter((x) => x === baseline.build.OPCODES.LNEW).length;
const transformedLnew = transformed.build.chunks[0].code.filter((x) => x === transformed.build.OPCODES.LNEW).length;
if (transformedLnew <= baselineLnew) throw new Error('EXTRACT did not change VM bytecode register structure');
if (run(transformed.artifact) !== '42') throw new Error('VM EXTRACT changed semantics');

const native = compile('local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(GLOBALS, CONSTANTS))) return G+2 end G=40 RESULT=f()');
if (!native.build.nativeFns?.[0]?.source?.includes('__lph_extract_')) throw new Error('VM(NONE) EXTRACT did not rewrite the native function source');
if (native.build.extract?.[0]?.globals !== 1 || native.build.extract[0].constants !== 1) throw new Error('VM(NONE) EXTRACT statistics are incomplete');
if (run(native.artifact) !== '42') throw new Error('VM(NONE) EXTRACT changed semantics');

const inherited = compile('local function outer() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) local function inner() return 7+1 end return inner() end RESULT=outer()');
if (!inherited.build.extract?.length) throw new Error('child function did not inherit EXTRACT metadata');
if (run(inherited.artifact) !== '8') throw new Error('inherited EXTRACT changed semantics');

const dynamicGlobal = compile('G=1 local function bump() G=2 end local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(GLOBALS))) bump() return G end RESULT=f()');
if (run(dynamicGlobal.artifact) !== '2' || dynamicGlobal.build.extract?.[0]?.globals !== 1) throw new Error('EXTRACT changed global evaluation order');
const writtenGlobal = compile('G=1 local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(GLOBALS))) G=5 return G end RESULT=f()');
if (run(writtenGlobal.artifact) !== '5' || writtenGlobal.build.extract?.[0]?.globals !== 0) throw new Error('EXTRACT did not conservatively reject a written global');

for (const source of [
  'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(FOO))) return 1 end RESULT=f()',
  'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS,GLOBALS))) return 1 end RESULT=f()',
  'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT,EXTRACT)) return 1 end RESULT=f()',
  'local function f() LPH_ATTRIBUTES(TRANSFORM()) return 1 end RESULT=f()',
]) {
  let rejected = false;
  try { applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
  catch (error) { rejected = /EXTRACT|TRANSFORM/.test(String(error)); }
  if (!rejected) throw new Error(`invalid EXTRACT usage was accepted: ${source}`);
}
console.log('TRANSFORM(EXTRACT) proof: PASS');
console.log(JSON.stringify({ vmBytecodeLnew: { baseline: baselineLnew, transformed: transformedLnew }, nativeSourceChanged: true, inherited: true, invalidUsageRejected: true }));
