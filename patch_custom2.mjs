import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\custom-obfuscator.js';
let s = fs.readFileSync(p, 'utf8');
const oldStr = "out.push('local ' + FN + '=(function() local g=getfenv and getfenv() or _G; return rawget(g, string.char(108,111,97,100,115,116,114,105,110,103)) or rawget(g, string.char(108,111,97,100)) end)()');";
const newStr = "out.push('local ' + FN + '=(function() local g=_G; return rawget(g, string.char(108,111,97,100,115,116,114,105,110,103)) or rawget(g, string.char(108,111,97,100)) end)()');";
if(s.includes(oldStr)){
  s = s.replace(oldStr, newStr);
  console.log('patched loadstring FN');
} else {
  console.log('oldStr not found, trying alternative');
  // Try to find the line with getfenv and getfenv() or _G
  const pattern = /out\.push\('local ' \+ FN \+ '=\(function\(\) local g=getfenv and getfenv\(\) or _G;/;
  if(pattern.test(s)){
    s = s.replace(pattern, "out.push('local ' + FN + '=(function() local g=_G;");
    console.log('patched via regex');
  } else {
    console.log('pattern not found');
  }
}
fs.writeFileSync(p, s, 'utf8');
console.log('done');
