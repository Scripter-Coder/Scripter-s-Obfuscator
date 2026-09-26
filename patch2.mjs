import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
// Find and patch E init
const pattern = /L\.push\('local ' \+ E \+ '=_G'\);\s*L\.push\('if getgenv then ' \+ E \+ '=getgenv\(\) end'\);\s*L\.push\('if not ' \+ E \+ ' then ' \+ E \+ '=_G end'\);/;
const match = s.match(pattern);
console.log('match found', !!match);
if(match){
  const replacement = `L.push('local ' + E + '=_G');
    L.push('if getgenv then ' + E + '=getgenv() end');
    // Luau: use getfenv(0) which is writable, unlike frozen _G
    L.push('if getfenv then local _le=getfenv(0) if _le then ' + E + '=_le end end');
    L.push('if not ' + E + ' then ' + E + '=_G end');
    // For Luau, if E is still _G (frozen), create writable proxy
    if (targetName === 'luau') {
        L.push('do local _frozen=false; if pcall then _frozen=not pcall(function() ' + E + '["__luau_probe"]=1; ' + E + '["__luau_probe"]=nil end) end; if _frozen then local _real=' + E + '; ' + E + '={}; setmetatable(' + E + ',{__index=_real}); for _k,_v in pairs(_real) do ' + E + '[_k]=_v end end end');
    }`;
  s = s.replace(pattern, replacement);
  console.log('patched E');
}
// Patch staticEnv check
const pattern2 = /if \(build\.staticEnv \|\| build\.debugProtect\) \{/;
if(pattern2.test(s)){
  s = s.replace(pattern2, 'if (build.staticEnv || build.debugProtect || targetName === \'luau\') {');
  console.log('patched staticEnv');
}
// Patch ENV metatable
const pattern3 = /L\.push\('setmetatable\(' \+ ENV \+ ',\{__index=' \+ E \+ ',__newindex=' \+ E \+ '\}'\)'\);/;
if(pattern3.test(s)){
  s = s.replace(pattern3, `if (targetName === 'luau') {\n            L.push('setmetatable(' + ENV + ',{__index=' + E + '})');\n        } else {\n            L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');\n        }`);
  console.log('patched ENV');
}
fs.writeFileSync(p, s, 'utf8');
console.log('done', s.length);
