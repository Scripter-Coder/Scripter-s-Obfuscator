import { makeRng } from '../rng.js';
// src/ir/fusion.js — True Instruction Fusion (Phase 4, §5)
// VM-level fusion (not constant folding). Fused represents multiple logical ops.

// Op names here MUST match vm-bytecode.js OP_NAMES, and every `fused` opcode
// must have a real emitter case -- the emitter's default branch throws
// `emit <name>` for an unknown opcode, so a pattern naming a non-existent
// opcode turns into a hard build failure rather than a missed optimisation.
//
// These patterns previously used LOADK / GETGLOBAL / GETTAB / MOVE / RETURN,
// none of which the compiler ever emits. The real op names are NUMK, GLOB, TGET,
// LSET and RET, so no pattern could ever match and fusion never ran: `fused`
// was 0 for every build, on every seed.
//
// Only fusions whose target opcode already exists in OP_NAMES and in the
// emitter are listed. Adding a new fused opcode means adding it to OP_NAMES *and*
// writing its handler; that is a feature addition, not a wiring fix.
export const FUSION_CANDIDATES = [
  { name: 'LOADK_ADD', pattern: ['NUMK','ADD'], fused: 'LOADK_ADD', cost: -1, desc: 'NUMK + ADD -> single fused' },
  { name: 'LOADK_MUL', pattern: ['NUMK','MUL'], fused: 'LOADK_MUL', cost: -1 },
];

export function findFusion(insts, seed, profileName) {
  let s = seed >>>0;
  const { rnd } = makeRng(s);
  const out=[];
  for(let i=0;i<insts.length-1;i++) {
    for(const cand of FUSION_CANDIDATES) {
      if(insts[i].op===cand.pattern[0] && insts[i+1].op===cand.pattern[1]) {
        const allow = profileName==='SECURE' ? rnd(100)<30 : profileName==='BALANCED' ? rnd(100)<15 : false;
        if(allow) out.push({at:i, cand, before: [insts[i], insts[i+1]], after: {op:cand.fused, a: insts[i].a, meta: {...(insts[i].meta||{}), fusedFrom:cand.pattern.slice()}}});
      }
    }
  }
  return out;
}

export function applyFusion(insts, seed, profileName) {
  const fusions = findFusion(insts, seed, profileName);
  if(!fusions.length) return { insts, fused: 0, log: [] };
  const fusedSet = new Set(fusions.map(f=>f.at));
  const out=[];
  const log=[];
  for(let i=0;i<insts.length;i++) {
    const f = fusions.find(x=>x.at===i);
    if(f) {
      log.push({ before: f.before, after: f.after });
      out.push(f.after);
      i++; // skip next
    } else out.push(insts[i]);
  }
  return { insts: out, fused: fusions.length, log };
}
