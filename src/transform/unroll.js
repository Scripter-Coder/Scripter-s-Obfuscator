// src/transform/unroll.js — Numeric-loop unrolling (compiler/IR path)

export function getNumericValue(node){
  if (!node) return null;
  if (node.type==='NumericLiteral') return node.value;
  if (node.type==='UnaryExpression' && node.operator==='-' && node.argument && node.argument.type==='NumericLiteral') return -node.argument.value;
  if (node.type==='UnaryExpression' && node.operator==='-' && node.argument && node.argument.type==='UnaryExpression') {
    const v=getNumericValue(node.argument);
    return v!=null ? -v : null;
  }
  return null;
}
export function isComputableBound(node) {
  return getNumericValue(node) !== null;
}

export function shouldUnroll(loopNode, profileName) {
  if (!loopNode || loopNode.type!=='ForNumericStatement') return false;
  if (profileName==='FAST') return false;
  if (!isComputableBound(loopNode.start) || !isComputableBound(loopNode.end)) return false;
  const stepVal = loopNode.step ? getNumericValue(loopNode.step) : 1;
  if (typeof stepVal!=='number') return false;
  if (stepVal === 0) return false;
  const step = stepVal;
  const start = getNumericValue(loopNode.start), end = getNumericValue(loopNode.end);

  if (step > 0 && start > end) return true; // 0 iterations
  if (step < 0 && start < end) return true; // 0 iterations

  const n = Math.floor((end - start)/step)+1;
  if (n <= 0) return true; // 0 iterations
  if (n > 8) return false;
  if (profileName==='BALANCED' && n>4) return false;
  // A goto/label may cross a loop-iteration boundary. Unrolling would change
  // the label target and block structure, so preserve the original lowering
  // for these loops. (goto_nested_test.mjs is the regression corpus.)
  function hasGotoOrLabel(node){
    if (!node || typeof node!=='object') return false;
    if (node.type==='GotoStatement' || node.type==='LabelStatement') return true;
    for(let k in node){
      let v=node[k];
      if(Array.isArray(v) && v.some(hasGotoOrLabel)) return true;
      else if(v && typeof v==='object' && v.type && hasGotoOrLabel(v)) return true;
    }
    return false;
  }
  if (hasGotoOrLabel(loopNode.body)) return false;
  const loopName = loopNode.variable && loopNode.variable.name;
  function hasDangerousMutation(node, inFunction) {
    if (!node || typeof node !== 'object') return false;
    if (!inFunction && node.type === 'AssignmentStatement' && (node.variables || []).some((v) => v && v.type === 'Identifier' && v.name === loopName)) return true;
    if (inFunction && (node.type === 'Identifier') && node.name === loopName) return true;
    const nextInFunction = inFunction || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) { if (v.some((child) => hasDangerousMutation(child, nextInFunction))) return true; }
      else if (v && typeof v === 'object' && v.type && hasDangerousMutation(v, nextInFunction)) return true;
    }
    return false;
  }
  if (loopName && hasDangerousMutation({ type: 'Block', body: loopNode.body }, false)) return false;
  // break/continue are handled via the two-level repeat expansion below;
  // nested loops are unrolled inside-out by the caller.
  return true;
}

let __unrollCounter = 0;

