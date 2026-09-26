// src/transform/control-flow.js — native control-flow flattening for VM(NONE).
//
// WHY THIS EXISTS
// ---------------
// CONTROL_FLOW on a virtualized function is implemented by applySafeCfgRewriting,
// which rewrites the VM instruction stream (`ctx.code`) by splitting jump
// trampolines. A VM(NONE) body is emitted as loader-level native Lua source and
// never becomes a chunk, so that implementation cannot apply to it.
//
// Rather than silently dropping the transform -- which would tell a caller their
// control flow had been flattened when nothing happened -- this performs a real
// transform on the native source: each if/elseif/else chain is rewritten into a
// state-dispatch loop, so branch bodies are no longer lexically nested under the
// conditional and control reaches them through a state selector.
//
//   if C1 then A elseif C2 then B else D end
//
// becomes
//
//   do local s = (C1) and 1 or ((C2) and 2 or 3)
//     while true do
//       if s == 1 then s = 0; A break end
//       if s == 2 then s = 0; B break end
//       s = 0; D break
//     end
//   end
//
// ORDERING -- WHY THIS RUNS LAST
// -----------------------------
// Earlier revisions planned the rewrite against pristine AST spans and rendered
// branch text through a callback that applied the other native transforms
// (EXTRACT / REWRITE_NAMECALLS / the upvalue bridge). That is unsound: those
// transforms change text LENGTH, so slicing a sub-range by its original offsets
// out of the already-rewritten text tears the text apart (observed: a condition
// rendering as `(__lph) and 1 or (2)` with the rest of the rewrite appearing
// elsewhere in the body). Rebasing regions did not fix it -- the problem is that
// two coordinate systems have to be reconciled after a length-changing rewrite.
//
// So this runs on the FINAL emitted text, after every other native transform has
// been applied, and re-parses it. There is then exactly one coordinate system in
// play and no rebase is needed. The trade-off is one extra parse of a single
// function body.
//
// The transform FAILS CLOSED, for the whole function, when semantics cannot be
// preserved: any branch body containing `break`, `continue`, or `goto` that is
// not owned by a nested function. Those statements target an enclosing loop or a
// label, so moving the body into a dispatch loop would silently retarget them. A
// partial transform is treated as failure, never as success.

const SKIP_KEYS = new Set(['loc', 'range', 'comments', 'raw', 'value', 'operator', 'indexer', 'type']);

// Statements that must not be relocated, because their target is an enclosing
// construct rather than the branch itself.
const UNSAFE_STATEMENTS = new Set(['BreakStatement', 'ContinueStatement', 'GotoStatement', 'LabelStatement']);

function offsetFactory(source) {
  const lines = String(source || '').split('\n');
  const starts = [0];
  for (let i = 0; i < lines.length; i++) starts.push(starts[i] + lines[i].length + 1);
  return (line, column) => starts[Math.max(0, line - 1)] + column;
}

function nodeRange(node, offsetAt) {
  if (!node || !node.loc || !node.loc.start || !node.loc.end) return null;
  return { start: offsetAt(node.loc.start.line, node.loc.start.column), end: offsetAt(node.loc.end.line, node.loc.end.column) };
}

// Every if/elseif/else chain in a function body, without descending into nested
// function bodies -- those have their own control flow and their own break/goto
// targets, and flattening across that boundary would be incorrect.
function collectChains(fnNode) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return;
    if (node.type === 'IfStatement') found.push(node);
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue;
      visit(node[k]);
    }
  };
  visit((fnNode && fnNode.body) || []);
  return found;
}

function contains(outer, inner) {
  return outer.start <= inner.start && inner.end <= outer.end && (outer.start !== inner.start || outer.end !== inner.end);
}

// A statement that must not be relocated, if any, in this subtree.
function findUnsafe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const c of node) { const hit = findUnsafe(c); if (hit) return hit; } return null; }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return null; // separate scope
  if (UNSAFE_STATEMENTS.has(node.type)) return node.type;
  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k)) continue;
    const hit = findUnsafe(node[k]);
    if (hit) return hit;
  }
  return null;
}

