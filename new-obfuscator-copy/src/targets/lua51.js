// src/targets/lua51.js — Target abstraction (spec §17)
// Real implementation for Lua 5.1; others stubbed and NOT advertised until differential passes.

export const TARGET = {
  name: 'lua51',
  version: '5.1.5',
  parserOpts: { luaVersion: '5.1' },
  number: { integer: false, float: 'double', intOps: false },
  bitwise: { native: false, lib: 'bit32' }, // via bit32 compat
  env: { get: 'getfenv or _G', set: 'setfenv' },
  coroutine: { supported: false, note: 'Host coroutines cross VM boundary — not virtualized in v1' },
  metamethod: { supported: 'via host t[k]=v triggering' },
  syntax: { goto: false, continue: false, bitwiseOps: false, integerDiv: false },
  status: 'IMPLEMENTED',
};

export function validate(_src) { return { ok: true }; }
export function adaptAst(_ast) { return _ast; }
