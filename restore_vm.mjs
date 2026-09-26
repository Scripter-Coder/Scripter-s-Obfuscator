import fs from 'fs';
const p = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\vm-bytecode.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/if \(targetName === 'lua51' \|\| targetName === 'luajit'\) throw/, "if (targetName === 'lua51' || targetName === 'luajit' || targetName === 'luau') throw");
fs.writeFileSync(p, s, 'utf8');
console.log('reverted vm-bytecode');
console.log(s.match(/GotoStatement[^}]*throw[^\n]*/g));
