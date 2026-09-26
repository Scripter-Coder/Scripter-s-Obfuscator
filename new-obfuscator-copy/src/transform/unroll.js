// src/transform/unroll.js — Numeric-loop unrolling (Phase 5, §13)

export function getNumericValue(node){
  if (!node) return null;
  if (node.type==='NumericLiteral') return node.value;
  if (node.type==='UnaryExpression' && node.operator==='-' && node.argument && node.argument.type==='NumericLiteral') return -node.argument.value;
  if (node.type==='UnaryExpression' && node.operator==='-' && node.argument && node.argument.type==='UnaryExpression') {
    // handle --1?
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
  const step = stepVal;
  const start = getNumericValue(loopNode.start), end = getNumericValue(loopNode.end);
  
  if (step > 0 && start > end) return true; // 0 iterations
  if (step < 0 && start < end) return true; // 0 iterations

  const n = Math.floor((end - start)/step)+1;
  if (n <= 0) return true; // 0 iterations
  if (n > 8) return false;
  if (profileName==='BALANCED' && n>4) return false;
  // Check for continue: fallback to preserve semantics (break is handled via repeat wrapper)
  function hasContinue(node){
    if (!node || typeof node!=='object') return false;
    if (node.type==='ContinueStatement') return true;
    for(let k in node){
      let v=node[k];
      if(Array.isArray(v) && v.some(hasContinue)) return true;
      else if(v && typeof v==='object' && v.type && hasContinue(v)) return true;
    }
    return false;
  }
  if (hasContinue(loopNode.body)) return false;
  return true;
}

export function unrollLoop(loopNode, profileName) {
  if(!shouldUnroll(loopNode, profileName)) return null;
  const start = getNumericValue(loopNode.start), end = getNumericValue(loopNode.end), step = loopNode.step ? getNumericValue(loopNode.step) : 1;
  const body = loopNode.body || [];
  const iter = [];
  
  for(let v=start; step>0 ? v<=end : v>=end; v+=step){
    const cloned = JSON.parse(JSON.stringify(body));
    const inject = (node)=>{
      if(!node||typeof node!=='object') return;
      if(node.type==='Identifier' && node.name===loopNode.variable.name) {
        node.type='NumericLiteral'; node.value=v; node.raw=String(v);
      }
      for(const k in node){
        const c=node[k];
        if(Array.isArray(c)) c.forEach(inject);
        else if(c && typeof c==='object' && c.type) inject(c);
      }
    };
    cloned.forEach(inject);
    iter.push({
      type: 'DoStatement',
      body: cloned
    });
  }
  
  // Wrap all iterations in a single RepeatStatement (repeat ... until true)
  // This executes the block exactly once, but allows 'break' inside to jump to the end,
  // which perfectly simulates breaking out of the loop and skipping remaining iterations.
  return [{
    type: 'RepeatStatement',
    condition: { type: 'BooleanLiteral', value: true, raw: 'true' },
    body: iter
  }];
}

export function unrollIR(blocks, seed, profileName) {
  // For IR blocks, similar but at IR level — stub for integration
  return { changed:false, unrolled:0 };
}
