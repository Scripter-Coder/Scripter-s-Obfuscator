// src/ast/transform.js — AST transformation framework (Phase 4)
// Separate from VM lowering. Passes: expression rewriting, branch rewriting,
// boolean normalization, arithmetic rewriting, control-flow normalization.
// Each pass is seed-deterministic and profile-aware.

export function makeAstTransforms(seed, profileName) {
  let s = seed >>> 0;
  const rnd = (n) => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
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
    // arithmetic rewriting: a + b -> b + a (commutative), a * 2 -> a + a, etc.
    if (tx.enabled.arithmetic && node.type === 'BinaryExpression') {
      if ((node.operator === '+' || node.operator === '*' || node.operator === '==') && tx.rnd(100) < 20) {
        // swap operands (commutative)
        const tmp = node.left; node.left = node.right; node.right = tmp;
        rewrites++;
      } else if (node.operator === '*' && node.right && node.right.type === 'NumericLiteral' && String(node.right.value) === '2' && tx.rnd(100) < 30) {
        // a * 2 -> a + a  (where a is left)
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
