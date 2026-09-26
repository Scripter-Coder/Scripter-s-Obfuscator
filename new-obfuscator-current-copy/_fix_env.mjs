import fs from 'fs';
let p='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Obfuscator-s Website/new-obfuscator-current-copy/vm-bytecode.js';
let s=fs.readFileSync(p,'utf8');
let old1='if (build.staticEnv || build.debugProtect) {\n        L.push(\'local \' + ENV + \'={}\')';
let new1='if (build.staticEnv || build.debugProtect || build.target === \'luau\') {\n        L.push(\'local \' + ENV + \'={}\')';
if(s.includes(old1)){
  s=s.replace(old1,new1);
  console.log('fixed ENV creation');
}else{console.log('NOT found old1');}
// fix GLOB/HGLOB/GSET uses
let oldGlob="(build.staticEnv || build.debugProtect ? ENV : E)";
let newGlob="(build.target === 'luau' || build.staticEnv || build.debugProtect ? ENV : E)";
if(s.includes(oldGlob)){
  s=s.split(oldGlob).join(newGlob);
  console.log('fixed GLOB/GSET');
}else{console.log('NOT found oldGlob');}
fs.writeFileSync(p,s,'utf8');
console.log('done');
