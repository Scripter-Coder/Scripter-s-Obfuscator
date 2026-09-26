
import fs from 'fs';
import path from 'path';
const src = "C:\\Users\\Ryzen 9 5900x\\Downloads\\new-obfuscator-current\\new-obfuscator";
const dest = "C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\new-obfuscator-copy";
const src2 = "C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files";
const dest2 = "C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Obfuscator-s Website\\LuaFilesCopy";
function copyRecursive(s, d){
  if(!fs.existsSync(s)) { console.error("src not found", s); return; }
  fs.mkdirSync(d, {recursive:true});
  const entries = fs.readdirSync(s, {withFileTypes:true});
  for(const e of entries){
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if(e.isDirectory()) copyRecursive(sp, dp);
    else {
      fs.copyFileSync(sp, dp);
      console.log("copied", sp, "->", dp);
    }
  }
}
try{
  copyRecursive(src, dest);
  copyRecursive(src2, dest2);
  console.log("done");
}catch(e){ console.error(e); }
