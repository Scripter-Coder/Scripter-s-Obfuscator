// src/vm/code-layout.js
//
// Per-build control-flow layout hardening for the VM bytecode.
//
// WHAT THIS ATTACKS
// -----------------
// Every devirtualizer for a stack VM starts the same way: read the chunk's
// instruction array in address order, split it into basic blocks, and rebuild
// the source from that CFG. That keeps working even when opcode values,
// handler bodies and dispatch topology are randomized per build, because the
// linear skeleton is the one thing an attacker still gets for free.
//
// This module removes that free lunch, per build:
//
//   1. BLOCK RELOCATION. A per-build subset of basic blocks is moved out of
//      line to the end of the chunk. The slot each one vacated becomes an
//      explicit JMP trampoline, so control flow no longer follows the address
//      order.
//
//   2. HOLE FILLING. Each vacated slot is refilled with unreachable but
//      well-formed code built from the real instruction set and the real
//      constant pool, so it decodes into plausible statements rather than
//      noise. Some of it is shaped like a loop. The relocated bodies are
//      emitted in a per-build shuffled order, so the tail is not source order
//      either.
//
//   3. IDENTIFIER SCRAMBLING. Constant-pool indices and lexical ids are passed
//      through one per-build permutation shared by every chunk, so the ids in
//      the bytecode are not the ids the compiler assigned. Upvalue cells are
//      keyed by the same id space in every chunk, so a single build-wide
//      permutation preserves capture and sharing while a chunk can no longer be
//      read on its own.
//
// Soundness rests on one rule: nothing injected is reachable. Reachability is
// computed from the chunk entry using the VM's own control-flow semantics, and
// only the space vacated by RELOCATED blocks is filled - never space that real
// code can fall into. Relocation is safe because every edge into a moved block
// (fall-through, conditional jump, unconditional jump, and the trampolines the
// CFG rewriter adds) is resolved through the old-PC to new-PC map after the
// rebuild.

const COND_OPS = new Set(['JIF', 'JIT', 'JNIL', 'ANDK', 'ORK']);
const UNCOND_OP = 'JMP';
const TERM_OPS = new Set(['RET', 'RETP', 'CRASH']);
const JUMP_OPS = new Set([UNCOND_OP, 'JIF', 'JIT', 'JNIL', 'ANDK', 'ORK']);

// Instruction operands that index the encrypted constant pool.
const REF_OPS = new Set(['CONST', 'NUMK', 'GLOB', 'GSET', 'HGLOB', 'LOADK_ADD', 'LOADK_MUL']);
// Instruction operands that name a lexical / upvalue slot.
const ID_OPS = new Set(['LLOAD', 'LNEW', 'LSET', 'ULOAD', 'USET']);

export function wordSize(inst) {
  return inst.args && inst.args.length ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Per-build RNG. Mirrors the emitter's LCG + avalanche so a --seed build
// reproduces byte-identically.
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    let x = s;
    x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  };
  return {
    next,
    rnd: (n) => (n <= 0 ? 0 : next() % n),
    rndInt: (a, b) => a + next() % (b - a + 1),
  };
}

function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.rnd(i + 1);
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reachability, with the VM's own control-flow semantics.
// ---------------------------------------------------------------------------
function reachablePcs(insts, pcToIndex) {
  const reach = new Set();
  const stack = [1];
  while (stack.length) {
    const pc = stack.pop();
    if (reach.has(pc)) continue;
    const i = pcToIndex.get(pc);
    if (i === undefined) continue;   // target past the end; preserved verbatim
    reach.add(pc);
    const inst = insts[i];
    const op = String(inst.op);
    if (TERM_OPS.has(op)) continue;
    if (op === UNCOND_OP) {
      if (inst.args.length) stack.push(inst.args[0]);
      continue;
    }
    if (COND_OPS.has(op) && inst.args.length) stack.push(inst.args[0]);
    stack.push(pc + wordSize(inst));
  }
  return reach;
}

