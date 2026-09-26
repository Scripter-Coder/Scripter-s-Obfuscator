// Luau 0.709 target adapter — full backend with continue, compound assignment, type stripping
export const TARGET = {
  name: 'luau',
  version: '0.709',
  parserOpts: { luaVersion: '5.3' },
  syntax: { types: true, iteration: 'luau', continue: true, goto: true },
  env: { roblox: true },
  status: 'IMPLEMENTED',
  semantics: {
    continue: 'lowered via goto',
    compound: 'lowered via explicit binary',
    types: 'stripped at source level',
  },
  unsupportedFeatures: [],
};

function stripParamTypes(line) {
  return line.replace(/(function\\s+[^\\(]*\\()([^\\)]*)(\\))/g, (_m,a,params,c) => {
    const p=params.replace(/([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\\n]*>)?(?:\\[\\])?(?:\\s*\\|\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g,'$1');
    return a+p+c;
  }).replace(/(\\))\\s*:\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\\n]*>)?(?:\\[\\])?(?:\\s*\\|\\s*[A-Za-z_][A-Za-z0-9_]*)*/g,'$1');
}
function stripLocalTypes(line) {
  return line.replace(/(\\blocal\\s+[A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*[^=,\\n]+(?=\\s*(?:=|,|$))/g,'$1');
}
function stripTypeAssertions(src){
  return src.replace(/\\s*::\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?(?:\\[\\])?(?:\\s*[\\|&]\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g, '');
}
function stripTypeDecls(src){
  src = src.replace(/^\\s*(?:export\\s+)?type\\s+[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*[^\\n]*$/gm, '');
  return src;
}
function lowerCompound(src){
  const ops = {
    "+=": "+",
    "-=": "-",
    "*=": "*",
    "/=": "/",
    "%=": "%",
    "^=": "^",
    "..=": ".."
  };
  // Escape op for regex: need to escape + * . ^ $ etc.
  function esc(s){ return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); }
  let changed=true;
  let out=src;
  while(changed){
    changed=false;
    for(const [op, bin] of Object.entries(ops)){
      const e = esc(op);
      // Match left side as identifier or member/index chain, then op, then right side
      // We use a simple heuristic: left is up to op, right is rest of line up to ; or newline
      const re = new RegExp("([A-Za-z_][A-Za-z0-9_\\.\\[\\]\\\"\\']*?)\\\\s*"+e+"\\\\s*([^\\n;]+)", "g");
      const newOut = out.replace(re, (m, left, right) => {
        left=left.trim(); right=right.trim();
        // Validate left is plausible lvalue
        if(!/^[A-Za-z_]/.test(left)) return m;
        // Avoid matching if left contains = or other ops (already an assignment)
        if(left.includes('=')) return m;
        changed=true;
        return left + " = " + left + " " + bin + " " + right;
      });
      if(newOut!==out){ out=newOut; }
    }
  }
  return out;
}
function lowerContinue(src){
  if(!/\\bcontinue\\b/.test(src)) return src;
  const lines = src.split(/\\r?\\n/);
  const out = [];
  const loopStack = []; // stack of {type, label} for loops only
  const blockStack = []; // stack of {type} for all blocks
  let labelCounter = 0;
  for(let i=0;i<lines.length;i++){
    let line = lines[i];
    let trimmed = line.trim();
    // Detect block starts
    // For loop: for ... do (may be on same line as "for i=1,5 do")
    // We check if trimmed starts with for/while/repeat/do/if/function
    let isFor = /^for\\b/.test(trimmed) && /\\bdo\\s*$/.test(trimmed);
    let isWhile = /^while\\b/.test(trimmed) && /\\bdo\\s*$/.test(trimmed);
    let isRepeat = /^repeat\\b/.test(trimmed);
    let isDo = /^do\\b/.test(trimmed) && !isFor && !isWhile;
    let isIf = /^if\\b/.test(trimmed);
    let isFunction = /^(?:local\\s+)?function\\b/.test(trimmed);
    // Push to stacks
    if(isFor){
      const label = "__luau_continue_" + (++labelCounter);
      loopStack.push({type:"for", label});
      blockStack.push({type:"for", label});
    } else if(isWhile){
      const label = "__luau_continue_" + (++labelCounter);
      loopStack.push({type:"while", label});
      blockStack.push({type:"while", label});
    } else if(isRepeat){
      const label = "__luau_continue_" + (++labelCounter);
      loopStack.push({type:"repeat", label});
      blockStack.push({type:"repeat", label});
    } else if(isDo){
      blockStack.push({type:"do"});
    } else if(isIf){
      // For single-line if like "if i==3 then continue end", we still push but need to pop at end of line
      // Check if the line contains "then" and "end" on same line -> it's a single-line if, not a block
      if(!/\\bthen\\b.*\\bend\\b/.test(trimmed)){
        blockStack.push({type:"if"});
      }
    } else if(isFunction){
      blockStack.push({type:"function"});
    }
    // Replace continue with goto
    if(/\\bcontinue\\b/.test(line)){
      let targetLabel = null;
      for(let j=loopStack.length-1;j>=0;j--){
        if(loopStack[j].label){ targetLabel = loopStack[j].label; break; }
      }
      if(!targetLabel) throw new Error("continue outside loop at line "+(i+1));
      line = line.replace(/\\bcontinue\\b/g, "goto " + targetLabel);
    }
    // Detect block ends
    // For "end" that closes a block, we need to pop
    // For "until" that closes a repeat
    // We need to handle "end" that may be at end of line like "if ... then ... end"
    // For simplicity, if trimmed is exactly "end" or starts with "end" followed by non-identifier, treat as block end
    let endMatch = /^end\\b/.test(trimmed);
    let untilMatch = /^until\\b/.test(trimmed);
    if(endMatch){
      // Pop from blockStack until we find a matching block that ends with end
      // The top of blockStack should be the matching block
      let poppedLoop = null;
      let poppedBlock = null;
      while(blockStack.length){
        const top = blockStack[blockStack.length-1];
        if(top.type==="for" || top.type==="while" || top.type==="do" || top.type==="if" || top.type==="function"){
          poppedBlock = blockStack.pop();
          if(poppedBlock.label) poppedLoop = poppedBlock;
          break;
        } else if(top.type==="repeat"){
          // repeat ends with until, not end, so this end is not for repeat
          break;
        } else {
          blockStack.pop();
        }
      }
      // Also pop from loopStack if the popped block was a loop
      if(poppedLoop){
        // loopStack's top should be the same loop
        for(let k=loopStack.length-1;k>=0;k--){
          if(loopStack[k].label===poppedLoop.label){ loopStack.splice(k,1); break; }
        }
        const indent = line.match(/^\\s*/)[0];
        out.push(indent + "::" + poppedLoop.label + "::");
      }
      // For loopStack, we already popped, but need to ensure loopStack's top is also popped if it was a loop
      // The above already handled
      out.push(line);
    } else if(untilMatch){
      let poppedLoop = null;
      while(blockStack.length){
        const top = blockStack.pop();
        if(top.type==="repeat"){ poppedLoop = top; break; }
      }
      if(poppedLoop){
        for(let k=loopStack.length-1;k>=0;k--){
          if(loopStack[k].label===poppedLoop.label){ loopStack.splice(k,1); break; }
        }
        const indent = line.match(/^\\s*/)[0];
        out.push(indent + "::" + poppedLoop.label + "::");
      }
      out.push(line);
    } else {
      out.push(line);
    }
  }
  return out.join("\\n");
}
export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(/\\+=|-=|\\*=|\\/=|%=|\\^=|\\.\\.=/.test(src)){
    src = lowerCompound(src);
  }
  if(/\\bcontinue\\b/.test(src)){
    src = lowerContinue(src);
  }
  src = src.split(/\\r?\\n/).map(line=>stripLocalTypes(stripParamTypes(line))).join("\\n");
  src = src.replace(/^\\s*(?:export\\s+)?type\\s+[^\\n]*$/gm, "");
  return src;
}
export function validate(src){try{prepareSource(src);return{ok:true};}catch(e){return{ok:false,error:e.message};}}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
