// Deterministic attribute interaction matrix.
//
// Proves that LPH_ATTRIBUTES metadata is actually CONSUMED by the compiler and
// not merely accepted: each cell asserts both the observable result and the
// concrete build-level evidence that the named transform/attribute ran.
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

function build(source, opts = {}) {
  let b = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 2468, rethrow: true, onBuild: (x) => { b = x; }, ...opts });
  return { artifact, build: b, result: execute(artifact) };
}

let cells = 0;
let valid = 0;
let rejected = 0;
const matrix = [];

function record(vm, feature, outcome, evidence) {
  cells++;
  if (outcome === 'APPLIED') valid++; else rejected++;
  matrix.push({ vm, feature, outcome, evidence });
  console.log(JSON.stringify({ vm, feature, outcome, evidence }));
}

// Which functions are actually VM(NONE)?
const nativeNames = (b) => new Set((b.nativeFns || []).map((f) => f.name));

// ============================ VALID MATRIX =================================
// Each row proves a distinct VM mode and that the feature was consumed.

for (const [vm, attr, profile] of [
  ['OPAL', 'VM(OPAL)', 'BALANCED'],
  ['ONYX', 'VM(ONYX)', 'SECURE'],
  ['NONE', 'VM(NONE)', 'BALANCED'],
]) {
  // PRESET
  {
    const g = build(`G=41 local function f() LPH_ATTRIBUTES(${attr}, PRESET(FAST)) return G+1 end RESULT=f()`, { profile });
    const usedNative = vm === 'NONE';
    const ok = g.result === '42' && (usedNative ? nativeNames(g.build).has('f') : !nativeNames(g.build).has('f'));
    if (!ok) throw new Error(`${vm} PRESET: result=${g.result} native=${[...nativeNames(g.build)]}`);
    record(vm, 'PRESET', 'APPLIED', `result=42 preset=${g.build.profileName}`);
  }
  // TRANSFORM(EXTRACT)
  {
    const g = build(`G=41 local function f() LPH_ATTRIBUTES(${attr}, TRANSFORM(EXTRACT(CONSTANTS))) local z=0 return G+1+z end RESULT=f()`, { profile });
    const ex = g.build.extract || [];
    if (vm === 'NONE') {
      if (!nativeNames(g.build).has('f')) throw new Error(`${vm} EXTRACT: function was not native`);
      if (!g.build.nativeFns[0].source.includes('__lph_extract_const_')) throw new Error(`${vm} EXTRACT: native source not rewritten`);
      record(vm, 'TRANSFORM(EXTRACT)', 'APPLIED', 'native source rewritten');
    } else {
      if (!ex.length || ex[0].changed !== true) throw new Error(`${vm} EXTRACT: no extract stats`);
      record(vm, 'TRANSFORM(EXTRACT)', 'APPLIED', `constants=${ex[0].constants}`);
    }
  }
  // TRANSFORM(REWRITE_NAMECALLS)
  {
    const g = build(`G={tag="T", m=function(self,v) return self.tag..tostring(v) end} local function f() LPH_ATTRIBUTES(${attr}, TRANSFORM(REWRITE_NAMECALLS)) return G:m(7) end RESULT=f()`, { profile });
    const nc = g.build.namecall || [];
    if (g.result !== 'T7') throw new Error(`${vm} NAMECALL: result=${g.result}`);
    if (vm === 'NONE') {
      if (!g.build.nativeFns[0].source.includes('.m(G,7)')) throw new Error(`${vm} NAMECALL: native not rewritten`);
      record(vm, 'TRANSFORM(REWRITE_NAMECALLS)', 'APPLIED', 'native source rewritten');
    } else {
      if (!nc.length || nc[0].count < 1) throw new Error(`${vm} NAMECALL: no rewrite reported`);
      record(vm, 'TRANSFORM(REWRITE_NAMECALLS)', 'APPLIED', `count=${nc[0].count}`);
    }
  }
  // ERROR_HANDLING (documented default true; false omits the line map)
  if (vm === 'NONE') {
    let rejectedOk = false;
    try { applyBytecodeVm(`local function f() LPH_ATTRIBUTES(VM(NONE), ERROR_HANDLING(false)) return 1 end RESULT=f()`, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
    catch (error) { rejectedOk = /cannot be used on nonvirtualized/.test(String(error && error.message ? error.message : error)); }
    if (!rejectedOk) throw new Error(`${vm} ERROR_HANDLING: expected documented VM(NONE) rejection`);
    record(vm, 'ERROR_HANDLING', 'REJECTED', 'documented: not allowed on VM(NONE)');
  } else {
    const g = build(`local function f() LPH_ATTRIBUTES(${attr}, ERROR_HANDLING(true)) return 1 end RESULT=f()`, { profile });
    if (g.result !== '1') throw new Error(`${vm} ERROR_HANDLING: result=${g.result}`);
    const withMap = g.build.chunks.filter((c) => c.meta && c.meta.errorHandlingLineMap === true).length;
    if (!withMap) throw new Error(`${vm} ERROR_HANDLING(true): no chunk emitted a line map`);
    const g2 = build(`local function f() LPH_ATTRIBUTES(${attr}, ERROR_HANDLING(false)) return 1 end RESULT=f()`, { profile });
    const off = g2.build.chunks.filter((c) => c.meta && c.meta.errorHandlingLineMap === false).length;
    if (!off) throw new Error(`${vm} ERROR_HANDLING(false): no chunk omitted the line map`);
    record(vm, 'ERROR_HANDLING', 'APPLIED', `trueEmitsMap=${withMap} falseEmitsMap=${off}`);
  }
  // INLINE
  {
    const g = build(`local function a() return 6 end local function f() LPH_ATTRIBUTES(${attr}, INLINE(true)) return a()*7 end RESULT=f()`, { profile });
    if (g.result !== '42') throw new Error(`${vm} INLINE: result=${g.result}`);
    const inlined = (g.build.inline && g.build.inline.inlined) || 0;
    if (inlined < 1) throw new Error(`${vm} INLINE: no inline reported`);
    record(vm, 'INLINE', 'APPLIED', `inlined=${inlined}`);
  }
  // UNROLL
  {
    const g = build(`local function f() LPH_ATTRIBUTES(${attr}) local t=0 for i=1,3 do t=t+i end return t end RESULT=f()`, { profile });
    if (g.result !== '6') throw new Error(`${vm} UNROLL: result=${g.result}`);
    const unrolled = (g.build.unroll && g.build.unroll.unrolled) || 0;
    if (unrolled < 1) throw new Error(`${vm} UNROLL: no unroll reported`);
    record(vm, 'UNROLL', 'APPLIED', `unrolled=${unrolled}`);
  }
  // STACKALLOC
  if (vm === 'NONE') {
    // LPH_STACKALLOC is a VM macro and is correctly rejected inside VM(NONE).
    let rejectedOk = false;
    try { applyBytecodeVm(`local function f() LPH_ATTRIBUTES(VM(NONE), STACKALLOC(true)) local s=LPH_STACKALLOC(4) s[1]=6 s[2]=7 return s[1]*s[2] end RESULT=f()`, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
    catch (error) { rejectedOk = /not valid inside VM=NONE/.test(String(error && error.message ? error.message : error)); }
    if (!rejectedOk) throw new Error(`${vm} STACKALLOC: expected VM(NONE) rejection`);
    record(vm, 'STACKALLOC', 'REJECTED', 'VM macro rejected inside VM(NONE)');
  } else {
    const g = build(`local function f() LPH_ATTRIBUTES(${attr}, STACKALLOC(true)) local s=LPH_STACKALLOC(4) s[1]=6 s[2]=7 return s[1]*s[2] end RESULT=f()`, { profile });
    if (g.result !== '42') throw new Error(`${vm} STACKALLOC: result=${g.result}`);
    const sa = g.build.stackalloc || {};
    if (!(sa.true > 0 || sa.fallback > 0)) throw new Error(`${vm} STACKALLOC: no stackalloc stats`);
    record(vm, 'STACKALLOC', 'APPLIED', `native=${sa.true} fallback=${sa.fallback}`);
  }
  // LPH_REWRITE
  if (vm === 'NONE') {
    let rejectedOk = false;
    try { applyBytecodeVm(`local a=5 local b=3 local function f() LPH_ATTRIBUTES(VM(NONE)) return LPH_REWRITE(a*b, "fast") end RESULT=f()`, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
    catch (error) { rejectedOk = /not valid inside VM=NONE/.test(String(error && error.message ? error.message : error)); }
    if (!rejectedOk) throw new Error(`${vm} REWRITE: expected VM(NONE) rejection`);
    record(vm, 'LPH_REWRITE', 'REJECTED', 'VM macro rejected inside VM(NONE)');
  } else {
    const g = build(`local a=5 local b=3 local function f() LPH_ATTRIBUTES(${attr}) return LPH_REWRITE(a*b, "fast") end RESULT=f()`, { profile });
    if (g.result !== '15') throw new Error(`${vm} REWRITE: result=${g.result}`);
    const rw = g.build.rewrite || [];
    if (!rw.length) throw new Error(`${vm} REWRITE: no rewrite stats`);
    record(vm, 'LPH_REWRITE', 'APPLIED', `rewrites=${rw.length}`);
  }
}

// ============================ INVALID MATRIX ===============================
// Each of these must be rejected; acceptance would mean metadata is unchecked.
const INVALID = [
  ['OPAL', 'unknown transform', 'local function f() LPH_ATTRIBUTES(TRANSFORM(NOPE)) return 1 end RESULT=f()', /invalid LPH_ATTRIBUTES transform/],
  ['OPAL', 'EXTRACT bad option', 'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(NOPE))) return 1 end RESULT=f()', /EXTRACT accepts only/],
  ['OPAL', 'EXTRACT duplicate option', 'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT(GLOBALS,GLOBALS))) return 1 end RESULT=f()', /unique/],
  ['OPAL', 'duplicate transform', 'local function f() LPH_ATTRIBUTES(TRANSFORM(EXTRACT,EXTRACT)) return 1 end RESULT=f()', /unique/],
  ['OPAL', 'empty TRANSFORM', 'local function f() LPH_ATTRIBUTES(TRANSFORM()) return 1 end RESULT=f()', /at least one transform/],
  ['OPAL', 'bad VM value', 'local function f() LPH_ATTRIBUTES(VM(FAST)) return 1 end RESULT=f()', /invalid LPH_ATTRIBUTES value/],
  ['ONYX', 'bad PRESET', 'local function f() LPH_ATTRIBUTES(VM(ONYX), PRESET(TURBO)) return 1 end RESULT=f()', /invalid LPH_ATTRIBUTES value/],
  ['NONE', 'ERROR_HANDLING on VM(NONE)', 'local function f() LPH_ATTRIBUTES(VM(NONE), ERROR_HANDLING(true)) return 1 end RESULT=f()', /ERROR_HANDLING cannot be used on nonvirtualized/],
  ['NONE', 'ERROR_HANDLING non-boolean', 'local function f() LPH_ATTRIBUTES(ERROR_HANDLING(1)) return 1 end RESULT=f()', /invalid LPH_ATTRIBUTES value for ERROR_HANDLING/],
  // CONTROL_FLOW rewrites the VM instruction stream (ctx.code). A VM(NONE) body
  // is emitted as loader-level native source and never becomes a chunk, so the
  // transform is structurally inapplicable rather than merely unimplemented.
  // It must still fail closed: silently ignoring it would tell the caller their
  // control flow was flattened when it was not.
  ['NONE', 'CONTROL_FLOW on VM(NONE)', 'local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(CONTROL_FLOW)) return 1 end RESULT=f()', /CONTROL_FLOW\) is not applicable to VM\(NONE\)/],
  ['OPAL', 'duplicate key', 'local function f() LPH_ATTRIBUTES(VM(OPAL), VM(ONYX)) return 1 end RESULT=f()', /duplicate LPH_ATTRIBUTES key/],
  ['OPAL', 'attribute not first statement', 'local function f() local q=1 LPH_ATTRIBUTES(VM(ONYX)) return q end RESULT=f()', /must be the first statement/],
];
for (const [vm, feature, source, pattern] of INVALID) {
  let rejectedOk = false;
  try { applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
  catch (error) { rejectedOk = pattern.test(String(error && error.message ? error.message : error)); }
  if (!rejectedOk) throw new Error(`${vm}/${feature}: expected rejection matching ${pattern}`);
  record(vm, feature, 'REJECTED', 'fails closed');
}

console.log(`Attribute interaction matrix: ${cells} cells (${valid} applied/consumed, ${rejected} correctly rejected)`);
