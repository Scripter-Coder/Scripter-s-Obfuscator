// tools/static_devirt_bench.mjs
//
// Generic static devirtualization resistance benchmark.
//
// DESIGN RULE: this analyzer is written the way an *attacker* writes it. It
// knows nothing about how our emitter names variables, orders instruction
// fields, or picks opcode numbers. Every stage reasons from generic AST
// structure only:
//
//   * "find the table whose keys are numeric literals and values are functions"
//     -> that is the opcode->handler map, whatever it is called;
//   * "find the site that indexes that table with something derived from a
//     program counter" -> that is the dispatch edge;
//   * "classify a handler by the AST shape of its body" -> that is semantics.
//
// A stage that SUCCEEDS means the artifact leaked that information statically.
// A stage that is BLOCKED means the analyst must fall back to dynamic analysis
// or per-build manual work. Resistance = % of stages blocked.
//
// The analyzer is artifact-agnostic: it scores any Lua file, so the supplied
// Luraph V15 reference (test.txt) can be measured on the exact same scale.
//
// Usage:
//   node tools/static_devirt_bench.mjs                    # score our artifacts
//   node tools/static_devirt_bench.mjs <file.lua> [...]    # score given files
//   node tools/static_devirt_bench.mjs --json             # machine-readable
//
// Always exits 0: this is a measurement instrument, not a gate.

import fs from 'node:fs';
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

// ---------------------------------------------------------------------------
// luaparse "Table" AST dialect -- the node vocabulary this analyzer understands
// ---------------------------------------------------------------------------
// Chunk / body[]
// LocalStatement {variables[], init[]}
// AssignmentStatement {variables[], init[]}
// CallStatement {expression}
// IfStatement {clauses:[{condition, block}], isElseif}
// ForNumericStatement {init,start,stop,step,body}
// ForGenericStatement / WhileStatement / RepeatStatement / ReturnStatement
// FunctionDeclaration {identifier|null, isLocal, parameters, body, isVararg}
// TableConstructorExpression {fields: TableKey{key,value} | TableValue{value}}
// NumericLiteral{value,raw} StringLiteral{value,raw} BooleanLiteral NilLiteral
// Identifier{name}
// IndexExpression{base,index} MemberExpression{base,index,indexer}
// CallExpression{base, index|null, args[]}   (index != null => method call)
// BinaryExpression{left,operator,right} LogicalExpression UnaryExpression{operator,argument}

const FN = 'FunctionDeclaration';
const isFn = (n) => n && n.type === FN;
const isIdx = (n) => n && n.type === 'IndexExpression';

function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return; }
  if (typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range' || k === 'comments') continue;
    walk(node[k], fn);
  }
}

function parseAny(src) {
  let last = 'unknown';
  for (const luaVersion of ['5.1', '5.2', '5.3', 'LuaJIT']) {
    try {
      return { ast: luaparse.parse(src, { luaVersion, locations: false, ranges: false, scope: false, comments: false, tolerant: false }), luaVersion };
    } catch (e) { last = `${e.constructor.name}: ${String(e.message).slice(0, 120)}`; }
  }
  return { ast: null, luaVersion: null, error: last };
}

// ---------------------------------------------------------------------------
// Structure finders
// ---------------------------------------------------------------------------

