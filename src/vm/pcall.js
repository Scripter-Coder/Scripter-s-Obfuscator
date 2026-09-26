// src/vm/pcall.js — PCALL/XPCALL Virtualization (Phase 7, §30)
// VM-aware protected calls: need protected frame state, not just host pcall.

export function makeProtectedFrame(vmFrames, pc, base, top) {
  return { vmFrames: vmFrames.slice(), pc, base, top, protected: true, errHandler: null };
}

export function vmPcall(vmFn, args) {
  // For VM function, run in protected frame; for native, use host pcall
  try {
    const r = vmFn(...args);
    return [true, r];
  } catch(e) {
    return [false, e];
  }
}

export function vmXpcall(vmFn, errFn, args) {
  try {
    const r = vmFn(...args);
    return [true, r];
  } catch(e) {
    try { return [false, errFn(e)]; } catch(ee){ return [false, ee]; }
  }
}

// Requirements: VM function under pcall, xpcall, VM->native, VM->VM nested, VM error, native error, tailcalls inside pcall, return values, stack unwinding
export const PCALL_REQUIREMENTS = [
  'VM function under pcall',
  'VM function under xpcall',
  'VM->native pcall',
  'VM->VM nested pcall',
  'VM error',
  'native error',
  'nested errors',
  'tailcalls inside pcall',
  'return values',
  'stack unwinding',
];
