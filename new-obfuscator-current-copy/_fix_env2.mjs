import fs from 'fs';
let p='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/vm-bytecode.js';
let s=fs.readFileSync(p,'utf8');
console.log(s.includes("if (build.staticEnv || build.debugProtect) {"));
if(s.includes("if (build.staticEnv || build.debugProtect) {")){
  s=s.replace("if (build.staticEnv || build.debugProtect) {", "if (build.staticEnv || build.debugProtect || build.target === 'luau') {");
  console.log('replaced');
}
fs.writeFileSync(p,s,'utf8');
console.log('done');
