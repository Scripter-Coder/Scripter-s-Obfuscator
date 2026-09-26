import fs from 'fs';
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';

vmBCSetLuaparse(luaparse);

function runLua(src) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const ok = lauxlib.luaL_dostring(L, to_luastring(src));
  if (ok !== lua.LUA_OK) {
    const err = lua.lua_tostring(L, -1);
    throw new Error(to_jsstring(err));
  }
  lua.lua_getglobal(L, to_luastring("RESULT"));
  let res = null;
  if (lua.lua_type(L, -1) === lua.LUA_TNUMBER) {
    res = lua.lua_tonumber(L, -1);
  } else if (lua.lua_type(L, -1) === lua.LUA_TSTRING) {
    res = to_jsstring(lua.lua_tostring(L, -1));
  }
  return res;
}

function runTest(name, src, unroll) {
  try {
    const nativeRes = runLua(src);
    const vmSrc = applyBytecodeVm(src, { profile: 'BALANCED', unroll: unroll });
    const vmRes = runLua(vmSrc);
    if (nativeRes !== vmRes) {
      console.log(`FAIL: ${name} (unroll=${unroll}) - native=${nativeRes}, vm=${vmRes}`);
      return false;
    }
    console.log(`PASS: ${name} (unroll=${unroll})`);
    return true;
  } catch(e) {
    console.log(`ERROR: ${name} - ${e.message}`);
    return false;
  }
}

function countInstructions(src, unroll) {
  const vmSrc = applyBytecodeVm(src, { profile: 'BALANCED', unroll: unroll });
  // The bytecode length is roughly proportional to string size. We can just check the vmSrc length or we could hook into compilation.
  // Actually, we just need a structural test proving different instruction counts or size differences
  return vmSrc.length;
}

let allOk = true;

const tests = {
  "zero iterations": `
    RESULT = 0
    for i=1,0 do RESULT = RESULT + i end
  `,
  "one iteration": `
    RESULT = 0
    for i=1,1 do RESULT = RESULT + i end
  `,
  "multiple iterations": `
    RESULT = 0
    for i=1,4 do RESULT = RESULT + i end
  `,
  "negative step": `
    RESULT = 0
    for i=5,1,-1 do RESULT = RESULT + i end
  `,
  "break inside loop": `
    RESULT = 0
    for i=1,4 do
      if i == 3 then break end
      RESULT = RESULT + i
    end
  `,
  "nested loop": `
    RESULT = 0
    for i=1,3 do
      for j=1,2 do
        RESULT = RESULT + i * j
      end
    end
  `,
  "non-constant bounds fallback": `
    RESULT = 0
    local n = 3
    for i=1,n do RESULT = RESULT + i end
  `
};

for (const [name, src] of Object.entries(tests)) {
  const resOff = runTest(name, src, false);
  const resOn = runTest(name, src, true);
  if (!resOff || !resOn) allOk = false;
}

const unrollSrc = `
  RESULT = 0
  for i=1,4 do RESULT = RESULT + i end
`;
const sizeOff = countInstructions(unrollSrc, false);
const sizeOn = countInstructions(unrollSrc, true);
console.log(`Size with unroll OFF: ${sizeOff}`);
console.log(`Size with unroll ON: ${sizeOn}`);
if (sizeOn === sizeOff) {
  console.log("FAIL: Structural test failed. Unrolling did not change VM output size.");
  allOk = false;
} else {
  console.log("PASS: Structural test (output size difference).");
}

if (!allOk) process.exit(1);
