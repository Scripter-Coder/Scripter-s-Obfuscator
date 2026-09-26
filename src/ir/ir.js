// src/ir/ir.js — Target-independent IR (spec §3, §5, §18)
// Single source of truth between parser → optimizer → virtualization lowering.
// Not a 1:1 mirror of Lua 5.3 bytecode: typed constants, SSA-ish, explicit operands.

// IR opcode set — superset of vm-bytecode.js OP_NAMES, extended per spec §4
export const IR_OPS = [
  'MOVE', 'LOADK', 'LOADN', 'LOADNIL', 'LOADBOOL', // const / literal
  'GETGLOBAL', 'SETGLOBAL', 'GETUPVAL', 'SETUPVAL', 'GETTAB', 'SETTAB', 'NEWTAB', 'SETLIST_APPEND',
  'SELF', // method lookup
  'ADD','SUB','MUL','DIV','MOD','POW','CONCAT','EQ','NEQ','LT','LE','GT','GE','LEN','NEG','NOT',
  'TEST', 'TESTSET', // branch primitives
  'JMP','JIF','JIT','JNIL','ANDK','ORK',
  'CALL','TAILCALL','RETURN','VARARG','CLOSURE','CLOSE', // frame
  'FOR_PREP','FOR_LOOP','TFOR_PREP','TFOR_LOOP', // loop lowering helpers (lowered to JMP+blocks)
  'PUSHSC','POPSC','DUP','POP','SWAP','UNPK','UNPKR', // stack helpers retained for compat, lowered to registers
  'STACKNEW','STACKGET','STACKSET','STACKLEN','STACKPACK','STACKUNPACK','STACKCLEAR','STACKADAPT','ENVLOAD','CRASH',
];

// IR instruction: { op: string, a,b,c: operands (register ids or constant idx), extra, loc, meta }
export function makeInst(op, args = {}, loc = null) {
  return { op, ...args, loc, meta: {} };
}

// Function IR: { params:[id], vararg:bool, blocks:[Block], constPool, upvalues:[], lineInfo }
export function makeFuncIR({ params = [], vararg = false, name = '<chunk>' } = {}) {
  return {
    name,
    params,
    vararg,
    blocks: [],
    consts: [], // { type:'string'|'number'|'bool'|'nil', value, ref }
    upvalues: [],
    nextReg: 0,
    maxReg: 0,
  };
}

// Basic block: { id, insts:[], succ:[], pred:[], phis:[] }
export function makeBlock(id) {
  return { id, insts: [], succ: [], pred: [], phis: [] };
}

// Typed constant pool (spec §14)
export function addConst(funcIR, type, value) {
  const idx = funcIR.consts.length;
  funcIR.consts.push({ type, value, idx, encoding: null });
  return idx;
}

// Helpers: map luaparse literal -> typed const
export function constForLiteral(funcIR, node) {
  // node.type: StringLiteral, NumericLiteral, BooleanLiteral, NilLiteral
  if (node.type === 'StringLiteral') return addConst(funcIR, 'string', node.value ?? node.raw);
  if (node.type === 'NumericLiteral') return addConst(funcIR, 'number', node.value);
  if (node.type === 'BooleanLiteral') return addConst(funcIR, 'bool', node.value);
  if (node.type === 'NilLiteral') return addConst(funcIR, 'nil', null);
  return null;
}
