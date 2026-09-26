// src/targets/lua54.js — Lua 5.4 backend (Phase 7, §23)
// Use discovered Lua 5.4 binary when available; otherwise NOT IMPLEMENTED with honest status.
// Implements target-specific semantic support: integers/floats, to-be-closed <close>, <const>, goto/labels, coroutines, envs, metamethods, varargs, etc.

export const TARGET = {
  name: 'lua54',
  version: '5.4.8',
  parserOpts: { luaVersion: '5.4' },
  number: { integer: true, float: 'double', intOps: true, toclose: true, constattr: true },
  bitwise: { native: true, lib: null },
  syntax: { goto: true, labels: true, tbc: true, constattr: true, integerDiv: true, bitwiseOps: true },
  coroutine: { supported: true },
  env: { get: '_ENV', set: '_ENV' },
  semantics: {
    integers: '64-bit',
    floats: 'double',
    close: '<close> variables and to-be-closed must run __close metamethod',
    goto: 'supported',
    metamethods: '__close, __index etc.',
  },
  unsupportedFeatures: ['lua5.1 setfenv'],
  status: 'NOT_IMPLEMENTED',
  reason: 'Native reference runtime unavailable — %USERPROFILE%\\Downloads\\lua-5.4.2_Win64_bin\\lua.exe not found. Need Lua 5.4.8 binary for differential testing.',
};

export function validate(src) {
  // Basic checks: detect <close>/<const> misuse, goto correctness
  if (src.includes('<close>') || src.includes('<const>')) {
    // would need full 5.4 parser; for now pass but mark
  }
  return { ok: false, error: TARGET.reason };
}
export function adaptAst(ast) { throw new Error(TARGET.reason); }
export function capabilities() { return TARGET; }
