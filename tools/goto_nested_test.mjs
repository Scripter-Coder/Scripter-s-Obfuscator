// tools/goto_nested_test.mjs — regression for control-flow lowering under
// optimizer profiles. Nested loops + goto miscompiled under BALANCED+
// because hidden-temp register reuse ran on multi-block chunks whose
// flattened live intervals cannot see loop back-edges.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function runJs(source, profile, seed) {
  const artifact = applyBytecodeVm(source, { target: 'lua52', profile, seedOverride: seed, rethrow: true });
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const status = lauxlib.luaL_dostring(state, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(`runtime error: ${to_jsstring(lua.lua_tostring(state, -1))}`);
  lua.lua_getglobal(state, 'RESULT');
  const out = to_jsstring(lua.lua_tostring(state, -1));
  if (out === undefined || out === null) throw new Error('RESULT missing');
  return out;
}

const CASES = [
  ['nested-for-goto-inner', 'local s=0\nfor i=1,3 do\nfor j=1,3 do\nif j==2 then goto L2 end\ns=s+1\n::L2::\nend\nend\nRESULT=tostring(s)', '6'],
  ['nested-for-goto-outer', 'local s=0\nfor i=1,3 do\nfor j=1,3 do\nif j==2 then goto OUT end\ns=s+1\nend\n::OUT::\nend\nRESULT=tostring(s)', '3'],
  ['single-for-goto', 'local s=0\nfor i=1,5 do\nif i==3 then goto C end\ns=s+i\n::C::\nend\nRESULT=tostring(s)', '12'],
  ['nested-while-goto', 'local s=0\nlocal i=0\nwhile i<3 do\ni=i+1\nlocal j=0\nwhile j<3 do\nj=j+1\nif j==2 then goto W2 end\ns=s+1\n::W2::\nend\nend\nRESULT=tostring(s)', '6'],
  ['fwd-goto', 'local s=0\ngoto SKIP\ns=99\n::SKIP::\nRESULT=tostring(s)', '0'],
  ['goto-loop', 'local i=0\n::TOP::\ni=i+1\nif i<3 then goto TOP end\nRESULT=tostring(i)', '3'],
  ['nested-break', 'local s=0\nfor i=1,3 do\nfor j=1,5 do\nif j>2 then break end\ns=s+1\nend\nend\nRESULT=tostring(s)', '6'],
  ['repeat-goto', 'local s=0\nlocal i=0\nrepeat\ni=i+1\nif i==2 then goto R end\ns=s+10\n::R::\nuntil i>=3\nRESULT=tostring(s)', '20'],
];

let pass = 0;
for (const profile of ['FAST', 'OPAL', 'BALANCED', 'ONYX', 'SECURE']) {
  for (const seed of [7, 41]) {
    for (const [name, source, expected] of CASES) {
      const got = runJs(`RESULT=nil; ${source}`, profile, seed);
      if (got !== expected) throw new Error(`${profile}/seed${seed}/${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
      pass++;
    }
  }
}
console.log(`nested goto/control-flow: ${pass}/${CASES.length * 10} passed`);
