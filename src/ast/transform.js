import { makeRng } from '../rng.js';
// src/ast/transform.js — AST transformation framework (Phase 4)
// Separate from VM lowering. Passes: expression rewriting, branch rewriting,
// boolean normalization, arithmetic rewriting, control-flow normalization.
// Each pass is seed-deterministic and profile-aware.

export function makeAstTransforms(seed, profileName) {
  let s = seed >>> 0;
  const { rnd } = makeRng(s);
  const rndInt = (a,b) => a + rnd(b-a+1);

  // profile controls which passes run
  const enabled = {
    arithmetic: profileName !== 'FAST',
    boolean: profileName === 'SECURE',
    branch: profileName !== 'FAST',
    localNorm: true,
  };

  return { rnd, rndInt, enabled, seed };
}

// Walk and mutate AST in-place (post-parse, pre-compile)
export function applyAstTransforms(ast, { seed, profileName }) {
  if (!ast || !ast.body) return ast;
  const tx = makeAstTransforms(seed, profileName);
  let rewrites=0, branches=0, bools=0;

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;
    const numericLiteral = (n) => !!n && n.type === 'NumericLiteral';
    const literal = (n) => !!n && ['NumericLiteral', 'StringLiteral', 'BooleanLiteral', 'NilLiteral'].includes(n.type);
    // Arithmetic operand order is observable through Lua metamethods. Only
    // swap literals; swapping arbitrary expressions can change __add/__mul
    // argument order and is not semantics-preserving.
    if (tx.enabled.arithmetic && node.type === 'BinaryExpression') {
      const safeSwap = (node.operator === '+' || node.operator === '*')
        ? numericLiteral(node.left) && numericLiteral(node.right)
        : node.operator === '==' && literal(node.left) && literal(node.right);
      if (safeSwap && tx.rnd(100) < 20) {
        const tmp = node.left; node.left = node.right; node.right = tmp;
        rewrites++;
      } else if (node.operator === '*' && numericLiteral(node.left) && node.right && numericLiteral(node.right) && String(node.right.value) === '2' && tx.rnd(100) < 30) {
        const left = node.left;
        node.operator = '+';
        node.left = JSON.parse(JSON.stringify(left));
        node.right = JSON.parse(JSON.stringify(left));
        rewrites++;
      }
    }
    // boolean normalization: not (a == b) -> a ~= b  (when enabled)
    if (tx.enabled.boolean && node.type === 'UnaryExpression' && node.operator === 'not' && node.argument && node.argument.type === 'BinaryExpression') {
      const map = { '==':'~=', '~=':'==', '<':'>=', '>=':'<', '<=':'>', '>':'<=' };
      if (map[node.argument.operator] && tx.rnd(100) < 25) {
        node.type = 'BinaryExpression';
        node.operator = map[node.argument.operator];
        node.left = node.argument.left;
        node.right = node.argument.right;
        delete node.argument;
        bools++;
      }
    }
    // branch rewriting: if (cond) -> if (not (not cond))  (double negation, normalized later)
    // we keep minimal to avoid breaking

    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walkNode);
      else if (v && typeof v === 'object' && v.type) walkNode(v);
    }
  }

  for (const stmt of ast.body) walkNode(stmt);
  // also walk function bodies via same recursion (already via walkNode)
  return { ast, stats: { rewrites, branches, bools } };
}