// ---------------------------------------------------------------------------
// Junk synthesis.
//
// Every sequence is STACK NEUTRAL and lands on an instruction boundary. They
// are only ever emitted into space vacated by a relocated block, so their
// runtime behaviour is unobservable; they exist to be decoded.
// ---------------------------------------------------------------------------
function junkBody(rng, refsCount) {
  const ref = () => (refsCount > 0 ? 1 + rng.rnd(refsCount) : 0);
  const num = () => rng.rndInt(1, 999);
  const w = (op, a) => (a === undefined ? { op, args: [] } : { op, args: [a] });
  switch (rng.rnd(9)) {
    case 0: return [w('NEWTAB'), w('CONST', ref()), w('CONST', ref()), w('TSET')];
    case 1: return [w('NEWTAB'), w('NUMK', num()), w('CONST', ref()), w('TSET')];
    case 2: return [w('NEWTAB'), w('NUMK', num()), w('NUMK', num()), w('TSET')];
    case 3: return [w('NUMK', num()), w('NUMK', num()), w(rng.rnd(2) ? 'ADD' : 'MUL'), w('POP')];
    case 4: return [w('NUMK', num()), w('NUMK', num()), w('SUB'), w('POP')];
    case 5: return [w('NEWTAB'), w('CONST', ref()), w('NEWTAB'), w('TSET')];
    case 6: return [w('CONST', ref()), w('NUMK', num()), w('CONCAT'), w('POP')];
    case 7: return [w('NEWTAB'), w('CONST', ref()), w('CONST', ref()), w('TSET'),
                    w('NEWTAB'), w('NUMK', num()), w('CONST', ref()), w('TSET')];
    default: return [w('CONST', ref()), w('POP'), w('DUP'), w('POP')];
  }
}

// ---------------------------------------------------------------------------
// Main pass
// ---------------------------------------------------------------------------
/**
 * @param {Array} insts  instruction objects: {op, args:number[], meta, line}
 * @param {Object} opts  {seed, relocateRatio, fillRatio, refsCount, maxLoops}
 * @returns {{insts:Array, stats:Object}}
 */
