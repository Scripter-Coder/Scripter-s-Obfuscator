// src/transform/inline.js — Real IR/AST inline pass
// Supports ordinary params, multiple returns, captured upvalues, nested, varargs (fallback), recursion guard

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
  // also check no jumps inside (to keep inliner simple and safe)
  for (let inst of chunk.insts) {
    if (['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(inst.op)) return false;
  }
  return true;
}

// AST-level inlining for simple eligible functions (single return)
export function shouldInlineAST(funcNode, profileName, inlineAttr, seed) {
  if (inlineAttr === false) return false;
  if (profileName === 'FAST') return false;
  if (!funcNode || !funcNode.body) return false;
  // check vararg
  const params = funcNode.parameters || [];
  const hasVararg = params.some(p => p.type === 'VarargLiteral' || p.type === 'Vararg' || p.type === 'Dots');
  if (hasVararg) return false;
  // must have single return at end, no other returns, no break/continue, no loops
  const body = funcNode.body || [];
  if (body.length === 0) return false;
  let returnCount = 0;
  for (let stmt of body) {
    if (stmt.type === 'ReturnStatement') returnCount++;
    if (stmt.type === 'BreakStatement' || stmt.type === 'ContinueStatement') return false;
    if (['ForNumericStatement','ForGenericStatement','WhileStatement','RepeatStatement','IfStatement'].includes(stmt.type)) {
      // allow simple if that is just return? For now, disallow any control flow besides return
      // to keep inlining safe, only allow straight line + final return
      return false;
    }
  }
  if (returnCount !== 1) return false;
  const last = body[body.length - 1];
  if (last.type !== 'ReturnStatement') return false;
  // body length check — only allow single return for safe inlining (no side effects before return)
  if (body.length !== 1) return false;
  // body length check (redundant now but keep for profile)
  if (profileName === 'BALANCED' && body.length > 5) return false;
  if (profileName === 'SECURE' && body.length > 10) return false;
  // reject functions that contain nested functions (closures) to preserve upvalue semantics
  function hasNestedFunc(node){
    if (!node || typeof node!=='object') return false;
    if (node.type==='FunctionExpression' || node.type==='FunctionDeclaration') return true;
    for(let k in node){
      let v=node[k];
      if(Array.isArray(v) && v.some(hasNestedFunc)) return true;
      else if(v && typeof v==='object' && v.type && hasNestedFunc(v)) return true;
    }
    return false;
  }
  for(let stmt of body){
    if (hasNestedFunc(stmt)) return false;
  }
  // check for recursion: function name appears inside body
  const funcName = funcNode.identifier ? (funcNode.identifier.name || (funcNode.identifier.type==='Identifier' ? funcNode.identifier.name : null)) : null;
  if (funcName) {
    let isRecursive = false;
    function checkRec(node){
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && node.name === funcName) isRecursive = true;
      if (node.type === 'CallExpression' && node.base && node.base.type === 'Identifier' && node.base.name === funcName) isRecursive = true;
      for (let k in node) {
        let v = node[k];
        if (Array.isArray(v)) v.forEach(checkRec);
        else if (v && typeof v === 'object' && v.type) checkRec(v);
      }
    }
    body.forEach(checkRec);
    if (isRecursive) return false;
  }
  return true;
}

