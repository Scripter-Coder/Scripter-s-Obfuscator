// src/transform/namecall.js — documented V15 TRANSFORM(REWRITE_NAMECALLS).
//
// Rewrites  object:method(args)  into  object.method(object, args)  as a real
// AST transform, so the result flows through the existing compiler/IR pipeline
// (OPAL, ONYX) and can be emitted as source edits for VM(NONE).
//
// Semantics that must be preserved:
//   * self/receiver identity          -> the receiver is passed as arg 1
//   * single evaluation of receiver   -> never evaluated twice
//   * evaluation order                -> receiver, then index, then args
//   * __index metamethod on the object-> a normal `.` index is still performed
//   * side effects                    -> no expression is dropped or duplicated
//
// Because Lua has no expression-level temporaries, a receiver is rewritten in
// one of exactly two provably-safe ways:
//
//   1. The receiver is a bare Identifier. Rewriting to `R.m(R, ...)` reads the
//      same global/local twice with no side effect in between, which is
//      unobservable. This is the documented `object:method(...)` case.
//
//   2. The receiver is not a bare Identifier but the call sits at the
//      leftmost evaluation position of its enclosing statement. A temporary is
//      declared immediately before that statement, which is provably the same
//      point in the evaluation order.
//
// Anything else is left untouched. An untransformed namecall is still exactly
// correct Lua; skipping only means the transform did not fire there.

const SKIP_CHILD_KEYS = new Set(['loc', 'range', 'comments', 'raw', 'value', 'operator', 'indexer', 'type']);

function isCall(node) {
  return !!node && (node.type === 'CallExpression' || node.type === 'StringCallExpression' || node.type === 'TableCallExpression');
}

function isNamecall(node) {
  return isCall(node) && node.base && node.base.type === 'MemberExpression' && node.base.indexer === ':';
}

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

function freshName(used, prefix) {
  let i = 1;
  while (used.has(prefix + i)) i++;
  const name = prefix + i;
  used.add(name);
  return name;
}

function collectUsedNames(node, used) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Identifier') used.add(node.name);
  for (const key of Object.keys(node)) {
    if (SKIP_CHILD_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((item) => collectUsedNames(item, used));
    else if (child && typeof child === 'object' && child.type) collectUsedNames(child, used);
  }
}

// Walks from `node` down to `target` following only positions that are
// evaluated FIRST. Returns true when the target is the leftmost thing the
// enclosing expression evaluates.
function isLeftmostExpressionPath(node, target) {
  if (node === target) return true;
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'MemberExpression' || node.type === 'IndexExpression') return isLeftmostExpressionPath(node.base, target);
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') return isLeftmostExpressionPath(node.left, target);
  return false;
}

function isLeftmostInStatement(statement, callNode) {
  if (!statement) return false;
  switch (statement.type) {
    case 'ExpressionStatement':
    case 'CallStatement':
      return isLeftmostExpressionPath(statement.expression || statement, callNode);
    case 'ReturnStatement':
      return (statement.arguments || []).length > 0 && isLeftmostExpressionPath(statement.arguments[0], callNode);
    case 'LocalStatement':
      return (statement.init || []).length > 0 && isLeftmostExpressionPath(statement.init[0], callNode);
    case 'AssignmentStatement':
      return (statement.init || []).length > 0 && isLeftmostExpressionPath(statement.init[0], callNode);
    default:
      return false;
  }
}

function setBaseInStatement(statement, callNode, newBase) {
  switch (statement.type) {
    case 'ExpressionStatement':
    case 'CallStatement':
      statement.expression = newBase;
      return;
    case 'ReturnStatement':
      statement.arguments[0] = newBase;
      return;
    case 'LocalStatement':
      statement.init[0] = newBase;
      return;
    case 'AssignmentStatement':
      statement.init[0] = newBase;
      return;
    default:
      throw new Error('REWRITE_NAMECALLS cannot place this call in its statement');
  }
}

/**
 * Apply REWRITE_NAMECALLS to a single function.
 *
 * Returns { changed, count, skipped, edits, inserts, fnStart } where edits and
 * inserts are absolute source ranges for VM(NONE) source emission.
 */
