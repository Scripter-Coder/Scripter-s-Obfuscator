// Regression: a native VM(NONE) callback must keep a native parent's lexical
// upvalue as a real Lua closure. Bridging it through VM_NATIVE_UPVALUE_UNBOUND
// is incorrect because VM(NONE) locals do not live in VM cells.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const source = `
local function make()
  LPH_ATTRIBUTES(VM(NONE))
  local dragStart
  local function dragCallback()
    return dragStart
  end
  dragStart = 42
  return dragCallback
end
local callback = make()
RESULT = tostring(callback())
`;

const artifact = applyBytecodeVm(source, { profile: 'FAST' });
if (!artifact) throw new Error('VM(NONE) native-capture compilation returned empty output');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const status = lauxlib.luaL_dostring(L, to_luastring(artifact));
if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
lua.lua_getglobal(L, to_luastring('RESULT'));
const result = lua.lua_tostring(L, -1);
if (!result || to_jsstring(result) !== '42') {
  throw new Error(`expected native nested capture 42, got ${result ? to_jsstring(result) : '<nil>'}`);
}
console.log('VM(NONE) native nested capture: PASS (42)');
