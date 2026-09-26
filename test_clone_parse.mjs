import fs from 'fs';
import luaparse from 'luaparse';
const src = fs.readFileSync('C:/Users/Ryzen 9 5900x/Desktop/Mine Scripts/Clone Kingdom Tycoon/Full Script.txt', 'utf8');
try {
  const ast = luaparse.parse(src, {luaVersion:'5.1'});
  console.log('parsed body len', ast.body.length);
  // find any unsupported constructs
  let hasGoto=false, hasLabel=false;
  function walk(n){
    if(!n||typeof n!=='object') return;
    if(n.type==='GotoStatement') hasGoto=true;
    if(n.type==='LabelStatement') hasLabel=true;
    for(const k in n){ if(Array.isArray(n[k])) n[k].forEach(walk); else if(typeof n[k]==='object') walk(n[k]); }
  }
  walk(ast);
  console.log('goto',hasGoto,'label',hasLabel);
} catch(e){ console.log('parse error', e.message.slice(0,500)); }