export function applyRewriteNamecalls(fnNode, options = {}) {
  const source = String(options.source || '');
  // Other transforms (the VM(NONE) upvalue bridge) may already have rewritten
  // parts of this source. When a temporary declaration has to copy a receiver
  // expression, it must copy the rewritten text, not the original, or the two
  // rewrites would collide on the same range.
  const renderText = typeof options.renderText === 'function'
    ? options.renderText
    : (start, end) => source.slice(start, end);
  const offsetAt = offsetFactory(source);
  const fnStart = fnNode && fnNode.loc ? offsetAt(fnNode.loc.start.line, fnNode.loc.start.column) : 0;
  const body = Array.isArray(fnNode && fnNode.body) ? fnNode.body : [];
  const used = new Set();
  collectUsedNames(fnNode, used);

  const edits = [];
  const inserts = [];
  const pendingDecls = [];
  const receivers = [];
  let count = 0;
  let skipped = 0;

  // Collect namecalls grouped by their enclosing top-level statement, so the
  // temporary declarations can be inserted in the right place and order.
  const byStatement = new Map();
  const seenCalls = new Set();
  function scan(node, statement) {
    if (!node || typeof node !== 'object') return;
    if (isNamecall(node) && !seenCalls.has(node)) {
      seenCalls.add(node);
      if (!byStatement.has(statement)) byStatement.set(statement, []);
      byStatement.get(statement).push(node);
    }
    for (const key of Object.keys(node)) {
      if (SKIP_CHILD_KEYS.has(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((item) => scan(item, statement));
      else if (child && typeof child === 'object' && child.type) scan(child, statement);
    }
  }
  for (const statement of body) scan(statement, statement);

  // Post-order: rewrite namecalls nested inside a receiver BEFORE the
  // enclosing one, so a temporary for an inner call is declared first.
  function rewriteIn(node, target, newNode) {
    if (!node || typeof node !== 'object') return false;
    for (const key of Object.keys(node)) {
      if (SKIP_CHILD_KEYS.has(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) {
        const index = child.indexOf(target);
        if (index >= 0) { child[index] = newNode; return true; }
        for (const item of child) if (rewriteIn(item, target, newNode)) return true;
      } else if (child && typeof child === 'object' && child.type) {
        if (child === target) { node[key] = newNode; return true; }
        if (rewriteIn(child, target, newNode)) return true;
      }
    }
    return false;
  }

  for (const [statement, calls] of byStatement.entries()) {
    if (!statement) continue;
    // Deepest first so nested receiver rewrites happen before their parent.
    const ordered = calls.slice().sort((a, b) => depth(b) - depth(a));
    for (const call of ordered) {
      const member = call.base;
      const recv = member.base;
      const methodName = member.identifier && member.identifier.name;
      if (!recv || !methodName) { skipped++; continue; }

      // If another transform (the VM(NONE) upvalue bridge) already owns any
      // part of this receiver's source range, leave the namecall untouched. An
      // untransformed namecall is still exactly correct Lua, and the two
      // rewrites would otherwise collide on overlapping ranges.
      if (typeof options.overlapsRewrite === 'function' && nodeRange(recv, offsetAt) &&
          options.overlapsRewrite(nodeRange(recv, offsetAt).start, nodeRange(recv, offsetAt).end)) {
        skipped++;
        continue;
      }

      let receiverRef;
      if (recv.type === 'Identifier') {
        receiverRef = recv.name;
      } else if (isLeftmostInStatement(statement, call) && nodeRange(recv, offsetAt) && nodeRange(statement, offsetAt)) {
        const temp = freshName(used, '__lph_nc_recv_');
        pendingDecls.push({ statement, name: temp, recv });
        receiverRef = temp;
      } else {
        skipped++;
        continue;
      }

      const newMember = {
        type: 'MemberExpression',
        indexer: '.',
        identifier: { type: 'Identifier', name: methodName },
        base: { type: 'Identifier', name: receiverRef },
        loc: member.loc,
      };
      const newArgs = [{ type: 'Identifier', name: receiverRef }].concat(call.arguments || []);
      const newCall = {
        type: 'CallExpression',
        base: newMember,
        arguments: newArgs,
        isMulti: call.isMulti,
        isMethod: false,
        loc: call.loc,
      };

      // AST mutation
      if (call === statement.expression || (statement.arguments && statement.arguments[0] === call) ||
          (statement.init && statement.init[0] === call)) {
        setBaseInStatement(statement, call, newCall);
      } else if (!rewriteIn(statement, call, newCall)) {
        skipped++;
        continue;
      }

      // Source edits for VM(NONE)
      const recvRange = nodeRange(recv, offsetAt);
      const methodStart = nodeRange(member.identifier, offsetAt);
      const callRange = nodeRange(call, offsetAt);
      if (recvRange && methodStart && callRange) {
        // `recv : method`  ->  `recv . method`
        edits.push({ start: recvRange.end, end: methodStart.start, text: '.' });
        const argRanges = (call.arguments || []).map((arg) => nodeRange(arg, offsetAt)).filter(Boolean);
        if (recv.type === 'Identifier') {
          // receiver text is unchanged, only the argument list gains self
          if (argRanges.length) inserts.push({ position: argRanges[0].start, text: receiverRef + ',' });
          else inserts.push({ position: callRange.end - 1, text: receiverRef });
        } else {
          // temporary declaration before the statement, receiver replaced by it
          inserts.push({ position: nodeRange(statement, offsetAt).start, text: 'local ' + receiverRef + '=' + renderText(recvRange.start, recvRange.end) + ';' });
          edits.push({ start: recvRange.start, end: recvRange.end, text: receiverRef });
          receivers.push({ start: recvRange.start, end: recvRange.end });
          if (argRanges.length) inserts.push({ position: argRanges[0].start, text: receiverRef + ',' });
          else inserts.push({ position: callRange.end - 1, text: receiverRef });
        }
      }
      count++;
    }
  }

  // Emit the temporary declarations into the AST.
  const grouped = new Map();
  for (const decl of pendingDecls) {
    if (!grouped.has(decl.statement)) grouped.set(decl.statement, []);
    grouped.get(decl.statement).push(decl);
  }
  for (const [statement, decls] of grouped.entries()) {
    const index = body.indexOf(statement);
    if (index < 0) continue;
    const locals = decls.map((decl) => ({
      type: 'LocalStatement',
      variables: [{ type: 'Identifier', name: decl.name }],
      init: [decl.recv],
    }));
    body.splice(index, 0, ...locals);
  }

  // Guard against duplicate source operations at the same offset.
  const dedupeEdits = new Map();
  for (const e of edits) dedupeEdits.set(e.start + ':' + e.end + ':' + e.text, e);
  const dedupeInserts = new Map();
  for (const i of inserts) dedupeInserts.set(i.position + ':' + i.text, i);

  return {
    changed: count > 0,
    count,
    skipped,
    receivers,
    fnStart,
    edits: Array.from(dedupeEdits.values()).sort((a, b) => b.start - a.start),
    inserts: Array.from(dedupeInserts.values()).sort((a, b) => b.position - a.position),
  };
}

/** Applies the recorded source edits/inserts to a VM(NONE) function slice. */
export function applyNamecallSource(source, result) {
  if (!result || !result.changed || typeof result.fnStart !== 'number') return source;
  const ops = result.edits.map((edit) => ({ pos: edit.start - result.fnStart, end: edit.end - result.fnStart, text: edit.text }))
    .concat(result.inserts.map((insert) => ({ pos: insert.position - result.fnStart, end: insert.position - result.fnStart, text: insert.text })));
  let out = String(source);
  for (const op of ops.sort((a, b) => (b.pos - a.pos) || (b.end - a.end))) {
    if (op.pos < 0 || op.end < op.pos || op.end > out.length) throw new Error('REWRITE_NAMECALLS source edit is outside the function');
    out = out.slice(0, op.pos) + op.text + out.slice(op.end);
  }
  return out;
}

function depth(node) {
  let d = 0;
  let cur = node;
  while (cur && cur.base) { d++; cur = cur.base; }
  return d;
}
