// src/ir/splitting.js — True Instruction Splitting (Phase 4, §6)
// Logical op lowers into multiple VM ops, profile-dependent.

export const SPLIT_RULES = {
  LOADK: [{ name:'DECODE_CONST+MOVE', parts: ['DECODE_CONST','MOVE'], cost: 2 }],
  GETTAB: [{ name:'PREP_KEY+LOOKUP', parts: ['PREP_KEY','LOOKUP'], cost: 2 }],
  CALL: [{ name:'PREP_ARGS+RESOLVE+ENTER', parts: ['PREP_ARGS','RESOLVE_CALLABLE','ENTER_CALL'], cost: 3 }],
  TGET: [{ name:'PREP_TGET+LOOKUP_TGET', parts: ['PREP_TGET','LOOKUP_TGET'], cost: 2 }],
};

export function shouldSplit(op, seed, profileName, idx) {
  if(!SPLIT_RULES[op]) return false;
  let s = (seed ^ (idx*0x85ebca6b)) >>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
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
