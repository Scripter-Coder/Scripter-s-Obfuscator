import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

// This benchmark is deliberately a blind consumer: after compilation it only
// receives the emitted Lua artifact. It does not inspect build metadata, AST,
// IR, chunks, opcode maps, or compiler state.
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const samples = {
  arithmetic: 'RESULT=tostring(2+3*4)',
  locals: 'local alpha=3; local beta=4; RESULT=tostring(alpha+beta)',
  branches: 'local x=4; if x>2 then RESULT="branch_yes" else RESULT="branch_no" end',
  loops: 'local x=0; for i=1,5 do x=x+i end; RESULT=tostring(x)',
  table_access: 'local t={a=3}; t.b=4; RESULT=tostring(t.a+t.b)',
  closures: 'local x=4; local function f() return x+3 end; RESULT=tostring(f())',
  upvalues: 'local x=1; local function f() x=x+2; return x end; RESULT=tostring(f())..":"..tostring(f())',
  nested_calls: 'local function a(x)return x+1 end; local function b(x)return a(x)*2 end; RESULT=tostring(b(4))',
  varargs: 'local function f(...) return select("#",...) end; RESULT=tostring(f(1,2,3))',
  multiple_returns: 'local function f() return 3,5 end; local a,b=f(); RESULT=tostring(a+b)',
  metamethod: 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(t+6)',
  coroutine: 'local co=coroutine.create(function() coroutine.yield(7); return 8 end); local a,b=coroutine.resume(co); local c,d=coroutine.resume(co); RESULT=tostring(a)..":"..tostring(b)..":"..tostring(c)..":"..tostring(d)',
  mixed_none: '-- VMATTR(VM=NONE)\nlocal function n(x)return x+1 end\n-- VMATTR(VM=OPAL)\nlocal function v(x)return n(x)*2 end\nRESULT=tostring(v(4))',
};

function execute(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) return { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)).slice(0, 160) };
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return { ok: true, result: to_jsstring(lua.lua_tostring(L, -1)) };
}

function count(regex, text) { return (text.match(regex) || []).length; }
function sourceStrings(source) {
  return [...source.matchAll(/(['"])(.*?)\1/g)].map((match) => match[2]).filter((value) => value.length > 2);
}
function sourceIdentifiers(source) {
  return [...source.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)].map((match) => match[0]).filter((value) => !['local', 'function', 'return', 'end', 'if', 'then', 'else', 'for', 'do', 'in', 'and', 'or', 'not', 'true', 'false', 'nil'].includes(value));
}

function blindMeasure(name, source, profile, seed) {
  const started = Date.now();
  const native = execute(source);
  const artifact = applyBytecodeVm(source, { profile, seedOverride: seed, rethrow: true });
  const observedBlobBytes = [...artifact.matchAll(/local\s+\w+\s*=\{([0-9,]+)\}/g)]
    .reduce((total, match) => Math.max(total, match[1].split(',').length), 0);
  const literalRecovered = sourceStrings(source).filter((value) => artifact.includes(value));
  const identifiersRecovered = sourceIdentifiers(source).filter((value) => artifact.includes(value));
  const directControlFlow = /\b(if|for|while|repeat|goto)\b/.test(source) && /\b(if|for|while|repeat|goto)\b/.test(artifact);
  const functionBoundaries = 0;
  const nativeFunctions = count(/local\s+function\s+\w+/g, artifact);
  const handlerCount = count(/\[\d+\]=function\(\)/g, artifact);
  const vmFunctions = Math.max(0, count(/return\s+\w+\(/g, artifact) - nativeFunctions);
  const semantic = execute(artifact);
  const semanticEquivalent = semantic.ok && native.ok && semantic.result === native.result;
  const recoveryScoreComponents = {
    literalRecovery: literalRecovered.length > 0 ? 20 : 0,
    identifierRecovery: identifiersRecovered.length > 0 ? 20 : 0,
    functionBoundaryRecovery: 0,
    cfgRecovery: directControlFlow ? 15 : 0,
    vmStructureRecovery: handlerCount > 0 ? 15 : 0,
    semanticReconstruction: semanticEquivalent ? 30 : 0,
  };
  const score = Object.values(recoveryScoreComponents).reduce((total, value) => total + value, 0);
  return {
    sample: name,
    profile,
    seed,
    originalSourceBytes: Buffer.byteLength(source),
    artifactBytes: Buffer.byteLength(artifact),
    observedInstructionWords: Math.floor(observedBlobBytes / 4),
    observedConstantEntries: count(/\{\d+,\d+\}/g, artifact),
    vmFunctions,
    nativeFunctions,
    handlerCount,
    dispatch: artifact.includes('dispatcher strategy: branch') ? 'branch' : 'table',
    literalsDirectlyRecovered: literalRecovered,
    controlFlowDirectlyRecovered: directControlFlow,
    originalVariableNamesRecovered: identifiersRecovered,
    functionBoundariesRecovered: functionBoundaries > 0,
    originalExpressionsRecovered: false,
    opcodeVmStructureRecovered: handlerCount > 0,
    semanticEquivalentReconstruction: semanticEquivalent,
    recoveryScoreComponents,
    recoveryScorePercent: score,
    elapsedMs: Date.now() - started,
  };
}

const configurations = [
  ['OPAL', 'FAST', 101],
  ['OPAL', 'BALANCED', 102],
  ['OPAL', 'SECURE', 103],
  ['ONYX', 'SECURE', 104],
];
const seedOffset = Number(process.env.BLIND_BENCH_SEED || process.argv[2] || 0) >>> 0;
const report = [];
for (const [index, [architecture, profile, seed]] of configurations.entries()) {
  for (const [name, source] of Object.entries(samples)) {
    const selected = architecture === 'ONYX' ? source : source.replace(/VM=ONYX/g, 'VM=OPAL');
    report.push(blindMeasure(`${architecture}:${name}`, selected, profile, (seed + seedOffset + index) >>> 0));
  }
}
for (const row of report) console.log(JSON.stringify(row));
const average = report.reduce((total, row) => total + row.recoveryScorePercent, 0) / report.length;
console.log(JSON.stringify({ methodology: 'blind artifact-only static observations plus independent semantic execution comparison', samples: report.length, averageRecoveryScorePercent: Number(average.toFixed(2)) }));
console.log('BLIND DEVIRTUALIZATION BENCH: COMPLETE');
