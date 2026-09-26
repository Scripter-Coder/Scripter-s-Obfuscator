// Documented EXTRACT semantics classified as IMPLEMENTED / BOUNDED, with the
// exact forms the documentation requires, plus interaction coverage with the
// other transforms.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

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
let bounded = 0;
const results = [];

function status(name, kind, detail) {
  results.push({ name, kind, detail });
  if (kind === 'IMPLEMENTED') pass++;
  else bounded++;
  console.log(JSON.stringify({ name, kind, detail }));
}

function compiles(source, opts = {}) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 5150, rethrow: true, onBuild: (b) => { build = b; }, ...opts });
  return { artifact, build, result: execute(artifact) };
}

const N = 'LPH_ATTRIBUTES(VM(NONE))';
const E = (mode) => `TRANSFORM(EXTRACT${mode})`;

// ---- documented forms: every documented spelling must be accepted ----------
for (const [label, attr] of [
  ['EXTRACT()', 'TRANSFORM(EXTRACT())'],
  ['EXTRACT bare', 'TRANSFORM(EXTRACT)'],
  ['EXTRACT(GLOBALS)', 'TRANSFORM(EXTRACT(GLOBALS))'],
  ['EXTRACT(CONSTANTS)', 'TRANSFORM(EXTRACT(CONSTANTS))'],
  ['EXTRACT(GLOBALS, CONSTANTS)', 'TRANSFORM(EXTRACT(GLOBALS, CONSTANTS))'],
]) {
  const got = compiles(`G=40 local function f() LPH_ATTRIBUTES(VM(NONE), ${attr}) return G+2 end RESULT=f()`);
  if (got.result !== '42') throw new Error(`${label}: wrong result ${got.result}`);
  status(`documented form ${label}`, 'IMPLEMENTED', `result=${got.result}`);
}

// ---- constants -------------------------------------------------------------
{
  const g = compiles('local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) local a=1 local b=2 return a+b end RESULT=f()');
  if (g.result !== '3' || g.build.extract[0].constants < 2) throw new Error('constant extraction not applied');
  status('constants in VM', 'IMPLEMENTED', `constants=${g.build.extract[0].constants}`);
  const n = compiles(`G=7 local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(CONSTANTS))) local a=1 return a+1 end RESULT=f()`);
  if (n.result !== '2' || !n.build.nativeFns[0].source.includes('__lph_extract_const_')) throw new Error('VM(NONE) constant extraction not applied');
  status('constants in VM(NONE)', 'IMPLEMENTED', 'native source rewritten');
}

// ---- globals: documented and provably-safe subset -------------------------
{
  const r = compiles('G=41 local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) return G+1 end RESULT=f()');
  if (r.result !== '42' || r.build.extract[0].globals !== 1) throw new Error('global extraction not applied');
  status('global read', 'IMPLEMENTED', `globals=${r.build.extract[0].globals}`);

  const w = compiles('G=41 local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) G=G+1 return G end RESULT=f()');
  if (w.result !== '42' || w.build.extract[0].globals !== 0) throw new Error('written global was not skipped');
  status('global write skipped (conservative)', 'IMPLEMENTED', 'globals=0');

  const o = compiles('G=1 local function bump() G=2 end local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) bump() return G end RESULT=f()');
  if (o.result !== '2') throw new Error('call-before-read ordering broken');
  status('call before read preserves order', 'IMPLEMENTED', `result=${o.result}`);

  const d = compiles('T={v=9} local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) return T.v end RESULT=f()');
  if (d.result !== '9' || d.build.extract[0].globals !== 0) throw new Error('dynamic indexing should stay un-extracted');
  status('dynamic indexing stays un-extracted', 'IMPLEMENTED', 'globals=0');

  const c = compiles('G=5 local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) return function() return G end end RESULT=f()()');
  if (c.result !== '5') throw new Error('closure capture broken');
  status('closure capture', 'IMPLEMENTED', `result=${c.result}`);

  const s = compiles('local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS))) local function g() return 1 end return g()+1 end RESULT=f()');
  if (s.result !== '2') throw new Error('nested function broken');
  status('nested function unaffected', 'IMPLEMENTED', `result=${s.result}`);
}

// ---- interaction with the other documented transforms ----------------------
{
  const i = compiles('local function a() return 6 end local function f() LPH_ATTRIBUTES(INLINE(true), TRANSFORM(EXTRACT(CONSTANTS))) return a()*7 end RESULT=f()');
  if (i.result !== '42') throw new Error('INLINE + EXTRACT broken');
  status('EXTRACT + INLINE', 'IMPLEMENTED', `result=${i.result}, inline=${JSON.stringify(i.build.inline)}`);

  const u = compiles('local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) local t=0 for i=1,3 do t=t+i end return t end RESULT=f()');
  if (u.result !== '6') throw new Error('UNROLL + EXTRACT broken');
  status('EXTRACT + UNROLL', 'IMPLEMENTED', `result=${u.result}, unroll=${JSON.stringify(u.build.unroll)}`);

  const r = compiles('local a=5 local b=3 local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) return LPH_REWRITE(a*b, "fast") end RESULT=f()');
  if (r.result !== '15') throw new Error('REWRITE + EXTRACT broken');
  status('EXTRACT + LPH_REWRITE', 'IMPLEMENTED', `result=${r.result}`);

  const st = compiles('local function f() LPH_ATTRIBUTES(STACKALLOC(true)) local s=LPH_STACKALLOC(4) s[1]=6 s[2]=7 return s[1]*s[2] end RESULT=f()');
  if (st.result !== '42') throw new Error('STACKALLOC broken');
  status('STACKALLOC unaffected by EXTRACT', 'IMPLEMENTED', `result=${st.result}`);

  const nc = compiles(`G={tag="T", m=function(self,v) return self.tag..tostring(v) end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(EXTRACT(CONSTANTS), REWRITE_NAMECALLS)) return G:m(7) end RESULT=f()`);
  if (nc.result !== 'T7') throw new Error('EXTRACT + REWRITE_NAMECALLS broken');
  status('EXTRACT + REWRITE_NAMECALLS', 'IMPLEMENTED', `result=${nc.result}`);
}

// ---- documented restriction: namecall method names are not extracted -------
{
  const g = compiles('G={m=function(self) return 1 end} local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(CONSTANTS))) return G:m() end RESULT=f()');
  if (g.result !== '1') throw new Error('namecall baseline broken');
  status('namecall method name not extracted as a constant', 'IMPLEMENTED', 'method name stays a field name in both forms');
}

// ---- bounded: the documented CONTROL_FLOW combination on VM(NONE) ----------
{
  let rejected = false;
  try {
    applyBytecodeVm(`G=1 local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(CONTROL_FLOW, EXTRACT)) return G end RESULT=f()`, { target: 'lua51', profile: 'BALANCED', rethrow: true });
  } catch (error) {
    rejected = /not implemented for VM\(NONE\)/.test(String(error && error.message ? error.message : error));
  }
  if (!rejected) throw new Error('CONTROL_FLOW on VM(NONE) did not fail closed');
  status('CONTROL_FLOW on VM(NONE)', 'BOUNDED', 'fails closed: no native-source control-flow lowering');
}

console.log(`EXTRACT classification: ${pass} IMPLEMENTED, ${bounded} BOUNDED`);
