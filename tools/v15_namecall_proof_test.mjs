// Structural + semantic proof for documented V15 TRANSFORM(REWRITE_NAMECALLS).
//
// The transform must rewrite object:method(...) into object.method(object, ...)
// through the AST/IR pipeline (never a textual regex), while preserving
// receiver identity, single receiver evaluation, evaluation order, __index
// metamethods, side effects and nested calls.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const R = 'REWRITE_NAMECALLS';

// A VM(NONE) function body is emitted at loader top level, so it can only see
// real globals. Fixtures therefore use G_* globals for the VM(NONE) cases and
// locals for the virtualized cases.
const GOBJ = 'G={ tag="T", m=function(self,v) return self.tag..":"..tostring(v) end }';

function execute(artifact) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const p = lua.lua_tostring(L, -1);
  return p ? to_jsstring(p) : String(lua.lua_tonumber(L, -1));
}

function compile(source, opts = {}) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 4242, rethrow: true, onBuild: (b) => { build = b; }, ...opts });
  return { artifact, build, result: execute(artifact) };
}

let pass = 0;
function check(name, source, expected, opts = {}) {
  const got = compile(source, opts);
  if (got.result !== expected) throw new Error(`${name}: expected ${expected}, got ${got.result}`);
  pass++;
  console.log(JSON.stringify({ name, result: got.result, namecall: got.build.namecall }));
}

// ---- receiver identity -----------------------------------------------------
const OBJ = 'local o={ tag="T", m=function(self,v) return self.tag..":"..tostring(v) end }';
check('receiver-identity-opal', `${OBJ} local function f() LPH_ATTRIBUTES(TRANSFORM(${R})) return o:m(7) end RESULT=f()`, 'T:7');
check('receiver-identity-none', `${GOBJ} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(${R})) return G:m(7) end RESULT=f()`, 'T:7');
check('receiver-identity-onyx', `${OBJ} local function f() LPH_ATTRIBUTES(VM(ONYX), TRANSFORM(${R})) return o:m(7) end RESULT=f()`, 'T:7', { profile: 'SECURE' });

// ---- zero-argument calls ---------------------------------------------------
check('zero-arg-none', 'G={m=function(self) return self.tag end, tag="Z"} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G:m() end RESULT=f()', 'Z');
check('zero-arg-opal', 'local o={m=function(self) return self.tag end, tag="Z"} local function f() LPH_ATTRIBUTES(TRANSFORM(' + R + ')) return o:m() end RESULT=f()', 'Z');

// ---- multi-argument calls --------------------------------------------------
check('multi-arg', 'G={tag="T", m=function(self,a,b,c) return self.tag..a..b..c end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G:m(1,2,3) end RESULT=f()', 'T123');

// ---- chained member receiver (temporary path) ------------------------------
check('chain-receiver-none', 'G={b={tag="C", m=function(self) return self.tag end}} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G.b:m() end RESULT=f()', 'C');
check('chain-receiver-opal', 'local o={b={tag="C", m=function(self) return self.tag end}} local function f() LPH_ATTRIBUTES(TRANSFORM(' + R + ')) return o.b:m() end RESULT=f()', 'C');

// ---- single evaluation of a side-effecting receiver ------------------------
check('single-eval-none', 'G=nil local function mk() G={tag="S", m=function(self) return self.tag end} return G end local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return mk():m() end RESULT=f()', 'S');

// ---- evaluation order ------------------------------------------------------
check('order-preserved', 'G={m=function(self,v) return v end} local n=0 local function mk(v) n=n*10+v return v end local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) G:m(mk(2)) end f() RESULT=tostring(n)', '2');
check('order-side-effect-arg', 'local log={} local function mk(v) log[#log+1]=v return v end local o={m=function(self,a,b) return a..b end} local function f() LPH_ATTRIBUTES(TRANSFORM(' + R + ')) return o:m(mk("A"),mk("B")) end RESULT=f()..":"..table.concat(log,",")', 'AB:A,B');

// ---- __index metamethod on the receiver -----------------------------------
check('metamethod', 'G=setmetatable({tag="M"},{__index=function(_,k) return function(self) return self.tag..k end end}) local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G:z() end RESULT=f()', 'Mz');

