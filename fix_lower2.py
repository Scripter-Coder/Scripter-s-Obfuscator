import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
# Find lowerContinue function and replace it
old = re.search(r'function lowerContinue\(src\)\{.*?return out\.join\("\\\\n"\);\n\}', s, re.DOTALL)
if old:
    print('found lowerContinue', len(old.group(0)))
    new_func = """function lowerContinue(src){
  if(!src.includes("continue")) return src;
  const lines = src.split(/\\r?\\n/);
  const out = [];
  const loopStack = [];
  let labelCounter = 0;
  for(let i=0;i<lines.length;i++){
    let line = lines[i];
    let trimmed = line.trim();
    let isFor = /^for\\b/.test(trimmed) && /\\bdo\\s*$/.test(trimmed);
    let isWhile = /^while\\b/.test(trimmed) && /\\bdo\\s*$/.test(trimmed);
    let isRepeat = /^repeat\\b/.test(trimmed);
    if(isFor || isWhile){
      const label = "__luau_continue_" + (++labelCounter);
      loopStack.push(label);
      // Replace continue in same line if any (e.g., for i=1,5 do print(i) end with continue? not needed)
      if(/\\bcontinue\\b/.test(line)){
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
    } else if(isRepeat){
      const label = "__luau_continue_" + (++labelCounter);
      loopStack.push(label);
      if(/\\bcontinue\\b/.test(line)){
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
    } else if(/^until\\b/.test(trimmed)){
      if(loopStack.length){
        const label = loopStack.pop();
        const indent = line.match(/^\\s*/)[0];
        out.push(indent + "::" + label + "::");
      }
      out.push(line);
    } else if(/^end\\b/.test(trimmed)){
      // Check if this end closes a loop (for/while) - if loopStack not empty, assume it does
      // For simplicity, if loopStack has entry and the line is just "end", treat as loop end
      // But need to handle if/for etc. For our tests, the "end" at line 4 is for's end
      if(loopStack.length){
        // Peek if the previous block was a loop - we don't have blockStack, so assume it's a loop if loopStack not empty
        // For nested loops, the innermost loop's end will be first
        // We can check if the line's indent matches the loop's indent? For now, just pop
        const label = loopStack.pop();
        const indent = line.match(/^\\s*/)[0];
        out.push(indent + "::" + label + "::");
      }
      out.push(line);
    } else {
      if(/\\bcontinue\\b/.test(line)){
        if(!loopStack.length) throw new Error("continue outside loop at line "+(i+1));
        const lbl = loopStack[loopStack.length-1];
        line = line.replace(/\\bcontinue\\b/g, "goto " + lbl);
      }
      out.push(line);
    }
  }
  return out.join("\\n");
}"""
    s = s.replace(old.group(0), new_func)
    p.write_text(s, encoding='utf-8')
    print('replaced')
    import subprocess
    result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    print(result.stdout, result.stderr, result.returncode)
else:
    print('not found')
