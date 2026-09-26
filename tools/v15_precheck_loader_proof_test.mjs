// Structural proof that LPH_PRECHECK is loader-integrated, not ordinary
// application code, and that the main payload is gated behind it.
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

function compile(source) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 5150, rethrow: true, onBuild: (b) => { build = b; } });
  return { artifact, build };
}

// 1. Ordering: the precheck stream is emitted and executed before the main
//    payload marker, and the main payload is decoded only after verification.
const gated = compile('LPH_PRECHECK(function() return 0x1234 end, 0x1234) RESULT="ok"');
const preStreamAt = gated.artifact.indexOf('VM_PRECHECK_STREAM');
const mainPayloadAt = gated.artifact.indexOf('VM_MAIN_PAYLOAD_AFTER_PRECHECK');
if (preStreamAt < 0 || mainPayloadAt < 0) throw new Error('precheck/main stream markers are missing');
if (!(preStreamAt < mainPayloadAt)) throw new Error('precheck stream is not emitted before the main payload gate');

// 2. The check function is a separate loader-only chunk, never a chunk of the
//    main application body, and it is cleared from the chunk table after use.
if (gated.build.prechecks.length !== 1) throw new Error('expected exactly one precheck record');
const checkChunkId = gated.build.prechecks[0].chunk;
const checkIndex = gated.build.chunks.findIndex((c) => c.meta && c.meta.precheck);
const checkChunk = gated.build.chunks[checkIndex];
if (!checkChunk) throw new Error('precheck body is not a dedicated loader-only chunk');
if (checkChunk.meta.precheck !== true) throw new Error('precheck chunk is not flagged loader-only');
// The emitter clears precheck chunks by their 1-based runtime chunk id.
const clearMarker = `[${checkIndex + 1}]=nil`;
if (!gated.artifact.includes(clearMarker)) throw new Error('precheck chunk is not cleared after verification');

// 3. A failing precheck blocks the main payload from ever running.
let blocked = false;
try {
  const failing = compile('SIDE=0 LPH_PRECHECK(function() return 9 end, 1) SIDE=1 RESULT="ran"');
  execute(failing.artifact);
} catch (error) {
  blocked = /LPH_PRECHECK/.test(String(error && error.message ? error.message : error));
}
if (!blocked) throw new Error('a failing precheck did not block the main payload');

// 4. Chained prechecks: the second failure must block even when the first passes.
let chainBlocked = false;
try {
  execute(compile('LPH_PRECHECK(function() return 1 end, 1) LPH_PRECHECK(function() return 2 end, 1) RESULT="ran"').artifact);
} catch (error) {
  chainBlocked = /LPH_PRECHECK/.test(String(error && error.message ? error.message : error));
}
if (!chainBlocked) throw new Error('a chained failing precheck did not block the main payload');

// 5. _ENV stays correct inside the check body. The check must rely on the
//    loader environment, not on main-payload state: the main payload has not
//    run yet when prechecks execute.
const envCase = compile('LPH_PRECHECK(function() if type(_ENV) ~= "table" or type(_ENV.print) ~= "function" then error("ENV",0) end return 1 end, 1) RESULT="ok"');
if (execute(envCase.artifact) !== 'ok') throw new Error('_ENV access inside a precheck is not correct');

// 5b. Proof that the main payload really has not executed at precheck time.
let precheckSawPayload = false;
try {
  execute(compile('SIDE_EARLY=1 LPH_PRECHECK(function() if _ENV.SIDE_EARLY ~= nil then error("LEAK",0) end return 1 end, 1) RESULT="ok"').artifact);
} catch (error) {
  precheckSawPayload = /LEAK/.test(String(error && error.message ? error.message : error));
}
if (precheckSawPayload) throw new Error('main-payload state leaked into a precheck that runs before it');

// 6. Documented restrictions.
const rejected = [
  ['upvalue capture', 'local K=5 LPH_PRECHECK(function() return K end, 5) RESULT="ok"'],
  ['named function', 'local function q() return 1 end LPH_PRECHECK(q, 1) RESULT="ok"'],
  ['parameters', 'LPH_PRECHECK(function(x) return 1 end, 1) RESULT="ok"'],
  ['expression placement', 'local x=LPH_PRECHECK(function() return 1 end, 1) RESULT="ok"'],
  ['non-literal key', 'local k=1 LPH_PRECHECK(function() return 1 end, k) RESULT="ok"'],
];
for (const [name, source] of rejected) {
  let ok = false;
  try { applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
  catch (error) { ok = /LPH_PRECHECK/.test(String(error && error.message ? error.message : error)); }
  if (!ok) throw new Error(`documented restriction not enforced: ${name}`);
}

console.log('LPH_PRECHECK loader proof: PASS');
console.log(JSON.stringify({
  precheckStreamBeforeMainPayload: true,
  loaderOnlyChunkId: checkIndex + 1,
  chunkClearedAfterVerification: true,
  failingPrecheckBlocksMain: true,
  chainedPrecheckBlocksMain: true,
  envCorrect: true,
  precheckRunsBeforeMainPayload: true,
  documentedRestrictionsEnforced: rejected.length,
}));
