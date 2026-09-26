import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(src, profile = 'BALANCED', seed = 7) {
  const vm = applyBytecodeVm(src, { profile, seedOverride: seed });
  if (!vm) throw new Error('applyBytecodeVm returned null');
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const st = lauxlib.luaL_dostring(L, to_luastring(vm));
  if (st !== lua.LUA_OK) {
    throw new Error(`lua execution failed: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  return L;
}

function getGlobal(L, name) {
  lua.lua_getglobal(L, to_luastring(name));
  const t = lua.lua_type(L, -1);
  if (t === lua.LUA_TSTRING) return to_jsstring(lua.lua_tostring(L, -1));
  if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, -1) ? 'true' : 'false';
  if (t === lua.LUA_TNUMBER) return String(lua.lua_tonumber(L, -1));
  return null;
}

const src = `
-- VMATTR(VM=NONE)
local function noneAdd(a, b)
  return a + b
end

-- VMATTR(VM=OPAL)
local function vmOuter(x)
  return noneAdd(x, 7) * 2
end

RESULT = tostring(vmOuter(3))
`;

const vm = applyBytecodeVm(src, { profile: 'BALANCED', seedOverride: 77 });
if (!vm) throw new Error('VM(NONE) test compile produced null');
if (!/function\s+noneAdd\s*\(/.test(vm)) {
  throw new Error('VM(NONE) function was not emitted as a native Lua function');
}
const L = run(src, 'BALANCED', 77);
const got = getGlobal(L, 'RESULT');
if (got !== '20') {
  throw new Error(`VM(NONE) mixed path returned ${got}, expected 20`);
}
console.log('VM(NONE) mixed execution: PASS');
