// src/ast/perfunc-enhanced.js — Per-Function Attributes (Phase 6, §17)
// Replace limited comment parser with real metadata architecture
// Syntax: VMATTR( VM=SECURE, PRESET=SECURE, TRANSFORM=CONTROL_FLOW, INLINE=true, UNROLL=true, MBA=STRONG, STACKALLOC=true, DEBUG=false, CONSTANTS=strong, CONTROL_FLOW=heavy )
// Also support legacy -- @VM

const SUPPORTED_KEYS = ['VM','PRESET','TRANSFORM','INLINE','UNROLL','MBA','STACKALLOC','DEBUG','CONSTANTS','CONTROL_FLOW','TARGET','COMPRESSION','STATIC_ENV','COMPAT','NO_UPVALUES','ERROR_HANDLING'];

function attrValue(value) {
  if (value == null) return 'true';
  if (value.type === 'CallExpression' && value.base && value.base.type === 'Identifier') {
    const callName = String(value.base.name || '').toUpperCase();
    const args = (value.arguments || []).map((arg) => attrValue(arg));
    if (callName === 'EXTRACT') return { kind: 'EXTRACT', options: args };
    return args.length === 0 ? true : (args.length === 1 && (typeof args[0] !== 'object' || args[0] === null) ? String(args[0]) : args);
  }
  if (value.type === 'StringLiteral') return String(value.value ?? value.raw ?? '').replace(/^['"]|['"]$/g, '');
  if (value.type === 'BooleanLiteral') return !!value.value;
  if (value.type === 'NumericLiteral') return Number(value.value);
  return String(value.name || value.type || '').trim();
}

function normalizeTransforms(parsed) {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length || items.some((item) => item === true || item === '')) throw new Error('TRANSFORM requires at least one transform');
  const result = items.map((item) => {
    if (item && typeof item === 'object' && item.kind === 'EXTRACT') {
      const options = (item.options || []).map((option) => String(option).toUpperCase());
      if (options.some((option) => !['GLOBALS', 'CONSTANTS'].includes(option))) throw new Error('EXTRACT accepts only GLOBALS and CONSTANTS');
      if (new Set(options).size !== options.length) throw new Error('EXTRACT options must be unique');
      return { name: 'EXTRACT', options: options.length ? options : ['GLOBALS', 'CONSTANTS'] };
    }
    const name = String(item).toUpperCase();
    if (!['CONTROL_FLOW', 'EXTRACT', 'REWRITE_NAMECALLS', 'NO_FUSION', 'NO_OPT'].includes(name)) throw new Error('invalid LPH_ATTRIBUTES transform: ' + name);
    return name === 'EXTRACT' ? { name: 'EXTRACT', options: ['GLOBALS', 'CONSTANTS'] } : name;
  });
  const names = result.map((item) => typeof item === 'string' ? item : item.name);
  if (new Set(names).size !== names.length) throw new Error('TRANSFORM options must be unique');
  return result;
}

function parseAttributeCall(node) {
  if (!node || node.type !== 'CallStatement' || !node.expression || node.expression.type !== 'CallExpression' || !node.expression.base || node.expression.base.type !== 'Identifier') return null;
  const name = String(node.expression.base.name || '').toUpperCase();
  if (name !== 'LPH_ATTRIBUTES' && name !== 'VMATTR') return null;
  const attrs = {};
  for (const arg of node.expression.arguments || []) {
    if (!arg) continue;
    let key = null;
    let value = arg;
    if (arg.type === 'CallExpression' && arg.base && arg.base.type === 'Identifier') key = String(arg.base.name).toUpperCase();
    else if (arg.type === 'TableKeyString' && arg.key && arg.key.name) key = String(arg.key.name).toUpperCase();
    if (!key || !SUPPORTED_KEYS.includes(key)) {
      throw new Error('unsupported LPH_ATTRIBUTES key: ' + (key || 'unknown'));
    }
    let parsed = attrValue(value);
    if (key === 'TRANSFORM') parsed = normalizeTransforms(parsed);
    else if (key === 'ERROR_HANDLING') {
      // Documented: ERROR_HANDLING(enabled) takes a boolean literal.
      const norm = String(parsed).trim().toUpperCase();
      if (norm === 'TRUE') parsed = true;
      else if (norm === 'FALSE') parsed = false;
      else throw new Error('invalid LPH_ATTRIBUTES value for ERROR_HANDLING: ' + parsed);
    }
    else if (typeof parsed === 'string') parsed = parsed.toUpperCase();
    const allowed = {
      VM: ['OPAL', 'ONYX', 'NONE'],
      PRESET: ['FAST', 'BALANCED', 'SECURE', 'STRONG', 'EXTREME'],
    };
    if (allowed[key]) {
      const values = Array.isArray(parsed) ? parsed : [parsed];
      if (values.some((value) => !allowed[key].includes(String(value)))) throw new Error('invalid LPH_ATTRIBUTES value for ' + key);
    }
    if (Object.prototype.hasOwnProperty.call(attrs, key)) throw new Error('duplicate LPH_ATTRIBUTES key: ' + key);
    attrs[key] = parsed;
  }
  return attrs;
}

export function parseVMAttr(src) {
  const out=[];
  const marker = /(?:VMATTR|LPH_ATTRIBUTES)\s*\(/g;
  let m;
  while((m=marker.exec(src))) {
    let depth = 1;
    let end = m.index + m[0].length;
    while (end < src.length && depth) {
      if (src[end] === '(') depth++;
      else if (src[end] === ')') depth--;
      end++;
    }
    if (depth) continue;
    const inside=src.slice(m.index + m[0].length, end - 1);
    const obj={};
    for(const part of splitTopLevel(inside)){
      const token = part.trim();
      const equals = token.indexOf('=');
      const call = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/s);
      const k = equals >= 0 ? token.slice(0, equals).trim() : call ? call[1] : token;
      let v = equals >= 0 ? token.slice(equals + 1).trim() : call ? call[2].trim() : 'true';
      if(!k) continue;
      const upK=k.toUpperCase();
      if(!SUPPORTED_KEYS.includes(upK)) continue;
      let val=v.replace(/^['"]|['"]$/g,'').trim();
      if (upK === 'TRANSFORM') val = splitTopLevel(val).map((x) => x.trim().replace(/^['"]|['"]$/g,'').toUpperCase());
      else if(val.toLowerCase()==='true') val=true;
      else if(val.toLowerCase()==='false') val=false;
      else if(/^\d+$/.test(val)) val=parseInt(val,10);
      else val=val.toUpperCase();
      obj[upK]=val;
    }
    out.push({ raw:src.slice(m.index, end), attrs:obj, index:m.index });
    marker.lastIndex = end;
  }
  return out;
}

function splitTopLevel(value) {
  const parts=[];
  let start=0, depth=0, quote=null;
  for (let i=0; i<value.length; i++) {
    const ch=value[i];
    if (quote) { if (ch===quote && value[i-1] !== '\\') quote=null; continue; }
    if (ch==='"' || ch==="'") { quote=ch; continue; }
    if (ch==='(' || ch==='{' || ch==='[') depth++;
    else if (ch===')' || ch==='}' || ch===']') depth--;
    else if (ch===',' && depth===0) { parts.push(value.slice(start,i)); start=i+1; }
  }
  parts.push(value.slice(start));
  return parts;
}

export function attachEnhancedPerFuncMeta(ast, src) {
  if (!ast || !ast.body) return new Map();
  const funcMap = new Map();
  const sourceText = String(src || '');
  const legacy = parseVMAttr(sourceText).filter((entry) => /^VMATTR\s*\(/.test(entry.raw) || /--\s*$/.test(sourceText.slice(0, entry.index)));
  const usedLegacy = new Set();
  function walk(nodes) {
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        const direct = parseAttributeCall(node.body && node.body[0]);
        if (direct) funcMap.set(node, direct);
        else if (node.loc && node.loc.start) {
          const line = node.loc.start.line - 1;
          for (let i = 0; i < legacy.length; i++) {
            if (usedLegacy.has(i)) continue;
            const attrLine = String(src || '').slice(0, legacy[i].index).split('\n').length - 1;
            if (attrLine <= line && line - attrLine <= 5) {
              funcMap.set(node, legacy[i].attrs);
              usedLegacy.add(i);
              break;
            }
          }
        }
      }
      for (const key in node) {
        const value = node[key];
        if (Array.isArray(value)) walk(value);
        else if (value && typeof value === 'object' && value.type) walk([value]);
      }
    }
  }
  walk(ast.body);
  return funcMap;
}

// Inheritance: parent settings propagate to nested functions unless overridden
export function inheritedMeta(funcMap, ast) {
  const result = new Map();
  function merge(parent, own) {
    if (!parent && !own) return null;
    return { ...(parent || {}), ...(own || {}) };
  }
  function walk(nodes, parentMeta) {
    for (const node of nodes || []) {
      if (!node) continue;
      const own = funcMap.get(node);
      const effective = merge(parentMeta, own);
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        if (effective) result.set(node, effective);
        walk(node.body || [], effective);
      } else {
        for (const key in node) {
          const value = node[key];
          if (Array.isArray(value)) walk(value, effective);
          else if (value && typeof value === 'object' && value.type) walk([value], effective);
        }
      }
    }
  }
  walk(ast.body, null);
  return result;
}
