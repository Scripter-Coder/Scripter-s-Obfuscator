import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function executeString(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) {
    throw new Error(`lua execution failed: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  const out = {};
  for (const name of ['RESULT', 'OK']) {
    lua.lua_getglobal(L, to_luastring(name));
    const t = lua.lua_type(L, -1);
    if (t === lua.LUA_TSTRING) out[name] = to_jsstring(lua.lua_tostring(L, -1));
    else if (t === lua.LUA_TBOOLEAN) out[name] = lua.lua_toboolean(L, -1) ? 'true' : 'false';
    else if (t === lua.LUA_TNUMBER) out[name] = String(lua.lua_tonumber(L, -1));
  }
  return out.RESULT ?? out.OK ?? null;
}

function compileProtected(source, profile, seed) {
  const artifact = applyBytecodeVm(source, { profile, seedOverride: seed, rethrow: true });
  if (!artifact) throw new Error(`compile failed for ${profile}/${seed}`);
  return artifact;
}

function runProtected(source, profile, seed) {
  const artifact = compileProtected(source, profile, seed);
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(artifact));
  if (status !== lua.LUA_OK) {
    throw new Error(`protected execution failed (${profile}/${seed}): ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const t = lua.lua_type(L, -1);
  if (t === lua.LUA_TSTRING) return to_jsstring(lua.lua_tostring(L, -1));
  if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, -1) ? 'true' : 'false';
  if (t === lua.LUA_TNUMBER) return String(lua.lua_tonumber(L, -1));
  return null;
}

function assertNativeArtifactContainsNativeFunction(artifact, name) {
  if (!artifact.includes(`local function ${name}`) && !artifact.includes(`local ${name}=function`)) {
    throw new Error(`generated artifact does not contain native target-language function ${name}`);
  }
}

