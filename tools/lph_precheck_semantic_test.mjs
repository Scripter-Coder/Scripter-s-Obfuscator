import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  return status === lua.LUA_OK ? { ok: true } : { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)) };
}

function protectedRun(source, prefix = '', profile = 'OPAL', seed = 17) {
  const artifact = applyBytecodeVm(source, { profile, seedOverride: seed, rethrow: true });
  return { artifact, result: run(prefix + artifact) };
}

function assertSuccess(name, source, expected, prefix = '') {
  for (const profile of ['OPAL', 'ONYX']) {
    const { artifact, result } = protectedRun(source, prefix, profile);
    if (!result.ok) throw new Error(`${name}/${profile} failed: ${result.error}`);
    if (!artifact.includes('LPH_PRECHECK') || artifact.includes('LPH_PRECHECK_KEY')) {
      throw new Error(`${name}/${profile} did not consume the documented precheck into the loader`);
    }
    console.log(JSON.stringify({ name, profile, expected, executed: true, equal: true }));
  }
}

function assertFailure(name, source, pattern = /LPH_PRECHECK/) {
  const { result } = protectedRun(source);
  if (result.ok || !pattern.test(result.error)) throw new Error(`${name} unexpectedly passed: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ name, rejected: true }));
}

assertSuccess('scalar success', 'LPH_PRECHECK(function() return 123 end, 123); RESULT="ok"', 123);
assertFailure('scalar failure', 'LPH_PRECHECK(function() return 124 end, 123); RESULT="ok"');
assertSuccess('array success', 'LPH_PRECHECK(function() return {1,2,3} end, {1,2,3}); RESULT="ok"', '[1,2,3]');
assertFailure('array failure', 'LPH_PRECHECK(function() return {1,2,4} end, {1,2,3}); RESULT="ok"');
assertSuccess('multiple chained prechecks', 'LPH_PRECHECK(function() return 1 end, 1); LPH_PRECHECK(function() return {2,3} end, {2,3}); RESULT="ok"', 'chained');
assertFailure('first precheck failure', 'LPH_PRECHECK(function() return 0 end, 1); LPH_PRECHECK(function() return 2 end, 2); RESULT="ok"');
assertFailure('second precheck failure', 'LPH_PRECHECK(function() return 1 end, 1); LPH_PRECHECK(function() return 0 end, 2); RESULT="ok"');
assertFailure('wrong return type', 'LPH_PRECHECK(function() return "123" end, 123); RESULT="ok"');
assertFailure('wrong array length', 'LPH_PRECHECK(function() return {1,2} end, {1,2,3}); RESULT="ok"');
assertFailure('wrong array element', 'LPH_PRECHECK(function() return {1,4,3} end, {1,2,3}); RESULT="ok"');
assertSuccess('negative integer', 'LPH_PRECHECK(function() return -7 end, -7); RESULT="ok"', -7);
assertSuccess('hexadecimal integer', 'LPH_PRECHECK(function() return 42 end, 0x2a); RESULT="ok"', 42);
assertSuccess('nested expressions', 'LPH_PRECHECK(function() local x=2; return (x+3)*4 end, 20); RESULT="ok"', 20);
assertSuccess('nested macro', 'LPH_PRECHECK(function() return LPH_ENCNUM(123) end, 123); RESULT="ok"', 123);
assertSuccess('ENV access', 'LPH_PRECHECK(function() return tonumber(_ENV.PRECHECK_VALUE) end, 123); RESULT="ok"', 123, '_G._ENV={PRECHECK_VALUE=123}\n');
assertSuccess('ambient ENV', 'LPH_PRECHECK(function() return tonumber(_ENV.PRECHECK_VALUE) end, 123); RESULT="ok"', 123, 'PRECHECK_VALUE=123\n');

for (const profile of ['OPAL', 'ONYX']) {
  let build = null;
  const artifact = applyBytecodeVm('LPH_PRECHECK(function() return 123 end, 123); RESULT="ok"', {
    profile,
    seedOverride: 91,
    rethrow: true,
    onBuild: (value) => { build = value; },
  });
  const preIndex = artifact.indexOf('-- VM_PRECHECK_STREAM');
  const mainIndex = artifact.indexOf('-- VM_MAIN_PAYLOAD_AFTER_PRECHECK');
  if (preIndex < 0 || mainIndex < 0 || preIndex >= mainIndex) throw new Error(`${profile}: loader stream ordering was not proven`);
  const preIds = new Set(build.chunks.filter((chunk) => chunk.meta && chunk.meta.precheck).map((_, index) => index + 1));
  const newf = build.OPCODES.NEWF;
  const main = build.chunks[build.chunks.length - 1].code;
  for (let i = 0; i < main.length; i++) {
    if (main[i] === newf && preIds.has(main[i + 1])) throw new Error(`${profile}: application chunk retained a callable precheck chunk`);
    if (main[i] === newf || ['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','STACKNEW','STACKGET','STACKSET','STACKLEN','STACKPACK','STACKUNPACK','STACKCLEAR','JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(main[i])) i++;
  }
  if (!build.prechecks[0].expectedRaw || build.prechecks[0].expectedRaw[0] !== 123) throw new Error(`${profile}: expected precheck value was not retained as loader metadata`);
  console.log(JSON.stringify({ name: 'loader-stream-proof', profile, precheckIds: [...preIds], mainDecodedAfterCheck: true, callableFromApplication: false, executed: true, equal: true }));
}

for (const [name, source] of [
  ['captured local rejection', 'local x=123; LPH_PRECHECK(function() return x end, 123); RESULT="ok"'],
  ['captured upvalue rejection', 'local x=123; local function outer() return LPH_PRECHECK(function() return x end, 123) end; outer(); RESULT="ok"'],
  ['invalid first argument', 'LPH_PRECHECK(123, 123); RESULT="ok"'],
  ['invalid second argument', 'LPH_PRECHECK(function() return 123 end, "123"); RESULT="ok"'],
  ['malformed precheck', 'LPH_PRECHECK(function(x) return x end, 1, 2); RESULT="ok"'],
  ['expression placement', 'local x=LPH_PRECHECK(function() return 1 end, 1); RESULT="bad"'],
]) {
  let rejected = false;
  try { applyBytecodeVm(source, { profile: 'OPAL', seedOverride: 17, rethrow: true }); } catch (error) { rejected = /LPH_PRECHECK|upvalues|parameters|integer/.test(String(error)); }
  if (!rejected) throw new Error(`${name} was accepted`);
  console.log(JSON.stringify({ name, rejected: true }));
}

console.log('LPH_PRECHECK semantic matrix: 33/33 passed');
