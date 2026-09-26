// src/transform/native-upvalues.js — VM(NONE) upvalue bridging.
//
// A VM(NONE) body is emitted as loader-level source, outside the lexical scope
// of its virtualized parent. Every reference to a captured local would
// therefore resolve to a same-named global and silently produce the wrong
// value. This transform rewrites those references into accessor calls that read
// and write the live VM cell pushed by the loader wrapper:
//
//     return x        ->  return UP("x")
//     x = expr        ->  UPSET("x", expr)
//
// Everything else is left untouched. A function is rewritten only when EVERY
// reference to a captured name is in a position this transform can prove
// equivalent; otherwise the whole function keeps its original behaviour so a
// rewrite can never be applied inconsistently.

const SKIP_CHILD_KEYS = new Set(['loc', 'range', 'comments', 'raw', 'value', 'operator', 'indexer', 'type']);

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

/**
 * @param {object} fnNode        function AST whose body is being emitted natively
 * @param {object} options
 * @param {Function} options.resolve       name -> { kind, id }
 * @param {Function} options.isCaptured    name -> boolean
 * @param {string} options.source          parse source the AST came from
 * @param {string} options.upAccessor      emitted name of the read accessor
 * @param {string} options.setAccessor     emitted name of the write accessor
 */
export function bridgeNativeUpvalues(fnNode, options) {
  const source = String(options.source || '');
  const offsetAt = offsetFactory(source);
  const resolve = options.resolve;
  const up = options.upAccessor;
  const set = options.setAccessor;
  const fnStart = fnNode && fnNode.loc ? offsetAt(fnNode.loc.start.line, fnNode.loc.start.column) : 0;

  const captured = new Set();
  for (const name of Object.keys(options.captures || {})) captured.add(name);
  if (!captured.size) return { changed: false, count: 0, fnStart, edits: [], inserts: [] };

  const edits = [];
  const inserts = [];
  let usable = true;
  const touched = new Set();

  function rewriteIdentifier(node, parent, key) {
    if (!captured.has(node.name) || touched.has(node)) return;
    const isMember = parent && parent.type === 'MemberExpression' && key === 'identifier';
    const isTableKey = parent && (parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key';
    if (isMember || isTableKey) { touched.add(node); return; }

    if (parent && parent.type === 'AssignmentStatement') {
      const index = (parent.variables || []).indexOf(node);
      if (index < 0) { touched.add(node); return; }
      // luaparse omits `operator` for a plain `=` assignment.
      var op = parent.operator == null ? '=' : parent.operator;
      if (op !== '=' || (parent.variables || []).length !== 1) { usable = false; return; }
      const idRange = nodeRange(node, offsetAt);
      const initNode = (parent.init || [])[index];
      const initRange = initNode && nodeRange(initNode, offsetAt);
      if (!idRange || !initRange) { usable = false; return; }
      // Replace the whole `x = init` span: the target becomes the call head,
      // the `=` and original target text are dropped, and a `)` is appended
      // after the (separately rewritten) initialiser.
      edits.push({ start: idRange.start, end: initRange.start, text: set + '(' + JSON.stringify(node.name) + ',' });
      inserts.push({ position: initRange.end, text: ')' });
      touched.add(node);
      return;
    }
    const idRange = nodeRange(node, offsetAt);
    if (!idRange) { usable = false; return; }
    edits.push({ start: idRange.start, end: idRange.end, text: up + '(' + JSON.stringify(node.name) + ')' });
    touched.add(node);
  }

  function walk(node, parent, key) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return;
    if (node.type === 'Identifier') rewriteIdentifier(node, parent, key);
    for (const k of Object.keys(node)) {
      if (SKIP_CHILD_KEYS.has(k)) continue;
      const child = node[k];
      if (Array.isArray(child)) child.forEach((item) => walk(item, node, k));
      else if (child && typeof child === 'object' && child.type) walk(child, node, k);
    }
  }
  walk({ type: 'Block', body: fnNode.body || [] }, null, null);

  if (!usable) return { changed: false, count: 0, fnStart, edits: [], inserts: [] };

  // Every captured name must be fully accounted for; a name we never touched
  // means some reference lives in a position we do not understand.
  for (const name of captured) {
    if (!edits.some((e) => e.text.indexOf(JSON.stringify(name)) >= 0)) return { changed: false, count: 0, fnStart, edits: [], inserts: [] };
  }

  return {
    changed: edits.length > 0,
    count: edits.length,
    fnStart,
    edits: edits.sort((a, b) => b.start - a.start),
    inserts: inserts.sort((a, b) => b.position - a.position),
  };
}
