// tools/pcall_truncation_test.mjs — regression for single-value pcall/xpcall truncation.
// A call in non-final position keeps only its first value. PCALL/XPCALL
// always leave a packed results table on the VM stack; truncation to the
// first value is required everywhere a single value is expected.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function runJs(source, profile, seed) {
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile, seedOverride: seed, rethrow: true });
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const status = lauxlib.luaL_dostring(state, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(`runtime error: ${to_jsstring(lua.lua_tostring(state, -1))}`);
  lua.lua_getglobal(state, 'RESULT');
  const out = to_jsstring(lua.lua_tostring(state, -1));
  if (out === undefined || out === null) throw new Error('RESULT missing');
  return out;
}

const CASES = [
  ['single-target-local-fail', 'local ok=pcall(function() error("x") end) RESULT=tostring(ok==false)', 'true'],
  ['single-target-local-ok', 'local ok=pcall(function() return 1,2,3 end) RESULT=tostring(ok)', 'true'],
  ['single-target-no-leak', 'local ok=pcall(function() return 1,2,3 end) local s="A" RESULT=tostring(ok).."|"..s', 'true|A'],
  ['two-target', 'local ok,e=pcall(function() error("boom") end) RESULT=tostring(ok).."|"..tostring(e):sub(-4)', 'false|boom'],
  ['two-target-ok', 'local ok,v=pcall(function() return 7 end) RESULT=tostring(ok).."|"..tostring(v)', 'true|7'],
  ['xpcall-fail', 'local ok,e=xpcall(function() error("z") end, function(m) return "h:"..tostring(m):sub(-1) end) RESULT=tostring(ok).."|"..tostring(e)', 'false|h:z'],
  ['xpcall-ok', 'local ok,v=xpcall(function() return 5 end, function(m) return m end) RESULT=tostring(ok).."|"..tostring(v)', 'true|5'],
  ['assign-single', 'local t={} t.k=pcall(function() error("w") end) RESULT=tostring(t.k==false)', 'true'],
  ['plain-assign', 'local v; v=pcall(function() return 9 end) RESULT=tostring(v)', 'true'],
  ['non-last-arg', 'local function f(a,b) return tostring(a).."|"..tostring(b) end RESULT=f(pcall(function() return 1,2,3 end), "x")', 'true|x'],
  ['last-arg-expands', 'RESULT=select("#", pcall(function() return 1,2 end))', '3'],
  ['if-cond-fail', 'if pcall(function() error("q") end) then RESULT="taken" else RESULT="skipped" end', 'skipped'],
  ['if-cond-ok', 'if pcall(function() return nil end) then RESULT="taken" else RESULT="skipped" end', 'taken'],
  ['while-cond', 'local n=0 while pcall(function() n=n+1 if n>=2 then error("stop") end end) do end RESULT=tostring(n)', '2'],
  ['return-tailcall', 'local function g() return pcall(function() return 4,5 end) end local a,b,c=g() RESULT=tostring(a).."|"..tostring(b).."|"..tostring(c)', 'true|4|5'],
  ['fixed-prefix-local', 'local a,b=pcall(function() return 8 end),99 RESULT=tostring(a).."|"..tostring(b)', 'true|99'],
  ['host-fn', 'local ok,s=pcall(tostring, 5) RESULT=tostring(ok).."|"..tostring(s)', 'true|5'],
  ['nested-pcall', 'local ok=pcall(function() return pcall(function() error("deep") end) end) RESULT=tostring(ok)', 'true'],
  ['table-keyed', 'local t={k=pcall(function() return 3 end)} RESULT=tostring(t.k)', 'true'],
  ['binop', 'local ok=pcall(function() return 1 end) RESULT=tostring(ok==true)', 'true'],
];

let pass = 0;
for (const profile of ['OPAL', 'ONYX']) {
  for (const seed of [7, 41]) {
    for (const [name, source, expected] of CASES) {
      const got = runJs(`RESULT=nil; ${source}`, profile, seed);
      if (got !== expected) throw new Error(`${profile}/seed${seed}/${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
      pass++;
    }
  }
}
console.log(`pcall/xpcall truncation: ${pass}/${CASES.length * 4} passed`);
