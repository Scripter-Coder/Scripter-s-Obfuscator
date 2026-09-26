import assert from 'node:assert/strict';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(source, options) {
  const artifact = applyBytecodeVm(source, { ...options, rethrow: true });
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const status = lauxlib.luaL_dostring(state, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(state, -1)));
  lua.lua_getglobal(state, to_luastring('RESULT'));
  return to_jsstring(lua.lua_tostring(state, -1));
}

// Regression: expression inlining must not discard tail multi-return values
// in table constructors.
assert.equal(run(
  'local function f() return 3,5,8 end local t={f()} local u={f(),f()} RESULT=tostring(#t)..":"..tostring(#u)',
  { target: 'lua51', profile: 'BALANCED', seedOverride: 24680 },
), '3:4');

// Regression: AST arithmetic rewriting must preserve metamethod operand order.
assert.equal(run(
  'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}) RESULT=tostring(t+6)',
  { target: 'lua51', profile: 'BALANCED', seedOverride: 24680 },
), '10');

// Regression: the VM environment must expose Lua 5.2+ _ENV behavior.
assert.equal(run(
  'RESULT=type(_ENV)..":"..type(_G)',
  { target: 'lua53', profile: 'BALANCED', seedOverride: 24680 },
), 'table:table');

// Regression: nested VM(NONE) -> VM(OPAL/ONYX) calls must retain the bridge
// and restore the outer scheduler state.
assert.equal(run(
  '-- VMATTR(VM=NONE)\nlocal function n1(x) return x+1 end\n-- VMATTR(VM=OPAL)\nlocal function o1(x) return n1(x)*2 end\n-- VMATTR(VM=NONE)\nlocal function n2(x) return o1(x)+3 end\n-- VMATTR(VM=ONYX)\nlocal function y1(x) return n2(x)*4 end\nRESULT=tostring(y1(2))',
  { target: 'lua51', profile: 'ONYX', seedOverride: 13579 },
), '36');

// Regression: compile-time attributes must not remain as runtime calls.
assert.equal(run(
  'local function f() LPH_ATTRIBUTES(VM(NONE)) return 3 end RESULT=tostring(f())',
  { target: 'lua51', profile: 'BALANCED', seedOverride: 24680 },
), '3');

// Regression: the supplied Luau runtime does not accept goto.
assert.throws(
  () => applyBytecodeVm('for i=1,3 do goto L end ::L:: RESULT=1', {
    target: 'luau', profile: 'BALANCED', seedOverride: 24680, rethrow: true,
  }),
  /goto is not supported by the Luau target/,
);

assert.equal(run(
  'local x=5 local y=3 RESULT=tostring(LPH_REWRITE(x&y))',
  { target: 'luau', profile: 'BALANCED', seedOverride: 24680 },
), '1');

console.log('V15 verification regression tests: PASS');
