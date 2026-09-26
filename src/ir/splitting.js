import { makeRng } from '../rng.js';
// src/ir/splitting.js — True Instruction Splitting (Phase 4, §6)
// Logical op lowers into multiple VM ops, profile-dependent.

// Keys must be op names the compiler actually emits, and every part must have a
// real emitter case (the emitter throws `emit <name>` otherwise).
//
// LOADK and GETTAB were never emitted; the real names are NUMK and TGET. NUMK
// is deliberately absent: its only split would need a MOVE opcode, and no MOVE
// exists in OP_NAMES. The old CALL rule was removed for the same reason -- its
// parts (PREP_ARGS / RESOLVE_CALLABLE / ENTER_CALL) are not opcodes, so firing
// it would abort the build. It happened to be unreachable because the caller
// only ever passes TGET, which is exactly the kind of latent landmine that
// should not be left in place.
export const SPLIT_RULES = {
  TGET: [{ name:'PREP_TGET+LOOKUP_TGET', parts: ['PREP_TGET','LOOKUP_TGET'], cost: 2 }],
};

export function shouldSplit(op, seed, profileName, idx) {
  if(!SPLIT_RULES[op]) return false;
  let s = (seed ^ (idx*0x85ebca6b)) >>>0;
  const { rnd } = makeRng(s);
  if(profileName==='FAST') return false;
  if(profileName==='SECURE') return rnd(100)<25;
  return rnd(100)<10;
}

export function splitInst(inst, seed, profileName, idx) {
  const rules = SPLIT_RULES[inst.op];
  if(!rules) return [inst];
  if(!shouldSplit(inst.op, seed, profileName, idx)) return [inst];
  const rule = rules[0]; // pick first variant; could randomize
  return rule.parts.map(p=>({op:p, orig:inst.op, split:true}));
}

export function applySplitting(insts, seed, profileName) {
  const out=[];
  let splits=0;
  for(let i=0;i<insts.length;i++) {
    const parts = splitInst(insts[i], seed, profileName, i);
    if(parts.length>1) splits++;
    out.push(...parts);
  }
  return { insts: out, splits };
}
