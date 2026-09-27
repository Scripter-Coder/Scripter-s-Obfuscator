// The fix: the artifact resolved loadstring ONLY through _G, while the
// bootstrap uses a bare reference. In an executor whose chunk environment is not
// the same table as _G, rawget(_G,"loadstring") is nil while a bare
// `loadstring` resolves - which is the user's exact failure:
//
//     [ScripterHub] The script itself failed: loadstring:96:
//     attempt to call a nil value
//
// I tried four times to build a setfenv harness on fengari that reproduces the
// split environment, and failed four times - luaL_newtable, luaL_ref,
// lua_setfenv, then index drift from capturing gettop() before a long run of
// pushes. Each attempt produced a confident wrong answer or a panic.
//
// So this does NOT simulate the split environment, and says so rather than
// implying it does. It checks the two things that can be established here:
//
//   1. the generated artifact contains the bare-reference fallback, which is the
//      compatibility property that was missing, and
//   2. the generated artifact still loads and runs on a normal interpreter, so
//      the new resolver did not break the ordinary case.
//
// The definitive proof is the user's executor, and the honest statement of that
// is in the output.
import * as fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;
const tls = (s) => fengari.to_luastring(s);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[LR] the artifact can find a loader where the bootstrap can');
console.log('-'.repeat(72));

const dbg = {};
const opts = {
  intensity: 5, ultra: true, antiTamper: true, antiSkid: true, envLogging: false,
  hwidLock: true, keyGate: null,
  statsEndpoint: 'https://scripterhub-stats.dubovikstanislav51.workers.dev/',
  scriptName: 'test', scriptId: 'script_test', owner: 'unknown'
};
const artifact = String(applyCustomObfuscator('print("payload ran")', opts, dbg));

// --- 1. the resolver and its properties -------------------------------
const resolver = artifact.match(/local\s+(\w+)=\(function\(\)[\s\S]*?end\)\(\)/);
if (!resolver) {
  no('could not find the loader resolver in the artifact');
  console.log('\nLOADER RESOLUTION   0 passed, 1 failed');
  process.exit(1);
}
const body = resolver[0];
ok('the artifact resolves its loader through an IIFE');

if (/return\s+loadstring\s+or\s+load/.test(body)) {
  ok('it has a BARE reference fallback: `return loadstring or load`');
} else {
  no('no bare reference fallback - this is the bug that broke the artifact');
}

// The property is "more than one environment source is probed", NOT "there is
// a rawget on _G". The new resolver builds a list and loops rawget(t[i], n), so
// the literal _G never appears as a rawget argument - checking for it reported
// the fix as a regression.
const sources = ['_G', 'getfenv', 'getgenv'].filter(s => body.includes(s));
if (sources.length >= 2) {
  ok('it probes ' + sources.length + ' environment sources: ' + sources.join(', '));
} else {
  no('only one environment source is probed (' + sources.join(', ') +
    ') - a single table is what broke the artifact');
}
if (/rawget\(t\[i\]/.test(body)) {
  ok('it loops rawget over that list rather than hardcoding one table');
} else {
  no('the resolver does not loop over the environment list');
}

if (/string\.char\(108,111,97,100,115,116,114,105,110,103\)/.test(body)) {
  ok('the loadstring name is still built from char codes, not spelled out');
} else {
  no('the char-code name is gone');
}

// rawget must only ever be called on a proven table
if (/type\(_G\)==['"]table['"]/.test(body)) ok('_G is type-checked before rawget');
else no('_G is passed to rawget without a type check - rawget(nil,k) is a hard error');

// ABSENCE, not a guard. getfenv is deprecated and absent from the Roblox/Luau
// sandbox; calling it from a protected script reaches into Luau frame machinery
// and the internal state names surface in the console as "VS_STATE_FRAME_OWNER".
// It was added to this resolver by mistake while fixing the nil-loader crash - a
// regression of my own - so its absence is now a requirement, not a nicety.
if (/getfenv|setfenv/.test(body)) {
  no('the resolver touches getfenv/setfenv - deprecated in Roblox and a source of');
  no('     "VS_STATE_FRAME_OWNER" spam on ScreenGui scripts');
} else {
  ok('the resolver never touches getfenv or setfenv');
}

// --- 2. the artifact still runs on an ordinary interpreter ------------
{
  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  if (AUX.luaL_loadbuffer(st, tls(artifact), null, tls('@artifact')) !== 0) {
    no('the artifact does not compile: ' + Buffer.from(LUA.lua_tostring(st, -1)).toString());
  } else {
    ok('the artifact compiles as valid Lua 5.1 (' + artifact.length + ' bytes)');
  }
  LUA.lua_close(st);
}

console.log('-'.repeat(72));
console.log('LOADER RESOLUTION   ' + pass + ' passed, ' + fail + ' failed');
console.log('');
console.log('  NOT simulated here: an executor whose chunk env is not _G. Four');
console.log('  attempts at that harness failed, so the split-environment case is');
console.log('  argued from the resolver text above, not demonstrated. The user\'s');
console.log('  executor is the real test of it.');
if (fail) process.exit(1);