// The opcode->handler dispatch table. Two construction forms must both be
// found, because an attacker would look for either:
//   (a) local H = { [123]=function() end, [456]=function() end, ... }
//   (b) local H = {}  H[123]=function() end  H[456]=function() end  ...
// Form (b) is what a table-literal-only search misses, and missing it would
// flatter our own artifact -- so it is handled explicitly.
function findDispatchTables(ast) {
  const out = [];

  // (a) table constructor form
  walk(ast, (n) => {
    if (n.type !== 'TableConstructorExpression') return;
    const fields = n.fields || [];
    if (fields.length < 6) return;
    let numKeyFn = 0, numKeyOther = 0;
    for (const f of fields) {
      if (!f || f.type !== 'TableKey') continue;
      if (!f.key || f.key.type !== 'NumericLiteral') continue;
      if (isFn(f.value)) numKeyFn++; else numKeyOther++;
    }
    if (numKeyFn >= 6) out.push({ form: 'table-literal', node: n, numKeyFn, numKeyOther, size: fields.length, score: numKeyFn * 2 - numKeyOther, map: extractFromFields(fields) });
  });

  // (b) assignment-built form: T[<numeral>] = function() end
  const built = new Map(); // varName -> Map(opcode -> [fn])
  walk(ast, (n) => {
    if (n.type !== 'AssignmentStatement') return;
    (n.variables || []).forEach((v, i) => {
      if (!v || v.type !== 'IndexExpression') return;
      if (!v.index || v.index.type !== 'NumericLiteral') return;
      if (!v.base || v.base.type !== 'Identifier') return;
      const val = (n.init || [])[i];
      if (!isFn(val)) return;
      if (!built.has(v.base.name)) built.set(v.base.name, new Map());
      const m = built.get(v.base.name);
      if (!m.has(v.index.value)) m.set(v.index.value, []);
      m.get(v.index.value).push(val);
    });
  });
  for (const [varName, m] of built) {
    if (m.size < 6) continue;
    out.push({ form: 'assignment-built', varName, numKeyFn: m.size, numKeyOther: 0, size: m.size, score: m.size * 2, map: m });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

function extractFromFields(fields) {
  const map = new Map();
  for (const f of fields || []) {
    if (!f || f.type !== 'TableKey' || !f.key || f.key.type !== 'NumericLiteral' || !isFn(f.value)) continue;
    if (!map.has(f.key.value)) map.set(f.key.value, []);
    map.get(f.key.value).push(f.value);
  }
  return map;
}

// A large flat numeric array: the serialized instruction stream.
function findNumericArrays(ast) {
  const out = [];
  walk(ast, (n) => {
    if (n.type !== 'TableConstructorExpression') return;
    const fields = n.fields || [];
    if (fields.length < 24) return;
    let nums = 0, strs = 0, other = 0;
    for (const f of fields) {
      const v = f && f.value;
      if (!v) { other++; continue; }
      if (v.type === 'NumericLiteral') nums++;
      else if (v.type === 'StringLiteral') strs++;
      else other++;
    }
    if (nums >= 24) out.push({ node: n, nums, strs, other, size: fields.length });
  });
  out.sort((a, b) => b.nums - a.nums);
  return out;
}

// A constant pool: numeric-indexed table whose values are string literals.
function findConstantPools(ast) {
  const out = [];
  walk(ast, (n) => {
    if (n.type !== 'TableConstructorExpression') return;
    const fields = n.fields || [];
    if (fields.length < 3) return;
    let strVals = 0, other = 0;
    for (const f of fields) {
      const v = f && f.value;
      if (v && v.type === 'StringLiteral') { const sv = (typeof v.value === 'string' && v.value.length) ? v.value : (typeof v.raw === 'string' ? v.raw : ''); if (sv) strVals++; else other++; } else other++;
    }
    if (strVals >= 3 && strVals >= other) out.push({ node: n, strVals, size: fields.length });
  });
  out.sort((a, b) => b.strVals - a.strVals);
  return out;
}

// Names used as the index of an index-expression, i.e. candidate
// "program counter" / "code array" variables. Name-agnostic.
function findIndexedNames(ast) {
  const names = new Map(); // name -> count
  const bump = (n) => { if (n && n.type === 'Identifier') names.set(n.name, (names.get(n.name) || 0) + 1); };
  walk(ast, (n) => {
    if (n.type === 'IndexExpression') bump(n.index);
  });
  return names;
}

// ---------------------------------------------------------------------------
// Handler semantics classification (generic, from AST shape only)
// ---------------------------------------------------------------------------

const ARITH = ['+', '-', '*', '/', '%', '^'];
const CMP = ['<', '>', '<=', '>='];
const EQ = ['==', '~='];
const BIT = ['&', '|', '~', '<<', '>>'];
const UN = ['-', 'not', '#'];

function classifyHandler(fnNode) {
  const feat = {
    binops: new Set(), unops: new Set(),
    nCall: 0, nMethodCall: 0, nIf: 0, nLoop: 0, nIndexAssign: 0,
    nReturn: 0, nVararg: 0, nTableCtor: 0, nNestedFn: 0, nConcat: 0,
    codeArrayReads: 0, pcAssignedFromArray: 0, nLocal: 0,
  };
  walk(fnNode, (n) => {
    switch (n.type) {
      case 'BinaryExpression':
        feat.binops.add(n.operator);
        if (n.operator === '..') feat.nConcat++;
        if (ARITH.includes(n.operator)) feat.binops.add('ARITH');
        if (CMP.includes(n.operator)) feat.binops.add('CMP');
        if (EQ.includes(n.operator)) feat.binops.add('EQ');
        if (BIT.includes(n.operator)) feat.binops.add('BIT');
        break;
      case 'LogicalExpression': feat.binops.add('LOGIC'); break;
      case 'UnaryExpression': if (UN.includes(n.operator)) feat.unops.add(n.operator); break;
      case 'CallExpression': if (n.index) feat.nMethodCall++; else feat.nCall++; break;
      case 'IfStatement': feat.nIf++; break;
      case 'WhileStatement': case 'ForNumericStatement': case 'ForGenericStatement': case 'RepeatStatement': feat.nLoop++; break;
      case 'ReturnStatement': feat.nReturn++; break;
      case 'TableConstructorExpression': feat.nTableCtor++; break;
      case 'LocalStatement': feat.nLocal++; break;
      case 'VarargExpression': feat.nVararg++; break;
      case FN: if (n !== fnNode) feat.nNestedFn++; break;
      case 'AssignmentStatement': {
        if ((n.variables || []).some(isIdx)) feat.nIndexAssign++;
        // "pc = codearray[pc]" style unconditional/conditional jump
        if ((n.variables || []).some((v) => v.type === 'Identifier') &&
            (n.init || []).some(isIdx)) feat.pcAssignedFromArray++;
        break;
      }
    }
  });
  // code-array reads: any read of the form <name>[<anything>]
  walk(fnNode, (n) => {
    if (n.type === 'IndexExpression' && n.index && (n.index.type === 'Identifier')) feat.codeArrayReads++;
  });
  return feat;
}

// Derive a human-facing semantic label for a handler from its feature set.
// This is the "obvious ADD/MUL/CALL" recovery the brief describes.
function semanticLabel(feat) {
  const t = [];
  if (feat.nMethodCall > 0 || (feat.nCall > 0 && feat.nNestedFn > 0)) t.push('CALL');
  if (feat.binops.has('..') && feat.nConcat > 0) t.push('CONCAT');
  if (feat.binops.has('EQ')) t.push('COMPARE_EQ');
  if (feat.binops.has('CMP')) t.push('COMPARE_REL');
  if (feat.binops.has('ARITH')) t.push('ARITH');
  if (feat.binops.has('BIT')) t.push('BITWISE');
  if (feat.binops.has('LOGIC')) t.push('SHORTCIRCUIT');
  if (feat.unops.size) t.push('UNARY:' + [...feat.unops].join('+'));
  if (feat.nIndexAssign > 0) t.push('STORE');
  if (feat.pcAssignedFromArray > 0) t.push('JUMP');
  if (feat.nTableCtor > 0) t.push('NEWTABLE');
  if (feat.nVararg > 0) t.push('VARARG');
  if (feat.nNestedFn > 0) t.push('CLOSURE');
  if (feat.nLoop > 0) t.push('LOOP');
  if (feat.nIf > 0) t.push('BRANCH');
  if (feat.nReturn > 0) t.push('RETURN');
  if (feat.nCall > 0 && feat.nMethodCall === 0) t.push('CALLS_UNKNOWN');
  return t;
}

// ---------------------------------------------------------------------------
// Dispatch topology: is there a single universal "<table>[key]()" edge?
// ---------------------------------------------------------------------------

function analyzeTopology(ast, tbl) {
  const out = {
    singleTableEdge: false, tableEdgeCount: 0, inlineIfChain: false,
    inChainCalls: 0, stateDependent: false, distinctDispatchSites: 0,
  };
  if (!tbl) return out;
  // Which variable(s) hold this table?
  const names = new Set();
  if (tbl.form === 'assignment-built') {
    names.add(tbl.varName);
  } else {
    walk(ast, (n) => {
      if (n.type === 'LocalStatement') {
        (n.variables || []).forEach((v, i) => { if ((n.init || [])[i] === tbl.node) names.add(v.name); });
      }
      if (n.type === 'AssignmentStatement') {
        (n.variables || []).forEach((v, i) => { if ((n.init || [])[i] === tbl.node && v.type === 'Identifier') names.add(v.name); });
      }
    });
  }
  out.tableVarNames = [...names];
  const nameSet = new Set(names);
  if (nameSet.size === 0) return out;

  // A "universal edge" is exactly one call site of the shape T[<expr>]() that
  // sits in the interpreter's hot loop. We count how many such sites exist.
  const sites = new Set();
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' || n.index) return;
    const callee = n.base;
    if (callee && callee.type === 'IndexExpression' && callee.base && callee.base.type === 'Identifier' && nameSet.has(callee.base.name)) {
      out.tableEdgeCount++;
      sites.add(JSON.stringify(callee.index && callee.index.type));
    }
    if (callee && callee.type === 'Identifier' && nameSet.has(callee.name)) {
      out.tableEdgeCount++;
    }
  });
  out.distinctDispatchSites = sites.size;
  out.singleTableEdge = out.tableEdgeCount > 0 && out.distinctDispatchSites <= 2;

  // inline if/elseif chain: T[<numeric literal>]() appearing many times
  let inlineCalls = 0;
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' || n.index) return;
    const callee = n.base;
    if (callee && callee.type === 'IndexExpression' && callee.base && callee.base.type === 'Identifier' && nameSet.has(callee.base.name)
        && callee.index && callee.index.type === 'NumericLiteral') inlineCalls++;
  });
  out.inChainCalls = inlineCalls;
  out.inlineIfChain = inlineCalls >= 6;
  return out;
}

