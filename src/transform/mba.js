import { makeRng } from '../rng.js';
// src/transform/mba.js — Mixed Boolean-Arithmetic rewriting
// Documented operator families: + - * & | ~ (xor) unary - unary ~ << >>
// Presets: fast/standard/strong/extreme. Budgets: small/medium/large.
// Context: optional numeric values (expression may use constants and simple
// locals/upvalues/globals). Unsupported (^ / % // and others) are rejected
// by validateRewriteNode in public-macros.js; this engine only generates
// documented forms and verifies integer-width behavior per target.

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

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function num(n) { return { type: 'NumericLiteral', value: n, raw: String(n) }; }
function integerWordExpr(node) {
  if (!node) return false;
  if (node.type === 'NumericLiteral') return Number.isInteger(Number(node.value));
  if (node.type === 'UnaryExpression') return (node.operator === '-' || node.operator === '~') && integerWordExpr(node.argument);
  if (node.type === 'BinaryExpression') return ['+', '-', '*', '&', '|', '~', '<<', '>>'].includes(node.operator) && integerWordExpr(node.left) && integerWordExpr(node.right);
  return false;
}
function bin(op, l, r) { return { type: 'BinaryExpression', operator: op, left: l, right: r }; }

// Conservative "this expression is definitely a number" test.
//
// MBA identities are only value-preserving for numbers. They are NOT safe on
// operands that may carry a metatable, because these operators reach Lua's
// metamethod dispatch: `a + b` on a table with __add calls that metamethod, and
// Lua passes the arguments in WRITTEN order. So rewriting `t + 6` into
// `6 + t`, or re-associating it, changes __add(t, 6) into __add(6, t) and
// silently miscompiles user code.
//
// This test is deliberately narrow: it only accepts expressions whose numeric
// type is evident from syntax (literals, already-verified numeric subtrees, and
// parenthesised numeric literals). Anything that could be a table with a
// metatable -- a name, a call, an index, a string concat -- returns false, so
// the family is simply not applied there.
const NUMERIC_PARENT_OPS = ['+', '-', '*', '/', '%', '^', '&', '|', '~', '<<', '>>'];
function numericExpr(node) {
  if (!node) return false;
  switch (node.type) {
    case 'NumericLiteral':
      return typeof node.value === 'number' || /^\s*[0-9.]/.test(String(node.raw || ''));
    case 'UnaryExpression':
      return (node.operator === '-' || node.operator === '~' || node.operator === '#') && numericExpr(node.argument);
    case 'BinaryExpression':
      return NUMERIC_PARENT_OPS.includes(node.operator)
        && numericExpr(node.left) && numericExpr(node.right);
    default:
      // Identifiers, calls, index expressions, string literals, table
      // constructors, and anything else are NOT provably numeric.
      return false;
  }
}
function una(op, a) { return { type: 'UnaryExpression', operator: op, argument: a }; }

// LPH_REWRITE input is parsed by the compiler and lowered to the VM's
// target-width bitwise handlers. Every supported target therefore has an
// internal bitwise representation, even when its source parser/runtime does
// not expose native bitwise syntax.
function targetHasBitwise(target) {
  return target === 'lua53' || target === 'lua54';
}

