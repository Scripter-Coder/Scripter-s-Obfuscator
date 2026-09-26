// Compatibility entry point for the retired lite VM pass.
// The repository's maintained implementation is the custom-bytecode VM;
// callers that still use the old vm-pass API are routed to that real VM
// instead of falling back to plaintext or importing a missing module.
import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';

export function vmSetLuaparse(parser) {
  vmBCSetLuaparse(parser);
}

export function applyVmPass(code, opts = {}) {
  return applyBytecodeVm(code, { profile: 'FAST', ...opts }) || code;
}
