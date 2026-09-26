// src/security/antitamper.js — Anti-Tamper (Phase 6, §21)
// Expand integrity protection: VM image, bytecode, handler, dispatcher, build metadata, state consistency

import { integrityHash } from '../bytecode/format.js';

export const CHECKS = [
  { name:'vm_image_integrity', impl:'FNV over V vault', failure:'return (fail to decrypt)', test:'flip vault byte' },
  { name:'bytecode_integrity', impl:'FNV over blob', failure:'error bad opcode', test:'flip blob byte' },
  { name:'handler_integrity', impl:'hash HAND keys', failure:'error bad handler', test:'patch handler' },
  { name:'dispatcher_integrity', impl:'hash dispatch loop', failure:'abort', test:'nop dispatch' },
  { name:'build_metadata_integrity', impl:'check buildId/vmId/chk', failure:'return', test:'change t0' },
  { name:'state_consistency', impl:'check SP/BASE/TOP bounds', failure:'error state', test:'overflow stack' },
  { name:'runtime_mutation_detection', impl:'pollute _G check', failure:'Shutdown', test:'set _G spy' },
];

export function buildIntegrity(vmBytes, blobBytes) {
  return {
    vm: integrityHash(vmBytes||[]),
    blob: integrityHash(blobBytes||[]),
    meta: Math.floor(Math.random()*4294967296),
  };
}

export function checksumBytes(bytes) {
  let h = 0;
  for (let i = 0; i < (bytes || []).length; i++) h = (h + (bytes[i] >>> 0)) >>> 0;
  return h >>> 0;
}

export function verifyIntegrity(expected, actual) {
  if (expected == null || actual == null) return false;
  return (expected >>> 0) === (actual >>> 0);
}

export function luaTamperAbort(msg) {
  return 'error(' + JSON.stringify(msg || 'tamper') + ',0)';
}
