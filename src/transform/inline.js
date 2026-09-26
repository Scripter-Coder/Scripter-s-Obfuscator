// src/transform/inline.js — Real IR/AST inline pass (V15 wired)
// Operates through the compiler/IR path (AST pre-lowering). Supports ordinary
// params, zero params, return values, multiple returns, varargs (tail),
// upvalues (incl. mutable), nested functions, side effects, argument
// evaluation order, VM NONE / OPAL / ONYX via per-function gates.

export function shouldInline(chunk, profileName, inlineAttr) {
  if (inlineAttr === false) return false;
  if (profileName === 'FAST') return false;
  if (chunk.vararg) return false;
  let retCount = 0;
  for (let inst of chunk.insts) {
      if (inst.op === 'RET' || inst.op === 'RETP') retCount++;
  }
  if (retCount !== 1) return false;
  let last = chunk.insts[chunk.insts.length - 1];
  if (last.op !== 'RET') return false;
  const bodyLen = chunk.insts.length;
  if (profileName === 'BALANCED' && bodyLen > 25) return false;
  if (profileName === 'SECURE' && bodyLen > 50) return false;
  for (let inst of chunk.insts) {
    if (['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(inst.op)) return false;
  }
  return true;
}

const CONTROL_TYPES = new Set(['ForNumericStatement','ForGenericStatement','WhileStatement','RepeatStatement','IfStatement','BreakStatement','ContinueStatement','GotoStatement','LabelStatement']);
let __inlineTempCounter = 0;
function freshTemp(prefix = '__inl') {
  __inlineTempCounter += 1;
  return `${prefix}_${__inlineTempCounter}`;
}
export function __resetInlineTemps() { __inlineTempCounter = 0; }

function isVarargParam(p) {
  return p && (p.type === 'VarargLiteral' || p.type === 'Vararg' || p.type === 'Dots' || p.type === 'VarargExpression');
}

// In a call's ARGUMENT list only the final position is a multi-return
// expression: `f(g())` passes every result of g(), while `f(g(), 9)` and
// `f(9, g())` both truncate g() to a single value. An expanding node in the
// last slot therefore supplies this parameter AND every parameter after it.
function expandsToMultipleValues(n) {
  if (!n) return false;
  if (n.type === 'CallExpression' || n.type === 'FunctionCall') return true;
  if (isVarargParam(n)) return true;
  // A parenthesised expression is truncated to one value in Lua 5.1/5.2/5.3/5.4
  // (`(f())` adjusts to one result), so it must NOT be treated as expanding.
  if (n.type === 'ParenthesizedExpression' || n.type === 'GroupExpression') return false;
  return false;
}

// AST-level eligibility: straight-line body (locals/assigns/calls)* + final return.
// No control flow, no mid-body returns. Upvalues/nested/varargs allowed;
// call-site expansion preserves semantics via temp bindings.
export function shouldInlineAST(funcNode, profileName, inlineAttr, seed) {
  if (inlineAttr === false) return false;
  if (profileName === 'FAST') return false;
  if (!funcNode || !funcNode.body) return false;
  const body = funcNode.body || [];
  if (body.length === 0) return false;
  const maxStmts = profileName === 'BALANCED' ? 6 : 12;
  if (body.length > maxStmts) return false;
  let returnCount = 0;
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    const isLast = i === body.length - 1;
    if (stmt.type === 'ReturnStatement') {
      returnCount++;
      if (!isLast) return false;
    } else if (isLast) {
      return false;
    } else if (stmt.type === 'LocalStatement' || stmt.type === 'AssignmentStatement' || stmt.type === 'CallStatement') {
      // allowed prelude (side effects preserved via statement expansion)
    } else if (stmt.type === 'CallExpression') {
      // expression-statement call prelude (luaparse may use CallStatement)
    } else {
      return false;
    }
    if (CONTROL_TYPES.has(stmt.type)) return false;
    // nested control inside prelude statements is rejected via deep scan
    if (stmt.type !== 'ReturnStatement') {
      let bad = false;
      (function scan(n) {
        if (!n || typeof n !== 'object' || bad) return;
        if (CONTROL_TYPES.has(n.type)) { bad = true; return; }
        if (n.type === 'ReturnStatement') { bad = true; return; }
        for (let k in n) {
          const v = n[k];
          if (Array.isArray(v)) v.forEach(scan);
          else if (v && typeof v === 'object' && v.type) scan(v);
        }
      })(stmt);
      if (bad) return false;
    }
  }
  if (returnCount !== 1) return false;
  const funcName = funcNode.identifier ? (funcNode.identifier.name || null) : null;
  if (funcName) {
    let isRecursive = false;
    function checkRec(node){
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.base && node.base.type === 'Identifier' && node.base.name === funcName) isRecursive = true;
      for (let k in node) {
        let v=node[k];
        if (Array.isArray(v)) v.forEach(checkRec);
        else if (v && typeof v==='object' && v.type) checkRec(v);
      }
    }
    body.forEach(checkRec);
    if (isRecursive) return false;
  }
  return true;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function substitute(node, paramMap, parent, key) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'Identifier' && paramMap.has(node.name) && isReferencePosition(parent, key)) {
    return clone(paramMap.get(node.name));
  }
  if ((node.type === 'VarargLiteral' || node.type === 'Vararg' || node.type === 'Dots') && paramMap.has('...')) {
    return clone(paramMap.get('...'));
  }
  const out = Array.isArray(node) ? [] : {};
  for (let k in node) {
    let v = node[k];
    if (Array.isArray(v)) out[k] = v.map(c => (c && typeof c === 'object' && c.type) ? substitute(c, paramMap, node, k) : c);
    else if (v && typeof v === 'object' && v.type) out[k] = substitute(v, paramMap, node, k);
    else out[k] = v;
  }
  return out;
}

