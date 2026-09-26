import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
// Fix the goto check: should be targetName for compile, not build.target
s = s.replace("if (targetName === 'lua51' || targetName === 'luajit' || build.target === 'luau') throw", "if (targetName === 'lua51' || targetName === 'luajit') throw");
fs.writeFileSync(p, s, 'utf8');
console.log('fixed goto');
console.log(s.match(/GotoStatement[^}]*throw[^\n]*/g));