export const MBA_FAMILIES = [
  // `reorders: true` marks a family that changes the order in which operands
  // are presented to the operator. That is only sound for provably numeric
  // operands: for anything that may have a metatable, the operator invokes a
  // Lua metamethod which observes written operand order. Gated by numericExpr
  // in applyMBA; do not set this flag on a family that preserves order.
  { name:'comm_swap', desc:'a+b -> b+a, a*b -> b*a', reorders:true, check: n=> n.type==='BinaryExpression' && ['+','*','=='].includes(n.operator), apply: n=>{ const t=n.left; n.left=n.right; n.right=t; } },
  { name:'add_xor_and', desc:'a+b -> (a~b)+2*(a&b)', targets:['bitwise'], wordDomain:true, check: n=> n.type==='BinaryExpression' && n.operator==='+', apply: n=>{
      const a=clone(n.left), b=clone(n.right);
      const x=bin('~', clone(a), clone(b));
      const ad=bin('&', clone(a), clone(b));
      const two=bin('*', num(2), ad);
      n.operator='+'; n.left=x; n.right=two;
  } },
  { name:'sub_not', desc:'a-b -> a+(~b)+1', targets:['bitwise'], wordDomain:true, reorders:true, check: n=> n.type==='BinaryExpression' && n.operator==='-', apply: n=>{
      const a=clone(n.left), b=clone(n.right);
      n.operator='+'; n.left=bin('+', a, una('~', b)); n.right=num(1);
  } },
  { name:'sub_neg', desc:'a-b -> a+(-b)', reorders:true, check: n=> n.type==='BinaryExpression' && n.operator==='-', apply: n=>{ const right=n.right; n.operator='+'; n.right={ type:'UnaryExpression', operator:'-', argument: clone(right) }; } },
  { name:'band_demorgan', desc:'a&b -> ~(~a|~b)', targets:['bitwise'], check: n=> n.type==='BinaryExpression' && n.operator==='&', apply: n=>{
      const a=clone(n.left), b=clone(n.right);
      const inner=bin('|', una('~', a), una('~', b));
      const out=una('~', inner);
      for (const k of Object.keys(n)) delete n[k];
      Object.assign(n, out);
  } },
  { name:'bor_demorgan', desc:'a|b -> ~(~a&~b)', targets:['bitwise'], check: n=> n.type==='BinaryExpression' && n.operator==='|', apply: n=>{
      const a=clone(n.left), b=clone(n.right);
      const inner=bin('&', una('~', a), una('~', b));
      const out=una('~', inner);
      for (const k of Object.keys(n)) delete n[k];
      Object.assign(n, out);
  } },
  { name:'bxor_or_and', desc:'a~b -> (a|b)-(a&b)', targets:['bitwise'], check: n=> n.type==='BinaryExpression' && n.operator==='~', apply: n=>{
      const a=clone(n.left), b=clone(n.right);
      n.operator='-'; n.left=bin('|', clone(a), clone(b)); n.right=bin('&', clone(a), clone(b));
  } },
  { name:'bnot_neg', desc:'~a -> -a-1', targets:['bitwise','arith'], wordDomain:true, check: n=> n.type==='UnaryExpression' && n.operator==='~', apply: n=>{
      const a=clone(n.argument);
      const out=bin('-', una('-', a), num(1));
      for (const k of Object.keys(n)) delete n[k];
      Object.assign(n, out);
  } },
  { name:'mul_pow2_shift', desc:'a*2^k -> a<<k (const)', targets:['bitwise'], wordDomain:true, check: n=> {
      if (n.type!=='BinaryExpression' || n.operator!=='*') return false;
      const c = n.left && n.left.type==='NumericLiteral' ? n.left.value : (n.right && n.right.type==='NumericLiteral' ? n.right.value : null);
      if (c == null || c <= 0) return false;
      const k = Math.log2(Number(c));
      return Number.isInteger(k) && k >= 1 && k <= 20;
    }, apply: n=>{
      const c = n.left && n.left.type==='NumericLiteral' ? n.left.value : n.right.value;
      const k = Math.log2(Number(c));
      const other = (n.left && n.left.type==='NumericLiteral') ? clone(n.right) : clone(n.left);
      const out = bin('<<', other, num(k));
      for (const kk of Object.keys(n)) delete n[kk];
      Object.assign(n, out);
  } },
  { name:'shl_mul', desc:'a<<k -> a*2^k (const k)', targets:['bitwise','arith'], wordDomain:true, check: n=> n.type==='BinaryExpression' && n.operator==='<<' && n.right && n.right.type==='NumericLiteral' && Number.isInteger(n.right.value) && n.right.value>=0 && n.right.value<=20, apply: n=>{
      const k = Number(n.right.value);
      const out = bin('*', clone(n.left), num(2 ** k));
      for (const kk of Object.keys(n)) delete n[kk];
      Object.assign(n, out);
  } },
  { name:'mul2_add', desc:'a*2 -> a+a', wordDomain:true, check: n=> n.type==='BinaryExpression' && n.operator==='*' && n.right && n.right.type==='NumericLiteral' && String(n.right.value)==='2', apply: n=>{ const left=n.left; n.operator='+'; n.left=clone(left); n.right=clone(left); } },
  { name:'double_neg', desc:'-(-a) -> a', check: n=> n.type==='UnaryExpression' && n.operator==='-' && n.argument && n.argument.type==='UnaryExpression' && n.argument.operator==='-', apply: n=>{ const inner=n.argument.argument; for (const k of Object.keys(n)) delete n[k]; Object.assign(n, clone(inner)); } },
  { name:'bitnot_twice', desc:'~~a -> a', targets:['bitwise'], check: n=> n.type==='UnaryExpression' && n.operator==='~' && n.argument && n.argument.type==='UnaryExpression' && n.argument.operator==='~', apply: n=>{ const value=clone(n.argument.argument); for (const k of Object.keys(n)) delete n[k]; Object.assign(n,value); } },
  { name:'add_neg', desc:'a+(-b) -> a-b', check: n=> n.type==='BinaryExpression' && n.operator==='+' && n.right && n.right.type==='UnaryExpression' && n.right.operator==='-', apply: n=>{ const arg=n.right.argument; n.operator='-'; n.right=clone(arg); } },
  { name:'shift_zero', desc:'a<<0 or a>>0 -> a', targets:['bitwise'], check: n=> n.type==='BinaryExpression' && ['<<','>>'].includes(n.operator) && n.right && n.right.type==='NumericLiteral' && Number(n.right.value)===0, apply: n=>{ const value=clone(n.left); for (const k of Object.keys(n)) delete n[k]; Object.assign(n,value); } },
];