export function hardenInstructionStream(insts, opts) {
  const o = opts || {};
  const stats = { blocks: 0, relocated: 0, junkBlocks: 0, junkWords: 0, realWords: 0 };
  if (!insts || insts.length < 6) return { insts: insts || [], stats };

  // Every entry in the rebuilt stream carries the ORIGINAL pc it came from, or
  // a synthetic negative pc for injected code. Both are resolved through one
  // old-PC to new-PC map, so real jumps and injected jumps are fixed up by the
  // same code path.
  let synth = 0;
  const work = insts.map((inst) => ({
    op: inst.op,
    args: (inst.args || []).slice(),
    meta: inst.meta || {},
    line: inst.line || 0,
    __src: null,
  }));
  let pc = 1;
  for (const inst of work) { inst.__src = pc; pc += wordSize(inst); }

  const pcToIndex = new Map();
  for (let i = 0; i < work.length; i++) pcToIndex.set(work[i].__src, i);

  const reach = reachablePcs(work, pcToIndex);
  if (!reach.has(1)) return { insts: work, stats };
  for (let i = 0; i < work.length; i++) stats.realWords += wordSize(work[i]);

  // ---- basic blocks over the reachable ranges ---------------------------
  const leaderSet = new Set([1]);
  for (const inst of work) {
    const op = String(inst.op);
    if (JUMP_OPS.has(op) && inst.args.length && pcToIndex.has(inst.args[0])) leaderSet.add(inst.args[0]);
    if (!TERM_OPS.has(op) && op !== UNCOND_OP) {
      const nx = inst.__src + wordSize(inst);
      if (pcToIndex.has(nx)) leaderSet.add(nx);
    }
  }
  const leaders = [...leaderSet].filter((p) => reach.has(p)).sort((a, b) => a - b);
  stats.blocks = leaders.length;
  if (leaders.length < 3) return { insts: work, stats };

  const rng = makeRng(((o.seed || 0) >>> 0) ^ 0x5f3a91);
  const ratio = Math.max(0, Math.min(0.8, o.relocateRatio == null ? 0.3 : o.relocateRatio));
  if (ratio <= 0) return { insts: work, stats };

  // Block spans, in instruction indices.
  const indexByLeader = leaders.map((p) => pcToIndex.get(p));
  const blocks = [];
  for (let b = 0; b < indexByLeader.length; b++) {
    blocks.push({ startPc: leaders[b], from: indexByLeader[b], to: b + 1 < indexByLeader.length ? indexByLeader[b + 1] : work.length });
  }
  for (const blk of blocks) {
    blk.words = 0;
    for (let i = blk.from; i < blk.to; i++) blk.words += wordSize(work[i]);
  }

  const movable = shuffled(blocks.slice(1), rng)
    .filter((blk) => blk.to > blk.from && blk.words >= 1)
    // A block whose last instruction falls through into whatever follows it can
    // only be moved if the successor is a real instruction to jump back to.
    .filter((blk) => blk.to < work.length
      || TERM_OPS.has(String(work[blk.to - 1].op))
      || String(work[blk.to - 1].op) === UNCOND_OP)
    .slice(0, Math.max(1, Math.floor((blocks.length - 1) * ratio)));

  const movedFrom = new Map();   // instruction index -> block
  for (const blk of movable) {
    for (let i = blk.from; i < blk.to; i++) movedFrom.set(i, blk);
  }
  stats.relocated = movable.length;

  // ---- rebuild the linear stream -----------------------------------------
  const linear = [];
  const inject = (inst) => {
    inst.__src = -(++synth);
    inst.meta = {};
    inst.line = 0;
    inst.__injected = true;
    linear.push(inst);
    return inst;
  };
  const fillRatio = o.fillRatio == null ? 1 : o.fillRatio;
  const maxLoops = o.maxLoops == null ? 1 : o.maxLoops;
  const refsCount = o.refsCount || 0;
  // Fill a vacated slot. Granularity is per junk BODY, and the budget is
  // counted in WORDS to match the block sizes it is filling: adding whole
  // multi-body regions against a small word target overshot by ~6x and doubled
  // the artifact.
  const fill = (words) => {
    const target = Math.max(1, Math.round(words * fillRatio));
    let placed = 0;
    let guard = 0;
    while (placed < target && guard++ < 256) {
      const withLoop = stats.junkBlocks < maxLoops && rng.rnd(3) === 0;
      const region = junkBody(rng, refsCount);
      if (withLoop) {
        // A body then an unconditional back edge. Decoded, this is
        // `while true do <body> end`, which is what makes a linear reader emit
        // an unbreakable loop it can never justify.
        region.push({ op: UNCOND_OP, args: [], __jmpSelf: true });
      }
      let firstSynthetic = null;
      for (let k = 0; k < region.length; k++) {
        const inst = region[k];
        inject(inst);
        if (k === 0) firstSynthetic = inst.__src;
        if (inst.__jmpSelf) inst.args = [firstSynthetic];
        delete inst.__jmpSelf;
      }
      placed += region.reduce((a, inst) => a + wordSize(inst), 0);
      stats.junkBlocks++;
      stats.junkWords += region.length;
    }
  };

  for (let i = 0; i < work.length; i++) {
    const blk = movedFrom.get(i);
    if (blk) {
      if (i === blk.from) {
        // Explicit edge for every predecessor, including the fall-through that
        // used to reach this block. The trampoline carries a synthetic source
        // pc so it never claims to BE the relocated block's entry.
        linear.push({ op: UNCOND_OP, args: [blk.startPc], meta: {}, line: 0, __src: -(++synth) });
        fill(blk.words);
      }
      continue;
    }
    linear.push(work[i]);
  }

  // ---- out-of-line region: junk first, then the moved bodies -------------
  // Junk first, so a dangling jump that lands past the end of the chunk lands
  // past the moved bodies rather than inside one.
  if (movable.length) {
    fill(rng.rndInt(4, 12));
    for (const blk of shuffled(movable, rng)) {
      for (let i = blk.from; i < blk.to; i++) linear.push(work[i]);
      // The out-of-line bodies are emitted in a per-build shuffled order, so a
      // block that used to fall through into its neighbour would now fall into
      // an unrelated one. Re-state that edge explicitly; it resolves through
      // the same old-PC to new-PC map, so it lands on the neighbour's new home
      // whether the neighbour moved too or not.
      const lastOp = String(work[blk.to - 1].op);
      if (!TERM_OPS.has(lastOp) && lastOp !== UNCOND_OP && blk.to < work.length) {
        linear.push({ op: UNCOND_OP, args: [work[blk.to].__src], meta: {}, line: 0, __src: -(++synth) });
      }
    }
    fill(rng.rndInt(4, 12));
  }

  // ---- final positions and target fixup ----------------------------------
  const map = new Map();
  let pos = 1;
  for (const inst of linear) {
    inst.__pc = pos;
    if (!map.has(inst.__src)) map.set(inst.__src, pos);
    pos += wordSize(inst);
  }
  const finalWords = pos - 1;
  stats.finalWords = finalWords;
  // A trampoline's target is the relocated block's ORIGINAL entry pc, which is
  // also carried by the block's first instruction - now at its new home. A
  // target with no instruction (a label at the very end of the chunk) is left
  // exactly as it was, so its behaviour is unchanged.
  for (const inst of linear) {
    const op = String(inst.op);
    if (JUMP_OPS.has(op) && inst.args.length) {
      const t = map.get(inst.args[0]);
      if (t != null) inst.args = [t];
    }
    inst.oldPc = inst.__pc;
    delete inst.meta.targetPc;
    delete inst.__src;
    delete inst.__pc;
  }
  verifyUnreachable(linear, stats);
  return { insts: linear, stats };
}

