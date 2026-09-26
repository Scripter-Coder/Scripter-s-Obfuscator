import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function result(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(L, -1));
}

const cases = [
  { name: 'arithmetic', prefix: 'local a,b,c=2,3,4; ', expression: 'a+b*c' },
  { name: 'nested', prefix: 'local a,b,c=2,3,4; ', expression: '(a+b)*(c-1)' },
  { name: 'unary', prefix: 'local a=2; ', expression: '-a' },
  { name: 'variable', prefix: 'local x=7; ', expression: 'x*2' },
];

for (const profile of ['OPAL', 'ONYX']) {
  for (const seed of [1, 2, 99]) {
    for (const testCase of cases) {
      const prefix = testCase.prefix || '';
      const nativeSource = `${prefix}RESULT=tostring(${testCase.expression})`;
      const rewrittenSource = `${prefix}RESULT=tostring(LPH_REWRITE(${testCase.expression}))`;
      const native = result(nativeSource);
      const artifact = applyBytecodeVm(rewrittenSource, { profile, seedOverride: seed, rethrow: true });
      const generated = result(artifact);
      if (native !== generated || artifact.includes('LPH_REWRITE')) {
        throw new Error(`${profile}/${seed}/${testCase.name}: native=${native} generated=${generated}`);
      }
      console.log(JSON.stringify({ profile, seed, case: testCase.name, native, generated, equal: native === generated }));
    }
  }
}

for (const source of [
  'RESULT=LPH_REWRITE(1,2)',
  'RESULT=LPH_REWRITE({a=1})',
  'RESULT=LPH_REWRITE(function() return 1 end)',
]) {
  let rejected = false;
  try { applyBytecodeVm(source, { profile: 'OPAL', seedOverride: 1, rethrow: true }); } catch (error) { rejected = /LPH_REWRITE/.test(String(error)); }
  if (!rejected) throw new Error(`unsupported or malformed rewrite accepted: ${source}`);
}

let noneRejected = false;
try {
  applyBytecodeVm('-- VMATTR(VM=NONE)\nlocal function f() return LPH_REWRITE(1+2) end\nRESULT=f()', { profile: 'OPAL', seedOverride: 1, rethrow: true });
} catch (error) {
  noneRejected = /VM=NONE/.test(String(error));
}
if (!noneRejected) throw new Error('LPH_REWRITE was accepted inside VM(NONE)');
console.log('LPH_REWRITE differential: 12/12 passed');
