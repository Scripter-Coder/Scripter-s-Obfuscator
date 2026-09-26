// Luau 0.709 target adapter — full backend with continue, compound assignment, type stripping
export const TARGET = {
  name: 'luau',
  version: '0.709',
  parserOpts: { luaVersion: '5.3' },
  syntax: { types: true, iteration: 'luau', continue: true, goto: false },
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
function mapCodeOutsideStrings(line, transform) {
  let out = '', buf = '', quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      out += ch;
      if (ch === quote && line[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { out += transform(buf) + ch; buf = ''; quote = ch; continue; }
    if (ch === '-' && line[i + 1] === '-') { out += transform(buf) + line.slice(i); return out; }
    buf += ch;
  }
  return out + transform(buf);
}
function stripLocalTypes(line) {
  return mapCodeOutsideStrings(line, (code) => code.replace(/:\s*(?![A-Za-z_][A-Za-z0-9_]*\s*\()[^=\n,]+(?=\s*=)/g, ''));
}
function stripTypeAssertions(src){
  return src.replace(/\s*::\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?(?:\[\\])?(?:\s*[\\|&]\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g, '');
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
  if(!/\r?\n/.test(src)){
    src = src.replace(/;/g, "\n").replace(/\b(do|then)\b/g, " $1\n").replace(/\b(else|end)\b/g, "\n$1\n");
  }
  // Length-preserving scrub so token offsets map back onto the original
  // text: strings and comments can contain loop/end keywords that must not
  // affect block tracking.
  const scrub = (line) => line.replace(/"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|--\[\[[\s\S]*?\]\]|--[^\r\n]*/g, (m) => " ".repeat(m.length));
  const out = [];
  const blockStack = []; // {kind:"loop"|"block", label?}
  let labelCounter = 0;
  const nearestLoop = () => { for(let i=blockStack.length-1;i>=0;i--) if(blockStack[i].kind==="loop") return blockStack[i]; return null; };
  const openerRe = /\b(for\s[^\n]*?\bdo|while\s[^\n]*?\bdo|repeat|if|function|do)\b/g;
  const lines = src.split(/\r?\n/);
  for(let li=0; li<lines.length; li++){
    const rawLine = lines[li];
    // A loop opener glued to leading code on one line (inline mode makes
    // e.g. `local s=0 for i=1,5 do`) must start its own line: two
    // statements cannot share a line without `;`.
    let linePieces = [rawLine];
    {
      const sc = scrub(rawLine);
      const m = sc.match(/^([\s\S]*?\S)\s*\b(for\s[^\n]*\bdo|while\s[^\n]*\bdo|repeat)\s*$/);
      if(m && !/^\s*(for|while|repeat)\b/.test(rawLine)){
        linePieces = [rawLine.slice(0, m[1].length), rawLine.slice(m[1].length)];
      }
    }
    for(const piece of linePieces){
    const scrubbed = scrub(piece);
    // Cut the line into segments at end/until boundaries so a closer that
    // shares its line with other code still matches the right opener.
    const cuts = [0];
    const closerRe = /\b(end|until)\b/g;
    let cm;
    while((cm = closerRe.exec(scrubbed))) cuts.push(cm.index, cm.index + cm[0].length);
    cuts.push(piece.length);
    const pieces = [];
    for(let c=0;c+1<cuts.length;c+=2) pieces.push({ text: piece.slice(cuts[c], cuts[c+1]), closer: c+2<cuts.length ? piece.slice(cuts[c+1], cuts[c+2]) : null });
    // A closer piece alternates with text pieces; walk in order.
    const segs = [];
    for(const p of pieces){ segs.push({ kind: "text", text: p.text }); if(p.closer != null) segs.push({ kind: "closer", text: p.closer }); }
    for(const seg of segs){
      if(seg.kind === "closer"){
        const isUntil = /^\s*until\b/.test(scrub(seg.text));
        const top = blockStack.pop();
        if(top && top.kind === "loop"){
          const indent = (seg.text.match(/^\s*/) || [""])[0];
          out.push(indent + "::" + top.label + "::");
        } else if(!top && !isUntil){
          // Unmatched end: leave it for the parser to reject.
        } else if(top && !isUntil){
          // Closer matches a non-loop block: nothing to emit.
        }
        out.push(seg.text);
        continue;
      }
      let text = seg.text;
      const code = scrub(text);
      openerRe.lastIndex = 0;
      let om;
      while((om = openerRe.exec(code))){
        const kw = om[1].startsWith("for") || om[1].startsWith("while") ? "loop" : (om[1] === "repeat" ? "loop" : "block");
        if(kw === "loop") blockStack.push({ kind: "loop", label: "__luau_continue_" + (++labelCounter) });
        else blockStack.push({ kind: "block" });
      }
      if(/\bcontinue\b/.test(code)){
        const loop = nearestLoop();
        if(!loop) throw new Error("continue outside loop at line "+(li+1));
        text = text.replace(/\bcontinue\b/g, "goto " + loop.label);
      }
      out.push(text);
      }
    }
  }
  return out.join("\n");
}
export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){
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
