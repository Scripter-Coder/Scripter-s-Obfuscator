import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
// Patch E initialization for Luau
const oldEInit = `    L.push('local ' + E + '=_G');
    L.push('if getgenv then ' + E + '=getgenv() end');
    L.push('if not ' + E + ' then ' + E + '=_G end');
    if (build.staticEnv || build.debugProtect) {`;
const newEInit = `    L.push('local ' + E + '=_G');
    L.push('if getgenv then ' + E + '=getgenv() end');
    if (targetName === 'luau' && typeof getfenv !== 'undefined' || true) {
        // For Luau, prefer getfenv(0) which is writable, unlike frozen _G
        L.push('if getfenv then local _le=getfenv(0) if _le then ' + E + '=_le end end');
    }
    L.push('if not ' + E + ' then ' + E + '=_G end');
    // Luau: ensure E is writable; if still _G (frozen), create proxy
    if (targetName === 'luau') {
        L.push('do local _isFrozen = (function() local ok=false; if pcall then ok=pcall(function() ' + E + '[\"__luau_probe\"]=1; ' + E + '[\"__luau_probe\"]=nil end) else ok=true end; return not ok end)()');
        L.push('if _isFrozen then local _real=' + E + '; ' + E + '={}; setmetatable(' + E + ',{__index=_real}); for _k,_v in pairs(_real) do ' + E + '[_k]=_v end end end');
    }
    if (build.staticEnv || build.debugProtect || targetName === 'luau') {`;
if(s.includes(oldEInit)){
  s = s.replace(oldEInit, newEInit);
  console.log('patched E init');
} else {
  console.log('oldEInit not found, trying alternative');
  // fallback: simple replace
  s = s.replace("L.push('local ' + E + '=_G');", "L.push('local ' + E + '=_G');\n    if (targetName === 'luau') { L.push('if getfenv then local _le=getfenv(0) if _le then ' + E + '=_le end end'); }");
}
// Patch ENV metatable for Luau
const oldEnvMeta = `        L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');`;
const newEnvMeta = `        if (targetName === 'luau') {
            L.push('setmetatable(' + ENV + ',{__index=' + E + '})');
        } else {
            L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');
        }`;
if(s.includes(oldEnvMeta)){
  s = s.replace(oldEnvMeta, newEnvMeta);
  console.log('patched ENV meta');
} else {
  console.log('oldEnvMeta not found');
}
fs.writeFileSync(p, s, 'utf8');
console.log('done', s.length);