function normalizeErrorString(value) {
  const s = String(value);
  return s
    .replace(/\[string\s+"[^"]*"\]:\d+:\s*/g, '')
    .replace(/\[string\s+"\.\.\."\]:\d+:\s*/g, '')
    .replace(/:\s+/g, ':')
    .trim();
}

function findVmNoneFunctionName(source) {
  const explicitMatch = source.match(/--\s*VMATTR\s*\(\s*VM\s*=\s*NONE\s*\)\s*[\r\n]+\s*local function\s+([A-Za-z0-9_]+)/g);
  if (explicitMatch && explicitMatch.length) {
    const last = explicitMatch[explicitMatch.length - 1];
    const name = last.match(/local function\s+([A-Za-z0-9_]+)/)?.[1];
    if (name) return name;
  }
  return source.match(/local function\s+([A-Za-z0-9_]+)\s*\(/)?.[1] ?? null;
}

const cases = [
  {
    name: 'OPAL -> NONE',
    native: `
      -- VMATTR(VM=OPAL)
      local function add(a, b) return a + b end
      -- VMATTR(VM=NONE)
      local function trip(x) return x + 7 end
      local function outer(x) return add(trip(x), 1) end
      RESULT = tostring(outer(3))
    `,
    protected: `
      -- VMATTR(VM=OPAL)
      local function add(a, b) return a + b end
      -- VMATTR(VM=NONE)
      local function trip(x) return x + 7 end
      local function outer(x) return add(trip(x), 1) end
      RESULT = tostring(outer(3))
    `,
    expected: '11',
    profile: 'OPAL',
    seed: 7,
  },
  {
    name: 'NONE -> OPAL',
    native: `
      -- VMATTR(VM=NONE)
      local function base(x) return x * 2 end
      -- VMATTR(VM=OPAL)
      local function outer(x) return base(x) + 5 end
      RESULT = tostring(outer(4))
    `,
    protected: `
      -- VMATTR(VM=NONE)
      local function base(x) return x * 2 end
      -- VMATTR(VM=OPAL)
      local function outer(x) return base(x) + 5 end
      RESULT = tostring(outer(4))
    `,
    expected: '13',
    profile: 'BALANCED',
    seed: 11,
  },
  {
    name: 'ONYX -> NONE',
    native: `
      -- VMATTR(VM=ONYX)
      local function scale(x) return x * 3 end
      -- VMATTR(VM=NONE)
      local function bump(x) return x + 2 end
      local function outer(x) return bump(scale(x)) end
      RESULT = tostring(outer(5))
    `,
    protected: `
      -- VMATTR(VM=ONYX)
      local function scale(x) return x * 3 end
      -- VMATTR(VM=NONE)
      local function bump(x) return x + 2 end
      local function outer(x) return bump(scale(x)) end
      RESULT = tostring(outer(5))
    `,
    expected: '17',
    profile: 'ONYX',
    seed: 17,
  },
  {
    name: 'NONE -> ONYX',
    native: `
      -- VMATTR(VM=NONE)
      local function first(x) return x + 1 end
      -- VMATTR(VM=ONYX)
      local function outer(x) return first(x) * 2 end
      RESULT = tostring(outer(4))
    `,
    protected: `
      -- VMATTR(VM=NONE)
      local function first(x) return x + 1 end
      -- VMATTR(VM=ONYX)
      local function outer(x) return first(x) * 2 end
      RESULT = tostring(outer(4))
    `,
    expected: '10',
    profile: 'ONYX',
    seed: 19,
  },
  {
    name: 'varargs and multiple returns',
    native: `
      -- VMATTR(VM=NONE)
      local function pack(a, ...) return a, ..., a + 3 end
      local function outer(...) return pack(2, 4, 5, 6) end
      local a, b, c, d = outer()
      RESULT = tostring(a .. ':' .. tostring(b) .. ':' .. tostring(c) .. ':' .. tostring(d))
    `,
    protected: `
      -- VMATTR(VM=NONE)
      local function pack(a, ...) return a, ..., a + 3 end
      local function outer(...) return pack(2, 4, 5, 6) end
      local a, b, c, d = outer()
      RESULT = tostring(a .. ':' .. tostring(b) .. ':' .. tostring(c) .. ':' .. tostring(d))
    `,
    expected: '2:4:5:nil',
    profile: 'BALANCED',
    seed: 23,
  },
  {
    name: 'pcall and xpcall',
    native: `
      -- VMATTR(VM=NONE)
      local function boom(x)
        if x < 0 then error('neg') end
        return x * 2
      end
      local ok1, v1 = pcall(boom, 3)
      local ok2, v2 = xpcall(function() return boom(-1) end, function(e) return 'caught:' .. tostring(e) end)
      RESULT = tostring(ok1) .. ':' .. tostring(v1) .. '|' .. tostring(ok2) .. ':' .. tostring(v2)
    `,
    protected: `
      -- VMATTR(VM=NONE)
      local function boom(x)
        if x < 0 then error('neg') end
        return x * 2
      end
      local ok1, v1 = pcall(boom, 3)
      local ok2, v2 = xpcall(function() return boom(-1) end, function(e) return 'caught:' .. tostring(e) end)
      RESULT = tostring(ok1) .. ':' .. tostring(v1) .. '|' .. tostring(ok2) .. ':' .. tostring(v2)
    `,
    expected: 'true:6|false:caught:neg',
    profile: 'BALANCED',
    seed: 29,
  },
  {
    name: 'closure and mutable upvalue',
    native: `
      -- VMATTR(VM=NONE)
      local function makeCounter(start)
        local n = start
        return function()
          n = n + 1
          return n
        end
      end
      local c = makeCounter(2)
      local a = c(); local b = c();
      RESULT = tostring(a .. ':' .. tostring(b))
    `,
    protected: `
      -- VMATTR(VM=NONE)
      local function makeCounter(start)
        local n = start
        return function()
          n = n + 1
          return n
        end
      end
      local c = makeCounter(2)
      local a = c(); local b = c();
      RESULT = tostring(a .. ':' .. tostring(b))
    `,
    expected: '3:4',
    profile: 'OPAL',
    seed: 31,
  },
];

for (const testCase of cases) {
  const nativeResult = executeString(testCase.native);
  const protectedResult = runProtected(testCase.protected, testCase.profile, testCase.seed);
  const artifact = compileProtected(testCase.protected, testCase.profile, testCase.seed);
  if (!artifact) throw new Error(`missing artifact for ${testCase.name}`);
  if (testCase.protected.includes('VM=NONE')) {
    const name = findVmNoneFunctionName(testCase.protected);
    if (name) assertNativeArtifactContainsNativeFunction(artifact, name);
  }
  if (normalizeErrorString(nativeResult) !== normalizeErrorString(testCase.expected)) {
    throw new Error(`${testCase.name}: native expectation was ${testCase.expected} but native result was ${nativeResult}`);
  }
  if (normalizeErrorString(protectedResult) !== normalizeErrorString(testCase.expected)) {
    throw new Error(`${testCase.name}: protected result ${protectedResult} did not match native ${testCase.expected}`);
  }
  console.log(`PASS ${testCase.name}: ${protectedResult}`);
}

console.log('VM(NONE) matrix: PASS');
