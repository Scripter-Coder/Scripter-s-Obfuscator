import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
// Revert ENV creation to not include Luau
s = s.replace("if (build.staticEnv || build.debugProtect || build.target === 'luau') {", "if (build.staticEnv || build.debugProtect) {");
// Remove the Luau-specific ENV metatable branching, restore original
s = s.replace("        if (build.target === 'luau') {\n            L.push('setmetatable(' + ENV + ',{__index=' + E + '})');\n        } else {\n            L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');\n        }", "        L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');");
// The E init for Luau should remain, but remove the frozen proxy if it exists
// We added a frozen check earlier but then removed it, but check if any remains
if(s.includes('_luauRealE') || s.includes('_isFrozen')){
  s = s.replace(/\s*L\.push\('do local _isFrozen[\s\S]*?end'\);\s*/g, '');
  console.log('removed frozen proxy');
}
fs.writeFileSync(p, s, 'utf8');
console.log('patched vm-bytecode for Luau E only');
console.log(s.includes("build.target === 'luau'") ? 'still has luau' : 'no luau');
