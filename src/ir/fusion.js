// src/ir/fusion.js — True Instruction Fusion (Phase 4, §5)
// VM-level fusion (not constant folding). Fused represents multiple logical ops.

export const FUSION_CANDIDATES = [
  { name: 'LOADK_ADD', pattern: ['LOADK','ADD'], fused: 'LOADK_ADD', cost: -1, desc: 'LOADK + ADD -> single fused' },
  { name: 'GETGLOBAL_CALL', pattern: ['GETGLOBAL','CALL'], fused: 'GETGLOBAL_CALL', cost: -1 },
  { name: 'GETTABLE_CALL', pattern: ['GETTAB','CALL'], fused: 'GETTABLE_CALL', cost: -1 },
  { name: 'MOVE_RETURN', pattern: ['MOVE','RETURN'], fused: 'MOVE_RETURN', cost: -1 },
  { name: 'CMP_BRANCH', pattern: ['EQ','JIF'], fused: 'EQ_JIF', cost: -1 },
  { name: 'LOADK_MUL', pattern: ['LOADK','MUL'], fused: 'LOADK_MUL', cost: -1 },
];

export function findFusion(insts, seed, profileName) {
  let s = seed >>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
  const out=[];
  for(let i=0;i<insts.length-1;i++) {
    for(const cand of FUSION_CANDIDATES) {
      if(insts[i].op===cand.pattern[0] && insts[i+1].op===cand.pattern[1]) {
        const allow = profileName==='SECURE' ? rnd(100)<30 : profileName==='BALANCED' ? rnd(100)<15 : false;
        if(allow) out.push({at:i, cand, before: [insts[i], insts[i+1]], after: {op:cand.fused}});
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
