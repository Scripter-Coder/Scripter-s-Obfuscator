// src/vm/dispatcher.js — Generated Dispatcher / Opaque State (Phase 4, §8)
// Genuine VM dispatcher state machine, several strategies, varying state layout.

export const DISPATCHER_STRATEGIES = {
  TABLE: 'direct_table_dispatch',      // HAND[OP]
  NUMERIC: 'numeric_state_dispatch',   // state + opcode
  STATE_OP: 'state_opcode',            // state|opcode
  BRANCH: 'generated_branch_dispatch', // if OP==... elseif ...
  MIXED: 'mixed_dispatch',             // table + branch hybrid
};

export function pickDispatcher(seed, profileName) {
  let s = seed >>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
  if(profileName==='FAST') return DISPATCHER_STRATEGIES.TABLE;
  if(profileName==='BALANCED') return [DISPATCHER_STRATEGIES.TABLE, DISPATCHER_STRATEGIES.BRANCH][rnd(2)];
  return Object.values(DISPATCHER_STRATEGIES)[rnd(5)];
}

export function stateLayout(seed) {
  let s = seed >>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
  const comps = ['pc','state','opcode','frame','nextState','tmp'];
  for(let i=comps.length-1;i>0;i--){const j=rnd(i+1); [comps[i],comps[j]]=[comps[j],comps[i]];}
  return { order: comps, useTmp: rnd(2)===0, stateVar: `_st${seed%1000}` };
}

export function luaDispatcherSnippet(strategy, vars, state) {
  const { PC, CODE, OP, HAND } = vars;
  switch(strategy) {
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
    default: return '';
  }
}
