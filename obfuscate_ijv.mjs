import { applyCustomObfuscator } from "./custom-obfuscator.js";
import luaparse from "luaparse";
import { vmSetLuaparse } from "./vm-pass.js";
import { vmBCSetLuaparse } from "./vm-bytecode.js";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
import * as fs from "fs";

vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);

const src = `print("ijv824824fjc_Random")`;

console.log("[*] Obfuscating:\n" + src);

const loader = applyCustomObfuscator(src, {
  intensity: 6,
  ultra: false,
  luraphMode: false,
  antiTamper: true,
  antiSkid: false,
  antiLogger: false,
  scriptName: "ijv",
  scriptId: "sh_" + Math.random().toString(16).slice(2,8),
  owner: "Scripter"
});

let cleaned = loader
  .replace(/--\[\[[\s\S]*?\]\]/g, '')
  .replace(/--[^\n]*\n/g, '\n')
  .replace(/\r?\n/g, ';')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^;+/, '').replace(/;+/g, ';');

function hex(len){ let c='0123456789abcdef',s='';for(let i=0;i<len;i++)s+=c[Math.floor(Math.random()*16)]; return s; }
const header = `--[[ This file was protected using Luraph Obfuscator v15.0 [https://lura.ph/] ]]`;
const keyPlain = "_0x" + hex(6);
const keyEsc = keyPlain.split('').map(c => "\\"+c.charCodeAt(0)).join('');
const finalOneLine = `${header} return setmetatable({}, {__index=function(_,_) ${cleaned} end, __metatable="The metatable is locked"})["${keyEsc}"]`;
const oneLine = finalOneLine.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

fs.writeFileSync("ijv_obf.lua", oneLine, "utf8");
console.log(`[+] Wrote ijv_obf.lua length ${oneLine.length} single line ${!oneLine.includes("\n")}`);
console.log(oneLine.slice(0,700));

// verify
function verify(code){
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  let out="";
  lua.lua_pushcfunction(L, (LL)=>{
    const n=lua.lua_gettop(LL);
    let parts=[];
    for(let i=1;i<=n;i++){
      const s=lua.lua_tostring(LL,i);
      parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i)));
    }
    out+=parts.join("\t");
    console.log("[VERIFY PRINT]", parts.join("\t"));
    return 0;
  });
  lua.lua_setglobal(L, "print");
  lauxlib.luaL_dostring(L, to_luastring('game={Shutdown=function() end,GetService=function() return {} end}'));
  lauxlib.luaL_dostring(L, to_luastring('getgenv=function() return _G end'));
  const st = lauxlib.luaL_dostring(L, to_luastring(code));
  if(st!==lua.LUA_OK){
    console.log("VERIFY FAIL:", to_jsstring(lua.lua_tostring(L,-1)));
    return false;
  }
  if(out.includes("ijv824824fjc_Random")){
    console.log("✓ verify ok");
    return true;
  } else {
    console.log("✗ no output", JSON.stringify(out));
    return false;
  }
}
verify(oneLine);
console.log("contains plain?", oneLine.includes("ijv824824fjc_Random") ? "LEAK" : "hidden ✓");
console.log("contains setmetatable?", oneLine.includes("setmetatable") ? "yes" : "no");
console.log("contains rawget?", oneLine.includes("rawget") ? "yes (hidden alias)" : "no");
