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
  return line.replace(/(function\s*[^\(]*\()([^\)]*)(\))/g, (_m,a,params,c) => {
    // Handle params like "a: number", "...: number", "a: Array<number>" etc.
    const p=params.replace(/([A-Za-z_][A-Za-z0-9_]*|\.\.\.)\s*:\s*[^,\)]+/g,'$1');
    return a+p+c;
  }).replace(/\)\s*:\s*[^\n]*?(?=\s*(?:local|return|end|do|then|\n|$))/g, ')');
}
function stripLocalTypes(line) {
  return line.replace(/:\s*[^=\n,]+(?=\s*=)/g, '');
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
    "//=": "//",
    "..=": ".."
  };
  let out=src;
  let changed=true;
  while(changed){
    changed=false;
    for(const [op, bin] of Object.entries(ops)){
      let pattern;
      if(op=="+=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*\+=\s*([^\n;]+)/g;
      else if(op=="-=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*-=\s*([^\n;]+)/g;
      else if(op=="*=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*\*=\s*([^\n;]+)/g;
      else if(op=="/=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*\/=\s*([^\n;]+)/g;
      else if(op=="%=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*%=\s*([^\n;]+)/g;
      else if(op=="^=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*\^=\s*([^\n;]+)/g;
      else if(op=="//=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]\"\']*?)\s*\/\/=\s*([^\n;]+)/g;
      else if(op=="..=") pattern = /([A-Za-z_][A-Za-z0-9_\.\[\]"']*?)\s*\.\.=\s*([^\n;]+)/g;
      const newOut = out.replace(pattern, (m, left, right) => {
        left=left.trim(); right=right.trim();
        if(!/^[A-Za-z_]/.test(left)) return m;
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
  if(!src.includes("continue")) return src;
  const lines = src.split(/\r?\n/);
  const out = [];
  const blockStack = [];
  const loopStack = [];
  let labelCounter = 0;
  function isLoopStart(trim){
    if(/\bfor\b/.test(trim) && /\bdo\b/.test(trim)) return true;
    if(/\bwhile\b/.test(trim) && /\bdo\b/.test(trim)) return true;
    return false;
  }
  function isRepeat(trim){ return /^\s*repeat\b/.test(trim); }
  for(let i=0;i<lines.length;i++){
    let line=lines[i];
    let trimmed=line.trim();
    if(isRepeat(trimmed)){
      const label="__luau_continue_"+(++labelCounter);
      blockStack.push({type:'loop',label}); loopStack.push(label);
      if(/\bcontinue\b/.test(line)) line=line.replace(/\bcontinue\b/g, "goto "+label);
      out.push(line); continue;
    }
    if(isLoopStart(trimmed)){
      const label="__luau_continue_"+(++labelCounter);
      blockStack.push({type:'loop',label}); loopStack.push(label);
      if(/\bcontinue\b/.test(line)) line=line.replace(/\bcontinue\b/g, "goto "+label);
      const thenCount=(trimmed.match(/\bthen\b/g)||[]).length;
      const funcCount=(trimmed.match(/\bfunction\b/g)||[]).length;
      for(let t=0;t<thenCount;t++) blockStack.push({type:'if',label:null});
      for(let t=0;t<funcCount;t++) blockStack.push({type:'func',label:null});
      const ends=(line.match(/\bend\b/g)||[]).length;
      if(ends>0){
        const pending=[];
        for(let e=0;e<ends;e++){
          if(!blockStack.length) break;
          const top=blockStack[blockStack.length-1];
          if(top.type==='loop'){pending.push(top.label); blockStack.pop(); loopStack.pop();}
          else if(top.type==='if'||top.type==='func'||top.type==='do') blockStack.pop();
          else break;
        }
        for(let lbl of pending){
          const idx=line.lastIndexOf('end');
          if(idx!==-1) line=line.slice(0,idx)+'::'+lbl+':: '+line.slice(idx);
        }
      }
      out.push(line); continue;
    }
    if(/^\s*if\b/.test(trimmed)){
      blockStack.push({type:'if',label:null});
      if(/\bcontinue\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\bcontinue\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\s*function\b/.test(trimmed)){
      blockStack.push({type:'func',label:null});
      if(/\bcontinue\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\bcontinue\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\s*do\b/.test(trimmed)){
      blockStack.push({type:'do',label:null});
      if(/\bcontinue\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\bcontinue\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\s*until\b/.test(trimmed)){
      if(blockStack.length && blockStack[blockStack.length-1].type==='loop'){
        const label=loopStack.pop(); blockStack.pop();
        const indent=line.match(/^\s*/)[0];
        out.push(indent+"::"+label+"::");
      }
      out.push(line); continue;
    }
    if(/^\s*end\b/.test(trimmed)){
      if(blockStack.length){
        const top=blockStack[blockStack.length-1];
        if(top.type==='loop'){const label=loopStack.pop(); blockStack.pop(); const indent=line.match(/^\s*/)[0]; out.push(indent+"::"+label+"::");}
        else blockStack.pop();
      }
      out.push(line); continue;
    }
    if(/\bcontinue\b/.test(line)){
      if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
      line=line.replace(/\bcontinue\b/g, "goto "+loopStack[loopStack.length-1]);
    }
    const endMatches=line.match(/\bend\b/g);
    if(endMatches && /\bend\s*$/.test(trimmed) && blockStack.length && blockStack[blockStack.length-1].type==='loop'){
      const label=loopStack.pop(); blockStack.pop();
      const idx=line.lastIndexOf('end');
      if(idx!==-1) line=line.slice(0,idx)+'::'+label+':: '+line.slice(idx);
    } else if(endMatches){
      const cnt=endMatches.length;
      for(let c=0;c<cnt;c++) if(blockStack.length && blockStack[blockStack.length-1].type!=='loop') blockStack.pop(); else break;
    }
    out.push(line);
  }
  return out.join("\n");
}
export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("//=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){
    src = lowerCompound(src);
  }
  if(src.includes("continue")){
    src = lowerContinue(src);
  }
  src = src.split(/\r?\n/).map(line=>stripLocalTypes(stripParamTypes(line))).join("\n");
  src = src.replace(/^\s*(?:export\s+)?type\s+[^\n]*$/gm, "");
  return src;
}
export function validate(src){try{prepareSource(src);return{ok:true};}catch(e){return{ok:false,error:e.message};}}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
