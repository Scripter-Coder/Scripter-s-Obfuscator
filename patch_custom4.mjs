import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\custom-obfuscator.js';
let s = fs.readFileSync(p, 'utf8');
const oldLoader = "    var loader = buildLoader(payload, intensity, loaderOpts);";
const newLoader = "    var loader;\n    if (selectedTarget === 'luau') {\n        loader = payload;\n    } else {\n        loader = buildLoader(payload, intensity, loaderOpts);\n    }";
if(s.includes(oldLoader)){
  s = s.replace(oldLoader, newLoader);
  console.log('patched loader');
} else {
  console.log('oldLoader not found');
  console.log(s.slice(s.indexOf('var loader'), s.indexOf('var loader')+300));
}
// Also skip double-wrap for Luau
const oldDouble = "    if (willDoubleWrap) {";
const newDouble = "    if (willDoubleWrap && selectedTarget !== 'luau') {";
if(s.includes(oldDouble)){
  // Only replace the first occurrence after loader
  let idx = s.indexOf(oldDouble);
  // Check if it's the double-wrap for intensity
  s = s.replace(oldDouble, newDouble);
  console.log('patched doubleWrap');
}
fs.writeFileSync(p, s, 'utf8');
console.log('done');
