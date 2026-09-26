import { makeRng } from '../rng.js';
// src/ir/mutation.js — True Instruction Mutation (Phase 4, §4)
// Logical op may have multiple equivalent VM encodings. Compiler chooses per build/profile.

export const MUTATIONS = {
  ADD: [
    { name: 'direct', cost: 1, gen: (a,b)=>({op:'ADD', a,b}) },
    { name: 'reversed', cost: 1, cond: (a,b)=>true, gen: (a,b)=>({op:'ADD_R', a,b}) }, // commutative
    { name: 'helper', cost: 2, gen: (a,b)=>({op:'CALL', helper:'add', a,b}) },
    { name: 'split', cost: 3, gen: (a,b)=>[{op:'LOADK', a}, {op:'ADD', b}] }, // split arith sequence
    { name: 'fused', cost: 1, gen: (a,b)=>({op:'ADD_K', a,b}) },
  ],
  SUB: [
    { name:'direct', cost:1, gen:(a,b)=>({op:'SUB', a,b}) },
    { name:'neg_add', cost:2, gen:(a,b)=>({op:'ADD', a, b:{op:'NEG', a:b}}) },
  ],
  MUL: [
    { name:'direct', cost:1, gen:(a,b)=>({op:'MUL', a,b}) },
    { name:'reversed', cost:1, gen:(a,b)=>({op:'MUL_R', a,b}) },
    { name:'pow2', cost:2, cond:(a,b)=>b===2, gen:(a,b)=>({op:'ADD', a, b:a}) },
  ],
  EQ: [
    { name:'direct', cost:1, gen:(a,b)=>({op:'EQ', a,b}) },
    { name:'neq_not', cost:2, gen:(a,b)=>({op:'NOT', a:{op:'NEQ', a,b}}) },
  ],
  NOT: [
    { name:'direct', cost:1, gen:a=>({op:'NOT', a}) },
    { name:'eq_nil', cost:2, gen:a=>({op:'EQ', a, b:null}) },
  ],
};

export function chooseMutation(op, seed, profileName, idx) {
  const variants = MUTATIONS[op];
  if (!variants) return null;
  let s = (seed ^ (idx*0x9e3779b9)) >>>0;
  const { rnd } = makeRng(s);
  // profile bias: FAST prefers direct, SECURE mixes
  const pool = profileName==='FAST' ? variants.slice(0,1) : profileName==='SECURE' ? [variants[0], variants[1]].filter(Boolean) : variants.slice(0,2);
  const pick = rnd(pool.length);
  return { mutation: pool[pick], seed: s };
}

// Metadata so VM generator knows which impl was emitted
export function mutationMetadata(op, mutation) {
  return { op, impl: mutation.name, cost: mutation.cost };
}
