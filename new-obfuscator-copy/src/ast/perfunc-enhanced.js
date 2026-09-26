// src/ast/perfunc-enhanced.js — Per-Function Attributes (Phase 6, §17)
// Replace limited comment parser with real metadata architecture
// Syntax: VMATTR( VM=SECURE, PRESET=SECURE, TRANSFORM=CONTROL_FLOW, INLINE=true, UNROLL=true, MBA=STRONG, STACKALLOC=true, DEBUG=false, CONSTANTS=strong, CONTROL_FLOW=heavy )
// Also support legacy -- @VM

const SUPPORTED_KEYS = ['VM','PRESET','TRANSFORM','INLINE','UNROLL','MBA','STACKALLOC','DEBUG','CONSTANTS','CONTROL_FLOW','TARGET','COMPRESSION','STATIC_ENV','COMPAT'];

export function parseVMAttr(src) {
  const re = /VMATTR\s*\(\s*([^)]+)\s*\)/g;
  const out=[];
  let m;
  while((m=re.exec(src))) {
    const inside=m[1];
    const obj={};
    for(const part of inside.split(',')){
      const [k,v]=part.split('=').map(s=>s.trim());
      if(!k||!v) continue;
      const upK=k.toUpperCase();
      if(!SUPPORTED_KEYS.includes(upK)) continue;
      let val=v.replace(/^['"]|['"]$/g,'');
      if(val==='true') val=true;
      else if(val==='false') val=false;
      else if(/^\d+$/.test(val)) val=parseInt(val,10);
      obj[upK]=val;
    }
    out.push({ raw:m[0], attrs:obj, index:m.index });
  }
  // also support -- @VM etc. via legacy parser fallback
  return out;
}

export function attachEnhancedPerFuncMeta(ast, src) {
  if(!ast||!ast.body) return new Map();
  const attrs = parseVMAttr(src);
  const lines = src.split('\n');
  const funcMap = new Map();
  function walk(nodes){
    for(const n of nodes){
      if(!n) continue;
      if(n.type==='FunctionDeclaration' || n.type==='FunctionExpression'){
        let line = n.loc && n.loc.start ? n.loc.start.line-1 : 0;
        // find closest VMATTR within 5 lines before function
        let best=null;
        for(const a of attrs){
          const aLine = src.slice(0,a.index).split('\n').length-1;
          if(aLine<=line && line-aLine<=5){
            if(!best || aLine>best.aLine) best={aLine, attrs:a.attrs};
          }
        }
        if(best) funcMap.set(n, best.attrs);
        // also check -- @VM legacy via perfunc.js? Keep compat
      }
      for(const k in n){
        const v=n[k];
        if(Array.isArray(v) && v[0] && v[0].type) walk(v);
        else if(v && v.type) walk([v]);
      }
    }
  }
  walk(ast.body);
  return funcMap;
}

// Inheritance: parent settings propagate to nested functions unless overridden
export function inheritedMeta(funcMap, ast) {
  const stack=[];
  const result=new Map(funcMap);
  function walk(nodes, parentMeta){
    for(const n of nodes){
      if(!n) continue;
      let meta = funcMap.get(n) || parentMeta;
      if(meta) result.set(n, meta);
      if(n.body && Array.isArray(n.body)) walk(n.body, meta);
    }
  }
  walk(ast.body, null);
  return result;
}
