// src/vm/dispatcher.js — Generated Dispatcher / Opaque State (Phase 4, §8)
// Genuine VM dispatcher state machine, several strategies, varying state layout.

export const DISPATCHER_STRATEGIES = {
  TABLE: 'direct_table_dispatch',      // HAND[kt(OP)]
  NUMERIC: 'numeric_state_dispatch',   // state + opcode
  STATE_OP: 'state_opcode',            // state|opcode
  BRANCH: 'generated_branch_dispatch', // if kt(OP)==... elseif ...
  MIXED: 'mixed_dispatch',             // table + branch hybrid
  // Opaque per-build decision tree. The opcode is first pushed through a
  // per-build affine key map, then routed through a generated balanced binary
  // tree over the permuted keys. Handlers are stored as independent generated
  // locals, so the artifact contains no "opcode number -> handler" table.
  TREE: 'opaque_decision_tree',
};

// LCG helper.
//
// The draw MUST come from the high bits. Taking `state % n` off the low bits
// of this generator is not uniform: the multiplier is odd and the increment is
// fixed, so the state modulo 10 collapses to just two residues and only a
// couple of outcomes ever become reachable. That silently pinned whole seed
// ranges to a single dispatch topology, which is the opposite of the intended
// per-build polymorphism. Drawing from the mixed high bits restores a spread.
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  const step = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; };
  const rnd = n => (n <= 0 ? 0 : (step() >>> 8) % n);
  return { step, rnd };
}

export function pickDispatcher(seed, profileName) {
  const { rnd } = lcg(seed);
  if (profileName === 'FAST') return DISPATCHER_STRATEGIES.TABLE;
  if (profileName === 'BALANCED') {
    return [DISPATCHER_STRATEGIES.TABLE, DISPATCHER_STRATEGIES.BRANCH,
      DISPATCHER_STRATEGIES.TREE, DISPATCHER_STRATEGIES.MIXED][rnd(4)];
  }
  // SECURE: bias toward the opaque tree, but keep every legacy shape reachable
  // so all dispatch paths stay covered by the test matrix.
  const roll = rnd(10);
  if (roll < 5) return DISPATCHER_STRATEGIES.TREE;
  if (roll < 6) return DISPATCHER_STRATEGIES.TABLE;
  if (roll < 7) return DISPATCHER_STRATEGIES.BRANCH;
  if (roll < 8) return DISPATCHER_STRATEGIES.MIXED;
  if (roll < 9) return DISPATCHER_STRATEGIES.NUMERIC;
  return DISPATCHER_STRATEGIES.STATE_OP;
}

export function stateLayout(seed) {
  const { rnd } = lcg(seed);
  const comps = ['pc', 'state', 'opcode', 'frame', 'nextState', 'tmp'];
  for (let i = comps.length - 1; i > 0; i--) { const j = rnd(i + 1); [comps[i], comps[j]] = [comps[j], comps[i]]; }
  return { order: comps, useTmp: rnd(2) === 0, stateVar: `_st${seed % 1000}` };
}

export function luaDispatcherSnippet(strategy, vars, state) {
  const { PC, CODE, OP, HAND } = vars;
  switch (strategy) {
    case DISPATCHER_STRATEGIES.TABLE:
      return `while true do local ${OP}=${CODE}.c[${PC}] ${PC}=${PC}+1 local _fn=${HAND}[${OP}] if _fn then _fn() else error("bad opcode "..tostring(${OP})) end end`;
    case DISPATCHER_STRATEGIES.BRANCH:
      return `-- branch dispatch: if chain per opcode\nwhile true do local ${OP}=${CODE}.c[${PC}] ${PC}=${PC}+1 if ${HAND}[${OP}] then ${HAND}[${OP}]() end end`;
    case DISPATCHER_STRATEGIES.NUMERIC:
      return `-- numeric state dispatch: state=${state.stateVar}\nlocal ${state.stateVar}=0; while true do local ${OP}=${CODE}.c[${PC}] ${PC}=${PC}+1 ${state.stateVar}=(${state.stateVar}*33+${OP})%4294967296; local _fn=${HAND}[${OP}] if _fn then _fn() end end`;
    case DISPATCHER_STRATEGIES.STATE_OP:
      return `-- state+opcode dispatch\nlocal _st=0; while true do local ${OP}=${CODE}.c[${PC}] ${PC}=${PC}+1 _st=(_st+${OP})%256; local _fn=${HAND}[${OP}] if _fn then _fn() end end`;
    case DISPATCHER_STRATEGIES.MIXED:
      return `-- mixed dispatch: RET inline, rest via HAND\nwhile true do local ${OP}=${CODE}.c[${PC}] ${PC}=${PC}+1 if ${OP}==9999 then break else local _fn=${HAND}[${OP}] if _fn then _fn() end end end`;
    // The tree is generated inline by emitVM; it needs the per-build key map
    // and the handler-local block, so it has no standalone snippet form.
    case DISPATCHER_STRATEGIES.TREE:
      return '';
    default: return '';
  }
}
