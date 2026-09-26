// src/transform/mba.js — Mixed Boolean-Arithmetic rewriting (Phase 5, §14)

export const MBA_PRESETS = {
  FAST: { budget: 'SMALL', strength: 1 },
  STANDARD: { budget: 'MEDIUM', strength: 2 },
  STRONG: { budget: 'LARGE', strength: 3 },
  EXTREME: { budget: 'LARGE', strength: 4 },
};

export const BUDGETS = {
  SMALL: 1,
  MEDIUM: 3,
  LARGE: 5,
};

// Real MBA families — each is a provable equivalent under lua51 double semantics
export const MBA_FAMILIES = [
  { name:'comm_swap', desc:'a+b -> b+a, a*b -> b*a', check: n=> n.type==='BinaryExpression' && ['+','*','=='].includes(n.operator), apply: n=>{ const t=n.left; n.left=n.right; n.right=t; } },
  { name:'mul2_add', desc:'a*2 -> a+a', check: n=> n.type==='BinaryExpression' && n.operator==='*' && n.right && n.right.type==='NumericLiteral' && String(n.right.value)==='2', apply: n=>{ const left=n.left; n.operator='+'; n.left=JSON.parse(JSON.stringify(left)); n.right=JSON.parse(JSON.stringify(left)); } },
  { name:'sub_neg', desc:'a-b -> a+(-b)', check: n=> n.type==='BinaryExpression' && n.operator==='-', apply: n=>{ const right=n.right; n.operator='+'; n.right={ type:'UnaryExpression', operator:'-', argument: JSON.parse(JSON.stringify(right)) }; } },
  { name:'add_neg', desc:'a+(-b) -> a-b', check: n=> n.type==='BinaryExpression' && n.operator==='+' && n.right && n.right.type==='UnaryExpression' && n.right.operator==='-', apply: n=>{ const arg=n.right.argument; n.operator='-'; n.right=JSON.parse(JSON.stringify(arg)); } },
  { name:'double_neg', desc:'-(-a) -> a', check: n=> n.type==='UnaryExpression' && n.operator==='-' && n.argument && n.argument.type==='UnaryExpression' && n.argument.operator==='-', apply: n=>{ const inner=n.argument.argument; Object.keys(n).forEach(k=> delete n[k]); Object.assign(n, JSON.parse(JSON.stringify(inner))); } },
  { name:'pow2_mul', desc:'a^2 -> a*a', check: n=> n.type==='BinaryExpression' && n.operator==='^' && n.right && n.right.type==='NumericLiteral' && String(n.right.value)==='2', apply: n=>{ const left=n.left; n.operator='*'; n.left=JSON.parse(JSON.stringify(left)); n.right=JSON.parse(JSON.stringify(left)); } },
  { name:'mul1_identity', desc:'a*1 -> a', check: n=> n.type==='BinaryExpression' && n.operator==='*' && ((n.right && n.right.type==='NumericLiteral' && String(n.right.value)==='1') || (n.left && n.left.type==='NumericLiteral' && String(n.left.value)==='1')), apply: n=>{ const other = (n.right && n.right.type==='NumericLiteral' && String(n.right.value)==='1') ? n.left : n.right; Object.keys(n).forEach(k=> delete n[k]); Object.assign(n, JSON.parse(JSON.stringify(other))); } },
];

export function applyMBA(ast, {seed=0, profileName='BALANCED', target='lua51', budget=null, strength=null} = {}) {
  const preset = MBA_PRESETS[profileName] || MBA_PRESETS.STANDARD;
  const cfgStrength = strength != null ? strength : preset.strength;
  const cfgBudget = budget || preset.budget;
  const maxRewrites = BUDGETS[cfgBudget] || 3;
  let s = seed >>>0;
  const rnd = n=>{ s=(s*1664525+1013904223)>>>0; return s % n; };
  let total=0;
  let rewrites=0;
  function walk(node){
    if (!node || typeof node!=='object') return;
    // budget check
    if (rewrites >= maxRewrites) {
      // still walk children but don't rewrite
      for(let k in node){ let v=node[k]; if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v==='object' && v.type) walk(v); }
      return;
    }
    // strength gate: FAST does little, BALANCED medium
    if (cfgStrength===1 && rnd(100) < 60) {
      for(let k in node){ let v=node[k]; if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v==='object' && v.type) walk(v); }
      return;
    }
    // try families
    let applied=false;
    for(let fam of MBA_FAMILIES){
      // target check: don't use bitwise/power identities if target lacks it (lua51 has ^ as pow, so okay; but no bit ops)
      if (target==='lua51' && fam.name==='xor_identity') continue;
      if (fam.check(node) && rnd(100) < (cfgStrength===4? 40 : cfgStrength===3? 30 : 20)) {
        // apply
        try { fam.apply(node); rewrites++; applied=true; total++; break; } catch(e){}
      }
    }
    // recurse
    for(let k in node){
      let v=node[k];
      if(Array.isArray(v)) v.forEach(walk);
      else if(v && typeof v==='object' && v.type) walk(v);
    }
  }
  if (ast && ast.body) ast.body.forEach(walk);
  return { rewrites, total, families: MBA_FAMILIES.length };
}

export function rewriteExpression(expr, preset='STANDARD', target='lua51', seed=0) {
  let s=seed>>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
  const cfg = MBA_PRESETS[preset] || MBA_PRESETS.STANDARD;
  if (cfg.strength===1 && rnd(100)<70) return expr;
  if (cfg.budget==='SMALL') return expr;
  if (target==='lua51' && expr.includes('^') && expr.includes('bit')) return expr;
  if (/\+/.test(expr) && rnd(100)<40) {
    const parts = expr.split('+');
    if(parts.length===2) return `${parts[1].trim()} + ${parts[0].trim()}`;
  }
  return expr;
}

// Evaluate native vs rewritten exact target semantics (preserve precision)
export function verifyRewrite(nativeEval, rewrittenEval, target='lua51') {
  // For numbers, require exact equality (including NaN handling) for target
  if (Number.isNaN(nativeEval) && Number.isNaN(rewrittenEval)) return true;
  if (nativeEval===rewrittenEval) return true;
  // For floats, allow epsilon only if target docs guarantee? Here strict.
  return false;
}
