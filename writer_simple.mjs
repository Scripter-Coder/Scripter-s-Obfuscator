import fs from 'fs';
const target = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator\\test_simple_luau.mjs';
const content = fs.readFileSync('C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\test_luau_simple2.mjs', 'utf8');
// The content has absolute imports, need to make them relative
let newContent = content.replace(/from 'C:\/Users\/Ryzen 9 5900x\/Downloads\/new-obfuscator-current\/new-obfuscator\/vm-bytecode\.js'/, "from './vm-bytecode.js'");
newContent = newContent.replace(/import luaparse from 'luaparse'/, "import luaparse from 'luaparse'");
fs.writeFileSync(target, newContent, 'utf8');
console.log('written test', target, fs.statSync(target).size);
console.log(newContent.slice(0,400));
