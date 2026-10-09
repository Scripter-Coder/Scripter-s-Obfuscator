// What does the payload actually ask the game for?
//
// The artifact contains none of the obfuscator's telemetry markers (no "track", no
// "ScripterHub Log", no "application/json"), so the reported
//     attempt to index nil with 'JSONEncode'
// cannot have come from custom-obfuscator.js's beacon - that code is not in this file.
// Which leaves the USER's own script, whose strings are encoded and therefore not
// greppable. Rather than argue from absence, this instruments GetService and every
// global the payload touches and reports what it asked for.
//
// Run: node tools/artifact_env_probe.mjs <artifact.bin>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'Storage Keeper', 'data', 'scripts');

const target = process.argv[2];
if (!target) { console.error('usage: node tools/artifact_env_probe.mjs <artifact.bin>'); process.exit(2); }
const src = fs.readFileSync(path.isAbsolute(target) ? target : path.join(DIR, target), 'utf8');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

// __asked records every service name requested, and returns nil for HttpService
// specifically - the failing case - while behaving normally for everything else, so the
// payload gets far enough to ask the question we care about.
const PRELUDE = `
__asked = {}
__noop = function() end
syn = nil http_request = nil
request = function(o) return {StatusCode=200, Body="ok", Success=true} end
identifyexecutor = function() return "probe" end
writefile = nil appendfile = nil makefolder = nil isfolder = nil
getgenv = function() return _G end
task = {wait=__noop, defer=__noop, spawn=__noop, delay=__noop}
hookfunction = __noop getcallingscript = __noop getscript = __noop
game = {}
workspace = {}
script = {}
function game:GetService(name)
  __asked[#__asked+1] = tostring(name)
  if name == "HttpService" then return nil end
  if name == "Players" then return {LocalPlayer={Name="probe", UserId=1}} end
  if name == "ReplicatedStorage" then return {} end
  if name == "RunService" then return {Heartbeat={Connect=__noop}} end
  if name == "UserInputService" then return {InputBegan={Connect=__noop}} end
  return {}
end
`;
if (lauxlib.luaL_loadstring(L, to_luastring(PRELUDE)) !== 0) {
  console.log('prelude failed: ' + to_jsstring(lua.lua_tostring(L, -1)));
  process.exit(1);
}
lua.lua_pcall(L, 0, 0, 0);

console.log('');
console.log('  artifact : ' + path.basename(target) + '  (' + (src.length / 1048576).toFixed(2) + ' MB)');
console.log('  GetService("HttpService") returns NIL, as on the reported executor');
console.log('');

const t0 = Date.now();
const st = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('=probe'));
if (st !== 0) {
  console.log('  COMPILE FAILED: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 160));
  process.exit(1);
}
let escaped = null;
const rc = lua.lua_pcall(L, 0, 0, 0);
if (rc !== 0) escaped = to_jsstring(lua.lua_tostring(L, -1)).slice(0, 200);

// Pull __asked out of Lua and report it.
lua.lua_getglobal(L, to_luastring('__asked'));
const asked = [];
if (lua.lua_type(L, -1) === lua.LUA_TTABLE) {
  const n = lua.lua_rawlen(L, -1);
  for (let i = 1; i <= n; i++) {
    lua.lua_rawgeti(L, -1, i);
    if (lua.lua_type(L, -1) === lua.LUA_TSTRING) asked.push(to_jsstring(lua.lua_tostring(L, -1)));
    lua.lua_pop(L, 1);
  }
}
lua.lua_pop(L, 1);

const uniq = [...new Set(asked)];
console.log('  elapsed      ' + (Date.now() - t0) + ' ms');
console.log('  escaped      ' + (escaped ? escaped : 'no'));
console.log('  services asked (' + uniq.length + ' distinct, ' + asked.length + ' calls):');
for (const s of uniq.sort()) console.log('    ' + s + (s === 'HttpService' ? '   <-- returns nil here' : ''));
console.log('');
console.log('  ' + (uniq.includes('HttpService')
  ? 'The payload DOES request HttpService, and it is nil in this environment - that is the'
  : 'The payload never requests HttpService, so the error is raised by something else.'));
console.log('  ' + (uniq.includes('HttpService')
  ? 'exact reported error. It is the SCRIPT asking, not ScripterHub\'s telemetry.'
  : ''));
console.log('');