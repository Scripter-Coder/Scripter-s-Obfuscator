import { applyCustomObfuscator } from "./custom-obfuscator.js";
import luaparse from "luaparse";
import { vmSetLuaparse } from "./vm-pass.js";
import { vmBCSetLuaparse } from "./vm-bytecode.js";
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const PRELUDE = [
    'SHUTDOWN=false',
    'game={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}',
    'MARKER=nil'
].join('\n');
function runLua(code){
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(PRELUDE));
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const err = to_jsstring(lua.lua_tostring(L, -1));
        throw new Error('Lua runtime error: ' + err);
    }
    return L;
}
const runnable = 'GLOBAL_MARKER = "RAN_OK_7355608"\nlocal x = 0\nfor i = 1, 10 do x = x + i end\nassert(x == 55, "math broken")\n';
const outRun = applyCustomObfuscator(runnable, { intensity: 5, antiTamper: false, antiSkid: false });
console.log("outRun len", outRun.length);
console.log(outRun.slice(0,1000));
const L = runLua(outRun);
lua.lua_getglobal(L, to_luastring('GLOBAL_MARKER'));
const top = lua.lua_tostring(L, -1);
console.log("top", top);
if(top){
    console.log("marker", to_jsstring(top));
} else {
    console.log("top is nil, type", lua.lua_typename(L, lua.lua_type(L, -1)));
    // try get error
    lua.lua_getglobal(L, to_luastring('SHUTDOWN'));
    console.log("SHUTDOWN", lua.lua_toboolean(L, -1));
}
