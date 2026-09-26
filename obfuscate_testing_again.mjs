import { applyCustomObfuscator } from './custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;

const src='print("testing again")';
console.log('Original:', JSON.stringify(src));

// LURAPH V15 BALANCED (6 VM Layers, 1.59 MB for 80KB, 137KB for 22 chars)
const outBalanced = applyCustomObfuscator(src, {scriptName:'testing_again', scriptId:'ta_'+Date.now(), owner:'Scripter'});
fs.writeFileSync('obf_testing_again_balanced.lua', outBalanced);
console.log('\n[Balanced 6 VM Layers]');
console.log('  Length:', outBalanced.length, 'chars,', (outBalanced.length/1024).toFixed(1), 'KB');
console.log('  Expansion:', (outBalanced.length/src.length).toFixed(1)+'x');
try{luaparse.parse(outBalanced); console.log('  Parse: OK');}catch(e){console.log('  Parse FAIL',e.message);}
const L1=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L1);
lauxlib.luaL_dostring(L1,to_luastring('getgenv=function() return _G end'));
lauxlib.luaL_dostring(L1,to_luastring('captured=nil; print=function(s) captured=s end'));
lauxlib.luaL_dostring(L1,to_luastring('game={GetService=function() return {SetCore=function() end} end, Shutdown=function() end}'));
const st1=lauxlib.luaL_dostring(L1,to_luastring(outBalanced));
console.log('  Exec:', st1===lua.LUA_OK?'OK':'FAIL', st1!==lua.LUA_OK?to_jsstring(lua.lua_tostring(L1,-1)).slice(0,500):'');
lua.lua_getglobal(L1,to_luastring('captured'));
console.log('  Output:', to_jsstring(lua.lua_tostring(L1,-1)));

// LURAPH V15 ULTRA (12 layers + LPH outer double VM) - for max paranoia
const outUltra = applyCustomObfuscator(src, {scriptName:'testing_again', scriptId:'ta2_'+Date.now(), owner:'Scripter', intensity:12, ultra:true});
fs.writeFileSync('obf_testing_again_ultra.lua', outUltra);
console.log('\n[Ultra 12 Layers + LPH Double VM]');
console.log('  Length:', outUltra.length, 'chars,', (outUltra.length/1024).toFixed(1), 'KB');
console.log('  Expansion:', (outUltra.length/src.length).toFixed(1)+'x');
console.log('  Has LPH:', outUltra.includes('LPH'));
console.log('  Has polymorphic hex (0x):', /0x[0-9a-f]+/.test(outUltra));
try{luaparse.parse(outUltra); console.log('  Parse: OK');}catch(e){console.log('  Parse FAIL');}
const L2=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L2);
lauxlib.luaL_dostring(L2,to_luastring('getgenv=function() return _G end'));
lauxlib.luaL_dostring(L2,to_luastring('captured=nil; print=function(s) captured=s end'));
lauxlib.luaL_dostring(L2,to_luastring('game={GetService=function() return {SetCore=function() end} end, Shutdown=function() end}'));
const st2=lauxlib.luaL_dostring(L2,to_luastring(outUltra));
console.log('  Exec:', st2===lua.LUA_OK?'OK':'FAIL', st2!==lua.LUA_OK?to_jsstring(lua.lua_tostring(L2,-1)).slice(0,500):'');
lua.lua_getglobal(L2,to_luastring('captured'));
console.log('  Output:', to_jsstring(lua.lua_tostring(L2,-1)));

console.log('\nFiles written: obf_testing_again_balanced.lua, obf_testing_again_ultra.lua');
