// src/targets/lua52.js — Lua 5.2 backend (Phase 7, §25)
export const TARGET = {
  name: 'lua52',
  version: '5.2.4',
  parserOpts: { luaVersion: '5.2' },
  number: { integer: false, float: 'double' },
  syntax: { goto: true, env: '_ENV', bit32: true, ephemeron: true },
  env: { get: '_ENV', set: '_ENV' },
  coroutine: { yieldable_pcall: true },
  metamethod: { ephemeron: true },
  status: 'NOT_IMPLEMENTED',
  reason: 'Lua 5.2 backend NOT READY — native reference runtime unavailable.',
};
export function validate(_src){ return { ok:false, error: TARGET.reason }; }
export function adaptAst(_ast){ throw new Error(TARGET.reason); }
