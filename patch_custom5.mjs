import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\custom-obfuscator.js';
let s = fs.readFileSync(p, 'utf8');
const oldStr = "        if (profName === 'FAST' && !options.vmTier) {";
const newStr = "        if (profName === 'FAST' && !options.vmTier && selectedTarget !== 'luau') {";
if(s.includes(oldStr)){
  s = s.replace(oldStr, newStr);
  console.log('patched FAST lite');
} else {
  console.log('oldStr not found');
}
fs.writeFileSync(p, s, 'utf8');
console.log('done');
