// src/ir/cfg.js — Control-Flow Graph builder + transforms (spec §9)
// Builds CFG from IR blocks, supports: block split, reorder, dispatcher transitions,
// opaque state vars, branch inversion, jump encoding, flattening (where safe).

export class CFG {
  constructor(funcIR) {
    this.func = funcIR;
    this.blocks = funcIR.blocks;
    this.entry = funcIR.blocks[0] || null;
  }

  // Build CFG edges from JMP/JIF/JIT/JNIL etc.
  build() {
    const idMap = new Map(this.blocks.map(b => [b.id, b]));
    for (const b of this.blocks) {
      b.succ = []; b.pred = [];
    }
    for (const b of this.blocks) {
      const last = b.insts[b.insts.length - 1];
      if (!last) continue;
      if (last.op === 'JMP' && last.target != null) {
        const t = idMap.get(last.target);
        if (t) { b.succ.push(t.id); t.pred.push(b.id); }
      } else if (['JIF','JIT','JNIL','ANDK','ORK','TFOR_LOOP','FOR_LOOP'].includes(last.op) && last.target != null) {
        const t = idMap.get(last.target);
        if (t) { b.succ.push(t.id); t.pred.push(b.id); }
        // fall-through
        const fallId = b.id + 1;
        const f = idMap.get(fallId);
        if (f) { b.succ.push(f.id); f.pred.push(b.id); }
      } else {
        // fall-through to next block if exists
        const nid = b.id + 1;
        const n = idMap.get(nid);
        if (n) { b.succ.push(n.id); n.pred.push(b.id); }
      }
    }
    return this;
  }

  // Jump-chain folding: JMP → JMP collapses
  foldJumps() {
    let changed = false;
    const idMap = new Map(this.blocks.map(b => [b.id, b]));
    for (const b of this.blocks) {
      const last = b.insts[b.insts.length - 1];
      if (!last || last.op !== 'JMP') continue;
      let tgt = idMap.get(last.target);
      while (tgt && tgt.insts.length === 1 && tgt.insts[0].op === 'JMP') {
        last.target = tgt.insts[0].target;
        tgt = idMap.get(last.target);
        changed = true;
      }
    }
    if (changed) this.build();
    return changed;
  }

  // Dead block elimination (unreachable)
  sweepUnreachable() {
    const reachable = new Set();
    const q = [this.entry?.id].filter(Boolean);
    const idMap = new Map(this.blocks.map(b => [b.id, b]));
    while (q.length) {
      const id = q.shift();
      if (reachable.has(id)) continue;
      reachable.add(id);
      const b = idMap.get(id);
      if (!b) continue;
      for (const s of b.succ) if (!reachable.has(s)) q.push(s);
    }
    const before = this.blocks.length;
    this.func.blocks = this.blocks.filter(b => reachable.has(b.id));
    this.blocks = this.func.blocks;
    this.build();
    return before !== this.blocks.length;
  }

  // Basic block splitting at instruction index
  splitBlock(blockId, atInstIdx) {
    const b = this.blocks.find(x => x.id === blockId);
    if (!b || atInstIdx <= 0 || atInstIdx >= b.insts.length) return null;
    const newId = Math.max(...this.blocks.map(x => x.id)) + 1;
    const nb = { id: newId, insts: b.insts.splice(atInstIdx), succ: [...b.succ], pred: [b.id], phis: [] };
    // rewrite original block to JMP new
    b.insts.push({ op: 'JMP', target: newId });
    b.succ = [newId];
    this.blocks.push(nb);
    this.build();
    return nb;
  }

  // Serialize to flat code with label positions (compat with old patchLabels)
  // Returns { code:[], labelPos:{} } where code is word stream old-style
  // Used only for bridging to existing emitVM until full bytecode format ships.
  toLegacyCode(opcodeMap) {
    // Assign sequential PC to each inst (1 word for op, +1 if arg)
    const labelPos = {};
    const code = [];
    let pc = 1;
    for (const b of this.blocks) {
      labelPos[b.id] = pc;
      for (const inst of b.insts) {
        const oc = opcodeMap[inst.op];
        if (oc == null) throw new Error('unknown op ' + inst.op);
        code.push(oc);
        if (inst.a != null) code.push(inst.a);
        else if (inst.target != null) code.push(inst.target); // will be patched to PC
        pc += (inst.a != null || inst.target != null) ? 2 : 1;
      }
    }
    // patch jump targets from block id -> code PC
    let idx = 0;
    for (const b of this.blocks) {
      for (const inst of b.insts) {
        if (inst.target != null) code[idx + 1] = labelPos[inst.target];
        idx += (inst.a != null || inst.target != null) ? 2 : 1;
      }
    }
    return { code, labelPos };
  }
}

// Light transform: reorder blocks deterministically by seed (structural diversity)
export function reorderBlocks(cfg, seed) {
  // Fisher-Yates with seed LCG — preserves entry at 0, shuffles rest
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
  const rest = cfg.blocks.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  cfg.func.blocks = [cfg.blocks[0], ...rest];
  cfg.blocks = cfg.func.blocks;
  // re-id sequentially to keep mapping simple
  cfg.blocks.forEach((b, i) => b.id = i);
  cfg.build();
}
