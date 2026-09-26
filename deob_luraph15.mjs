import fs from 'fs';
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
const path='C:/Users/Ryzen 9 5900x/Desktop/Special Website/ScripterHub Website/Deobfuscation Files Test/test_obf.lua';
const code=fs.readFileSync(path,'utf8');
const L=lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
lauxlib.luaL_dostring(L,to_luastring('getgenv=function() return _G end'));
lauxlib.luaL_dostring(L,to_luastring('captured=nil; print=function(s) captured=tostring(s) end'));
lauxlib.luaL_dostring(L,to_luastring('game={GetService=function() return {SetCore=function() end} end, Shutdown=function() end, HttpGet=function() return "" end}'));
lauxlib.luaL_dostring(L,to_luastring('task={spawn=function(f) end, wait=function() end}'));
lauxlib.luaL_dostring(L,to_luastring('buffer={create=function(n) return {data=string.rep("\\0",n), len=n} end, len=function(b) return b.len end, tostring=function(b) return b.data end, readu8=function(b,i) return string.byte(b.data, i+1) end, writeu8=function(b,i,v) b.data=b.data:sub(1,i)..string.char(v%256)..b.data:sub(i+2) end}'));
lauxlib.luaL_dostring(L,to_luastring('vector={create=function(x,y,z) return {x=x,y=y,z=z} end}'));
lauxlib.luaL_dostring(L,to_luastring('bit32={bxor=function(a,b) local r,p=0,1 for _=1,32 do local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end}'));
const st=lauxlib.luaL_dostring(L,to_luastring(code));
console.log('status',st);
if(st!==0) console.log('err',to_jsstring(lua.lua_tostring(L,-1)).slice(0,2000));
else {
 lua.lua_getglobal(L,to_luastring('captured'));
 const v=lua.lua_tostring(L,-1);
 console.log('captured', v?to_jsstring(v):'nil');
}
