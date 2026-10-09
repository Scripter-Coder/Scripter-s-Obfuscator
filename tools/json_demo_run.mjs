// Run json_demo.lua under fengari and print what it emits.
//
// A demo that has never been executed is a demo that does not work. This runs it with
// HttpService ABSENT - the environment that produced the original report - so the output
// shown here is the output a user on a broken executor gets, not a hopeful sketch.
//
// Run: node tools/json_demo_run.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = fs.readFileSync(path.join(ROOT, 'Storage Keeper', 'json_demo.lua'), 'utf8');

const MODE = process.argv[2] || 'nil';   // nil | real

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

const PRELUDE = `
-- GLOBAL, not local: the demo runs as a separate chunk, so a local here would be out
-- of scope by the time anything printed, and the harness would report "printed nothing"
-- for a demo that printed plenty.
__out = {}
print = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t+1] = tostring((select(i, ...))) end
  __out[#__out+1] = table.concat(t, " ")
end
game = {}
function game:GetService(name)
  if name == "HttpService" then
    ${MODE === 'real'
      ? 'return { JSONEncode = function(self, v) return "NATIVE" end }'
      : 'return nil'}
  end
  return {}
end
`;

if (lauxlib.luaL_loadstring(L, to_luastring(PRELUDE)) !== 0) {
  console.log('prelude failed to compile: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 200));
  process.exit(1);
}
if (lua.lua_pcall(L, 0, 0, 0) !== 0) {
  // Previously unchecked, which is why the capture silently produced nothing and the
  // demo looked broken when it had simply never run.
  console.log('prelude failed at runtime: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 200));
  process.exit(1);
}

const st = lauxlib.luaL_loadbuffer(L, to_luastring(demo), demo.length, to_luastring('=json_demo'));
if (st !== 0) {
  console.log('DEMO FAILED TO COMPILE:\n  ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 300));
  process.exit(1);
}
if (lua.lua_pcall(L, 0, 0, 0) !== 0) {
  console.log('DEMO FAILED AT RUNTIME:\n  ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 300));
  process.exit(1);
}

// Dump whatever the demo printed, reading the global directly rather than through a
// probe chunk - a probe chunk is one more thing that can silently fail and be mistaken
// for the demo producing nothing.
console.log('\n  --- demo output, HttpService = ' + MODE + ' ---');
lua.lua_getglobal(L, to_luastring('__out'));
if (lua.lua_type(L, -1) !== lua.LUA_TTABLE) {
  console.log('  (the demo printed nothing: __out is ' + lua.lua_type(L, -1) + ')');
} else {
  const n = lua.lua_rawlen(L, -1);
  for (let i = 1; i <= n; i++) {
    lua.lua_rawgeti(L, -1, i);
    if (lua.lua_type(L, -1) === lua.LUA_TSTRING) console.log(to_jsstring(lua.lua_tostring(L, -1)));
    lua.lua_pop(L, 1);
  }
}
console.log('');