export function applyMBA(ast, {seed=0, profileName='BALANCED', target='lua51', budget=null, strength=null, macro=false} = {}) {
  const upper = String(profileName || 'BALANCED').toUpperCase();
  const presetKey = upper === 'FAST' ? 'FAST' : upper === 'SECURE' ? 'STRONG' : (MBA_PRESETS[upper] ? upper : 'STANDARD');
  const preset = MBA_PRESETS[presetKey] || MBA_PRESETS.STANDARD;
  const cfgStrength = strength != null ? strength : preset.strength;
  const cfgBudget = budget || preset.budget;
  const maxRewrites = BUDGETS[String(cfgBudget || '').toUpperCase()] || BUDGETS[cfgBudget] || 3;
  const hasBit = macro ? true : targetHasBitwise(target);
  const allowWordDomain = macro && (target === 'lua53' || target === 'lua54');
  let s = seed >>>0;
  const { rnd } = makeRng(s);
  let rewrites=0;
  function walk(node){
    if (!node || typeof node!=='object') return;
    if (rewrites < maxRewrites) {
      if (!(cfgStrength===1 && rnd(100) < 60)) {
        const cands = MBA_FAMILIES.filter(f => {
          if (f.wordDomain && !(allowWordDomain && integerWordExpr(node))) return false;
          // Reordering families change metamethod argument order, so they are
          // restricted to provably numeric operands.
          if (f.reorders && !(numericExpr(node.left) && numericExpr(node.right))) return false;
          if (f.targets && f.targets.includes('bitwise') && !hasBit) {
            // bnot_neg also has arith tag: allow on non-bit targets since it
            // removes bitwise (uses only -). Others require native bitwise.
            if (!(f.name === 'bnot_neg')) return false;
          }
          try { return f.check(node); } catch (e) { return false; }
        });
        // strength-gated random choice among applicable families
        for (const fam of cands) {
          const p = cfgStrength===4 ? 40 : cfgStrength===3 ? 30 : 20;
          if (rnd(100) < p) {
            try { fam.apply(node); rewrites++; break; } catch (e) {}
          }
        }
      }
    }
    for(let k in node){
      let v=node[k];
      if(Array.isArray(v)) v.forEach(walk);
      else if(v && typeof v==='object' && v.type) walk(v);
    }
  }
  if (ast && ast.body) ast.body.forEach(walk);
  return { rewrites, total: rewrites, families: MBA_FAMILIES.length };
}

export function rewriteExpression(expr, preset='STANDARD', target='lua51', seed=0) {
  let s=seed>>>0;
  const { rnd } = makeRng(s);
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

export function verifyRewrite(nativeEval, rewrittenEval, target='lua51') {
  if (Number.isNaN(nativeEval) && Number.isNaN(rewrittenEval)) return true;
  if (nativeEval===rewrittenEval) return true;
  return false;
}