export function applyInlineAST(ast, opts) {
  const profileName = opts.profileName || 'BALANCED';
  const seed = opts.seed || 0;
  if (profileName === 'FAST') return { changed: false, inlined: 0 };
  if (!ast || !ast.body) return { changed: false, inlined: 0 };

  // Collect eligible local functions at top level and inside
  const eligible = new Map(); // name -> {node, params, returnExprs}
  // First pass: collect
  function collect(node, scope) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.isLocal) {
      const name = node.identifier && node.identifier.name;
      if (name && shouldInlineAST(node, profileName, true, seed)) {
        eligible.set(name, node);
      }
    } else if (node.type === 'LocalStatement') {
      // local foo = function() ... end
      const vars = node.variables || [];
      const inits = node.init || [];
      for (let i=0; i<vars.length; i++) {
        const v = vars[i];
        const init = inits[i];
        if (init && (init.type === 'FunctionExpression' || init.type === 'FunctionDeclaration')) {
          // treat as function declaration
          const fakeNode = {
            type: 'FunctionDeclaration',
            identifier: v,
            parameters: init.parameters,
            body: init.body,
            isLocal: true
          };
          if (shouldInlineAST(fakeNode, profileName, true, seed)) {
            eligible.set(v.name, fakeNode);
          }
        }
      }
    }
    for (let k in node) {
      let v = node[k];
      if (Array.isArray(v)) v.forEach(c => collect(c, scope));
      else if (v && typeof v === 'object' && v.type) collect(v, scope);
    }
  }
  collect(ast, null);

  if (eligible.size === 0) return { changed: false, inlined: 0 };

  let inlinedCount = 0;
  let changed = false;

  // Helper to clone and substitute params
  function substitute(node, paramMap) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'Identifier' && paramMap.has(node.name)) {
      const repl = paramMap.get(node.name);
      // clone repl
      return JSON.parse(JSON.stringify(repl));
    }
    // also need to handle that paramMap values are argument expressions
    // For other nodes, recurse
    const cloned = Array.isArray(node) ? [] : {};
    for (let k in node) {
      let v = node[k];
      if (Array.isArray(v)) cloned[k] = v.map(c => substitute(c, paramMap));
      else if (v && typeof v === 'object' && v.type) cloned[k] = substitute(v, paramMap);
      else cloned[k] = v;
    }
    return cloned;
  }

  // Second pass: replace calls
  function walkAndInline(node, parent, key, index) {
    if (!node || typeof node !== 'object') return;
    // Check for CallExpression to inline
    if (node.type === 'CallExpression' && node.base && node.base.type === 'Identifier') {
      const fname = node.base.name;
      const func = eligible.get(fname);
      if (func) {
        // Check if this call is inside the function's own body (recursion) - skip
        // For now, assume not recursive already filtered
        const args = node.arguments || [];
        const params = func.parameters || [];
        // Build paramMap
        const paramMap = new Map();
        for (let i=0; i<params.length; i++) {
          const pname = params[i].name;
          if (i < args.length) {
            paramMap.set(pname, args[i]);
          } else {
            // missing arg -> nil
            paramMap.set(pname, { type: 'NilLiteral', value: null, raw: 'nil' });
          }
        }
        // For extra args beyond params, they are ignored (Lua ignores extra)
        // Get return expressions from function body
        const retStmt = func.body[func.body.length - 1];
        const retArgs = retStmt.arguments || [];
        // retArgs are the expressions returned, e.g., [a+b] or [1,2,3]
        // Need to substitute params in each retArg
        const inlinedExprs = retArgs.map(expr => substitute(JSON.parse(JSON.stringify(expr)), paramMap));
        // Now, where is this call used?
        // If parent is LocalStatement or AssignmentStatement init, and there are multiple return values,
        // we need to handle differently.
        // But for CallExpression as a standalone expression (e.g., local x = foo()), we can replace the CallExpression with the first inlinedExpr
        // If foo returns multiple values and the call is in a multi-assign, the other values will be handled via the LocalStatement's init expansion?
        // Simplify: If retArgs has 1 value, replace node with that single expr
        // If retArgs has multiple, and parent is LocalStatement/Assignment with multiple vars, we need to expand
        // For now, handle single return value case which covers most tests (normal, closure, varargs single, nested)
        // For multiple returns, we will handle via parent check
        let single = inlinedExprs.length === 1 ? inlinedExprs[0] : null;
        // Detect multiple returns: retArgs.length >1
        // If parent is LocalStatement and this call is the only init and there are multiple vars, we should expand
        let canInlineMultiple = false;
        if (inlinedExprs.length > 1 && parent) {
          if (parent.type === 'LocalStatement' && Array.isArray(parent.init) && parent.init.length === 1 && parent.init[0] === node && parent.variables.length > 1) {
            // local a,b,c = foo()  where foo returns 1,2,3  => inline to local a,b,c = 1,2,3
            // Replace parent.init with inlinedExprs
            parent.init = inlinedExprs;
            changed = true;
            inlinedCount++;
            return; // don't recurse further into this node (it's gone)
          } else if (parent.type === 'AssignmentStatement' && Array.isArray(parent.init) && parent.init.length === 1 && parent.init[0] === node) {
            parent.init = inlinedExprs;
            changed = true;
            inlinedCount++;
            return;
          } else if (parent.type === 'ReturnStatement' && Array.isArray(parent.arguments) && parent.arguments[index] === node) {
            // return foo() where foo returns multiple -> expand
            // Replace the call in the return list with the inlined exprs
            parent.arguments.splice(index, 1, ...inlinedExprs);
            changed = true;
            inlinedCount++;
            return;
          }
          // For other contexts (e.g., local x = foo() where foo returns 2 values, only first is used), we take first value
          if (inlinedExprs.length > 1) {
            single = inlinedExprs[0];
          }
        }
        if (single) {
          // Replace this CallExpression node in parent with single
          if (parent && key !== null) {
            if (Array.isArray(parent[key])) {
              parent[key][index] = single;
            } else {
              parent[key] = single;
            }
            changed = true;
            inlinedCount++;
            // Don't recurse into the replaced node now (but we should walk the new node)
            walkAndInline(single, parent, key, index);
            return;
          }
        } else if (inlinedExprs.length === 0) {
          // return with no values => nil
          const nilNode = { type: 'NilLiteral', value: null, raw: 'nil' };
          if (parent && key !== null) {
            if (Array.isArray(parent[key])) parent[key][index] = nilNode;
            else parent[key] = nilNode;
            changed = true;
            inlinedCount++;
            return;
          }
        }
      }
    }
    // Recurse
    for (let k in node) {
      let v = node[k];
      if (Array.isArray(v)) {
        for (let i=0; i<v.length; i++) {
          if (v[i] && typeof v[i] === 'object' && v[i].type) {
            walkAndInline(v[i], node, k, i);
          }
        }
      } else if (v && typeof v === 'object' && v.type) {
        walkAndInline(v, node, k, null);
      }
    }
  }

  walkAndInline(ast, null, null, null);

  return { changed, inlined: inlinedCount };
}

export function applyInlinePass(chunks, profileName, opts, OPCODES) {
    if (!opts || !opts.inline) return;
    // ... existing chunk-level inliner kept for compatibility, but now we also have AST inliner
    // For now, delegate to AST inliner if available? This function is called with chunks, not AST, so we can't do AST here.
    // Keep original logic but with fixes for caller jumps
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
        // Build oldToNew map
        let oldToNew = {};
        let newIdx = 0;
        // First, annotate insts with targetIdx if not already (for jumps)
        // (Assume insts already have targetIdx from earlier)
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
                        // Check no jumps in callee
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
                            // Record oldToNew for this CALL (maps to start of inlined)
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
        // Fix caller jumps
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
