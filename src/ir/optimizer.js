// src/ir/optimizer.js — conservative production-safe IR optimizer.
// Passes only rewrite patterns whose semantics are explicit in the IR.

function isPure(inst) {
  return !!inst && ['LOADK','LOADN','LOADNIL','LOADBOOL','MOVE'].includes(inst.op);
}

export function constFolding(blocks) {
  let folded = 0;
  for (const b of blocks) {
    for (let i = 0; i + 2 < b.insts.length; i++) {
      // Stack-VM production IR form: NUMK, NUMK, arithmetic. Values are
      // explicitly annotated by the pipeline, so folding cannot guess about
      // tables/metamethods or other observable expressions.
      const sa=b.insts[i], sb=b.insts[i+1], so=b.insts[i+2];
      if(sa?.op==='NUMK' && sb?.op==='NUMK' && sa.meta?.stackValue!==undefined && sb.meta?.stackValue!==undefined && ['ADD','SUB','MUL','DIV','MOD','POW'].includes(so.op)) {
        const av=sa.meta.stackValue, bv=sb.meta.stackValue;
        if(!(so.op==='DIV' && bv===0) && !(so.op==='MOD' && bv===0)) {
          let value;
          switch(so.op){case 'ADD':value=av+bv;break;case 'SUB':value=av-bv;break;case 'MUL':value=av*bv;break;case 'DIV':value=av/bv;break;case 'MOD':value=av%bv;break;case 'POW':value=av**bv;break;}
          if(typeof value==='number' && Number.isFinite(value) && (so.meta?.allowFold!==false)) { b.insts.splice(i,3,{op:'NUMK',a:null,meta:{stackValue:value,folded:true,oldPc:sa.meta?.oldPc,targetPc:sa.meta?.targetPc}}); folded++; i--; continue; }
        }
      }
      const a = b.insts[i], c = b.insts[i + 1], op = b.insts[i + 2];
      if (!a || !c || !op || !['LOADK','LOADN'].includes(a.op) || !['LOADK','LOADN'].includes(c.op)) continue;
      const av = a.meta && a.meta.value, bv = c.meta && c.meta.value;
      if (typeof av !== 'number' || typeof bv !== 'number') continue;
      if (!['ADD','SUB','MUL','DIV','MOD','POW'].includes(op.op)) continue;
      if (op.a != null && op.a !== a.a) continue;
      if (op.b != null && op.b !== c.a) continue;
      let value;
      switch (op.op) {
        case 'ADD': value = av + bv; break;
        case 'SUB': value = av - bv; break;
        case 'MUL': value = av * bv; break;
        case 'DIV': if (bv === 0) continue; value = av / bv; break;
        case 'MOD': if (bv === 0) continue; value = av % bv; break;
        case 'POW': value = av ** bv; break;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      b.insts.splice(i, 3, { op:'LOADN', a:a.a, meta:{ value } });
      folded++; i--;
    }
  }
  return { changed: folded > 0, stats: { folded } };
}

export function deadCode(blocks) {
  let removed = 0;
  for (const b of blocks) {
    const live = new Set();
    for (let i = b.insts.length - 1; i >= 0; i--) {
      const inst = b.insts[i];
      if (inst.op === 'MOVE' && inst.b != null && !live.has(inst.a)) {
        b.insts.splice(i, 1); removed++; continue;
      }
      if (inst.def) for (const r of inst.def) live.delete(r);
      if (inst.use) for (const r of inst.use) live.add(r);
      if (inst.a != null && ['MOVE','LOADK','LOADN','LOADNIL','LOADBOOL'].includes(inst.op)) live.add(inst.a);
    }
  }
  return { changed: removed > 0, stats: { removed } };
}

export function redundantMoveElim(blocks) {
  let elim = 0;
  for (const b of blocks) {
    for (let i = 0; i < b.insts.length - 1; i++) {
      const a = b.insts[i], c = b.insts[i + 1];
      if (a.op === 'MOVE' && c.op === 'MOVE' && a.a === c.b && a.b === c.a) {
        b.insts.splice(i, 2); elim += 2; i--;
      } else if (a.op === 'MOVE' && c.op === 'MOVE' && a.b === c.b) {
        b.insts.splice(i, 1); elim++; i--;
      }
    }
  }
  return { changed: elim > 0, stats: { elim } };
}

export function runOptimizer(funcIR, { profile } = {}) {
  const passes = [constFolding, redundantMoveElim, deadCode];
  let totalChanged = false;
  const stats = {};
  for (const p of passes) {
    const r = p(funcIR.blocks || []);
    totalChanged = totalChanged || r.changed;
    stats[p.name] = r.stats;
  }
  return { changed: totalChanged, stats, profile: profile || 'BALANCED' };
}
