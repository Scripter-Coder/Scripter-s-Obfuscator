import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function runJs(source, profile, seed) {
  const artifact = applyBytecodeVm(source, { target: 'luau', profile, seedOverride: seed, rethrow: true });
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const status = lauxlib.luaL_dostring(state, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(`runtime error: ${to_jsstring(lua.lua_tostring(state, -1))}`);
  lua.lua_getglobal(state, 'RESULT');
  const tp = lua.lua_type(state, -1);
  if (tp !== lua.LUA_TSTRING && tp !== lua.LUA_TNUMBER) throw new Error(`RESULT missing (type ${tp})`);
  return to_jsstring(lua.lua_tostring(state, -1));
}
const CASES = [
  ['cont-single-line', 'local s=0 for i=1,5 do if i==3 then continue end s=s+i end RESULT=tostring(s)', '12'],
  ['cont-multi', 'local s=0\nfor i=1,5 do\nif i==3 then continue end\ns=s+i\nend\nRESULT=tostring(s)', '12'],
  ['cont-nested', 'local s=0\nfor i=1,3 do\nfor j=1,3 do\nif j==2 then continue end\ns=s+1\nend\nend\nRESULT=tostring(s)', '6'],
  ['cont-if-block', 'local s=0\nfor i=1,5 do\nif i>1 then\ns=s+100\nend\ns=s+i\nif i==4 then continue end\ns=s+10\nend\nRESULT=tostring(s)', '455'],
  ['cont-do-block', 'local s=0\nfor i=1,3 do\ndo\ns=s+1\nend\nif i==2 then continue end\ns=s+10\nend\nRESULT=tostring(s)', '23'],
  ['cont-repeat', 'local s=0\nlocal i=0\nrepeat\ni=i+1\nif i==2 then continue end\ns=s+10\nuntil i>=3\nRESULT=tostring(s)', '20'],
  ['cont-outside-rejected', null, null],
];
let pass = 0;
for (const profile of ['FAST', 'OPAL', 'BALANCED']) {
  for (const seed of [7, 41]) {
    for (const [name, source, expected] of CASES) {
      if (source === null) continue;
      let got;
      try { got = runJs(`RESULT=nil; ${source}`, profile, seed); }
      catch (e) { throw new Error(`${profile}/seed${seed}/${name}: ${e.message}`); }
      if (got !== expected) throw new Error(`${profile}/seed${seed}/${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
      pass++;
    }
  }
}
// SECURE/ONYX artifacts use the compressed loader path, which the Fengari
// harness cannot execute; they are compile-checked here and executed
// against the real Luau runtime in exact-runtime verification.
for (const profile of ['SECURE', 'ONYX']) {
  for (const [name, source] of CASES) {
    if (source === null) continue;
    applyBytecodeVm(`RESULT=nil; ${source}`, { target: 'luau', profile, seedOverride: 7, rethrow: true });
    pass++;
  }
}
let rejected = false;
try { applyBytecodeVm('local s=0 continue RESULT=s', { target: 'luau', profile: 'BALANCED', seedOverride: 7, rethrow: true }); }
catch (e) { rejected = /continue outside loop/.test(String(e && e.message)); }
if (!rejected) throw new Error('top-level continue was not rejected');
pass++;
console.log(`luau continue lowering: ${pass} passed`);
