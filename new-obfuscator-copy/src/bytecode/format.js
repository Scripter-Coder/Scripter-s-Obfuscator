// src/bytecode/format.js — Custom bytecode format (spec §4)
// Versioned, not a 1:1 mirror of Lua 5.3. Header + func records + const sections + upvalue descs.

export const FORMAT_VERSION = 2; // bump when layout changes

// Image: { ver, buildId, vmId, target, profile, seed, funcs:[], constPool, integrity }
// Func: { idx, params:[regId], vararg:bool, nRegs, code:[word], consts:[{type,value,enc}], upDescs:[], lineInfo?, blocksInfo? }

export function makeImage({ buildId, vmId, target, profile, seed, funcs, constPool }) {
  return {
    ver: FORMAT_VERSION,
    buildId,
    vmId,
    target,
    profile,
    seed,
    funcs,
    constPool,
    integrity: null, // filled after serialize
  };
}

// Serialize v2: length-prefixed records with header (compat with old blob but adds header)
// Header: ver(1B) buildId(4B LE) vmId(4B LE) nFuncs(2B) ...
// Each func record: nParams(2B) params(2B each) vararg(1B) nRegs(2B) nCode(4B) code(4B each) nConsts(2B) ...
// For now bridge to existing blob: old blob is func records without header. New adds 8-byte header.
export function serializeV2(image) {
  const out = [];
  // header: ver, seed low 16, nFuncs
  out.push(image.ver & 0xFF);
  out.push(image.seed & 0xFF, (image.seed>>>8)&0xFF, (image.seed>>>16)&0xFF, (image.seed>>>24)&0xFF);
  out.push(image.funcs.length & 0xFF, (image.funcs.length>>>8)&0xFF);
  // pad to keep old decoder compatible? Old decoder expects nParams at pos0; we skip header in decoder by offset.
  // Actual func records appended after header — new decoder reads header first.
  for (const fn of image.funcs) {
    out.push(fn.params.length & 0xFF, (fn.params.length>>>8)&0xFF);
    for (const p of fn.params) out.push(p & 0xFF, (p>>>8)&0xFF);
    out.push(fn.vararg?1:0);
    out.push(fn.nRegs & 0xFF, (fn.nRegs>>>8)&0xFF);
    out.push(fn.code.length & 0xFF, (fn.code.length>>>8)&0xFF, (fn.code.length>>>16)&0xFF, (fn.code.length>>>24)&0xFF);
    for (const w of fn.code) out.push(w & 0xFF, (w>>>8)&0xFF, (w>>>16)&0xFF, (w>>>24)&0xFF);
  }
  return out;
}

// Integrity: simple FNV over serialized bytes (anti-tamper, spec §15) — separate from crypto
export function integrityHash(bytes) {
  let h = 2166136261;
  for (let i=0;i<bytes.length;i++){ h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