// ---------------------------------------------------------------------------
// DEEP analyzer: constant-folds computed handler keys and inverts the
// per-build dispatch transform.
//
// The shallow analyzer above is deliberately pattern-based, the way a quick
// generic tool behaves. This pass represents a determined analyst who reads
// the emitted expressions: it evaluates constant subtrees, rebuilds the
// handler table under its REAL key values, and solves the affine dispatch map
// so it can recover the true opcode -> handler association. It exists so that
// "resistance" cannot be claimed on the strength of syntax alone.
// ---------------------------------------------------------------------------

function foldConst(n) {
  if (!n) return null;
  switch (n.type) {
    case 'NumericLiteral': return typeof n.value === 'number' ? n.value : null;
    case 'UnaryExpression': {
      const v = foldConst(n.argument);
      if (v == null) return null;
      if (n.operator === '-') return -v;
      if (n.operator === 'not') return v ? 0 : 1;
      if (n.operator === '#') return null;
      return null;
    }
    case 'BinaryExpression': {
      const a = foldConst(n.left), b = foldConst(n.right);
      if (a == null || b == null) return null;
      switch (n.operator) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? null : Math.floor(a / b);
        case '%': return b === 0 ? null : ((a % b) + b) % b;
        case '^': return Math.pow(a, b);
        case '..': return null;
        case '//': return b === 0 ? null : Math.floor(a / b);
        default: return null;
      }
    }
    default: return null;
  }
}

// Collect the numeric literals of a subtree and the single free identifier.
function analyseExpr(n, lits, idents) {
  if (!n) return;
  if (n.type === 'NumericLiteral') { if (typeof n.value === 'number') lits.push(n.value); return; }
  if (n.type === 'Identifier') { idents.push(n.name); return; }
  if (n.type === 'UnaryExpression') { analyseExpr(n.argument, lits, idents); return; }
  if (n.type === 'BinaryExpression') { analyseExpr(n.left, lits, idents); analyseExpr(n.right, lits, idents); return; }
}

