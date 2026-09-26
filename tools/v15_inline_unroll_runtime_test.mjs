import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function result(source, profile) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const nativeStatus = lauxlib.luaL_dostring(L, to_luastring(source));
  if (nativeStatus !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const native = to_jsstring(lua.lua_tostring(L, -1));
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile, seedOverride: 811, rethrow: true });
  const generatedState = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(generatedState);
  const generatedStatus = lauxlib.luaL_dostring(generatedState, to_luastring(artifact));
  if (generatedStatus !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(generatedState, -1)));
  lua.lua_getglobal(generatedState, to_luastring('RESULT'));
  const generated = to_jsstring(lua.lua_tostring(generatedState, -1));
  return { native, generated };
}

const cases = [
  ['side effects', 'local x=0; local function f(a) x=x+1; return a+x end; RESULT=f(4)'],
  ['argument ordering', 'local x=0; local function f(a,b) return a+b end; local function g() x=x+1; return x end; RESULT=f(g(),g())'],
  ['upvalue', 'local x=4; local function f(a) return a+x end; RESULT=f(3)'],
  ['varargs', 'local function f(...) return select("#",...) end; RESULT=f(1,2,3)'],
  ['multiple returns', 'local function f() return 2,5 end; local a,b=f(); RESULT=a*10+b'],
  ['unroll computed bounds', 'local s=0; local first,last=1,4; for i=first,last,1 do s=s+i end; RESULT=s'],
  ['unroll zero iterations', 'local s=0; for i=4,1,1 do s=s+1 end; RESULT=s'],
  ['unroll descending', 'local s=0; for i=4,1,-1 do s=s+i end; RESULT=s'],
  ['unroll break', 'local s=0; for i=1,5 do if i==3 then break end s=s+i end; RESULT=s'],
];

let passed = 0;
for (const profile of ['OPAL', 'ONYX']) {
  for (const [name, source] of cases) {
    const values = result(source, profile);
    if (values.native !== values.generated) throw new Error(`${profile}/${name}: native=${values.native} generated=${values.generated}`);
    console.log(JSON.stringify({ profile, case: name, native: values.native, generated: values.generated, equal: true }));
    passed++;
  }
}
console.log(`INLINE/UNROLL behavior matrix: ${passed}/${cases.length * 2} passed`);
