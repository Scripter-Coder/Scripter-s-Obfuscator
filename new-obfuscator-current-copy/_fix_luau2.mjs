import fs from 'fs';
let p='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/src/targets/luau.js';
let s=fs.readFileSync(p,'utf8');
let start=s.indexOf('function lowerContinue(src){');
let end=s.indexOf('return out.join("\\n");\n}', start);
console.log('start',start,'end',end);
if(start!==-1 && end!==-1){
  let old=s.slice(start, end+ 'return out.join("\\n");\n}'.length);
  console.log('old len',old.length);
  console.log(old.slice(0,500));
  let newFunc=`function lowerContinue(src){
  if(!src.includes("continue")) return src;
  const lines = src.split(/\\r?\\n/);
  const out = [];
  const blockStack = [];
  const loopStack = [];
  let labelCounter = 0;
  function isLoopStart(trim){
    if(/\\bfor\\b/.test(trim) && /\\bdo\\b/.test(trim)) return true;
    if(/\\bwhile\\b/.test(trim) && /\\bdo\\b/.test(trim)) return true;
    return false;
  }
  function isRepeat(trim){ return /^\\s*repeat\\b/.test(trim); }
  for(let i=0;i<lines.length;i++){
    let line = lines[i];
    let trimmed = line.trim();
    if(isRepeat(trimmed)){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type:'loop', label});
      loopStack.push(label);
      if(/\\bcontinue\\b/.test(line)){
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
      continue;
    }
    if(isLoopStart(trimmed)){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type:'loop', label});
      loopStack.push(label);
      if(/\\bcontinue\\b/.test(line)){
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      const thenCount = (trimmed.match(/\\bthen\\b/g)||[]).length;
      const funcCount = (trimmed.match(/\\bfunction\\b/g)||[]).length;
      for(let t=0;t<thenCount;t++) blockStack.push({type:'if', label:null});
      for(let t=0;t<funcCount;t++) blockStack.push({type:'func', label:null});
      const ends = (line.match(/\\bend\\b/g)||[]).length;
      if(ends>0){
        const pending=[];
        for(let e=0;e<ends;e++){
          if(!blockStack.length) break;
          const top=blockStack[blockStack.length-1];
          if(top.type==='loop'){
            pending.push(top.label);
            blockStack.pop(); loopStack.pop();
          } else if(top.type==='if'||top.type==='func'||top.type==='do'){
            blockStack.pop();
          } else break;
        }
        for(let lbl of pending){
          const idx=line.lastIndexOf('end');
          if(idx!==-1) line=line.slice(0,idx)+'::'+lbl+':: '+line.slice(idx);
        }
      }
      out.push(line);
      continue;
    }
    if(/^\\s*if\\b/.test(trimmed)){
      blockStack.push({type:'if', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\\bcontinue\\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\\s*function\\b/.test(trimmed)){
      blockStack.push({type:'func', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\\bcontinue\\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\\s*do\\b/.test(trimmed)){
      blockStack.push({type:'do', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        line=line.replace(/\\bcontinue\\b/g, "goto "+loopStack[loopStack.length-1]);
      }
      out.push(line); continue;
    }
    if(/^\\s*until\\b/.test(trimmed)){
      if(blockStack.length && blockStack[blockStack.length-1].type==='loop'){
        const label=loopStack.pop(); blockStack.pop();
        const indent=line.match(/^\\s*/)[0];
        out.push(indent+"::"+label+"::");
      }
      out.push(line); continue;
    }
    if(/^\\s*end\\b/.test(trimmed)){
      if(blockStack.length){
        const top=blockStack[blockStack.length-1];
        if(top.type==='loop'){
          const label=loopStack.pop(); blockStack.pop();
          const indent=line.match(/^\\s*/)[0];
          out.push(indent+"::"+label+"::");
        } else blockStack.pop();
      }
      out.push(line); continue;
    }
    if(/\\bcontinue\\b/.test(line)){
      if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
      line=line.replace(/\\bcontinue\\b/g, "goto "+loopStack[loopStack.length-1]);
    }
    const endMatches=line.match(/\\bend\\b/g);
    if(endMatches && /\\bend\\s*$/.test(trimmed) && blockStack.length && blockStack[blockStack.length-1].type==='loop'){
      const label=loopStack.pop(); blockStack.pop();
      const idx=line.lastIndexOf('end');
      if(idx!==-1) line=line.slice(0,idx)+'::'+label+':: '+line.slice(idx);
    } else if(endMatches){
      const cnt=endMatches.length;
      for(let c=0;c<cnt;c++) if(blockStack.length && blockStack[blockStack.length-1].type!=='loop') blockStack.pop(); else break;
    }
    out.push(line);
  }
  return out.join("\\n");
}`;
  s=s.slice(0,start)+newFunc+s.slice(end+ 'return out.join("\\n");\n}'.length);
  fs.writeFileSync(p,s,'utf8');
  console.log('replaced');
} else console.log('not found');
