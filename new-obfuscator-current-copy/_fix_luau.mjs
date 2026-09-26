import fs from 'fs';
let p='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/src/targets/luau.js';
let s=fs.readFileSync(p,'utf8');
// Replace lowerContinue with more robust version that handles single-line loops and nested ifs
let old = s.match(/function lowerContinue\(src\)\{[\s\S]*?return out\.join\("\\n"\)\;\n\}/);
console.log('found old?', !!old, old? old[0].slice(0,200):'');
let newFunc=`function lowerContinue(src){
  if(!src.includes("continue")) return src;
  // Tokenize while respecting strings/comments to correctly track blocks
  // We'll use a simple stack that tracks block types: loop vs non-loop
  const lines = src.split(/\\r?\\n/);
  const out = [];
  const blockStack = []; // each entry: {type: 'loop'|'if'|'func'|'do'|'repeat', label: string|null}
  const loopStack = []; // labels of loops (mirrors blockStack loops)
  let labelCounter = 0;
  function isLoopStart(trim){
    // for with do in line (allow single-line)
    if(/\\bfor\\b/.test(trim) && /\\bdo\\b/.test(trim)) return true;
    if(/\\bwhile\\b/.test(trim) && /\\bdo\\b/.test(trim)) return true;
    return false;
  }
  function isRepeat(trim){ return /^\\s*repeat\\b/.test(trim); }
  function countEnds(trim){
    // Count occurrences of standalone 'end' and 'until' as block closers
    // This is heuristic: each 'end' closes one block, 'until' closes repeat
    // We need to handle 'end' inside strings/comments already stripped? For now simple.
    let cnt = 0;
    const re = /\\bend\\b|\\buntil\\b/g;
    let m;
    while((m=re.exec(trim))!==null) cnt++;
    return cnt;
  }
  for(let i=0;i<lines.length;i++){
    let line = lines[i];
    let trimmed = line.trim();
    // Handle repeat separate (has no 'do')
    if(isRepeat(trimmed)){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type:'loop', label});
      loopStack.push(label);
    } else if(isLoopStart(trimmed)){
      const label = "__luau_continue_" + (++labelCounter);
      blockStack.push({type:'loop', label});
      loopStack.push(label);
      // If line also contains continue, replace it now (single-line loop)
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      // Count extra 'if'/'function'/'do' in same line that open non-loop blocks
      // e.g., 'for i=1,5 do if i==3 then' -> 'if' opens a block
      const thenCount = (trimmed.match(/\\bthen\\b/g)||[]).length;
      const funcCount = (trimmed.match(/\\bfunction\\b/g)||[]).length;
      // 'do' already counted as loop, but additional 'do' for other constructs?
      // For simplicity, push non-loop blocks for 'then' and 'function'
      for(let t=0;t<thenCount;t++) blockStack.push({type:'if', label:null});
      for(let t=0;t<funcCount;t++) blockStack.push({type:'func', label:null});
      // Handle ends in same line (e.g., '... end' closing ifs and possibly loop)
      const endCount = countEnds(trimmed);
      // We already pushed loop, so ends should close from top
      // But we need to pop for each 'end'/'until' found, inserting label before loop's end
      // For single-line, the final 'end' is loop's end, prior 'end's are ifs
      // We'll process ends: if blockStack top is non-loop, pop non-loop; if loop, pop loop and insert label
      // However our line already has the loop's 'end' at end, so we need to handle insertion
      // Instead of per-line endCount, handle via blockStack counting
      if(endCount>0){
        // Determine how many blocks were opened in this line besides the loop
        // For our single-line example, thenCount=1 (if), so blockStack has [loop, if]
        // endCount=2? Actually line 'for i=1,5 do if i==3 then continue end print(i) end' has two 'end's: one for if, one for loop
        // So we need to pop accordingly
        const pendingLabels = [];
        for(let e=0;e<endCount;e++){
          if(blockStack.length===0) break;
          const top = blockStack.pop();
          if(top.type==='loop'){
            pendingLabels.push(top.label);
            loopStack.pop();
          }
        }
        // Insert labels before the line's final 'end'? For single-line we need to insert goto labels before each loop's end
        // Simplify: if pendingLabels contains loop labels, inject '::label::' before the last 'end'
        // We'll replace last occurrence of 'end' with '::label:: end' for each loop label
        if(pendingLabels.length){
          // Insert in reverse (innermost first) before the last 'end'
          // For single-line, there may be multiple loops? Usually one
          // We'll do: for each label, replace last 'end' with '::label:: end'
          for(let lbl of pendingLabels){
            const idx = line.lastIndexOf('end');
            if(idx!==-1){
              line = line.slice(0,idx) + '::' + lbl + ':: ' + line.slice(idx);
            }
          }
        }
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }
    // Handle 'if'/'function'/'do' non-loop blocks (multi-line)
    if(/^\\s*if\\b/.test(trimmed) || /^\\s*elseif\\b/.test(trimmed)){
      // 'if' opens a block that will be closed by 'end'
      // Count 'then' as block start? In Lua, 'if' ... 'then' opens, 'end' closes
      // For our tracking, push one block per 'if'
      blockStack.push({type:'if', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
      continue;
    }
    if(/^\\s*function\\b/.test(trimmed)){
      blockStack.push({type:'func', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
      continue;
    }
    if(/^\\s*do\\b/.test(trimmed)){
      // bare 'do' block (not loop's do) - e.g., 'do ... end'
      // Only if not already counted as loop do
      // We already handled loops, so this is non-loop do
      blockStack.push({type:'do', label:null});
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
      continue;
    }
    // Handle 'end'/'until' lines (multi-line)
    if(/^\\s*until\\b/.test(trimmed)){
      if(blockStack.length){
        const top = blockStack[blockStack.length-1];
        if(top.type==='loop'){
          const popped = blockStack.pop();
          const label = loopStack.pop();
          const indent = line.match(/^\\s*/)[0];
          out.push(indent + "::" + label + "::");
        } else {
          // shouldn't happen, but pop generic
          blockStack.pop();
        }
      }
      out.push(line);
      continue;
    }
    if(/^\\s*end\\b/.test(trimmed)){
      if(blockStack.length){
        const top = blockStack[blockStack.length-1];
        if(top.type==='loop'){
          const popped = blockStack.pop();
          const label = loopStack.pop();
          const indent = line.match(/^\\s*/)[0];
          out.push(indent + "::" + label + "::");
        } else {
          blockStack.pop();
        }
      }
      out.push(line);
      continue;
    }
    // Generic line with possible 'end' inside (e.g., 'end' after code)
    // Also handle 'else'/'elseif' which don't affect blockStack
    if(/\\bcontinue\\b/.test(line)){
      if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
      const lbl = loopStack[loopStack.length-1];
      line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
    }
    // For lines that contain 'end' not at start but inside, we need to handle block closing
    // Example: '  print(i) end' - contains loop end but not at line start with ^end
    // Detect if line contains '\\bend\\b' and blockStack top is loop
    // This is heuristic: if line has 'end' and blockStack has loop, treat last 'end' as block closer
    // But avoid consuming 'end' that is part of 'then continue end' which we already handled
    // For simplicity, if line has '\\bend\\b' and not already handled as loop start, check if it closes loop
    // Count 'end's in line and see if we need to pop
    const endMatches = line.match(/\\bend\\b/g);
    if(endMatches){
      // Only if line ends with 'end' and blockStack top is loop, we should handle
      // This handles cases like '  print(i) end' where 'end' is loop closer
      // We need to avoid double-handling of 'if i==3 then continue end' which we already handled as single-line loop
      // That case was handled earlier as isLoopStart, so we skip here
      // For other lines, if trimmed ends with 'end', it may be a block closer
      if(/\\bend\\s*$/.test(trimmed) && blockStack.length && blockStack[blockStack.length-1].type==='loop'){
        const popped = blockStack.pop();
        const label = loopStack.pop();
        const indent = line.match(/^\\s*/)[0];
        // Need to insert label before this line's 'end'
        // But line already contains 'end', so we insert before it
        // We'll do: replace last 'end' with '::label:: end'
        const idx = line.lastIndexOf('end');
        if(idx!==-1){
          line = line.slice(0,idx) + '::' + label + ':: ' + line.slice(idx);
        }
      } else {
        // For non-loop ends, just pop non-loop blocks
        // Count ends and pop accordingly, but only for non-loop blocks
        // This handles '  end' that closes an 'if' inside loop
        const cnt = endMatches.length;
        for(let c=0;c<cnt;c++){
          if(blockStack.length && blockStack[blockStack.length-1].type!=='loop'){
            blockStack.pop();
          } else break;
        }
      }
    }
    out.push(line);
  }
  return out.join("\\n");
}`;
if(old){
  s=s.replace(old[0], newFunc);
  fs.writeFileSync(p,s,'utf8');
  console.log('replaced lowerContinue');
}else console.log('not found');
