// src/targets/luajit.js — LuaJIT backend (Phase 7, §27)
export const TARGET = {
  name: 'luajit',
  version: '2.1',
  parserOpts: { luaVersion: '5.1' },
  number: { integer: false, float: 'double', jit: true },
  features: { ffi: false, jit: true, bit: true },
  syntax: { goto: false },
  status: 'NOT_IMPLEMENTED',
  reason: 'LuaJIT backend NOT IMPLEMENTED until runtime reference testing is available — luajit.exe not found.',
  options: { ENABLE_FFI: false },
};
export function validate(_src){ return { ok:false, error: TARGET.reason }; }
export function adaptAst(_ast){ throw new Error(TARGET.reason); }