function isReferencePosition(parent, key) {
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && key === 'identifier') return false;
  if ((parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key') return false;
  if (parent.type === 'FunctionDeclaration' && key === 'identifier') return false;
  return true;
}

function isPureArg(n) {
  if (!n) return true;
  return n.type === 'NumericLiteral' || n.type === 'StringLiteral' || n.type === 'BooleanLiteral' || n.type === 'NilLiteral' || n.type === 'Identifier' || n.type === 'VarargLiteral' || n.type === 'Vararg';
}

function isSafeDiscardExpr(n) {
  if (!n) return true;
  if (n.type === 'NumericLiteral' || n.type === 'StringLiteral' || n.type === 'BooleanLiteral' || n.type === 'NilLiteral' || n.type === 'Identifier') return true;
  if (n.type === 'UnaryExpression') return isSafeDiscardExpr(n.argument);
  if (n.type === 'BinaryExpression') return isSafeDiscardExpr(n.left) && isSafeDiscardExpr(n.right);
  return false;
}

function countParamUses(funcBody, paramNames) {
  const counts = new Map(paramNames.map(p => [p, 0]));
  (function walk(n, parent, key) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier' && counts.has(n.name) && isReferencePosition(parent, key)) counts.set(n.name, counts.get(n.name) + 1);
    for (let k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((child) => walk(child, n, k));
      else if (v && typeof v === 'object' && v.type) walk(v, n, k);
    }
  })({ type: 'Block', body: funcBody }, null, null);
  return counts;
}

