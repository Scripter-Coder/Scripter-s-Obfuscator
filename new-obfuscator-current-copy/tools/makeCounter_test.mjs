import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

const src = `
local function makeCounter(start)
    local n = start
    return function(x, ...)
        n = n + x
        local t = {
            value = n,
            args = {...}
        }
        if n % 2 == 0 then
            t.kind = "even"
        else
            t.kind = "odd"
        end
        return t.value, t.kind, n
    end
end
local a = makeCounter(10)
local b = makeCounter(100)
local v1,k1,n1 = a(2, "x", "y")
local v2,k2,n2 = a(3)
local v3,k3,n3 = b(5)
RESULT = v1..","..k1..","..n1.."|"..v2..","..k2..","..n2.."|"..v3..","..k3..","..n3
`;

function run(src){
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(src));
 if(st!==lua.LUA_OK) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1))};
 lua.lua_getglobal(L,to_luastring('RESULT'));
 return {ok:true, res: to_jsstring(lua.lua_tostring(L,-1))};
}
const native=run(src);
console.log('native', native);
const vm=applyBytecodeVm(src, {profile:'BALANCED'});
const prot=run(vm);
console.log('prot', prot);
console.log('match', native.res===prot.res ? 'PASS' : 'FAIL');
if(native.res!==prot.res) process.exit(1);
