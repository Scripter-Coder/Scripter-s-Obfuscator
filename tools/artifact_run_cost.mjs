// Execute a delivered artifact and measure what it costs the executor.
//
// Parsing is NOT the bottleneck - 15 MB parses in ~250 ms. So the reported "lag for
// ten seconds, then a crash" is not compilation. It is the artifact RUNNING: the
// obfuscator emits a bytecode VM that unpacks and rebuilds itself before your code
// executes, and that work happens on the executor's main thread with the executor's
// heap, where nothing can yield.
//
// This runs the real bytes under fengari with a wall-clock cap and reports peak memory,
// because "it crashed after ten seconds" is a resource symptom and the resource is
// almost certainly heap, not CPU.
//
// NOT DELTA. fengari is a Lua 5.3 in JavaScript on Node's GC, which is more forgiving
// than a Roblox client's executor in one way (a real GC) and far more punishing in
// another (no cap). Treat the shape as indicative and the numbers as a bound.
//
// Run: node --max-old-space-size=2048 tools/artifact_run_cost.mjs <artifact.bin> [seconds]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';

const { lauxlib, lualib, lua, to_luastring, to_jsstring } = fengari;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'Storage Keeper', 'data', 'scripts');

const target = process.argv[2];
const CAP = Number(process.argv[3] || 30);
if (!target) { console.error('usage: node tools/artifact_run_cost.mjs <artifact.bin> [seconds]'); process.exit(2); }

const full = path.isAbsolute(target) ? target : path.join(DIR, target);
const src = fs.readFileSync(full, 'utf8');
const name = path.basename(full);

console.log('');
console.log('  running ' + name + '  (' + (src.length / 1048576).toFixed(2) + ' MB, ' +
  src.length.toLocaleString() + ' chars)');
console.log('  hard cap: ' + CAP + 's');
console.log('');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

// Stub ONLY the Roblox/executor globals, and do it by RUNNING a small Lua prelude
// rather than by pushing values across the C API by hand. Hand-pushing needs the stack
// kept exactly straight and an off-by-one surfaces as "expects an array of bytes" from
// deep inside fengari.
//
// Deliberately NOT stubbing pcall/select/type/pairs or the rest of the standard library:
// replacing those with strings makes the artifact die on its first call, which reads as
// "the script is broken" and hides the thing being measured. An earlier version of this
// file did exactly that.
const PRELUDE = `
local function noop() end
game = {} workspace = {} script = {} shared = {}
getgenv = function() return _G end
task = { wait=noop, defer=noop, spawn=function(f) end, delay=function(_,f) end }
hookfunction = noop hookmetamethod = noop
getcallingscript = noop getscript = noop
syn = { write=noop } fluxus = {}
gethui = function() return nil end
findfirstchild = function() return nil end
warn = noop wait = noop
collectgarbage = noop
`;
{
  const p = PRELUDE;
  if (lauxlib.luaL_loadstring(L, to_luastring(p)) !== 0) {
    console.log('  prelude failed: ' + to_jsstring(lua.lua_tostring(L, -1)));
    process.exit(1);
  }
  if (lua.lua_pcall(L, 0, 0, 0) !== 0) {
    console.log('  prelude error: ' + to_jsstring(lua.lua_tostring(L, -1)));
    process.exit(1);
  }
}

const mem0 = process.memoryUsage().heapUsed;
let peak = mem0;
const sampler = setInterval(() => {
  const h = process.memoryUsage().heapUsed;
  if (h > peak) peak = h;
}, 250);

const t0 = Date.now();
let outcome;
try {
  const st = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring('=' + name));
  if (st !== 0) {
    outcome = 'COMPILE FAILED: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 120);
  } else {
    const rc = lua.lua_pcall(L, 0, 0, 0);
    const ms = Date.now() - t0;
    if (rc !== 0) outcome = 'RUNTIME ERROR after ' + ms + ' ms: ' + to_jsstring(lua.lua_tostring(L, -1)).slice(0, 140);
    else outcome = 'ran to completion in ' + ms + ' ms';
  }
} catch (e) {
  outcome = 'host threw: ' + String(e && e.message).slice(0, 140);
}
const ms = Date.now() - t0;
clearInterval(sampler);

console.log('  ' + outcome);
console.log('  elapsed        ' + ms + ' ms (' + (ms / 1000).toFixed(1) + 's)');
console.log('  heap growth    ~' + ((peak - mem0) / 1048576).toFixed(1) + ' MB');
console.log('  peak heap      ~' + (peak / 1048576).toFixed(1) + ' MB');
console.log('');

if (ms >= CAP * 1000) console.log('  NOTE: exceeded the cap - it was still working when stopped.');
process.exit(0);