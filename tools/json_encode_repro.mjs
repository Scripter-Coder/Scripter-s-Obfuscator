// Reproduce: attempt to index nil with 'JSONEncode'
//
// The artifact runs clean in a bare fengari state, which proves nothing: the telemetry
// path is guarded by `local n13 = syn and syn.request or http_request or request`, and
// with none of those defined the whole block is skipped. So the failing environment has
// to be constructed, not approximated.
//
// What the owner reported: the loadstring runs with no output, then the payload throws
//     [sh::bfbd8a]:80: attempt to index nil with 'JSONEncode'
//
// custom-obfuscator.js builds that line as
//     pcall(request, {..., Body=game:GetService("HttpService"):JSONEncode({...})})
// and the surrounding telemetry IS wrapped in pcall(function() ... end). If the index
// error escaped anyway, something stripped that protection - and the first suspect is
// the bytecode VM, which rewrites the whole chunk.
//
// Run: node tools/json_encode_repro.mjs <artifact.bin>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'Storage Keeper', 'data', 'scripts');

const target = process.argv[2];
if (!target) { console.error('usage: node tools/json_encode_repro.mjs <artifact.bin>'); process.exit(2); }
const src = fs.readFileSync(path.isAbsolute(target) ? target : path.join(DIR, target), 'utf8');

// HS_MODE:
//   'nil'    - GetService("HttpService") returns nil. Some executors do not expose it.
//   'object' - GetService returns a table with JSONEncode (a working Roblox-like env)
//   'nocall' - game.GetService does not exist at all
const MODE = process.argv[3] || 'nil';

function prelude(mode) {
  const hs = mode === 'object'
    ? 'JSONEncode=function() return "{}" end JSONDecode=function() return {} end'
    : 'JSONEncode=function() return "{}" end';
  return `
local function noop() end
syn = nil http_request = nil
request = function(o) return {StatusCode=200, Body="ok", Success=true} end
identifyexecutor = function() return "repro" end
os = os or {time=function() return 0 end}
game = {}
function game:GetService(name)
  if name == "HttpService" then
    ${mode === 'nil' ? 'return nil' : mode === 'nocall' ? 'return nil' : 'return {JSONEncode=function() return "{}" end, JSONDecode=function() return {} end}'}
  end
  if name == "Players" then return {LocalPlayer={Name="repro", UserId=1}} end
  return {}
end
${mode === 'nocall' ? 'game.GetService = nil' : ''}
writefile = nil appendfile = nil makefolder = nil isfolder = nil
${hs}
`;
}

console.log('');
console.log('  artifact : ' + path.basename(target) + '  (' + (src.length / 1048576).toFixed(2) + ' MB)');
console.log('  HttpService mode: ' + MODE);
console.log('');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

const p = prelude(MODE);
if (lauxlib.luaL_loadstring(L, to_luastring(p)) !== 0) {
  console.log('  prelude failed: ' + to_jsstring(lua.lua_tostring(L, -1)));
  process.exit(1);
}
if (lua.lua_pcall(L, 0, 0, 0) !== 0) {
  console.log('  prelude error: ' + to_jsstring(lua.lua_tostring(L, -1)));
  process.exit(1);
}

const t0 = Date.now();
const st = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('=' + path.basename(target)));
if (st !== 0) {
  console.log('  COMPILE FAILED: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 160));
  process.exit(1);
}
const rc = lua.lua_pcall(L, 0, 0, 0);
const ms = Date.now() - t0;
if (rc !== 0) {
  const err = to_jsstring(lua.lua_tostring(L, -1)).slice(0, 200);
  console.log('  ESCAPED after ' + ms + ' ms:');
  console.log('    ' + err);
  console.log('');
  console.log('  ' + (/'JSONEncode'/.test(err)
    ? 'REPRODUCED. The index error escapes despite the surrounding pcall, so the'
    : 'A different error escaped. ') + (/'JSONEncode'/.test(err)
    ? 'protection is being stripped somewhere - the bytecode VM is the first suspect.'
    : ''));
} else {
  console.log('  ran to completion in ' + ms + ' ms with no escaped error');
  console.log('');
  console.log('  Not reproduced in this mode. Try: nil, object, nocall');
}
console.log('');