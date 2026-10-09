// Does json_shim actually replace HttpService:JSONEncode?
//
// The reported failure is "attempt to index nil with 'JSONEncode" on an executor where
// game:GetService("HttpService") returns nil. A shim that is never exercised in that
// exact environment is just a file nobody has tested, so this runs the shim under
// fengari with HttpService returning nil and asserts the encode output against
// hand-written expected JSON.
//
// Run: node tools/json_shim_test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIM = path.join(ROOT, 'Storage Keeper', 'json_shim.lua');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

const src = fs.readFileSync(SHIM, 'utf8');

function run(encodeExpr, hsMode) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const PRELUDE = `
game = {}
function game:GetService(name)
  if name == "HttpService" then ${hsMode === 'nil' ? 'return nil' : 'return {JSONEncode=function() return "REAL" end}'} end
  return {}
end
`;
  if (lauxlib.luaL_loadstring(L, to_luastring(PRELUDE)) !== 0) return { err: 'prelude' };
  lua.lua_pcall(L, 0, 0, 0);
  if (lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('=json_shim')) !== 0) {
    return { err: 'shim load: ' + to_jsstring(lua.lua_tostring(L, -1)) };
  }
  if (lua.lua_pcall(L, 0, 1, 0) !== 0) {
    return { err: 'shim run: ' + to_jsstring(lua.lua_tostring(L, -1)) };
  }
  const out = lua.lua_tostring(L, -1);
  if (lua.lua_type(L, -1) !== lua.LUA_TTABLE) return { err: 'shim did not return a table' };
  // json_shim.lua ends with `json_shim.JSON = json_shim.install()` and `return json_shim`,
  // so what lands on the stack is the MODULE, not install()'s result. An earlier version
  // of this harness published the module as the global JSON, which meant every assertion
  // silently exercised json_shim.encode - the low-level encoder - instead of the installed
  // facade. That made "the real HttpService is preferred" fail for a reason that had
  // nothing to do with the shim. Publish module.JSON, which is what a user holds.
  lauxlib.luaL_loadstring(L, to_luastring('_G.JSON = (...).JSON'));
  lua.lua_pushvalue(L, -2);
  if (lua.lua_pcall(L, 1, 0, 0) !== 0) return { err: 'could not publish JSON' };
  lua.lua_pop(L, 1);   // drop the module table left on the stack
  if (lauxlib.luaL_loadstring(L, to_luastring('return ' + encodeExpr)) !== 0) return { err: 'expr' };
  if (lua.lua_pcall(L, 0, 1, 0) !== 0) return { err: to_jsstring(lua.lua_tostring(L, -1)) };
  return { out: to_jsstring(lua.lua_tostring(L, -1)) };
}

console.log('');
console.log('  HttpService returns NIL (the reported failing environment)');
console.log('');

const CASES = [
  ['string', 'JSON.encode("hi")', '"hi"'],
  ['escaped quote', 'JSON.encode(\'a"b\')', '"a\\"b"'],
  ['newline', 'JSON.encode("a\\nb")', '"a\\nb"'],
  ['backslash', 'JSON.encode("a\\\\b")', '"a\\\\b"'],
  ['control char', 'JSON.encode("a\\1b")', '"a\\u0001b"'],
  ['number', 'JSON.encode(42)', '42'],
  ['float', 'JSON.encode(1.5)', '1.5'],
  ['boolean', 'JSON.encode(true)', 'true'],
  ['empty object', 'JSON.encode({})', '{}'],
  ['object', 'JSON.encode({a=1})', '{"a":1}'],
  ['array', 'JSON.encode({1,2,3})', '[1,2,3]'],
  ['nested', 'JSON.encode({a={b=2}})', '{"a":{"b":2}}'],
  ['sorted keys', 'JSON.encode({z=1,a=2})', '{"a":2,"z":1}'],
  ['array of objects', 'JSON.encode({{a=1},{a=2}})', '[{"a":1},{"a":2}]'],
  ['NaN becomes null', 'JSON.encode(0/0)', 'null'],
];

for (const [label, expr, want] of CASES) {
  const r = run(expr, 'nil');
  if (r.err) no(`${label}: ${r.err.slice(0, 80)}`);
  else if (r.out === want) ok(`${label} -> ${r.out}`);
  else no(`${label} -> got ${JSON.stringify(r.out)}, want ${JSON.stringify(want)}`);
}

console.log('');
console.log('  the failing call shape, with HttpService nil');
{
  // Exactly what user code writes. Before the shim this is the reported crash.
  const r = run('game:GetService("HttpService"):JSONEncode({x=1})', 'nil');
  if (r.err) no('still crashes: ' + r.err.slice(0, 100));
  else if (r.out === '{"x":1}') ok('game:GetService("HttpService"):JSONEncode({x=1}) -> ' + r.out);
  else no('unexpected: ' + JSON.stringify(r.out));
}

console.log('');
console.log('  with a WORKING HttpService, the real one must still be used');
{
  const r = run('JSON.encode({x=1})', 'real');
  if (r.err) no('errored: ' + r.err.slice(0, 80));
  else if (r.out === 'REAL') ok('the genuine HttpService is preferred - no behaviour change');
  else no('did not use the real HttpService, got ' + JSON.stringify(r.out));
}

console.log('');
console.log('='.repeat(62));
console.log('  JSON SHIM   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(62));
process.exit(fail === 0 ? 0 : 1);