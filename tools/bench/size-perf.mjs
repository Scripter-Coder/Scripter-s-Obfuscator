// tools/bench/size-perf.mjs
//
// Size and runtime cost of the layout hardening, measured A/B on the same
// source and seed. Reports what the hardening costs the executor, so the
// security gain is never paid for silently.
//
// Usage: node tools/bench/size-perf.mjs <source.lua> [--seeds 1] [--profiles SECURE]
import { readFileSync } from 'fs';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i === -1) return d;
  const a = argv[i + 1];
  return a && !a.startsWith('--') ? a : 'true';
};
const src = readFileSync(argv[0], 'utf8');
const SEEDS = parseInt(opt('seeds', '1'), 10);
const PROFILES = (opt('profiles', 'FAST,BALANCED,SECURE') || '').split(',').filter(Boolean);

function run(text) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const t = Date.now();
  const st = lauxlib.luaL_dostring(L, to_luastring(text));
  const ms = Date.now() - t;
  return { ok: st === lua.LUA_OK, ms, err: st === lua.LUA_OK ? null : to_jsstring(lua.lua_tostring(L, -1)).slice(0, 120) };
}

console.log(`source: ${argv[0]}  ${src.length} chars`);
for (const profile of PROFILES) {
  for (let s = 0; s < SEEDS; s++) {
    const seed = 9001 + s * 104729;
    for (const [label, opts] of [['OFF', { hardenOff: true, scrambleOff: true }], ['ON', {}]]) {
      let build = null;
      const t0 = Date.now();
      const vm = applyBytecodeVm(src, Object.assign({
        profile, rethrow: true, seedOverride: seed, onBuild: (b) => { build = b; },
      }, opts));
      const buildMs = Date.now() - t0;
      if (!vm) { console.log(`  ${profile} seed${seed} ${label}: emit returned null`); continue; }
      const r = run(vm);
      console.log(`  ${profile.padEnd(8)} seed=${seed} ${label}  ` +
        `chars=${String(vm.length).padStart(8)} (${(vm.length / src.length).toFixed(1)}x)  ` +
        `emit=${String(buildMs).padStart(5)}ms  run=${String(r.ms).padStart(6)}ms  ${r.ok ? 'OK' : 'ERR ' + r.err}`);
    }
  }
}