function namesInUse(node) {
  const used = new Set();
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'Identifier' && n.name) used.add(n.name);
    for (const k of Object.keys(n)) { if (SKIP_KEYS.has(k)) continue; visit(n[k]); }
  };
  visit(node);
  return used;
}

// The top-level function declarations in a chunk. A native body is emitted as one
// of these, so each is flattened independently.
function topLevelFunctions(ast) {
  const out = [];
  for (const st of (ast.body || [])) {
    if (st.type === 'FunctionDeclaration' || st.type === 'FunctionExpression') out.push(st);
  }
  return out;
}

/**
 * Flattens control flow in already-final native source.
 *
 * @param {string} text     final emitted text for one native function
 * @param {object} options
 * @param {Function} options.parse   (source) => AST, the project's luaparse wrapper
 * @param {number}  options.seed    per-build seed for temporary naming
 * @returns {{changed, text, chains, flattened, reason}}
 */
export function flattenNativeSource(text, options) {
  const source = String(text || '');
  const unchanged = { changed: false, text: source, chains: 0, flattened: 0, reason: null };
  if (!source.trim()) return unchanged;

  const parse = options && options.parse;
  if (typeof parse !== 'function') return { ...unchanged, reason: 'no parser available' };

  let ast;
  try { ast = parse(source); }
  catch (e) { return { ...unchanged, reason: 'native source did not parse: ' + String(e && e.message ? e.message : e).slice(0, 120) }; }

  const offsetAt = offsetFactory(source);
  const all = [];
  for (const fn of topLevelFunctions(ast)) {
    for (const st of collectChains(fn)) {
      const r = nodeRange(st, offsetAt);
      if (r) all.push({ node: st, start: r.start, end: r.end });
    }
  }
  if (!all.length) return unchanged;

  all.sort((a, b) => (a.end - a.start) - (b.end - b.start)); // innermost first

  // Only OUTERMEST chains produce edits: an outer chain's text already contains
  // the flattened form of everything nested inside it, so inner edits would be
  // applied twice.
  const outermost = all.filter((s) => !all.some((o) => o !== s && contains(o, s)));

  // ---- safety: any unsafe statement fails the whole function ---------------
  for (const s of all) {
    for (const clause of s.node.clauses || []) {
      const hit = findUnsafe(clause.body);
      if (hit) return { ...unchanged, chains: all.length, reason: 'branch body contains ' + hit };
    }
  }

  const used = namesInUse(ast);
  let tempN = 0;
  const makeTemp = () => {
    for (;;) {
      const candidate = 'lphcf' + ((options.seed | 0) % 9973) + 'z' + (tempN++).toString(36);
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
  };

  // `done` marks a chain whose flattened text has already been produced, so it is
  // never produced twice. Memoising by start offset alone is not enough: the text
  // for a chain depends on which ancestors are being rendered (an ancestor's body
  // must not have that ancestor re-spliced into it), so a cached value computed
  // under one context cannot be reused under another.
  const done = new Set();
  const textOf = new Map();

  // Render a source range with the flattened text of any chain nested inside it
  // spliced in. This is what flattens deeply nested conditionals too.
  //
  // Only chains that are not inside the range currently being produced are
  // considered. Without that restriction an inner chain is flattened once as the
  // body of its parent and again on its own, and the two copies overlap and tear
  // the text apart (observed: `endd 1 or (2) while true do ...`).
  const renderRange = (start, end, exclude) => {
    const inRange = all.filter((s) => s.start >= start && s.end <= end && !(exclude && exclude.has(s.start)));
    if (!inRange.length) return source.slice(start, end);
    // Keep only the OUTERMOST chains in this range. If chain X is rendered, its
    // flattened text already contains every chain nested inside X, so splicing a
    // descendant again would emit that text twice and tear the output (observed:
    // four dispatch loops and two copies of a `return` for three chains).
    const skipDescendants = new Set();
    for (const o of inRange) for (const i of inRange) if (o !== i && o.start <= i.start && i.end <= o.end) skipDescendants.add(i.start);
    const inner = inRange.filter((s) => !skipDescendants.has(s.start));
    if (!inner.length) return source.slice(start, end);
    let out = source.slice(start, end);
    for (const s of inner.sort((a, b) => b.start - a.start)) {
      const at = s.start - start;
      out = out.slice(0, at) + flatten(s, exclude) + out.slice(at + (s.end - s.start));
    }
    return out;
  };

  function flatten(s, exclude) {
    if (done.has(s.start)) return textOf.get(s.start);
    done.add(s.start);
    const nextExclude = new Set(exclude || []);
    nextExclude.add(s.start);
    const text = build(s, nextExclude);
    textOf.set(s.start, text);
    return text;
  }

  function build(s, exclude) {
    const clauses = s.node.clauses || [];
    if (!clauses.length) return '';

    const lastIsElse = clauses[clauses.length - 1].condition == null;
    const condClauses = lastIsElse ? clauses.slice(0, -1) : clauses;
    const elseClause = lastIsElse ? clauses[clauses.length - 1] : null;

    const tmp = makeTemp();
    const bodyTextOf = (clause) => {
      const body = (clause && clause.body) || [];
      if (!body.length) return '';
      const first = nodeRange(body[0], offsetAt);
      const last = nodeRange(body[body.length - 1], offsetAt);
      if (!first || !last) return '';
      return renderRange(first.start, last.end, exclude);
    };
    // `break` is only legal where control can reach it. A branch ending in
    // `return` leaves the function there, so a following `break` is an
    // "expression expected" syntax error rather than dead code.
    const terminatorOf = (clause) => {
      const body = (clause && clause.body) || [];
      const last = body[body.length - 1];
      return last && last.type === 'ReturnStatement' ? '' : 'break';
    };

    // Selector: evaluates each condition exactly once and in order, so
    // short-circuiting and side-effect order are preserved. N+1 selects the
    // trailing else (implicit and empty when the chain has none).
    let sel = String(condClauses.length + 1);
    for (let i = condClauses.length - 1; i >= 0; i--) {
      const cr = nodeRange(condClauses[i].condition, offsetAt);
      if (!cr) { return ''; }
      sel = '(' + renderRange(cr.start, cr.end, exclude) + ') and ' + (i + 1) + ' or (' + sel + ')';
    }

    const parts = ['do local ' + tmp + ' = ' + sel, 'while true do'];
    for (let i = 0; i < condClauses.length; i++) {
      parts.push('if ' + tmp + ' == ' + (i + 1) + ' then ' + tmp + '=0; ' + bodyTextOf(condClauses[i]) + ' ' + terminatorOf(condClauses[i]) + ' end');
    }
    // Catch-all arm. Without it a selector value matching no arm falls through
    // every `if` and spins the dispatch loop forever -- which is exactly what a
    // chain with no `else` produced, since the selector could reach N+1 while
    // only arms 1..N existed.
    const elseBody = elseClause ? bodyTextOf(elseClause) : '';
    const elseTerm = elseClause && terminatorOf(elseClause) === '' ? '' : 'break';
    // The catch-all `end` closes the `while`; the next closes the `do`. The
    // function's own `end` is outside the replaced span and is left untouched, so
    // emitting a second one here would orphan it.
    parts.push(tmp + '=0; ' + elseBody + ' ' + elseTerm + ' end');
    parts.push('end');
    const out = parts.join(' ');
    return out;
  }

  let out = source;
  for (const s of outermost.sort((a, b) => b.start - a.start)) {
    const text = flatten(s, null);
    if (!text) continue;
    out = out.slice(0, s.start) + text + out.slice(s.end);
  }
  if (out === source) return { ...unchanged, chains: all.length };
  return { changed: true, text: out, chains: all.length, flattened: outermost.length, reason: null };
}
