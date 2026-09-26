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
  return line.replace(/(function\s+[^\(]*\()([^\)]*)(\))/g, (_m,a,params,c) => {
    const p=params.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\n]*>)?(?:\[\])?(?:\s*\|\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g,'$1');
    return a+p+c;
  }).replace(/(\))\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\n]*>)?(?:\[\])?(?:\s*\|\s*[A-Za-z_][A-Za-z0-9_]*)*/g,'$1');
}
function stripLocalTypes(line) {
  return line.replace(/(\blocal\s+[A-Za-z_][A-Za-z0-9_]*)\s*:\s*[^=,\n]+(?=\s*(?:=|,|$))/g,'$1');
}
function stripTypeAssertions(src){
  return src.replace(/\s*::\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?(?:\[\])?(?:\s*[\|&]\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g, '');
}
function stripTypeDecls(src){
  src = src.replace(/^\s*(?:export\s+)?type\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\n]*$/gm, '');
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
  let changed=true;
  while(changed){
    changed=false;
    for(const [op, bin] of Object.entries(ops)){
      const escaped = op.replace(/([.+*?\^$])/g, "\$1");
      const re = new RegExp("([^\n;]+?)\\s*"+escaped+"\\s*([^\n;]+)", "g");
      const newSrc = src.replace(re, (m, left, right) => {
        left=left.trim(); right=right.trim();
        if(/[+\-*/%^=<>]/.test(left.replace(/\./g,"").replace(/\[.*\]/g,""))){
          if(!/[A-Za-z0-9_\]\.\"\']$/.test(left)) return m;
        }
        if(!/^[A-Za-z_]/.test(left.trim())) return m;
        changed=true;
        return left + " = " + left + " " + bin + " " + right;
      });
      if(newSrc!==src){ src=newSrc; }
    }
  }
  return src;
}
function lowerContinue(src){
  if(!/\bcontinue\b/.test(src)) return src;
  const lines = src.split(/\r?\n/);
  const out = [];
  const blockStack = [];
  let labelCounter = 0;
  for(let i=0;i<lines.length;i++){
    let line = lines[i];
    let trimmed = line.trim();
    const isFor = /^\s*for\b/.test(trimmed) && /\bdo\s*$/.test(trimmed);
    const isWhile = /^\s*while\b/.test(trimmed) && /\bdo\s*$/.test(trimmed);
    const isRepeat = /^\s*repeat\s*$/.test(trimmed);
    const isDo = /^\s*do\s*$/.test(trimmed);
    const isIf = /^\s*if\b/.test(trimmed);
    const isFunction = /^\s*(?:local\s+)?function\b/.test(trimmed);
    if(isFor || isWhile){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type: isFor ? "for" : "while", label});
    } else if(isRepeat){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type: "repeat", label});
    } else if(isIf){
      blockStack.push({type: "if", label: null});
    } else if(isFunction){
      blockStack.push({type: "function", label: null});
    } else if(isDo){
      blockStack.push({type: "do", label: null});
    }
    if(/\bcontinue\b/.test(line)){
      let targetLabel = null;
      for(let j=blockStack.length-1;j>=0;j--){
        if(blockStack[j].label){
          targetLabel = blockStack[j].label;
          break;
        }
      }
      if(!targetLabel) throw new Error("continue outside loop at line "+(i+1));
      line = line.replace(/\bcontinue\b/g, "goto " + targetLabel);
    }
    const endMatch = trimmed.match(/^end\b/);
    const untilMatch = trimmed.match(/^until\b/);
    if(endMatch){
      let popped = null;
      while(blockStack.length){
        const top = blockStack.pop();
        if(top.type === "for" || top.type === "while" || top.type === "do" || top.type === "if" || top.type === "function"){
          popped = top;
          break;
        } else if(top.type === "repeat"){
          blockStack.push(top);
          popped = null;
          break;
        }
      }
      if(popped && popped.label){
        const indent = line.match(/^\s*/)[0];
        out.push(indent + "::" + popped.label + "::");
      }
      out.push(line);
    } else if(untilMatch){
      let popped = null;
      while(blockStack.length){
        const top = blockStack.pop();
        if(top.type === "repeat"){ popped = top; break; }
      }
      if(popped && popped.label){
        const indent = line.match(/^\s*/)[0];
        out.push(indent + "::" + popped.label + "::");
      }
      out.push(line);
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}
export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(/\+=|-=|\*=|\/=|%=|\^=|\.\.=/.test(src)){
    src = lowerCompound(src);
  }
  if(/\bcontinue\b/.test(src)){
    src = lowerContinue(src);
  }
  src = src.split(/\r?\n/).map(line=>stripLocalTypes(stripParamTypes(line))).join("\n");
  src = src.replace(/^\s*(?:export\s+)?type\s+[^\n]*$/gm, "");
  return src;
}
export function validate(src){try{prepareSource(src);return{ok:true};}catch(e){return{ok:false,error:e.message};}}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