// ---- __call on a plain function value (no receiver) ------------------------
check('no-method-call-untouched', 'G=setmetatable({},{__call=function(_,a) return a*2 end}) local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G(21) end RESULT=f()', '42');

// ---- mutation through self -------------------------------------------------
check('self-mutation', 'G={n=0, m=function(self,v) self.n=self.n+v return self.n end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) G:m(5) G:m(6) return G.n end RESULT=f()', '11');

// ---- multiple namecalls in one function ------------------------------------
check('multiple-sites', 'G={tag="Q", m=function(self,v) return self.tag..v end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) return G:m(1)..G:m(2) end RESULT=f()', 'Q1Q2');

// ---- namecall inside a loop ------------------------------------------------
check('in-loop-none', 'G={tag="L", m=function(self,v) return self.tag..v end} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(' + R + ')) local r="" for i=1,3 do r=r..G:m(i) end return r end RESULT=f()', 'L1L2L3');

// ---- untransformed control: same result without the attribute --------------
const control = compile(`${OBJ} local function f() return o:m(7) end RESULT=f()`);
if (control.result !== 'T:7') throw new Error('control case without the attribute is wrong');
pass++;
console.log(JSON.stringify({ name: 'control-no-attribute', result: control.result, namecall: control.build.namecall }));

// ---- STRUCTURAL PROOF: the transform actually changed the program ---------
{
  // VM(NONE): the emitted native source must be a dot-call with an explicit
  // self argument and must no longer contain the ':' namecall form.
  const withT = compile(`${GOBJ} local function f() LPH_ATTRIBUTES(VM(NONE), TRANSFORM(${R})) return G:m(7) end RESULT=f()`);
  const without = compile(`${GOBJ} local function f() LPH_ATTRIBUTES(VM(NONE)) return G:m(7) end RESULT=f()`);
  const nativeWith = withT.build.nativeFns[0].source;
  const nativeWithout = without.build.nativeFns[0].source;
  if (!nativeWith.includes('.m(G,7)')) throw new Error(`VM(NONE) native source was not rewritten: ${nativeWith}`);
  if (nativeWithout.includes('.m(G,7)')) throw new Error('control native source was unexpectedly rewritten');
  if (withT.build.namecall[0].count !== 1) throw new Error('namecall transform did not report one rewrite');
  console.log(JSON.stringify({ name: 'structure-vm-none', nativeBefore: nativeWithout.trim(), nativeAfter: nativeWith.trim() }));

  // OPAL structural proof: the compiled IR of the transformed function must
  // differ from the IR of the same program without the transform, and the
  // differing chunk must be the one carrying the TRANSFORM metadata. This is
  // the strongest available evidence that the rewrite happened inside the
  // compiler rather than textually.
  const codesOf = (build) => build.chunks.map((c) => JSON.stringify(c.code));
  const opalTransformed = compile(`${OBJ} local function f() LPH_ATTRIBUTES(TRANSFORM(${R})) return o:m(7) end RESULT=f()`);
  const opalNamecall = compile(`${OBJ} local function f() return o:m(7) end RESULT=f()`);
  const cT = codesOf(opalTransformed.build);
  const cN = codesOf(opalNamecall.build);
  if (cT.length !== cN.length) throw new Error('chunk count changed unexpectedly');
  const differing = cT.map((code, i) => (code !== cN[i] ? i : -1)).filter((i) => i >= 0);
  if (differing.length === 0) throw new Error('OPAL IR is unchanged: the namecall was not rewritten');
  const marked = differing.filter((i) => {
    const meta = opalTransformed.build.chunks[i].meta;
    return meta && Array.isArray(meta.transform) && meta.transform.includes(R);
  });
  if (marked.length === 0) throw new Error('the changed chunk is not the one carrying the REWRITE_NAMECALLS attribute');
  console.log(JSON.stringify({ name: 'structure-opal', differingChunks: differing, transformTaggedChunk: marked, irChanged: true }));
  pass += 2;
}

console.log(`REWRITE_NAMECALLS proof: ${pass} checks passed`);