export function applyInlineAST(ast, opts) {
  const o = opts || {};
  const profileName = o.profileName || 'BALANCED';
  const seed = o.seed || 0;
  const disabled = o.disabled instanceof Set ? o.disabled : new Set();
  __resetInlineTemps();
  if (profileName === 'FAST') return { changed: false, inlined: 0 };
  if (!ast || !ast.body) return { changed: false, inlined: 0 };

  const eligible = new Map();
  const eligibleNames = new Set();
  const eligibleCounts = new Map();
  const assignedNames = new Set();
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentStatement') {
      for (const variable of node.variables || []) if (variable && variable.type === 'Identifier') assignedNames.add(variable.name);
    }
    if (node.type === 'FunctionDeclaration' && node.isLocal) {
      const name = node.identifier && node.identifier.name;
      if (name && !disabled.has(name) && shouldInlineAST(node, profileName, true, seed)) {
        eligible.set(name, node); eligibleNames.add(name); eligibleCounts.set(name, (eligibleCounts.get(name) || 0) + 1);
      }
    } else if (node.type === 'LocalStatement') {
      const vars = node.variables || [];
      const inits = node.init || [];
      for (let i=0; i<vars.length; i++) {
        const v = vars[i];
        const init = inits[i];
        if (init && (init.type === 'FunctionExpression' || init.type === 'FunctionDeclaration')) {
          const fakeNode = {
            type: 'FunctionDeclaration',
            identifier: v,
            parameters: init.parameters,
            body: init.body,
            isLocal: true
          };
          if (v && v.name && !disabled.has(v.name) && shouldInlineAST(fakeNode, profileName, true, seed)) {
            eligible.set(v.name, fakeNode); eligibleNames.add(v.name); eligibleCounts.set(v.name, (eligibleCounts.get(v.name) || 0) + 1);
          }
        }
      }
    }
    for (let k in node) {
      let v = node[k];
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v==='object' && v.type) collect(v);
    }
  }
  collect(ast);
  for (const [name, count] of eligibleCounts) {
    if (count > 1 || assignedNames.has(name)) { eligible.delete(name); eligibleNames.delete(name); }
  }
  function calledNames(fn) {
    const names = new Set();
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'CallExpression' && n.base && n.base.type === 'Identifier') names.add(n.base.name);
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && v.type) walk(v); }
    })({ type: 'Block', body: fn.body || [] });
    return names;
  }
  let removed = true;
  while (removed) {
    removed = false;
    for (const name of Array.from(eligible.keys())) {
      const seen = new Set();
      const reaches = (current) => {
        if (current === name) return true;
        if (seen.has(current)) return false;
        seen.add(current);
        const fn = eligible.get(current);
        if (!fn) return false;
        for (const dep of calledNames(fn)) if (eligible.has(dep) && reaches(dep)) return true;
        return false;
      };
      const deps = calledNames(eligible.get(name));
      if ([...deps].some((dep) => eligible.has(dep) && reaches(dep))) { eligible.delete(name); removed = true; }
    }
  }
  if (eligible.size === 0) return { changed: false, inlined: 0 };

  let inlinedCount = 0;
  let changed = false;

  // Statement-list expansion: handles multi-statement bodies with side
  // effects, upvalues, multiple returns, and strict left-to-right argument
  // evaluation via fresh temp bindings. Operates on AST statement arrays
  // (the compiler path), never textual substitution.
  function tryExpandStatementList(stmts, idx) {
    const stmt = stmts[idx];
    if (!stmt) return false;
    // Patterns: LocalStatement / AssignmentStatement with single call init,
    // ReturnStatement with call arg, CallStatement bare call.
    let callNode = null;
    let kind = null;
    if (stmt.type === 'LocalStatement' && stmt.init && stmt.init.length === 1 && stmt.init[0] && stmt.init[0].type === 'CallExpression' && stmt.init[0].base && stmt.init[0].base.type === 'Identifier') {
      callNode = stmt.init[0]; kind = 'local';
    } else if (stmt.type === 'AssignmentStatement' && stmt.init && stmt.init.length === 1 && stmt.init[0] && stmt.init[0].type === 'CallExpression' && stmt.init[0].base && stmt.init[0].base.type === 'Identifier') {
      callNode = stmt.init[0]; kind = 'assign';
    } else if (stmt.type === 'ReturnStatement' && stmt.arguments && stmt.arguments.length >= 1) {
      // only expand when exactly one call returning multiple, or single call
      const ci = stmt.arguments.findIndex(a => a && a.type === 'CallExpression' && a.base && a.base.type === 'Identifier' && eligible.has(a.base.name));
      if (ci >= 0 && stmt.arguments.length === 1) { callNode = stmt.arguments[0]; kind = 'return'; }
      else return false;
    } else if (stmt.type === 'CallStatement' && stmt.expression && stmt.expression.type === 'CallExpression' && stmt.expression.base && stmt.expression.base.type === 'Identifier') {
      callNode = stmt.expression; kind = 'callstmt';
    } else {
      return false;
    }
    const fname = callNode.base.name;
    const func = eligible.get(fname);
    if (!func) return false;
    // Safety: closure factories (locals escaping via returned closures)
    // cannot be statement-spliced without alpha-renaming. Skip those sites
    // to preserve per-call fresh locals (e.g. makeCounter/outer patterns).
    // Pure expression functions are still handled by the substitution path.
    try {
      const preludeLocals = new Set();
      for (const ps of (func.body || []).slice(0, -1)) {
        if (ps && ps.type === 'LocalStatement') for (const vv of (ps.variables || [])) if (vv && vv.name) preludeLocals.add(vv.name);
      }
      if (preludeLocals.size > 0) {
        const ret0 = (func.body || [])[(func.body || []).length - 1];
        let escapes = false;
        (function scanEsc(n) {
          if (!n || typeof n !== 'object' || escapes) return;
          if (n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration') {
            // check if it references any prelude local
            (function scanRef(r) {
              if (!r || typeof r !== 'object' || escapes) return;
              if (r.type === 'Identifier' && preludeLocals.has(r.name)) escapes = true;
              for (const k in r) { const vv = r[k]; if (Array.isArray(vv)) vv.forEach(scanRef); else if (vv && typeof vv === 'object' && vv.type) scanRef(vv); }
            })(n);
            return;
          }
          for (const k in n) { const vv = n[k]; if (Array.isArray(vv)) vv.forEach(scanEsc); else if (vv && typeof vv === 'object' && vv.type) scanEsc(vv); }
        })(ret0);
        if (escapes) return false;
      }
    } catch (e) { /* conservative: proceed */ }
    // Never inline a function into its own body
    // (recursion already filtered, but guard nested self-reference)
    const args = callNode.arguments || [];
    const params = (func.parameters || []).filter(p => !isVarargParam(p));
    const hasVararg = (func.parameters || []).some(isVarargParam);
    // Lua evaluates every supplied argument, even when the callee declares
    // fewer formals. Do not drop an impure extra argument during splicing.
    if (!hasVararg && args.length > params.length) return false;
    const body = func.body || [];
    if (body.length === 0) return false;
    const retStmt = body[body.length - 1];
    if (!retStmt || retStmt.type !== 'ReturnStatement') return false;
    const retArgs = retStmt.arguments || [];
    if (kind === 'callstmt' && retArgs.some((expr) => !isSafeDiscardExpr(expr))) return false;
    const prelude = body.slice(0, body.length - 1);

    // Build temp bindings for params in evaluation order.
    const bindings = [];
    const paramToTemp = new Map();
    // Position of a trailing multi-return argument, or -1. When set, the
    // params from that index onward are bound from ONE call so that all of
    // its results land in them left to right.
    let multiArgIndex = -1;
    if (args.length > 0) {
      const lastArg = args.length - 1;
      if (expandsToMultipleValues(args[lastArg]) && lastArg < params.length) {
        // A variadic callee would also need the results beyond its declared
        // params, which cannot be expressed as a fixed local list. Decline the
        // inline instead of emitting a wrong splice: an uninlined call is
        // still correct, a wrong one is not.
        if (!hasVararg) multiArgIndex = lastArg;
      }
    }
    for (let i = 0; i < params.length; i++) {
      if (multiArgIndex >= 0 && i >= multiArgIndex) {
        // Bind this param and every remaining one from the single expanding
        // call. Lua pads missing results with nil and discards extras, which
        // is exactly what `local t1,t2,... = call()` does.
        const vars = [];
        for (let j = i; j < params.length; j++) {
          const tv = freshTemp('__inl_p');
          paramToTemp.set(params[j].name, tv);
          vars.push({ type: 'Identifier', name: tv });
        }
        bindings.push({ type: 'LocalStatement', variables: vars, init: [clone(args[multiArgIndex])] });
        break;
      }
      const pname = params[i].name;
      const t = freshTemp('__inl_p');
      paramToTemp.set(pname, t);
      const argExpr = i < args.length ? clone(args[i]) : { type: 'NilLiteral', value: null, raw: 'nil' };
      bindings.push({ type: 'LocalStatement', variables: [{ type: 'Identifier', name: t }], init: [argExpr] });
    }
    let varargBinding = null;
    if (hasVararg) {
      const extra = args.slice(params.length).map(clone);
      if (extra.some((arg) => !isPureArg(arg))) return false;
      const t = freshTemp('__inl_va');
      // Represent ... as a packed table temp; substitute VarargLiteral with
      // an unpack of that temp is complex at AST level, so expand only when
      // ... appears in tail call position (f(..., ) or select(..., )) by
      // splicing. Otherwise bind and substitute via table unpack helper is
      // out of scope: fall back to no-inline for non-tail vararg use.
      let usesVararg = false;
      (function scanV(n) {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'VarargLiteral' || n.type === 'Vararg' || n.type === 'Dots') usesVararg = true;
        for (let k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(scanV); else if (v && typeof v === 'object' && v.type) scanV(v); }
      })({ type: 'Block', body });
      if (usesVararg) {
        // Only support tail-position ... (last call arg). Check all uses.
        let tailOnly = true;
        (function scanTail(n, parent, key, index) {
          if (!n || typeof n !== 'object') return;
          if ((n.type === 'VarargLiteral' || n.type === 'Vararg' || n.type === 'Dots')) {
            const callTail = parent && parent.type === 'CallExpression' && Array.isArray(parent.arguments) && parent.arguments[parent.arguments.length - 1] === n;
            const returnTail = parent && parent.type === 'ReturnStatement' && Array.isArray(parent.arguments) && parent.arguments[parent.arguments.length - 1] === n;
            if (!callTail && !returnTail) tailOnly = false;
          }
          for (let k in n) {
            const v = n[k];
            if (Array.isArray(v)) v.forEach((c, ii) => scanTail(c, n, k, ii));
            else if (v && typeof v === 'object' && v.type) scanTail(v, n, k, null);
          }
        })({ type: 'Block', body });
        if (!tailOnly) return false;
        varargBinding = { temp: t, extra };
      }
    }

    const tempMap = new Map();
    for (const [pname, t] of paramToTemp) tempMap.set(pname, { type: 'Identifier', name: t });

    function substituteWithVararg(node) {
      let out = substitute(clone(node), tempMap);
      if (varargBinding) {
        // splice tail ... into call args
        (function spliceTail(n) {
          if (!n || typeof n !== 'object') return;
          if (n.type === 'CallExpression' && Array.isArray(n.arguments) && n.arguments.length) {
            const last = n.arguments[n.arguments.length - 1];
            if (last && (last.type === 'VarargLiteral' || last.type === 'Vararg' || last.type === 'Dots')) {
              n.arguments.splice(n.arguments.length - 1, 1, ...varargBinding.extra.map(clone));
            }
          }
          if (n.type === 'ReturnStatement' && Array.isArray(n.arguments) && n.arguments.length) {
            const last = n.arguments[n.arguments.length - 1];
            if (last && (last.type === 'VarargLiteral' || last.type === 'Vararg' || last.type === 'Dots')) {
              n.arguments.splice(n.arguments.length - 1, 1, ...varargBinding.extra.map(clone));
            }
          }
          for (let k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(spliceTail); else if (v && typeof v === 'object' && v.type) spliceTail(v); }
        })(out);
      }
      return out;
    }

    const expandedPrelude = prelude.map(s => substituteWithVararg(s));
    // Substitute prelude locals that might shadow temps? Fresh temps avoid collision.

    if (kind === 'local') {
      // local vars = f(args)  (vars may be 1..N)
      const vars = stmt.variables || [];
      if (varargBinding && retArgs.length === 1 && (retArgs[0].type === 'VarargLiteral' || retArgs[0].type === 'Vararg' || retArgs[0].type === 'Dots')) {
        const replacement = [...bindings, ...expandedPrelude, { type: 'LocalStatement', variables: clone(vars), init: varargBinding.extra.map(clone) }];
        stmts.splice(idx, 1, ...replacement);
        inlinedCount++; changed = true;
        return true;
      }
      if (retArgs.length <= 1) {
        const retExpr = retArgs.length === 1 ? substituteWithVararg(retArgs[0]) : { type: 'NilLiteral', value: null, raw: 'nil' };
        const replacement = [...bindings];
        if (varargBinding) {
          // materialize vararg temp as multiple locals? For tail splice we
          // already spliced, no temp needed. Skip binding.
        }
        replacement.push(...expandedPrelude);
        replacement.push({ type: 'LocalStatement', variables: clone(vars), init: [retExpr] });
        stmts.splice(idx, 1, ...replacement);
        inlinedCount++; changed = true;
        return true;
      } else {
        // multiple returns: local a,b = f() -> bindings + prelude + local a,b = r1,r2
        if (vars.length === 1) {
          // single var receiving multiple: keep first (Lua truncates)
          const first = substituteWithVararg(retArgs[0]);
          const replacement = [...bindings, ...expandedPrelude, { type: 'LocalStatement', variables: clone(vars), init: [first] }];
          stmts.splice(idx, 1, ...replacement);
          inlinedCount++; changed = true;
          return true;
        }
        const inits = retArgs.map(r => substituteWithVararg(r));
        const replacement = [...bindings, ...expandedPrelude, { type: 'LocalStatement', variables: clone(vars), init: inits }];
        stmts.splice(idx, 1, ...replacement);
        inlinedCount++; changed = true;
        return true;
      }
    } else if (kind === 'assign') {
      const vars = stmt.variables || [];
      const directVararg = varargBinding && retArgs.length === 1 && (retArgs[0].type === 'VarargLiteral' || retArgs[0].type === 'Vararg' || retArgs[0].type === 'Dots');
      const retExprs = directVararg ? varargBinding.extra.map(clone) : (retArgs.length ? retArgs.map(r => substituteWithVararg(r)) : [{ type: 'NilLiteral', value: null, raw: 'nil' }]);
      const replacement = [...bindings, ...expandedPrelude, { type: 'AssignmentStatement', variables: clone(vars), init: retExprs }];
      stmts.splice(idx, 1, ...replacement);
      inlinedCount++; changed = true;
      return true;
    } else if (kind === 'return') {
      // return f(args) -> bindings + prelude + return exprs
      const directVararg = varargBinding && retArgs.length === 1 && (retArgs[0].type === 'VarargLiteral' || retArgs[0].type === 'Vararg' || retArgs[0].type === 'Dots');
      const retExprs = directVararg ? varargBinding.extra.map(clone) : (retArgs.length ? retArgs.map(r => substituteWithVararg(r)) : []);
      const replacement = [...bindings, ...expandedPrelude, { type: 'ReturnStatement', arguments: retExprs }];
      stmts.splice(idx, 1, ...replacement);
      inlinedCount++; changed = true;
      return true;
    } else if (kind === 'callstmt') {
      // f(args) as statement: bindings + prelude (+ return discarded)
      const replacement = [...bindings, ...expandedPrelude];
      // if function returns values they are discarded as statement
      stmts.splice(idx, 1, ...replacement);
      inlinedCount++; changed = true;
      return true;
    }
    return false;
  }

  // Walk statement lists depth-first, expanding eligible calls.
  function walkStmtLists(node) {
    if (!node || typeof node !== 'object') return;
    // Function bodies hold statement arrays in .body
    if (Array.isArray(node.body)) {
      for (let i = 0; i < node.body.length; i++) {
        if (tryExpandStatementList(node.body, i)) {
          // expanded: re-walk inserted range conservatively (nested inline)
          const inserted = node.body;
          // avoid infinite loop: cap iterations
          if (inlinedCount > 500) return;
          // re-walk the whole list from start to catch nested inline
          walkStmtLists({ body: inserted.slice(0, i) });
          // walk newly inserted statements' children
          for (let j = i; j < Math.min(inserted.length, i + 12); j++) walkStmtLists(inserted[j]);
          // continue after inserted block
          continue;
        }
        walkStmtLists(node.body[i]);
      }
    }
    for (let k in node) {
      if (k === 'body') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walkStmtLists);
      else if (v && typeof v === 'object' && v.type) walkStmtLists(v);
    }
  }

  // First: statement expansion (handles side effects, upvalues, multiret,
  // varargs-tail, nested). This is the primary wired path.
  walkStmtLists(ast);

  // Second: pure expression substitution for remaining single-return pure
  // bodies in arbitrary expression positions, with eval-order guard
  // (skip impure multi-use sites to preserve observable behavior).
  function walkAndInline(node, parent, key, index) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.base && node.base.type === 'Identifier') {
      const fname = node.base.name;
      const func = eligible.get(fname);
      if (func && func.body && func.body.length === 1 && func.body[0].type === 'ReturnStatement') {
        const args = node.arguments || [];
        const params = (func.parameters || []).filter(p => !isVarargParam(p));
        if (!(func.parameters || []).some(isVarargParam)) {
          if (args.length > params.length) return;
          // Substitution maps ONE parameter to ONE argument expression, so it
          // cannot express "a call in the final argument slot feeds this
          // parameter and every one after it". When the callee declares more
          // parameters than the call supplies arguments and the final
          // argument expands, the surplus parameters take the call's 2nd..Nth
          // results; binding them positionally would substitute a bare `nil`
          // (or move an expanding call into a non-final position where it
          // truncates). Decline instead: an uninlined call stays correct.
          if (args.length < params.length && args.length > 0 && expandsToMultipleValues(args[args.length - 1])) return;
          const paramNames = params.map(p => p.name);
          const uses = countParamUses(func.body, paramNames);
          let safe = true;
          const paramMap = new Map();
          for (let i = 0; i < params.length; i++) {
            const pname = params[i].name;
            const arg = i < args.length ? args[i] : { type: 'NilLiteral', value: null, raw: 'nil' };
            if ((uses.get(pname) || 0) > 1 && !isPureArg(arg)) { safe = false; break; }
            paramMap.set(pname, arg);
          }
          if (safe) {
            const retArgs = func.body[0].arguments || [];
            const inlinedExprs = retArgs.map(expr => substitute(clone(expr), paramMap));
            if (inlinedExprs.length > 1) {
              if (parent) {
                if (parent.type === 'LocalStatement' && Array.isArray(parent.init) && parent.init.length === 1 && parent.init[0] === node && parent.variables.length > 1) {
                  parent.init = inlinedExprs; changed = true; inlinedCount++; return;
                } else if (parent.type === 'AssignmentStatement' && Array.isArray(parent.init) && parent.init.length === 1 && parent.init[0] === node) {
                  parent.init = inlinedExprs; changed = true; inlinedCount++; return;
                } else if (parent.type === 'ReturnStatement' && Array.isArray(parent.arguments) && parent.arguments[index] === node) {
                  parent.arguments.splice(index, 1, ...inlinedExprs); changed = true; inlinedCount++; return;
                }
              }
              // Other positions (notably table constructors and call
              // arguments) have context-sensitive multiple-return expansion.
              // Leave the call intact rather than replacing it with only its
              // first result.
              return;
            }
            let single = inlinedExprs.length === 1 ? inlinedExprs[0] : null;
            if (single) {
              if (parent && key !== null) {
                if (Array.isArray(parent[key])) parent[key][index] = single;
                else parent[key] = single;
                changed = true; inlinedCount++;
                walkAndInline(single, parent, key, index);
                return;
              }
            } else if (inlinedExprs.length === 0) {
              const nilNode = { type: 'NilLiteral', value: null, raw: 'nil' };
              if (parent && key !== null) {
                if (Array.isArray(parent[key])) parent[key][index] = nilNode;
                else parent[key] = nilNode;
                changed = true; inlinedCount++;
                return;
              }
            }
          }
        }
      }
    }
    for (let k in node) {
      let v = node[k];
      if (Array.isArray(v)) {
        for (let i=0; i<v.length; i++) {
          if (v[i] && typeof v[i]==='object' && v[i].type) walkAndInline(v[i], node, k, i);
        }
      } else if (v && typeof v==='object' && v.type) {
        walkAndInline(v, node, k, null);
      }
    }
  }
  walkAndInline(ast, null, null, null);

  return { changed, inlined: inlinedCount };
}