// Assertion: nothing this module injected may be reachable from the chunk
// entry. If it ever is, the filler is not filler and the artifact is wrong.
// Cheap (one linear pass), so it runs on every build rather than under a flag.
function verifyUnreachable(linear) {
  const injected = new Set();
  let pos = 1;
  const check = [];
  for (const inst of linear) {
    if (inst.__injected) injected.add(pos);
    check.push({ op: inst.op, args: inst.args.slice() });
    pos += wordSize(inst);
  }
  const pcToIndex = new Map();
  pos = 1;
  for (let i = 0; i < check.length; i++) { pcToIndex.set(pos, i); pos += wordSize(check[i]); }
  const reach = reachablePcs(check, pcToIndex);
  for (const p of injected) {
    if (reach.has(p)) throw new Error('layout hardening: injected instruction reachable at pc ' + p);
  }
}

// ---------------------------------------------------------------------------
// Identifier scrambling
// ---------------------------------------------------------------------------
function permutation(values, rng) {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.rnd(i + 1);
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  const map = new Map();
  values.forEach((v, i) => map.set(v, out[i]));
  return map;
}

/**
 * Build one permutation for constant-pool indices and one for lexical ids,
 * shared by every chunk in the build.
 *
 * @param {Object} build   the compile() result (needs refs, seed, prechecks)
 * @param {Array<{chunk:Object,stream:Array}>} pending  hardened streams
 *
 * Ids appear OUTSIDE the instruction stream as well - a chunk's parameter list
 * binds arguments into scope slots by id, and a VM(NONE) bridge records the
 * ids its body captures. Those move with the instructions, or the parameters
 * and captures silently read empty cells.
 */
export function applyIdentifierPermutation(build, pending) {
  const instLists = (pending || []).map((p) => p.stream);
  const refs = build.refs || [];
  const refIds = [];
  for (let i = 1; i <= refs.length; i++) refIds.push(i);
  const idSet = new Set();
  for (const list of instLists) {
    for (const inst of list) {
      if (ID_OPS.has(String(inst.op)) && inst.args && inst.args.length) idSet.add(inst.args[0]);
    }
  }
  const lexIds = [...idSet];

  const rng = makeRng(((build.seed || 0) >>> 0) ^ 0x2b7d13);
  const refMap = refIds.length > 1 ? permutation(refIds, rng) : null;
  const idMap = lexIds.length > 1 ? permutation(lexIds, rng) : null;
  let changed = 0;

  const remapId = (v) => {
    if (!idMap || v == null) return v;
    const n = idMap.get(v);
    return n === undefined ? v : n;
  };

  for (const list of instLists) {
    for (const inst of list) {
      if (!inst.args || !inst.args.length) continue;
      const op = String(inst.op);
      const m = REF_OPS.has(op) ? refMap : (ID_OPS.has(op) ? idMap : null);
      if (!m) continue;
      const v = m.get(inst.args[0]);
      if (v !== undefined && v !== inst.args[0]) { inst.args[0] = v; changed++; }
    }
  }
  for (const p of pending || []) {
    const ch = p.chunk;
    if (!ch) continue;
    if (Array.isArray(ch.params)) ch.params = ch.params.map(remapId);
  }
  for (const nf of build.nativeFns || []) {
    for (const cap of nf.stackCaptures || []) cap.id = remapId(cap.id);
    for (const cap of nf.upvalCaptures || []) cap.id = remapId(cap.id);
  }
  // The constant ranges MOVE with the indices that name them. Without this the
  // permutation would only re-point instructions at different vault entries,
  // which changes what the program computes rather than how it is written.
  if (refMap) {
    const moved = new Array(refs.length);
    for (let i = 0; i < refs.length; i++) moved[refMap.get(i + 1) - 1] = refs[i];
    refs.length = 0;
    for (const r of moved) refs.push(r);
  }
  // Precheck expectations name constant indices, so they move with the pool.
  if (refMap && build.prechecks) {
    for (const pc of build.prechecks) {
      if (!pc.expected) continue;
      for (let i = 0; i < pc.expected.length; i++) {
        const v = refMap.get(pc.expected[i]);
        if (v !== undefined) pc.expected[i] = v;
      }
    }
  }
  return { changed };
}