// Structural proof for ERROR_HANDLING.
//
// Demonstrates that the generated VM genuinely RETAINS original source-line
// information (a per-instruction line map recorded from AST source locations
// during lowering), and that the resulting runtime error reports use that
// original line. Also proves ERROR_HANDLING(false) changes the behavior by
// omitting the map entirely, rather than by relabelling a number.
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function execute(artifact) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(artifact));
  if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring('RESULT'));
  const p = lua.lua_tostring(L, -1);
  return p ? to_jsstring(p) : String(lua.lua_tonumber(L, -1));
}

function compile(source, opts = {}) {
  let build = null;
  const artifact = applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 20260925, rethrow: true, onBuild: (b) => { build = b; }, ...opts });
  return { artifact, build };
}

let pass = 0;

// =========================================================================
// 1. The line map exists and is real original source information.
// =========================================================================
{
  // `boom` spans original lines 2..4; the failing `return t.x` is line 4.
  const src = [
    'local function boom()',            // line 1
    '  local t = nil',                  // line 2
    '  return t.x',                     // line 3  <-- failure site
    'end',                              // line 4
    'local ok,e=pcall(boom)',           // line 5
    'RESULT=tostring(e)',              // line 6
  ].join('\n');
  const { artifact, build } = compile(src);

  // (a) every virtualized chunk carries a per-slot line map the same length as
  //     its code, i.e. it is genuine per-instruction data, not a single number.
  const mapped = build.chunks.filter((c) => Array.isArray(c.lines) && c.lines.length === c.code.length);
  if (mapped.length === 0) throw new Error('no chunk carries a per-instruction line map');
  for (const c of mapped) {
    if (c.lines.some((n) => typeof n !== 'number')) throw new Error('line map contains non-numeric entries');
  }

  // (b) the map contains the ORIGINAL source lines, including the failure site
  //     (3) and statements from later original lines (5 and 6).
  const allLines = new Set();
  for (const c of mapped) for (const n of c.lines) allLines.add(n);
  for (const required of [2, 3, 5, 6]) {
    if (!allLines.has(required)) throw new Error(`line map is missing original line ${required}; got ${[...allLines].sort((a, b) => a - b)}`);
  }
  pass++;
  console.log(JSON.stringify({ name: 'line-map-present', mappedChunks: mapped.length, distinctOriginalLines: [...allLines].sort((a, b) => a - b) }));

  // (c) the emitted artifact actually carries the table (flag byte + data),
  //     proving it is serialized into the VM rather than kept in the build.
  if (!/\.l and \w+\.l\[/.test(artifact)) throw new Error('interpreter does not read a per-chunk line map at dispatch');
  if (!/\{c=cd,p=ps,v=va,l=ln\}/.test(artifact)) throw new Error('decoded chunk records do not carry the line table');
  pass++;
  console.log(JSON.stringify({ name: 'line-map-serialized-into-artifact', dispatchReadsMap: true, recordsCarryMap: true }));

  // (d) the resulting error uses the ORIGINAL line, matching plain Lua.
  const reported = execute(artifact).match(/:(\d+): attempt/);
  if (!reported || reported[1] !== '3') throw new Error(`expected original line 3 in the error, got ${reported && reported[1]}`);
  pass++;
  console.log(JSON.stringify({ name: 'error-uses-original-line', originalLine: Number(reported[1]) }));
}

// =========================================================================
// 2. The line numbers are per-source-location, not a constant relabelling.
//    Moving the failing statement must move the reported line.
// =========================================================================
{
  const report = (pad) => {
    const src = 'local function boom()\n' + '\n'.repeat(pad) + '  local t = nil\n' + '\n'.repeat(pad) + '  return t.x\nend\nlocal ok,e=pcall(boom)\nRESULT=tostring(e)';
    const { build } = compile(src);
    const expected = 3 + 2 * pad; // pad blank lines before `t = nil` and before `return t.x`
    const got = execute(compile(src).artifact).match(/:(\d+): attempt/);
    const lines = new Set();
    for (const c of build.chunks) if (c.lines) for (const n of c.lines) lines.add(n);
    return { expected, reported: got ? Number(got[1]) : null, hasExpectedLineInMap: lines.has(expected) };
  };
  for (const pad of [0, 1, 2, 5]) {
    const r = report(pad);
    if (r.reported !== r.expected) throw new Error(`pad=${pad}: expected line ${r.expected}, reported ${r.reported}`);
    if (!r.hasExpectedLineInMap) throw new Error(`pad=${pad}: line ${r.expected} absent from the map`);
    pass++;
    console.log(JSON.stringify({ name: `tracks-source-location-pad${pad}`, expected: r.expected, reported: r.reported }));
  }
}

// =========================================================================
// 3. ERROR_HANDLING(false) omits the map entirely and changes the behavior.
// =========================================================================
{
  const body = (attr) => `local function boom()\n ${attr}\n local t = nil\n return t.x\nend\nlocal ok,e=pcall(boom)\nRESULT=tostring(e)`;
  const withTrue = compile(body('LPH_ATTRIBUTES(ERROR_HANDLING(true))'));
  const withFalse = compile(body('LPH_ATTRIBUTES(ERROR_HANDLING(false))'));

  const trueChunk = withTrue.build.chunks.find((c) => c.meta && c.meta.errorHandling === true);
  const falseChunk = withFalse.build.chunks.find((c) => c.meta && c.meta.errorHandling === false);
  if (!trueChunk || !falseChunk) throw new Error('expected chunks for both attribute values');
  if (trueChunk.meta.errorHandlingLineMap !== true) throw new Error('ERROR_HANDLING(true) did not emit a line map');
  if (falseChunk.meta.errorHandlingLineMap !== false) throw new Error('ERROR_HANDLING(false) still emitted a line map');
  pass++;
  console.log(JSON.stringify({ name: 'attribute-controls-emission', trueEmitsMap: true, falseEmitsMap: false }));

  const trueLine = execute(withTrue.artifact).match(/:(\d+): attempt/);
  const falseLine = execute(withFalse.artifact).match(/:(\d+): attempt/);
  if (!trueLine || trueLine[1] !== '4') throw new Error(`ERROR_HANDLING(true) expected line 4, got ${trueLine && trueLine[1]}`);
  if (!falseLine || falseLine[1] === '4') throw new Error(`ERROR_HANDLING(false) must not report the original line, got ${falseLine && falseLine[1]}`);
  if (Number(falseLine[1]) <= 0) throw new Error('ERROR_HANDLING(false) produced no line at all');
  pass++;
  console.log(JSON.stringify({ name: 'behavior-differs-by-attribute', trueReports: Number(trueLine[1]), falseReports: Number(falseLine[1]) }));
}

// =========================================================================
// 4. The attribute reaches chunk metadata (not an accepted-and-ignored
//    string). Verified via the emission flag recorded during packing.
// =========================================================================
{
  const src = 'local function f() LPH_ATTRIBUTES(ERROR_HANDLING(false)) return 1 end RESULT=f()';
  const { build } = compile(src);
  const metas = build.chunks.map((c) => c.meta).filter((m) => m && m.errorHandlingLineMap !== undefined);
  if (!metas.length) throw new Error('ERROR_HANDLING never reached chunk metadata');
  if (!metas.some((m) => m.errorHandling === false)) throw new Error('no chunk recorded errorHandling=false');
  pass++;
  console.log(JSON.stringify({ name: 'attribute-is-consumed', chunksWithMetadata: metas.length, disabledChunks: metas.filter((m) => m.errorHandling === false).length }));
}

console.log(`ERROR_HANDLING structural proof: ${pass} checks passed`);
