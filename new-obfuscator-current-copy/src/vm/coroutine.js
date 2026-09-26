// src/vm/coroutine.js — Coroutine Support (Phase 7, §31)
// VM-aware coroutine state: create/resume/yield/status/wrap, VM frames preserved.

export const COROUTINE_OPS = ['YIELD','RESUME'];

export function makeCoroutineState() {
  return {
    // VM frames, REG state, PC, BASE/TOP, upvalues, pending return, protected-call state
    frames: [],
    reg: [],
    pc: 1,
    base: 0,
    top: 0,
    upvalues: [],
    status: 'suspended', // suspended | running | dead
    pending: null,
  };
}

// VM must retain frames on yield: not treat suspended frame as finished
export function suspend(state) {
  state.status = 'suspended';
  return state;
}
export function resume(state, args) {
  state.status = 'running';
  state.pending = args;
  return state;
}
