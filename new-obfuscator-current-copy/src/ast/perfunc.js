// src/ast/perfunc.js — Per-function transformation infrastructure (Phase 4)
// Parses project-specific attributes like -- @VM SECURE, -- @PRESET BALANCED, -- @TRANSFORM branch
// Attributes flow: source comment -> function metadata -> IR -> compiler -> VM generation

// Simple attribute grammar: -- @VM <preset>  or  --#VM <preset>  or  /* @VM ... */
// Presets: FAST, BALANCED, SECURE, NONE (bypass VM for that function)
// Also supports: -- @TRANSFORM <name>  (not yet, placeholder)
// Syntax is independent from Luraph's VM(...)/PRESET(...)

const PRESET_RE = /--\s*@VM\s+(FAST|BALANCED|SECURE|NONE)/i;
const PRESET2_RE = /--\s*@PRESET\s+(FAST|BALANCED|SECURE)/i;
const TRANSFORM_RE = /--\s*@TRANSFORM\s+(\w+)/i;

export function parsePerFunctionAttrs(src) {
  const lines = src.split('\n');
  const attrs = []; // {line, preset, transform}
  for (let i=0;i<lines.length;i++) {
    const line=lines[i];
    let m = line.match(PRESET_RE) || line.match(PRESET2_RE);
    if(m){
      const preset=m[1].toUpperCase();
      // find next function definition within 3 lines
      let targetLine=i;
      for(let j=i+1;j<Math.min(lines.length,i+4);j++){
        if(/function\s+\w+/.test(lines[j]) || /local\s+function/.test(lines[j]) || /function\s*\(/.test(lines[j])){
          targetLine=j;
          break;
        }
      }
      attrs.push({ line: targetLine, preset, raw: line.trim() });
    }
    let tm=line.match(TRANSFORM_RE);
    if(tm){
      attrs.push({ line:i, transform: tm[1], raw: line.trim() });
    }
  }
  return attrs;
}

// Attach to AST FunctionDeclaration nodes via leading comments (luaparse locations)
// We use line numbers to match
export function attachPerFuncMeta(ast, attrs, src) {
  if(!ast || !ast.body) return new Map();
  const funcMap = new Map(); // node -> {preset}
  // Need locations: ensure ast has loc
  function walk(nodes, depth=0){
    for(const n of nodes){
      if(!n) continue;
      if(n.type==='FunctionDeclaration' || n.type==='FunctionExpression'){
        const loc = n.loc || n.range;
        let line = null;
        if(n.loc && n.loc.start) line=n.loc.start.line-1;
        // find closest attr with line <= n's line and within 3
        let best=null;
        for(const a of attrs){
          if(a.preset && a.line <= (line||0) && (line - a.line) <= 3){
            if(!best || a.line > best.line) best=a;
          }
        }
        if(best) funcMap.set(n, {preset: best.preset});
      }
      // recurse into bodies
      const bodies = [];
      if(n.body) bodies.push(...(Array.isArray(n.body)? n.body : [n.body]));
      if(n.clauses) for(const c of n.clauses) if(c.body) bodies.push(...c.body);
      // generic walk: inspect all array fields that contain nodes
      for(const k in n){
        const v=n[k];
        if(Array.isArray(v) && v[0] && v[0].type) walk(v, depth+1);
        else if(v && v.type) walk([v], depth+1);
      }
    }
  }
  walk(ast.body);
  return funcMap;
}