export function unrollLoop(loopNode, profileName) {
  if(!shouldUnroll(loopNode, profileName)) return null;
  const start = getNumericValue(loopNode.start), end = getNumericValue(loopNode.end), step = loopNode.step ? getNumericValue(loopNode.step) : 1;
  const body = loopNode.body || [];
  const values = [];
  for(let v=start; step>0 ? v<=end : v>=end; v+=step) values.push(v);
  if (values.length === 0) return []; // zero iterations: loop removed

  function hasBreakOrContinue(nodes) {
    let found = { brk: false, cont: false };
    (function scan(n, depth) {
      if (!n || typeof n !== 'object') return;
      // Do not descend into nested loops/functions for outer break/continue
      // semantics: break/continue bind to innermost loop.
      if (n !== loopNode && (n.type === 'ForNumericStatement' || n.type === 'ForGenericStatement' || n.type === 'WhileStatement' || n.type === 'RepeatStatement')) {
        // nested loop: its breaks/continues belong to it; still scan inside
        // for unrolling purposes but don't attribute to outer.
        for (const k in n) { const c = n[k]; if (Array.isArray(c)) c.forEach(x => scan(x, depth + 1)); else if (c && typeof c === 'object' && c.type) scan(c, depth + 1); }
        return;
      }
      if (n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration') return; // closures don't execute inline
      if (n.type === 'BreakStatement' && depth === 0) found.brk = true;
      if ((n.type === 'ContinueStatement' || n.type === 'Continue') && depth === 0) found.cont = true;
      for (const k in n) { const c=n[k]; if (Array.isArray(c)) c.forEach(x => scan(x, depth)); else if (c && typeof c==='object' && c.type) scan(c, depth); }
    })({ type: 'Block', body: nodes }, 0);
    return found;
  }

  const iter = [];
  const flag = `__unroll_brk_${(__unrollCounter++)}_${Math.abs(start)}_${Math.abs(end)}`;

  for (const v of values) {
    const cloned = JSON.parse(JSON.stringify(body));
    const inject = (node, parent, key)=>{
      if(!node||typeof node!=='object') return;
      const memberName = parent && parent.type === 'MemberExpression' && key === 'identifier';
      const tableKey = parent && (parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key';
      if(node.type==='Identifier' && node.name===loopNode.variable.name && !memberName && !tableKey) {
        node.type='NumericLiteral'; node.value=v; node.raw=String(v); delete node.name;
      }
      for(const k in node){
        const c=node[k];
        if(Array.isArray(c)) c.forEach((child)=>inject(child,node,k));
        else if(c && typeof c==='object' && c.type) inject(c,node,k);
      }
    };
    cloned.forEach(inject);
    const bc = hasBreakOrContinue(cloned);
    if (!bc.brk && !bc.cont) {
      iter.push({ type: 'DoStatement', body: cloned });
    } else {
      // Two-level expansion:
      //   repeat <body with continue->break> until true   (per-iteration)
      // break (outer) becomes: flag=true + break(inner), with
      // `if flag then break end` between iterations (breaks outer).
      const rewriteInner = (nodes) => {
        return nodes.map(stmt => {
          const c = JSON.parse(JSON.stringify(stmt));
          (function rw(n) {
            if (!n || typeof n !== 'object') return;
            if (n.type === 'ForNumericStatement' || n.type === 'ForGenericStatement' || n.type === 'WhileStatement' || n.type === 'RepeatStatement' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration') return;
            if (n.type === 'BreakStatement') {
              // break outer: set flag then break inner
              n.type = 'DoStatement';
              n.body = [
                { type: 'AssignmentStatement', variables: [{ type: 'Identifier', name: flag }], init: [{ type: 'BooleanLiteral', value: true, raw: 'true' }] },
                { type: 'BreakStatement' },
              ];
              delete n.operator; delete n.argument; delete n.arguments;
              return;
            }
            if (n.type === 'ContinueStatement' || n.type === 'Continue') {
              n.type = 'BreakStatement';
              for (const k of Object.keys(n)) { if (k !== 'type') delete n[k]; }
              return;
            }
            for (const k in n) { const cc = n[k]; if (Array.isArray(cc)) cc.forEach(rw); else if (cc && typeof cc === 'object' && cc.type) rw(cc); }
          })(c);
          return c;
        });
      };
      const innerBody = rewriteInner(cloned);
      iter.push({
        type: 'RepeatStatement',
        condition: { type: 'BooleanLiteral', value: true, raw: 'true' },
        body: innerBody,
      });
      if (bc.brk) {
        iter.push({
          type: 'IfStatement',
          clauses: [{
            type: 'IfClause',
            condition: { type: 'Identifier', name: flag },
            body: [{ type: 'BreakStatement' }],
          }],
        });
      }
    }
  }

  const needsFlag = iter.some(n => n.type === 'IfStatement');
  const out = [];
  if (needsFlag) out.push({ type: 'LocalStatement', variables: [{ type: 'Identifier', name: flag }], init: [{ type: 'BooleanLiteral', value: false, raw: 'false' }] });
  // Outer repeat allows original `break` (via flag) to skip remaining
  // iterations while executing the prefix exactly once.
  out.push({
    type: 'RepeatStatement',
    condition: { type: 'BooleanLiteral', value: true, raw: 'true' },
    body: iter,
  });
  return out;
}

export function unrollIR(blocks, seed, profileName) {
  return { changed:false, unrolled:0 };
}