// Recover (A, B, M) from a dispatch key expression shaped
//   ((OP*A + B) % M)
// by structural descent; returns null if the shape does not match.
function extractAffine(n) {
  if (!n || n.type !== 'BinaryExpression' || n.operator !== '%') return null;
  const M = foldConst(n.right);
  if (M == null || M === 0) return null;
  let inner = n.left;
  let B = 0;
  if (inner.type === 'BinaryExpression' && inner.operator === '+') {
    B = foldConst(inner.right);
    if (B == null) return null;
    inner = inner.left;
  }
  let A = 1;
  if (inner.type === 'BinaryExpression' && inner.operator === '*') {
    A = foldConst(inner.right);
    if (A == null) return null;
    inner = inner.left;
  }
  if (!inner || inner.type !== 'Identifier') return null;
  return { varName: inner.name, A: ((A % M) + M) % M, B: ((B % M) + M) % M, M };
}

function modinv(a, m) {
  let [old_r, r] = [((a % m) + m) % m, m], [old_s, s] = [1, 0];
  while (r !== 0) { const q = Math.floor(old_r / r); [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return old_r === 1 ? ((old_s % m) + m) % m : null;
}

function deepAnalyze(ast) {
  const out = {
    handlerTableRecovered: false, handlerCount: 0, form: 'none',
    transformRecovered: false, transform: null,
    opcodeMapRecovered: false, opcodesRecovered: 0,
    stage: 'none',
  };

  // Named function locals -- how the tree topology stores its handlers.
  const localFns = new Map();
  walk(ast, (n) => {
    if (n.type !== 'LocalStatement') return;
    (n.variables || []).forEach((v, i) => {
      if (v && v.type === 'Identifier' && isFn((n.init || [])[i])) localFns.set(v.name, n.init[i]);
    });
  });

  // 1a) assignment-built table, rebuilt under folded key values
  const built = new Map();
  walk(ast, (n) => {
    if (n.type !== 'AssignmentStatement') return;
    (n.variables || []).forEach((v, i) => {
      if (!v || v.type !== 'IndexExpression' || !v.base || v.base.type !== 'Identifier') return;
      const val = (n.init || [])[i];
      if (!isFn(val)) return;
      const k = foldConst(v.index);
      if (k == null) return;
      const t = v.base.name;
      if (!built.has(t)) built.set(t, new Map());
      const m = built.get(t);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(val);
    });
  });
  let best = null;
  for (const [t, m] of built) if (!best || m.size > best.m.size) best = { t, m };

  // key value -> handler bodies, across whichever form the build used
  let keyFns = null;
  if (best && best.m.size >= 6) {
    keyFns = best.m;
    out.handlerTableRecovered = true;
    out.handlerCount = best.m.size;
    out.form = 'table';
  }

  // 2) locate the per-build dispatch transform. It appears in different places
  //    per topology -- as the table lookup expression, as a `local KT=`
  //    initialiser in the branch chain, or as the tree's key expression -- so
  //    scan every node for an affine shape over exactly one free identifier
  //    rather than assuming a syntactic position.
  // 2) locate the per-build dispatch transform, but only accept a candidate
  //    that is provably the DISPATCH key. Scanning every node for an affine
  //    shape picks up unrelated "%"-expressions (the MBA helpers emit x%1 and
  //    friends); accepting one of those would understate what a determined
  //    analyst recovers, i.e. it would flatter the artifact. A genuine
  //    transform is either
  //      (a) the index expression of a READ of the handler table, or
  //      (b) the initialiser of a local that is later compared for equality
  //          against constants (branch chain / decision tree).
  //
  // Candidates are ranked by how central their ROUTING variable is. Note the
  // ranking key is the local being initialised, not the free identifier inside
  // the expression: extractAffine reports the inner (opcode) variable, whose
  // comparison count is small, while the routing variable is the one compared
  // against every handler key.
  const eqCompared = new Map();
  walk(ast, (n) => {
    if (n.type !== 'BinaryExpression') return;
    if (!['==', '<=', '<'].includes(n.operator)) return;
    for (const side of [n.left, n.right]) {
      if (!side || side.type !== 'Identifier') continue;
      const other = side === n.left ? n.right : n.left;
      if (foldConst(other) != null) eqCompared.set(side.name, (eqCompared.get(side.name) || 0) + 1);
    }
  });

  const affine = [];
  const seenAffine = new Set();
  const consider = (n, score, routingVar) => {
    const a = extractAffine(n);
    if (!a || a.M <= 1) return;
    const sig = `${a.varName}|${a.A}|${a.B}|${a.M}`;
    if (seenAffine.has(sig)) return;
    seenAffine.add(sig);
    affine.push({ ...a, score, routingVar: routingVar || a.varName });
  };
  if (best) {
    // A transform used as the index of a read of the handler table is the
    // dispatch transform by construction -- rank it above everything else.
    walk(ast, (n) => {
      if (n.type === 'IndexExpression' && n.base && n.base.type === 'Identifier' && n.base.name === best.t) consider(n.index, 1e9, n.index && n.index.type === 'Identifier' ? n.index.name : null);
    });
  }
  walk(ast, (n) => {
    if (n.type !== 'LocalStatement') return;
    (n.variables || []).forEach((v, i) => {
      if (v && v.type === 'Identifier' && eqCompared.has(v.name)) consider((n.init || [])[i], eqCompared.get(v.name), v.name);
    });
  });
  if (affine.length) {
    affine.sort((a, b) => b.score - a.score);
    out.transformRecovered = true;
    out.transform = affine[0];
    out.transformUsage = affine[0].score;
  }

  // 1b) tree form: leaves compare the transform variable against a constant
  //     and then call a handler local. That is the same information as a table
  //     entry, just written differently, so fold it into the same map.
  if (!keyFns && out.transformRecovered) {
    const tv = out.transform.routingVar;
    const leaves = new Map();
    walk(ast, (n) => {
      if (n.type !== 'IfStatement') return;
      let key = null;
      const calls = new Set();
      walk(n, (m) => {
        if (m.type === 'BinaryExpression' && (m.operator === '==' || m.operator === '<=')) {
          const l = m.left, r = m.right;
          if (l && l.type === 'Identifier' && l.name === tv && foldConst(r) != null) key = foldConst(r);
          else if (r && r.type === 'Identifier' && r.name === tv && foldConst(l) != null) key = foldConst(l);
        }
        if (m.type === 'CallExpression' && !m.index && m.base && m.base.type === 'Identifier' && localFns.has(m.base.name)) calls.add(m.base.name);
      });
      if (key != null && calls.size) {
        if (!leaves.has(key)) leaves.set(key, []);
        for (const c of calls) leaves.get(key).push(localFns.get(c));
      }
    });
    if (leaves.size >= 6) {
      keyFns = leaves;
      out.handlerTableRecovered = true;
      out.handlerCount = leaves.size;
      out.form = 'tree-leaves';
    }
  }

  // 3) invert the transform to recover the true opcode -> handler map
  if (keyFns && out.transformRecovered) {
    const { A, B, M } = out.transform;
    const inv = modinv(A, M);
    if (inv != null) {
      const seen = new Set();
      for (const k of keyFns.keys()) {
        const oc = (((k - B) % M + M) % M * inv) % M;
        seen.add(oc);
      }
      out.opcodesRecovered = seen.size;
      out.opcodeMapRecovered = seen.size >= 6;
    }
  }
  out.stage = out.opcodeMapRecovered ? 'DEOBFUSCATED' : (out.handlerTableRecovered ? 'TABLE-ONLY' : 'BLOCKED');

  // Rung 3: once the map is recovered, how many handlers can be named?
  // `shallow` counts handlers classifiable from their own body; `resolved`
  // counts handlers classifiable after following combinator calls.
  if (keyFns && out.opcodeMapRecovered) {
    let anyShallow = 0, anyResolved = 0, opShallow = 0, opResolved = 0, total = 0;
    const opsSeen = new Set();
    for (const [, fns] of keyFns) {
      const fn = fns[0];
      if (!fn) continue;
      total++;
      const c = classifyResolved(fn, localFns);
      // Two different questions, kept separate so the numbers are comparable:
      //  - "any semantic tag"   : could a one-pass AST read say ANYTHING about
      //                           this handler (ARITH, STORE, JUMP, CALL, ...)
      //  - "named operation"    : could it name the specific operation
      //                           (ADD vs MUL vs SUB vs LT vs ...)
      if (c.shallow.length) anyShallow++;
      if (c.resolved.length) anyResolved++;
      const isOp = (tags) => tags.filter((t) => /^(ADD|SUB|MUL|DIV|MOD|POW|CONCAT|EQ|NEQ|LT|LE|GT|GE|NOT|NEG|LEN)$/.test(t));
      if (isOp(c.shallow).length) opShallow++;
      if (isOp(c.resolved).length) { opResolved++; for (const t of isOp(c.resolved)) opsSeen.add(t); }
    }
    out.classified = { total, anyShallow, anyResolved, opShallow, opResolved, distinctOps: opsSeen.size };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolved classification: the determined-analyst view of rung 3.
//
// "Semantic classification must fail on a substantial fraction" is only
// meaningful against an analyst who actually resolves things. This pass takes
// each recovered handler and asks what can be named:
//   shallow  -- from the handler body alone (one AST pass, no call following)
//   resolved -- after following calls into the generated combinator groups and
//               reading the branch selected by the literal tag
// The gap between the two is what the per-build combinator layer buys.
// ---------------------------------------------------------------------------

// Map a resolved return expression to an operation name.
function opOfExpr(n) {
  if (!n) return null;
  if (n.type === 'BinaryExpression') {
    const m = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '^': 'POW', '..': 'CONCAT', '==': 'EQ', '~=': 'NEQ', '<': 'LT', '<=': 'LE', '>': 'GT', '>=': 'GE' };
    if (m[n.operator]) return m[n.operator];
    return null;
  }
  if (n.type === 'UnaryExpression') {
    const m = { '-': 'NEG', 'not': 'NOT', '#': 'LEN' };
    return m[n.operator] || null;
  }
  return null;
}

// Find the return expression of the branch guarded by `k == <tag>`.
function resolveTaggedReturn(groupFn, tag) {
  let found = null;
  walk(groupFn, (n) => {
    if (n.type !== 'IfStatement' || found) return;
    walk(n, (c) => {
      if (c.type === 'BinaryExpression' && c.operator === '==') {
        const kl = c.left, kr = c.right;
        const kIsIdent = (x) => x && x.type === 'Identifier';
        const t = (kIsIdent(kl) && foldConst(kr) === tag) ? kr : (kIsIdent(kr) && foldConst(kl) === tag) ? kl : null;
        if (t == null) return;
        walk(n, (r) => {
          if (r.type === 'ReturnStatement' && r.arguments && r.arguments.length) {
            const o = opOfExpr(r.arguments[0]);
            if (o) found = o;
          }
        });
      }
    });
  });
  return found;
}

function classifyResolved(handlerFn, localFns) {
  const shallow = semanticLabel(classifyHandler(handlerFn));
  const resolved = new Set(shallow);
  let followedCalls = 0;
  walk(handlerFn, (n) => {
    if (n.type !== 'CallExpression' || n.index) return;
    const callee = n.base;
    if (!callee || callee.type !== 'Identifier') return;
    const target = localFns.get(callee.name);
    if (!target) return;
    // Our combinator groups are called as f(<literal tag>, a, b).
    // NOTE: luaparse names the argument list `arguments`, not `args`.
    const tag = foldConst((n.arguments || [])[0]);
    if (tag == null) return;
    followedCalls++;
    const op = resolveTaggedReturn(target, tag);
    if (op) resolved.add(op);
  });
  return { shallow, resolved: [...resolved], followedCalls };
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

function analyze(label, src) {
  const res = { label, bytes: src.length, stages: {}, detail: {} };
  const { ast, luaVersion, error } = parseAny(src);
  res.luaVersion = luaVersion;
  if (!ast) {
    res.detail.parseError = error;
    res.stages = {
      handlerTable: 'blocked', opcodeMap: 'blocked', semantics: 'blocked',
      instructions: 'blocked', constants: 'blocked', calls: 'blocked',
      branches: 'blocked', functions: 'blocked', cfg: 'blocked', source: 'blocked',
    };
    res.blocked = 10; res.total = 10; res.resistance = 100;
    res.leakedList = [];
    res.blockedList = Object.keys(res.stages);
    return res;
  }

  // --- global shape ------------------------------------------------------
  const shape = { tables: 0, biggestTable: 0, numericLiterals: 0, stringLiterals: 0, functions: 0, calls: 0, methodCalls: 0, branches: 0, loops: 0, statements: 0 };
  const stringSamples = [];
  walk(ast, (n) => {
    switch (n.type) {
      case 'TableConstructorExpression': shape.tables++; shape.biggestTable = Math.max(shape.biggestTable, (n.fields || []).length); break;
      case 'NumericLiteral': shape.numericLiterals++; break;
      case 'StringLiteral': {
        const v = (typeof n.value === 'string' && n.value.length) ? n.value : (typeof n.raw === 'string' ? n.raw : '');
        shape.stringLiterals++;
        if (stringSamples.length < 8 && v.length) stringSamples.push(v.slice(0, 32));
        break;
      }
      case FN: shape.functions++; break;
      case 'CallExpression': if (n.index) shape.methodCalls++; else shape.calls++; break;
      case 'IfStatement': shape.branches++; break;
      case 'WhileStatement': case 'ForNumericStatement': case 'ForGenericStatement': case 'RepeatStatement': shape.loops++; break;
      case 'ReturnStatement': case 'LocalStatement': case 'AssignmentStatement': case 'CallStatement': shape.statements++; break;
    }
  });
  res.shape = shape;
  res.detail.stringSamples = stringSamples;

  // --- stage: handler table / opcode map ---------------------------------
  const tables = findDispatchTables(ast);
  const tbl = tables[0] || null;
  res.detail.dispatchTableSize = tbl ? tbl.size : 0;
  res.detail.numKeyFn = tbl ? tbl.numKeyFn : 0;
  res.stages.handlerTable = tbl ? 'leaked' : 'blocked';

  const opmap = tbl ? tbl.map : new Map();
  res.detail.dispatchTableForm = tbl ? tbl.form : 'none';
  res.detail.opcodes = opmap.size;
  res.stages.opcodeMap = opmap.size > 0 ? 'leaked' : 'blocked';

  // --- stage: instruction boundaries (stride recovery) --------------------
  const numericArrays = findNumericArrays(ast);
  const arr = numericArrays[0] || null;
  res.detail.biggestNumericArray = arr ? arr.nums : 0;
  // To recover strides you must tie the handler table to the code array.
  // Generic tie: a handler reads <someName>[<expr>] -- the code array is the
  // name that handlers index the most.
  const idxNames = findIndexedNames(ast);
  let strides = new Map();
  let tiedName = null;
  if (tbl) {
    const tally = new Map();
    for (const [, fns] of opmap) {
      for (const fn of fns) {
        walk(fn, (n) => {
          if (n.type === 'IndexExpression' && n.index && n.index.type === 'Identifier') tally.set(n.index.name, (tally.get(n.index.name) || 0) + 1);
        });
      }
    }
    tiedName = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (tiedName) {
      for (const [, fns] of opmap) {
        for (const fn of fns) {
          let reads = 0;
          walk(fn, (n) => {
            if (n.type === 'IndexExpression' && n.index && n.index.type === 'Identifier' && n.index.name === tiedName) reads++;
          });
          const len = reads + 1; // +1 for the opcode word itself
          strides.set(len, (strides.get(len) || 0) + 1);
        }
      }
    }
  }
  res.detail.codeArrayVariable = tiedName;
  res.detail.strideHistogram = Object.fromEntries([...strides.entries()].sort((a, b) => a[0] - b[0]));
  res.detail.distinctStrides = strides.size;
  const boundariesRecoverable = !!tiedName && strides.size > 0 && strides.size <= 8;
  res.stages.instructions = boundariesRecoverable ? 'leaked' : 'blocked';

  // --- stage: semantics ---------------------------------------------------
  let labelled = 0, distinctLabels = 0;
  const labelSet = new Set();
  if (opmap.size) {
    for (const [, fns] of opmap) {
      const feat = classifyHandler(fns[0]);
      const labels = semanticLabel(feat);
      if (labels.length) { labelled++; for (const l of labels) labelSet.add(l); }
    }
    distinctLabels = labelSet.size;
  }
  res.detail.opcodesLabelled = labelled;
  res.detail.distinctSemanticLabels = distinctLabels;
  // A universal opcode->semantic map needs (a) the table, (b) a small bounded
  // stride set, and (c) a label for essentially every opcode.
  const semanticsRecoverable = opmap.size > 0 && labelled >= opmap.size * 0.9;
  res.stages.semantics = semanticsRecoverable ? 'leaked' : 'blocked';

  // --- stage: constants ---------------------------------------------------
  const pools = findConstantPools(ast);
  res.detail.constantPool = pools.length ? pools[0].strVals : 0;
  res.stages.constants = (shape.stringLiterals > 0 || pools.length > 0) ? 'leaked' : 'blocked';

  // --- stage: calls -------------------------------------------------------
  res.detail.callSites = shape.calls;
  res.detail.methodCallSites = shape.methodCalls;
  res.stages.calls = shape.calls + shape.methodCalls > 0 ? 'leaked' : 'blocked';

  // --- stage: branches ----------------------------------------------------
  // Jump recovery needs handlers whose body assigns the pc from the code array.
  let jumpHandlers = 0;
  if (opmap.size && tiedName) {
    for (const [, fns] of opmap) {
      const feat = classifyHandler(fns[0]);
      if (feat.pcAssignedFromArray > 0) jumpHandlers++;
    }
  }
  res.detail.jumpHandlers = jumpHandlers;
  res.stages.branches = jumpHandlers > 0 ? 'leaked' : 'blocked';

  // --- stage: functions ---------------------------------------------------
  res.detail.functions = shape.functions;
  res.stages.functions = shape.functions > 0 ? 'leaked' : 'blocked';

  // --- stage: CFG ---------------------------------------------------------
  // A VM-level CFG needs: opcode map + boundaries + jump identification.
  res.stages.cfg = (boundariesRecoverable && opmap.size > 0 && jumpHandlers > 0) ? 'leaked' : 'blocked';

  // --- stage: source reconstruction --------------------------------------
  res.stages.source = (res.stages.cfg === 'leaked' && res.stages.semantics === 'leaked' && res.stages.constants === 'leaked') ? 'leaked' : 'blocked';

  // --- topology metric ----------------------------------------------------
  res.detail.topology = analyzeTopology(ast, tbl);
  // Deep (deobfuscating) pass: does the structure survive an analyst who
  // constant-folds the emitted keys and inverts the dispatch transform?
  res.deep = deepAnalyze(ast);

  // --- score --------------------------------------------------------------
  const keys = ['handlerTable', 'opcodeMap', 'semantics', 'instructions', 'constants', 'calls', 'branches', 'functions', 'cfg', 'source'];
  const leakedKeys = keys.filter((k) => res.stages[k] === 'leaked');
  res.leaked = leakedKeys.length;
  res.blocked = keys.length - leakedKeys.length;
  res.total = keys.length;
  res.resistance = Math.round((res.blocked / keys.length) * 100);
  res.leakedList = leakedKeys;
  res.blockedList = keys.filter((k) => res.stages[k] === 'blocked');
  return res;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const SAMPLES = [
  ['print("a + e + c")', 'print'],
  ['local t={} for i=1,10 do t[#t+1]=i*i end print(table.concat(t,","))', 'loop'],
  ['local function f(n) if n<2 then return n end return f(n-1)+f(n-2) end print(f(15))', 'recursion'],
  ['local s=0 for i=1,100 do if i%3==0 then s=s+i elseif i%5==0 then s=s-i end end print(s)', 'branchy'],
];

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

// Which dispatch topology a build used, read from the emitter's own marker.
function strategyOf(src) {
  const m = src.match(/-- dispatcher strategy: (\w+)/);
  return m ? m[1] : 'unknown';
}

function selfArtifacts() {
  const out = [];
  for (const [src, name] of SAMPLES) {
    for (const profile of ['BALANCED', 'SECURE']) {
      for (const seed of SEEDS) {
        try {
          const art = applyBytecodeVm(src, { target: 'lua51', profile, obfuscated: true, rethrow: true, seedOverride: seed });
          out.push([`ours:${profile}:${name}:s${seed}`, art]);
        } catch { /* skip unsampleable */ }
      }
    }
  }
  return out;
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));

let items;
if (files.length) items = files.map((f) => [`file:${f.split(/[\\/]/).pop()}`, fs.readFileSync(f, 'utf8')]);
else items = selfArtifacts();

const results = items.map(([label, src]) => analyze(label, src));

if (jsonMode) {
  console.log(JSON.stringify({ results, average: Math.round(results.reduce((a, r) => a + r.resistance, 0) / (results.length || 1)) }, null, 2));
} else {
  console.log('STATIC DEVIRTUALIZATION RESISTANCE BENCH');
  console.log('='.repeat(80));
  console.log('Resistance = % of the 10 analysis stages that did NOT yield to automatic static analysis.');
  console.log('Analyzer is name-agnostic: it locates structure from AST shape, not from our emitter\'s names.');
  console.log('='.repeat(80));
  for (const r of results) {
    console.log('');
    console.log(`[${r.label}]  ${r.bytes} bytes  lua=${r.luaVersion || 'UNPARSEABLE'}`);
    if (!r.shape) {
      console.log(`  generic parser BLOCKED: ${r.detail.parseError || 'unknown'}`);
      console.log(`  RESISTANCE ${r.resistance}%  (blocked ${r.blocked}/${r.total}: ${r.blockedList.join(',')})`);
      continue;
    }
    const d = r.detail;
    console.log(`  shape: tables=${r.shape.tables} biggestTable=${r.shape.biggestTable} numLits=${r.shape.numericLiterals} strLits=${r.shape.stringLiterals} fns=${r.shape.functions}`);
    console.log(`  dispatchTable=${d.dispatchTableSize || 0} form=${d.dispatchTableForm || 'none'} (numKeyFn=${d.numKeyFn || 0})  opcodes=${d.opcodes || 0}  codeArrayVar=${d.codeArrayVariable || 'n/a'}  arrayLen=${d.biggestNumericArray || 0}`);
    console.log(`  strides: ${JSON.stringify(d.strideHistogram || {})}  (${d.distinctStrides || 0} distinct)`);
    console.log(`  semantics: labelled ${d.opcodesLabelled || 0}/${d.opcodes || 0}  distinctLabels=${d.distinctSemanticLabels || 0}  jumpHandlers=${d.jumpHandlers || 0}`);
    const t = d.topology || {};
    console.log(`  topology: singleTableEdge=${t.singleTableEdge} edgeSites=${t.distinctDispatchSites || 0} inlineIfChain=${t.inlineIfChain}(${t.inChainCalls || 0})`);
    const st = r.stages;
    const fmt = (s) => s === 'leaked' ? 'LEAK ' : 'BLOCK';
    console.log(`  stages: ${Object.entries(st).map(([k, v]) => `${k}=${fmt(v)}`).join(' ')}`);
    console.log(`  DEEP: ${r.deep.stage}  handlers=${r.deep.handlerCount} transform=${r.deep.transformRecovered ? `A=${r.deep.transform.A},B=${r.deep.transform.B},M=${r.deep.transform.M}` : 'no'} opcodesRecovered=${r.deep.opcodesRecovered}`);
    console.log(`  RESISTANCE ${r.resistance}%  (blocked ${r.blocked}/${r.total}: ${r.blockedList.join(',') || 'none'})`);
  }
  console.log('');
  console.log('='.repeat(80));
  const avg = Math.round(results.reduce((a, r) => a + r.resistance, 0) / (results.length || 1));
  console.log(`SHALLOW (pattern-based) AVERAGE RESISTANCE (${results.length} artifact(s)): ${avg}%`);

  // Deep pass: the honest number against an analyst who evaluates the emitted
  // expressions instead of pattern-matching them.
  const deob = results.filter((r) => r.deep && r.deep.opcodeMapRecovered).length;
  const tblOnly = results.filter((r) => r.deep && r.deep.stage === 'TABLE-ONLY').length;
  const blocked = results.filter((r) => r.deep && r.deep.stage === 'BLOCKED').length;
  console.log(`DEEP (deobfuscating)  opcode->handler map recovered in ${deob}/${results.length}` +
    `   table-only ${tblOnly}   fully blocked ${blocked}`);
  console.log('  => the shallow number measures resistance to a generic tool;');
  console.log('     the deep number measures resistance to an analyst who reads the transform.');

  // Rung 3: semantic classification, once the map is recovered.
  const cls = results.map((r) => r.deep && r.deep.classified).filter(Boolean);
  if (cls.length) {
    const sum = (f) => cls.reduce((a, c) => a + f(c), 0);
    const tot = sum((c) => c.total);
    const pct = (v) => `${v} (${Math.round((v / tot) * 100)}%)`;
    console.log('');
    console.log('--- rung 3: semantic classification of recovered handlers ---');
    console.log(`  handlers recovered                : ${tot}  (~${Math.round(tot / cls.length)} per artifact)`);
    console.log(`  ANY semantic tag, from body alone : ${pct(sum((c) => c.anyShallow))}`);
    console.log(`  ANY semantic tag, after following : ${pct(sum((c) => c.anyResolved))}`);
    console.log(`  NAMED operation, from body alone  : ${pct(sum((c) => c.opShallow))}`);
    console.log(`  NAMED operation, after following  : ${pct(sum((c) => c.opResolved))}`);
    console.log('');
    console.log('  Read together: the combinator layer drives NAMED-operation-in-place to');
    console.log('  zero, so a single AST pass over a handler body no longer tells you what');
    console.log('  the operation is. Naming it then costs resolving which per-build group');
    console.log('  holds the operation, under which permuted tag, and which body shape.');
    console.log('  Only a minority of all handlers are value operations, so the');
    console.log('  "after following" figure is expected to stay well under 100%.');
  }

  // Per-topology breakdown. A single number is misleading when the emitter
  // picks the dispatch shape per build, so report each shape separately.
  const byStrat = new Map();
  for (let i = 0; i < results.length; i++) {
    const s = strategyOf(items[i][1]);
    if (!byStrat.has(s)) byStrat.set(s, []);
    byStrat.get(s).push(results[i]);
  }
  console.log('');
  console.log('--- by dispatch topology ---');
  for (const [s, rs] of [...byStrat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const a = Math.round(rs.reduce((x, r) => x + r.resistance, 0) / rs.length);
    const stages = new Map();
    for (const r of rs) for (const k of r.blockedList) stages.set(k, (stages.get(k) || 0) + 1);
    const blockedDesc = [...stages.entries()].sort((a2, b2) => b2[1] - a2[1])
      .map(([k, n]) => `${k} ${n}/${rs.length}`).join(', ');
    console.log(`  ${s.padEnd(22)} n=${String(rs.length).padStart(3)}  avg resistance ${String(a).padStart(3)}%   blocked: ${blockedDesc || 'none'}`);
  }
}
