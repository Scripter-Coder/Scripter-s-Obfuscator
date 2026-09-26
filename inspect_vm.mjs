import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split('\n');
for(let i=0;i<lines.length;i++){
  if(lines[i].includes("_G") && lines[i].includes("L.push")){
    console.log(i, lines[i]);
    for(let j=Math.max(0,i-2); j<Math.min(lines.length,i+5); j++) console.log('  ', j, JSON.stringify(lines[j]));
    console.log('---');
    if(i>1200) break;
  }
}
