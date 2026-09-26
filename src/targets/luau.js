// src/targets/luau.js — Luau backend (Phase 7, §28)
export const TARGET = {
  name: 'luau',
  version: '0.709',
  parserOpts: { luaVersion: '5.1' }, // Luau parses via luaparse 5.1 + type stripping
  syntax: { types: true, iteration: 'luau', continue: true },
  env: { roblox: true },
  status: 'NOT_IMPLEMENTED',
  reason: 'Luau backend not available — luau.exe / Luau CLI not found.',
};
export function validate(_src){ return { ok:false, error: TARGET.reason }; }
export function adaptAst(_ast){ throw new Error(TARGET.reason); }
