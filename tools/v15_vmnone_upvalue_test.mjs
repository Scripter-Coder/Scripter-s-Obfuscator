// Executable proof for the VM(NONE) upvalue bridge.
//
// A VM(NONE) body is emitted at loader top level, outside the lexical scope of
// its virtualized parent. Before the bridge, every reference to a captured
// local silently resolved to a same-named global and produced the wrong value.
// The bridge rewrites those references to accessor calls over the live VM cell,
// captured once at closure creation exactly like a real Lua upvalue.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const N = 'LPH_ATTRIBUTES(VM(NONE))';

function execute(artifact) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const p = lua.lua_tostring(L, -1);
  return p ? to_jsstring(p) : String(lua.lua_tonumber(L, -1));
}

let pass = 0;
function check(name, source, expected) {
  const got = execute(applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 9090, rethrow: true }));
  if (got !== expected) throw new Error(`${name}: expected ${expected}, got ${got}`);
  pass++;
  console.log(JSON.stringify({ name, result: got }));
}

// lexical lookup
check('read', `local function outer() local x=41 local function inner() ${N} return x+1 end return inner() end RESULT=outer()`, '42');
check('param-capture', `local function outer(p) local function inner() ${N} return p+1 end return inner() end RESULT=outer(41)`, '42');
check('string-capture', `local function o() local s='hi' local function i() ${N} return s..'!' end return i() end RESULT=o()`, 'hi!');
check('multi-capture', `local function o() local a=1 local b=2 local function i() ${N} return a*10+b end return i() end RESULT=o()`, '12');
check('three-captures', `local function o() local a=1 local b=2 local c=3 local function i() ${N} return a+b+c end return i() end RESULT=o()`, '6');
// mutation
check('write', `local function outer() local x=41 local function inner() ${N} x=x+1 return x end inner() return x end RESULT=outer()`, '42');
check('sibling-sharing', `local function outer() local c=0 local function inc() ${N} c=c+1 end local function get() ${N} return c end inc() inc() return get() end RESULT=outer()`, '2');
check('table-mutation', `local function outer() local t={n=0} local function bump() ${N} t.n=t.n+1 end local function read() ${N} return t.n end bump() bump() bump() return read() end RESULT=outer()`, '3');
// lifetime
check('escaping-closure', `local function mk() local x=7 local function f() ${N} return x end return f end local g=mk() RESULT=g()`, '7');
check('counter-closure', `local function mk() local n=0 return function() ${N} n=n+1 return n end end local f=mk() f() RESULT=f()`, '2');
// recursion
check('recursion', `local function fact(n) ${N} if n<=1 then return 1 end return n*fact(n-1) end RESULT=fact(5)`, '120');
// transitions and unrelated behavior must be untouched
check('vm-calls-none', `local function f(a) ${N} return a*2 end local function g() return f(21) end RESULT=g()`, '42');
check('env-intact', `local function f() ${N} return type(_ENV) end RESULT=f()`, 'table');
check('plain-vm-counter', `local function mk() local n=0 return function() n=n+1 return n end end local f=mk() f() RESULT=f()`, '2');

// ---- structural proof: the native source is actually rewritten -------------
{
  const build = (source) => { let b = null; applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 9090, rethrow: true, onBuild: (x) => { b = x; } }); return b; };
  const withBridge = build(`local function outer() local x=41 local function inner() ${N} return x+1 end return inner() end RESULT=outer()`);
  // Control: a VM(NONE) function with no captured upvalue must be untouched.
  const withoutBridge = build(`G=41 local function f() ${N} return G+1 end RESULT=f()`);
  const bridged = withBridge.nativeFns[0].source;
  const plain = withoutBridge.nativeFns[0].source;
  if (!bridged.includes('__lph_vm_none_up("x")')) throw new Error(`native body was not bridged: ${bridged}`);
  if (plain.includes('__lph_vm_none_up')) throw new Error('control native body was unexpectedly bridged');
  if (!withBridge.upvalBridge || withBridge.upvalBridge.length === 0) throw new Error('no bridge was reported');
  if (withoutBridge.upvalBridge && withoutBridge.upvalBridge.length) throw new Error('control run reported a bridge');
  console.log(JSON.stringify({ name: 'structure', plain: plain.trim(), bridged: bridged.trim(), reported: withBridge.upvalBridge }));
  pass++;
}

// ---- bounded: a VM(NONE) function nested inside another VM(NONE) function --
// The inner body is still emitted at loader top level, so it cannot see the
// outer function's own (non-virtualized) locals. This is reported, not hidden.
{
  let reported = null;
  try {
    const artifact = applyBytecodeVm(`local function outer() ${N} local x=41 local function inner() ${N} return x+1 end return inner() end RESULT=outer()`, { target: 'lua51', profile: 'BALANCED', rethrow: true });
    try { execute(artifact); reported = 'accepted'; } catch (error) { reported = String(error.message || error); }
  } catch (error) {
    reported = String(error.message || error);
  }
  const isError = /nil value|UNBOUND/.test(reported);
  if (!isError) throw new Error(`expected the nested VM(NONE) case to be a bounded failure, got: ${reported}`);
  console.log(JSON.stringify({ name: 'bounded-none-in-none', observed: reported.slice(0, 70) }));
  pass++;
}

console.log(`VM(NONE) upvalue bridge proof: ${pass} checks passed`);
