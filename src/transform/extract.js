// src/transform/extract.js — documented V15 EXTRACT transform.
//
// EXTRACT localizes constant leaves and safe global reads in the current
// function. It is deliberately conservative: global reads are extracted only
// when the complete return expression is side-effect-free, so moving the read
// to a local initializer cannot change evaluation order. Nested functions are
// transformed independently when they carry their own attributes.

function clone(node) {
  return node && typeof node === 'object' ? JSON.parse(JSON.stringify(node)) : node;
}

function isCall(node) {
  return !!node && (node.type === 'CallExpression' || node.type === 'StringCallExpression' || node.type === 'TableCallExpression');
}

function isMacroCall(node) {
  return isCall(node) && node.base && node.base.type === 'Identifier' &&
    (String(node.base.name).toUpperCase().startsWith('LPH_') || String(node.base.name).toUpperCase() === 'VM_STACKALLOC');
}

function isReferencePosition(parent, key) {
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && key === 'identifier') return false;
  if ((parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key') return false;
  if (parent.type === 'FunctionDeclaration' && key === 'identifier') return false;
  if (parent.type === 'LabelStatement' && key === 'name') return false;
  return true;
}

function isConstant(node) {
  return !!node && (node.type === 'NumericLiteral' || node.type === 'StringLiteral' || node.type === 'BooleanLiteral');
}

function isSimpleExpression(node) {
  if (!node) return true;
  if (node.type === 'Identifier' || isConstant(node)) return true;
  if (node.type === 'UnaryExpression') return node.operator === '-' && isSimpleExpression(node.argument);
  if (node.type === 'BinaryExpression') return ['+', '-', '*', '/', '%', '^', '==', '~=', '<', '<=', '>', '>=', 'and', 'or'].includes(node.operator) && isSimpleExpression(node.left) && isSimpleExpression(node.right);
  return false;
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
  while (used.has(`${prefix}${i}`)) i++;
  const name = `${prefix}${i}`;
  used.add(name);
  return name;
}

function declarationText(parts) {
  if (!parts.length) return '';
  return 'local ' + parts.map((part) => part.name).join(',') + '=' + parts.map((part) => part.initText).join(',');
}

/**
 * Apply EXTRACT to one function AST.
 *
 * `source` must be the same source used to create `fnNode.loc`. The returned
 * absolute source edits are used for VM(NONE), whose native function body is
 * still emitted from source rather than from the VM AST.
 */
export function applyExtractSource(source, fnNode, result) {
  if (!result || !result.changed || !fnNode || !fnNode.loc) return source;
  // The edits/inserts were computed as absolute offsets into the same source
  // that produced the AST, so the function base offset must come from the
  // recorded value, not from re-deriving it against this function slice.
  const fnStart = result.fnStart;
  if (typeof fnStart !== 'number') throw new Error('EXTRACT source edit is missing its function base offset');
  const edits = (result.edits || []).map((edit) => ({ pos: edit.start - fnStart, end: edit.end - fnStart, text: edit.text, kind: 'edit' }));
  const inserts = (result.inserts || []).map((insert) => ({ pos: insert.position - fnStart, end: insert.position - fnStart, text: insert.text, kind: 'insert' }));
  // Edits and inserts are all expressed in ORIGINAL source coordinates, so a
  // single descending pass keeps every later operation's offset valid even
  // when a replacement changes the text length ahead of an insertion point.
  const ops = edits.concat(inserts).sort((a, b) => (b.pos - a.pos) || ((b.end - a.end)));
  let out = String(source);
  for (const op of ops) {
    if (op.pos < 0 || op.end < op.pos || op.end > out.length) throw new Error('EXTRACT source edit is outside the function');
    out = out.slice(0, op.pos) + op.text + out.slice(op.end);
  }
  return out;
}

export function applyExtractTransform(fnNode, options = {}) {
  const resolve = options.resolve || (() => ({ kind: 'global', name: '' }));
  const source = String(options.source || '');
  const offsetAt = offsetFactory(source);
  const fnStart = fnNode && fnNode.loc ? offsetAt(fnNode.loc.start.line, fnNode.loc.start.column) : 0;
  const body = Array.isArray(fnNode && fnNode.body) ? fnNode.body : [];
  const used = new Set();
  const globalNames = new Set();
  const globalWrites = new Set();
  const constantNodes = [];
  const globalRefs = [];
  const statementFor = new Map();

  function walk(node, parent, key, statement) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return;
    if (isMacroCall(node)) return;
    if (node.type === 'Identifier' && isReferencePosition(parent, key)) {
      const r = resolve(node.name);
      if (r && r.kind === 'global' && node.name !== '_ENV') {
        globalNames.add(node.name);
        globalRefs.push({ node, statement, parent, key });
      }
    }
    if (isConstant(node)) constantNodes.push({ node, statement, parent, key });
    for (const childKey of Object.keys(node)) {
      const child = node[childKey];
      if (Array.isArray(child)) {
        for (const item of child) walk(item, node, childKey, statement);
      } else if (child && typeof child === 'object' && child.type) {
        walk(child, node, childKey, statement);
      }
    }
  }

  function collectWrites(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return;
    if (node.type === 'AssignmentStatement') {
      for (const variable of node.variables || []) {
        if (variable && variable.type === 'Identifier' && resolve(variable.name).kind === 'global') globalWrites.add(variable.name);
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach((item) => collectWrites(item));
      else if (child && typeof child === 'object' && child.type) collectWrites(child);
    }
  }

  function collectUsedNames(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier') used.add(node.name);
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(collectUsedNames);
      else if (child && typeof child === 'object' && child.type) collectUsedNames(child);
    }
  }

  collectUsedNames(fnNode);
  collectWrites({ type: 'Block', body });
  let firstStatement = null;
  for (const statement of body) {
    if (statement && statement.type === 'CallStatement' && statement.expression && statement.expression.type === 'CallExpression' && statement.expression.base && statement.expression.base.type === 'Identifier' && ['LPH_ATTRIBUTES', 'VMATTR'].includes(String(statement.expression.base.name).toUpperCase())) continue;
    if (!firstStatement) firstStatement = statement;
    statementFor.set(statement, statement);
    walk(statement, { type: 'Block', body }, 'body', statement);
  }
  if (!firstStatement) return { changed: false, constants: 0, globals: 0, edits: [], inserts: [] };

  const optionsSet = new Set((options.mode && options.mode.options) || ['GLOBALS', 'CONSTANTS']);
  const edits = [];
  const inserts = new Map();
  const astDeclarations = new Map();
  let constantCount = 0;
  let globalCount = 0;

  function addDeclaration(statement, name, initNode, initText) {
    if (!astDeclarations.has(statement)) astDeclarations.set(statement, []);
    astDeclarations.get(statement).push({ name, init: clone(initNode) });
    if (!inserts.has(statement)) inserts.set(statement, []);
    inserts.get(statement).push({ name, initText });
  }

  if (optionsSet.has('CONSTANTS')) {
    for (const item of constantNodes) {
      const range = nodeRange(item.node, offsetAt);
      if (!range) continue;
      const name = freshName(used, '__lph_extract_const_');
      edits.push({ start: range.start, end: range.end, text: name });
      addDeclaration(firstStatement, name, item.node, source.slice(range.start, range.end));
      item.node.type = 'Identifier';
      item.node.name = name;
      delete item.node.value;
      delete item.node.raw;
      constantCount++;
    }
  }

  if (optionsSet.has('GLOBALS')) {
    for (const ref of globalRefs) {
      if (globalWrites.has(ref.node.name)) continue;
      if (!ref.statement || ref.statement.type !== 'ReturnStatement') continue;
      const args = ref.statement.arguments || [];
      if (!args.some((arg) => isSimpleExpression(arg))) continue;
      const range = nodeRange(ref.node, offsetAt);
      if (!range) continue;
      const name = freshName(used, '__lph_extract_global_');
      edits.push({ start: range.start, end: range.end, text: name });
      addDeclaration(ref.statement, name, { type: 'Identifier', name: ref.node.name }, ref.node.name);
      ref.node.type = 'Identifier';
      ref.node.name = name;
      globalCount++;
    }
  }

  // Apply the same declarations to the AST used by the VM compiler. The
  // source edits above are kept separate for VM(NONE).
  const firstIndex = body.indexOf(firstStatement);
  if (firstIndex >= 0 && astDeclarations.has(firstStatement)) {
    const declarations = astDeclarations.get(firstStatement).map(({ name, init }) => ({
      type: 'LocalStatement',
      variables: [{ type: 'Identifier', name }],
      init: [init],
    }));
    body.splice(firstIndex, 0, ...declarations);
  }
  for (const [statement, declarations] of astDeclarations.entries()) {
    if (statement === firstStatement) continue;
    const index = body.indexOf(statement);
    if (index < 0) continue;
    body.splice(index, 0, ...declarations.map(({ name, init }) => ({ type: 'LocalStatement', variables: [{ type: 'Identifier', name }], init: [init] })));
  }

  const sourceInserts = [];
  for (const [statement, parts] of inserts.entries()) {
    const range = nodeRange(statement, offsetAt);
    // Inserted inline (no new line) so LPH_LINE inside a VM(NONE) body keeps
    // the original line numbering of the emitted native function.
    if (range) sourceInserts.push({ position: range.start, text: declarationText(parts) + ' ' });
  }
  return {
    changed: edits.length > 0,
    fnStart,
    constants: constantCount,
    globals: globalCount,
    edits: edits.sort((a, b) => b.start - a.start),
    inserts: sourceInserts.sort((a, b) => a.position - b.position),
  };
}
