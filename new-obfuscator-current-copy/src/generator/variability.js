// src/generator/variability.js — Per-build generator variability (additional requirement #6 + old §11)
// Must vary STRUCTURALLY, not just names/order. Categories:
// VM state layout, instruction field layout, register encoding, handler decomposition,
// dispatcher structure, handler ordering/selection, constant representation, control-flow state.

export function makeVariability(seed) {
  let s = seed >>> 0;
  const rnd = (n) => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
  const rndInt = (a,b) => a + rnd(b - a + 1);
  return {
    seed,
    // 1. VM state layout: field order + naming + packing
    stateLayout: (() => {
      const fields = ['S','SP','SC','LK','PC','CODE','VA','CH','HAND','REG','BASE','TOP'];
      for (let i = fields.length - 1; i > 0; i--) { const j = rnd(i+1); [fields[i], fields[j]] = [fields[j], fields[i]]; }
      return { order: fields, useRegFile: rnd(2)===0, regBaseShift: rndInt(0,7) };
    })(),
    // 2. Instruction field layout: operand pos permutation + width (1 or 2 words)
    instrLayout: (() => {
      // each op may encode args as [op, a, b, c] vs [op, a<<x|b]
      return { permute: rnd(2)===0, width2For: rnd(2)===0 ? ['JMP','JIF'] : ['CALL','NEWF'] };
    })(),
    // 3. Register encoding: shuffle id -> slot
    regEncoding: (() => {
      const map = new Map();
      const shuffle = (ids) => { const a=[...ids]; for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; };
      return { shuffle };
    })(),
    // 4. Handler decomposition: split complex handler (CALL) into 2 fns or fused op
    handlerDecomp: {
      fuseAddMul: rnd(2)===0,
      splitCall: rnd(2)===0,
      splitTGet: rnd(3)===0,
    },
    // 5. Dispatcher structure: switch-like if-chain vs table dispatch vs state machine
    dispatcher: ['table','ifchain','statemachine'][rnd(3)],
    // 6. Handler ordering already shuffled per build in vm-bytecode; add selection variant
    handlerSelection: rnd(2)===0 ? 'table' : 'ifchain',
    // 7. Constant representation: vault cipher coefficients (already per-build) + per-const type
    constRepr: {
      string: ['vault','inline_xor'][rnd(2)],
      number: ['tonumber_vault','inline'][rnd(2)],
    },
    // 8. Control-flow state representation: block id vs opaque state var
    controlFlowState: rnd(2)===0 ? 'pc' : 'stateVar',
  };
}
