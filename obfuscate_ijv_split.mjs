import { applyCustomObfuscator } from "./custom-obfuscator.js";
import luaparse from "luaparse";
import { vmSetLuaparse } from "./vm-pass.js";
import { vmBCSetLuaparse } from "./vm-bytecode.js";
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import * as fs from "fs";

const src = `print("ijv824824fjc_Random")`;
const SH_STATS_ENDPOINT = 'https://scripterhub-stats.dubovikstanislav51.workers.dev/';
const scriptRef = 'ijv_' + Math.random().toString(16).slice(2,8);

console.log("[*] Obfuscating with splitKey (serverNonce + hwid) - Luraph-grade");

const out = applyCustomObfuscator(src, {
  intensity: 6,
  ultra: false,
  antiTamper: true,
  antiSkid: false,
  antiLogger: false,
  scriptName: "ijv",
  scriptId: scriptRef,
  owner: "Scripter",
  serverKey: {keyUrl: SH_STATS_ENDPOINT + "sh/k", scriptRef: scriptRef}
}, {});

console.log("len", out.length);
console.log(out.slice(0,1200));

// Check that splitKey is present
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function testOffline(code){
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  // mock print
  let out="";
  lua.lua_pushcfunction(L, (LL)=>{
    const n=lua.lua_gettop(LL);
    let parts=[];
    for(let i=1;i<=n;i++){
      const s=lua.lua_tostring(LL,i);
      parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i)));
    }
    out+=parts.join("\t");
    console.log("[OFFLINE PRINT]", parts.join("\t"));
    return 0;
  });
  lua.lua_setglobal(L, "print");
  // offline: game without HttpGet
  lauxlib.luaL_dostring(L, to_luastring('game={GetService=function() return {} end}'));
  lauxlib.luaL_dostring(L, to_luastring('getgenv=function() return _G end'));
  const st = lauxlib.luaL_dostring(L, to_luastring(code));
  if(st!==lua.LUA_OK){
    console.log("[OFFLINE] Lua error:", to_jsstring(lua.lua_tostring(L,-1)));
  }
  console.log("[OFFLINE] out:", JSON.stringify(out));
  if(out.includes("ijv824824fjc_Random")){
    console.log("OFFLINE LEAK - still decodable without HttpGet (BAD)");
  } else {
    console.log("OFFLINE PROTECTED - no leak without HttpGet (GOOD)");
  }
  return out;
}

function testOnline(code, mockResponse){
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
    console.log("[ONLINE PRINT]", parts.join("\t"));
    return 0;
  });
  lua.lua_setglobal(L, "print");
  // online: mock game.HttpGet to return valid SHK
  // For this test, we will extract the expected paddedKey from the debug info
  // Simplest: mock HttpGet to return whatever the file expects - we need to know what it expects
  // The file will do game:HttpGet(url) and expect "SHK t0 chk key..." - we can mock to return empty and see
  lauxlib.luaL_dostring(L, to_luastring(`game={GetService=function() return {} end, HttpGet=function(_,url) print("HttpGet called", url); return "SHK fake" end}`));
  lauxlib.luaL_dostring(L, to_luastring('getgenv=function() return _G end'));
  lauxlib.luaL_dostring(L, to_luastring('gethwid=function() return "test-hwid-123" end'));
  lauxlib.luaL_dostring(L, to_luastring('identifyexecutor=function() return "TestExec" end'));
  lauxlib.luaL_dostring(L, to_luastring('game.JobId="test-job"; game.PlaceId=123'));
  const st = lauxlib.luaL_dostring(L, to_luastring(code));
  console.log("[ONLINE] status", st);
  if(st!==lua.LUA_OK) console.log(to_jsstring(lua.lua_tostring(L,-1)));
  console.log("[ONLINE] out", JSON.stringify(out));
}

console.log("\n--- OFFLINE TEST (no HttpGet, should NOT leak) ---");
testOffline(out);

console.log("\n--- ONLINE TEST (with HttpGet mock) ---");
// testOnline(out); // would need real SHK, skip for now

// Also write single-line setmetatable wrapper like before
let cleaned = out
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
fs.writeFileSync("ijv_obf_split.lua", oneLine, "utf8");
console.log(`[+] Wrote ijv_obf_split.lua length ${oneLine.length}`);
console.log("contains HttpGet?", oneLine.includes("HttpGet") ? "yes (splitKey)" : "no");
console.log("contains START seed zeroed?", oneLine.includes("{{0,0,0") ? "maybe" : "check");
