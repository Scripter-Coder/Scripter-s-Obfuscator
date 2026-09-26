// src/targets/lua53.js — NOT IMPLEMENTED until differential tests pass (spec §10, §17)

export const TARGET = {
  name: 'lua53',
  version: '5.3.6',
  parserOpts: { luaVersion: '5.3' },
  number: { integer: true, float: 'double', intOps: true },
  bitwise: { native: true, lib: null },
  env: { get: '_ENV', set: '_ENV' },
  coroutine: { supported: false },
  syntax: { goto: true, continue: false, bitwiseOps: true, integerDiv: true },
  status: 'NOT_IMPLEMENTED',
};

export function validate(_src) { return { ok: false, error: 'Lua 5.3 target not yet implemented — use lua51' }; }
export function adaptAst(_ast) { throw new Error('lua53 target not implemented'); }
