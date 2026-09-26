import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { applyMBA } from '../src/transform/mba.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function run(code) {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_dostring(L, to_luastring(code));
  if (st !== lua.LUA_OK) return { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)) };
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const v = lua.lua_isnil(L, -1) ? 'nil' : to_jsstring(lua.lua_tostring(L, -1));
  return { ok: true, value: v };
}
let passed = 0;
function check(n, fn) { fn(); console.log(JSON.stringify({ encryption: n, pass: true })); passed++; }

// ENCSTR key forms
check('encstr-no-key', () => {
  const a = applyBytecodeVm('RESULT=LPH_ENCSTR("hello")', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== 'hello') throw new Error(JSON.stringify(r));
});
check('encstr-numeric-key-correct', () => {
  const a = applyBytecodeVm('RESULT=LPH_ENCSTR("hello", 7, 7)', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== 'hello') throw new Error(JSON.stringify(r));
});
check('encstr-numeric-key-wrong', () => {
  const a = applyBytecodeVm('RESULT=LPH_ENCSTR("hello", 7, 8)', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (r.ok) throw new Error('wrong key should fail, got ' + r.value);
  if (!/LPH_ENCSTR/.test(r.error)) throw new Error('wrong error: ' + r.error);
});
check('encstr-hex-key', () => {
  const hex = '0123456789abcdef'.repeat(4);
  const a = applyBytecodeVm(`RESULT=LPH_ENCSTR("hello", "${hex}", "${hex}")`, { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== 'hello') throw new Error(JSON.stringify(r));
});
check('encstr-runtime-expr', () => {
  const a = applyBytecodeVm('local k=9 RESULT=LPH_ENCSTR("hi", 9, k)', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== 'hi') throw new Error(JSON.stringify(r));
});

// ENCNUM + 8-entry limit
check('encnum-basic', () => {
  const a = applyBytecodeVm('RESULT=LPH_ENCNUM(42)', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== '42') throw new Error(JSON.stringify(r));
});
check('encnum-8-limit-ok', () => {
  const entries = Array.from({ length: 8 }, (_, i) => `[${i + 1}]=${i + 100}`).join(',');
  const a = applyBytecodeVm(`local t={${entries}} RESULT=LPH_ENCNUM(5, {[1]=100,[2]=101,[3]=102,[4]=103,[5]=104,[6]=105,[7]=106,[8]=107})`, { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  // key-table form checks runtime exprs vs ints at runtime; here keys are
  // literals 1..8 vs values — they will mismatch (1~=100) so it errors.
  // The point is compile accepts 8 entries.
  if (!a) throw new Error('8-entry compile failed');
});
check('encnum-9-rejected', () => {
  let rej = false;
  try {
    applyBytecodeVm('RESULT=LPH_ENCNUM(1, {[1]=1,[2]=2,[3]=3,[4]=4,[5]=5,[6]=6,[7]=7,[8]=8,[9]=9})', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  } catch (e) { rej = /LPH_ENCNUM|8/.test(String(e)); }
  if (!rej) throw new Error('9-entry key table accepted');
});

// ENCFUNC
check('encfunc', () => {
  const a = applyBytecodeVm('local f=LPH_ENCFUNC(function(x) return x*2 end) RESULT=f(21)', { profile: 'BALANCED', seedOverride: 1, rethrow: true });
  const r = run(a); if (!r.ok || r.value !== '42') throw new Error(JSON.stringify(r));
});

// MBA proof: documented families actually generate (rewrites>0) on bit targets
check('mba-bitwise-generates', () => {
  const ast = luaparse.parse('local x=1 local y=2 local z=(x+y)*(x-y) local w=(x&y)|(x~y) local v=~x local s=x<<2', { luaVersion: '5.3' });
  const st = applyMBA(ast, { seed: 1234, profileName: 'BALANCED', target: 'lua53', budget: 'LARGE', strength: 4 });
  if (!(st.rewrites > 0)) throw new Error('MBA generated 0 rewrites: ' + JSON.stringify(st));
});
check('mba-unsupported-rejected', () => {
  for (const src of ['RESULT=LPH_REWRITE(x^y)', 'RESULT=LPH_REWRITE(x/y)', 'RESULT=LPH_REWRITE(x%y)']) {
    let rej = false;
    try { applyBytecodeVm('local x=1 local y=2 ' + src, { profile: 'BALANCED', seedOverride: 1, rethrow: true }); }
    catch (e) { rej = /LPH_REWRITE|support/.test(String(e)); }
    if (!rej) throw new Error('unsupported operator accepted: ' + src);
  }
  // `//` is a syntax error on lua51 (parser rejects before macro validation);
  // on lua53+ it must be explicitly rejected as unsupported.
  let floorRej = false;
  try { applyBytecodeVm('local x=1 local y=2 RESULT=LPH_REWRITE(x//y)', { target: 'lua53', profile: 'BALANCED', seedOverride: 1, rethrow: true }); }
  catch (e) { floorRej = /LPH_REWRITE|support/.test(String(e && e.message || e)); }
  if (!floorRej) throw new Error('unsupported operator accepted: RESULT=LPH_REWRITE(x//y) on lua53');
});

// LPH_STACKALLOC alias + true vs fallback reporting
check('stackalloc-alias-true-fallback', () => {
  let bTrue = null, bFall = null;
  const a1 = applyBytecodeVm('local a=LPH_STACKALLOC(3) a[1]=1 RESULT=a[1]', { profile: 'BALANCED', seedOverride: 1, rethrow: true, onBuild: (b) => { bTrue = b.stackalloc; } });
  const r1 = run(a1); if (!r1.ok || r1.value !== '1') throw new Error(JSON.stringify(r1));
  if (!bTrue || !(bTrue.true >= 1)) throw new Error('TRUE stackalloc not reported: ' + JSON.stringify(bTrue));
  const a2 = applyBytecodeVm('local function mk() local a=LPH_STACKALLOC(2) a[1]=9 return a end RESULT=mk()[1]', { profile: 'BALANCED', seedOverride: 1, rethrow: true, onBuild: (b) => { bFall = b.stackalloc; } });
  const r2 = run(a2); if (!r2.ok || r2.value !== '9') throw new Error(JSON.stringify(r2));
  if (!bFall || !(bFall.fallback >= 1)) throw new Error('FALLBACK not reported: ' + JSON.stringify(bFall));
});

console.log(`ENCRYPTION/TRANSFORM proof: ${passed}/${passed} passed`);
