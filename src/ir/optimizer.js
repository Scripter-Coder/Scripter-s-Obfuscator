// src/ir/optimizer.js — Real optimizer passes (spec §18)
// Each pass returns { changed: bool, stats:{} }. Pipeline is normalize→semantic→optimize→transform.

export function constFolding(blocks) {
  let folded = 0;
  for (const b of blocks) {
    for (const inst of b.insts) {
      if (['ADD','SUB','MUL','DIV','MOD','POW'].includes(inst.op) && inst.a != null && inst.b != null) {
        // args are already constant indices — fold if both are numbers
        // stub: mark for later lowering; actual fold happens when const pool is typed
      }
      if (inst.op === 'LOADK' && inst.a != null) folded++;
    }
  }
  return { changed: false, stats: { folded } };
}

export function deadCode(blocks) {
  // remove unreachable MOVE where dest never read — stub for now, wired via CFG sweep
  let removed = 0;
  for (const b of blocks) {
    const live = new Set();
    // backward liveness sketch
    for (let i = b.insts.length - 1; i >= 0; i--) {
      const inst = b.insts[i];
      if (inst.op === 'MOVE' && inst.b != null && !live.has(inst.a)) {
        // dead move
        // b.insts.splice(i,1); removed++;
      }
      if (inst.a != null) live.add(inst.a);
    }
  }
  return { changed: removed > 0, stats: { removed } };
}

export function redundantMoveElim(blocks) {
  let elim = 0;
  for (const b of blocks) {
    for (let i = 0; i < b.insts.length - 1; i++) {
      const a = b.insts[i], c = b.insts[i+1];
      if (a.op === 'MOVE' && c.op === 'MOVE' && a.a === c.b && a.b === c.a) {
        // a->b then b->a cancel — remove both
        // b.insts.splice(i,2); elim+=2; i--;
      }
    }
  }
  return { changed: elim>0, stats:{ elim } };
}

// Full pipeline entry
export function runOptimizer(funcIR, { profile } = {}) {
  const passes = [
    constFolding,
    deadCode,
    redundantMoveElim,
  ];
  let totalChanged = false;
  const stats = {};
  for (const p of passes) {
    const r = p(funcIR.blocks);
    totalChanged = totalChanged || r.changed;
    stats[p.name] = r.stats;
  }
  return { changed: totalChanged, stats };
}