export function applyInlinePass(chunks, profileName, opts, OPCODES) {
    if (!opts || !opts.inline) return;
    let chunkUses = {};
    for (let c of chunks) {
        for (let inst of c.insts) {
            if (inst.op === 'NEWF') {
                chunkUses[inst.a] = (chunkUses[inst.a] || 0) + 1;
            }
        }
    }
    for (let ci = 0; ci < chunks.length; ci++) {
        let caller = chunks[ci];
        let insts = caller.insts;
        let localFuncs = new Map();
        for (let i = 0; i < insts.length; i++) {
            if (insts[i].op === 'NEWF' && i + 1 < insts.length && insts[i+1].op === 'LNEW') {
                localFuncs.set(insts[i+1].a, insts[i].a);
            }
        }
        let newInsts = [];
        let maxReg = caller.maxReg || 0;
        let oldToNew = {};
        let i = 0;
        while (i < insts.length) {
            let inst = insts[i];
            if (inst.op === 'CALL') {
                let nArgs = inst.a;
                let fnIdx = findFunctionForCall(newInsts, newInsts.length, nArgs);
                let calleeChunkId = null;
                if (fnIdx !== null) {
                    let fnInst = newInsts[fnIdx.idx];
                    if (fnInst.op === 'NEWF') {
                        calleeChunkId = fnInst.a;
                    } else if (fnInst.op === 'LLOAD') {
                        if (localFuncs.has(fnInst.a)) {
                            calleeChunkId = localFuncs.get(fnInst.a);
                        }
                    }
                }
                if (calleeChunkId !== null && calleeChunkId < ci && calleeChunkId >= 0 && calleeChunkId < chunks.length) {
                    let callee = chunks[calleeChunkId];
                    if (shouldInline(callee, profileName, true)) {
                        let hasJump = callee.insts.some(it => ['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(it.op));
                        if (!hasJump) {
                            let regOffset = maxReg + 1;
                            let mappedParams = [];
                            for (let p of callee.params) mappedParams.push(p + regOffset);
                            let paramBinds = [];
                            for (let j = nArgs - 1; j >= 0; j--) {
                                if (j < callee.params.length) paramBinds.push({ op: 'LNEW', a: mappedParams[j], rawOp: OPCODES['LNEW'] });
                                else paramBinds.push({ op: 'POP', rawOp: OPCODES['POP'] });
                            }
                            paramBinds.push({ op: 'POP', rawOp: OPCODES['POP'] });
                            for (let j = nArgs; j < callee.params.length; j++) {
                                paramBinds.push({ op: 'NIL', rawOp: OPCODES['NIL'] });
                                paramBinds.push({ op: 'LNEW', a: mappedParams[j], rawOp: OPCODES['LNEW'] });
                            }
                            let calleeBody = [];
                            for (let j = 0; j < callee.insts.length; j++) {
                                let cInst = callee.insts[j];
                                if (cInst.op === 'RET') {
                                    let retCount = cInst.a;
                                    if (retCount === 0) calleeBody.push({ op: 'NIL', rawOp: OPCODES['NIL'] });
                                    else if (retCount > 1) for (let k = 1; k < retCount; k++) calleeBody.push({ op: 'POP', rawOp: OPCODES['POP'] });
                                } else {
                                    let cloned = { ...cInst };
                                    if (['LLOAD', 'LNEW', 'LSET'].includes(cloned.op) && cloned.a != null) cloned.a += regOffset;
                                    if (cloned.targetIdx != null) cloned.targetIdx += newInsts.length + paramBinds.length;
                                    calleeBody.push(cloned);
                                }
                            }
                            maxReg += (callee.maxReg || 0) + 1;
                            oldToNew[i] = newInsts.length;
                            newInsts.push(...paramBinds);
                            newInsts.push(...calleeBody);
                            i++;
                            continue;
                        }
                    }
                }
            }
            oldToNew[i] = newInsts.length;
            newInsts.push(inst);
            i++;
        }
        for (let j = 0; j < newInsts.length; j++) {
            let it = newInsts[j];
            if (it.targetIdx != null && oldToNew[it.targetIdx] != null) {
                it.targetIdx = oldToNew[it.targetIdx];
            }
        }
        caller.insts = newInsts;
        caller.maxReg = maxReg;
    }
}

function findFunctionForCall(insts, callIdx, nArgs) {
    let depth = nArgs;
    for (let i = callIdx - 1; i >= 0; i--) {
        let op = insts[i].op;
        if (['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(op)) return null;
        let pushes = 0, pops = 0;
        switch(op) {
            case 'CONST': case 'NUMK': case 'NIL': case 'TRUE': case 'FALSE':
            case 'GLOB': case 'LLOAD': case 'ULOAD': case 'VARGP': case 'NEWF': case 'DUP':
                pushes = 1; pops = 0; break;
            case 'POP': pushes = 0; pops = 1; break;
            case 'LNEW': case 'LSET': case 'GSET': case 'USET':
                pushes = 0; pops = 1; break;
            case 'TGET': pushes = 1; pops = 2; break;
            case 'TSET': pushes = 0; pops = 3; break;
            case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD': case 'POW': case 'CONCAT':
            case 'EQ': case 'NEQ': case 'LT': case 'LE': case 'GT': case 'GE':
                pushes = 1; pops = 2; break;
            case 'NOT': case 'NEG': case 'LEN':
                pushes = 1; pops = 1; break;
            case 'NEWTAB': pushes = 1; pops = 0; break;
            case 'APD': pushes = 0; pops = 2; break;
            case 'SWAP': pushes = 2; pops = 2; break;
            case 'CALL': case 'CALLM': 
                pops = insts[i].a + 1; pushes = 1; break;
            case 'UNPK': pushes = insts[i].a; pops = 1; break;
            case 'UNPKR': pushes = insts[i].a; pops = 1; break;
            case 'UNPK1F': case 'UNPK2F': case 'UNPK3F': pushes = 1; pops = 1; break;
        }
        depth -= pushes;
        if (depth < 0) {
            return { inst: insts[i], idx: i };
        }
        depth += pops;
    }
    return null;
}
