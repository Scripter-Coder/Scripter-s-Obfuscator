import * as fs from "fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const code = fs.readFileSync("C:\\Users\\Ryzen 9 5900x\\Desktop\\Special Website\\ScripterHub Website\\Deobfuscation Files Test\\a_b_no_header.lua", "utf8");
console.log("code len", code.length);

// Create Lua state
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

// Capture print
let prints = [];
lua.lua_pushcfunction(L, (LL)=>{
  const n = lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){
    const s = lua.lua_tostring(LL,i);
    parts.push(s ? to_jsstring(s) : lua.lua_typename(LL, lua.lua_type(LL,i)));
  }
  prints.push(parts.join("\t"));
  console.log("[PRINT]", parts.join("\t"));
  return 0;
});
lua.lua_setglobal(L, "print");
lua.lua_pushcfunction(L, (LL)=>{
  const n = lua.lua_gettop(LL);
  let parts=[];
  for(let i=1;i<=n;i++){
    const s = lua.lua_tostring(LL,i);
    parts.push(s ? to_jsstring(s) : "?");
  }
  console.log("[WARN]", parts.join(" "));
  return 0;
});
lua.lua_setglobal(L, "warn");

// Mock game, getfenv, tick, loadstring capture
let capturedPayload = null;
lua.lua_pushcfunction(L, (LL)=>{
  // getfenv
  lua.lua_pushglobaltable(LL);
  return 1;
});
lua.lua_setglobal(L, "getfenv");

// Capture loadstring
const origLoadString = lua.lua_tostring;
lua.lua_pushcfunction(L, (LL)=>{
  const n = lua.lua_gettop(LL);
  // first arg is code string
  const codeStr = to_jsstring(lua.lua_tostring(LL, 1));
  console.log("[LOADSTRING] called, len", codeStr ? codeStr.length : 0);
  if(codeStr) {
    console.log(codeStr.slice(0,500));
    capturedPayload = codeStr;
    prints.push("LOADSTRING:" + codeStr.slice(0,200));
  }
  // actually load it using fengari's load
  const status = lauxlib.luaL_loadstring(LL, to_luastring(codeStr));
  if(status !== lua.LUA_OK){
    console.log("loadstring compile error", to_jsstring(lua.lua_tostring(LL,-1)));
    lua.lua_pushnil(LL);
    return 1;
  }
  return 1;
});
lua.lua_setglobal(L, "loadstring");
// also set load alias
lauxlib.luaL_dostring(L, to_luastring('load = loadstring'));

// Mock game
lauxlib.luaL_dostring(L, to_luastring('game={HttpGet=function() return "SHK 0 0" end}'));
lauxlib.luaL_dostring(L, to_luastring('tick=function() return 0 end'));
lauxlib.luaL_dostring(L, to_luastring('bit32={bxor=function(a,b) local r,p=0,1 for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end}'))

console.log("--- Running obfuscated file ---");
const st = lauxlib.luaL_dostring(L, to_luastring(code));
console.log("status", st);
if(st!==lua.LUA_OK){
  const err = lua.lua_tostring(L, -1);
  console.log("ERROR", err ? to_jsstring(err) : "null");
  // try to get more
  console.log("top type", lua.lua_typename(L, lua.lua_type(L, -1)));
}
console.log("prints", prints);
if(capturedPayload){
  console.log("\n--- CAPTURED PAYLOAD (first 1000) ---");
  console.log(capturedPayload.slice(0,1000));
  // try to run it separately
  const L2 = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L2);
  lua.lua_pushcfunction(L2, (LL)=>{
    const n=lua.lua_gettop(LL);
    let p=[];
    for(let i=1;i<=n;i++) p.push(to_jsstring(lua.lua_tostring(LL,i)));
    console.log("[PAYLOAD PRINT]", p.join(" "));
    return 0;
  });
  lua.lua_setglobal(L2, "print");
  const st2 = lauxlib.luaL_dostring(L2, to_luastring(capturedPayload));
  console.log("payload status", st2);
  if(st2!==0) console.log(to_jsstring(lua.lua_tostring(L2,-1)));
}
