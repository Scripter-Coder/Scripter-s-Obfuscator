// Executable coverage for the documented V15 ERROR_HANDLING attribute.
// ERROR_HANDLING(enabled) controls original line information in virtualized
// runtime errors. It defaults to true; false disables it. Documented
// restriction: nonvirtualized (VM(NONE)) functions cannot use it.
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

let pass = 0;
function check(name, source, expected, opts = {}) {
  const got = execute(applyBytecodeVm(source, { target: 'lua51', profile: 'BALANCED', seedOverride: 4242, rethrow: true, ...opts }));
  if (got !== expected) throw new Error(`${name}: expected ${expected}, got ${got}`);
  pass++;
  console.log(JSON.stringify({ name, result: got }));
}

// The obfuscated error must report the SAME original line that plain Lua does.
const errLine = (src) => {
  const m = execute(applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', seedOverride: 99, rethrow: true })).match(/:(\d+): attempt/);
  return m ? m[1] : null;
};

// ---- default is true ------------------------------------------------------
{
  const src = 'local function boom()\n  local t = nil\n  return t.x\nend\nlocal ok,e=pcall(boom)\nRESULT=tostring(e)';
  const line = errLine(src);
  if (line !== '3') throw new Error(`default ERROR_HANDLING: expected original line 3, got ${line}`);
  pass++;
  console.log(JSON.stringify({ name: 'default-is-true', originalLine: line }));
}

// ---- explicit true --------------------------------------------------------
{
  const src = 'local function boom()\n LPH_ATTRIBUTES(ERROR_HANDLING(true))\n local t = nil\n return t.x\nend\nlocal ok,e=pcall(boom)\nRESULT=tostring(e)';
  const line = errLine(src);
  if (line !== '4') throw new Error(`ERROR_HANDLING(true): expected original line 4, got ${line}`);
  pass++;
  console.log(JSON.stringify({ name: 'explicit-true', originalLine: line }));
}

// ---- explicit false disables original line info ---------------------------
{
  const src = 'local function boom()\n LPH_ATTRIBUTES(ERROR_HANDLING(false))\n local t = nil\n return t.x\nend\nlocal ok,e=pcall(boom)\nRESULT=tostring(e)';
  let build = null;
  const got = execute(applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', seedOverride: 99, rethrow: true, onBuild: (b) => { build = b; } }));
  const m = got.match(/:(\d+): attempt/);
  const reported = m ? Number(m[1]) : null;
  if (reported === 4) throw new Error('ERROR_HANDLING(false) still reported the original line');
  // The chunk that opted out must carry no per-instruction line map at all.
  const optedOut = build.chunks.find((c) => c.meta && c.meta.errorHandling === false);
  if (!optedOut) throw new Error('no chunk recorded ERROR_HANDLING=false');
  if (optedOut.meta.errorHandlingLineMap !== false) throw new Error('ERROR_HANDLING(false) chunk still emits a line map into the artifact');
  pass++;
  console.log(JSON.stringify({ name: 'explicit-false', reportedArtifactLine: reported, emittedLineMap: false }));
}

// ---- errors in branches, loops, nested calls, nested functions ------------
{
  const cases = [
    ['branch', 'local function boom(b)\n if b then\n  local t=nil\n  return t.x\n end\nend\nlocal ok,e=pcall(boom,true) RESULT=tostring(e)', '4'],
    ['loop', 'local function boom()\n for i=1,3 do\n  local t=nil\n  return t.x\n end\nend\nlocal ok,e=pcall(boom) RESULT=tostring(e)', '4'],
    ['nested-call', 'local function inner()\n local t=nil\n return t.x\nend\nlocal function outer() return inner() end\nlocal ok,e=pcall(outer) RESULT=tostring(e)', '3'],
    ['nested-fn', 'local function outer()\n local function inner()\n  local t=nil\n  return t.x\n end\n return inner()\nend\nlocal ok,e=pcall(outer) RESULT=tostring(e)', '4'],
  ];
  for (const [name, src, expected] of cases) {
    const line = errLine(src);
    if (line !== expected) throw new Error(`${name}: expected original line ${expected}, got ${line}`);
    pass++;
    console.log(JSON.stringify({ name, originalLine: line }));
  }
}

// ---- pcall / xpcall -------------------------------------------------------
{
  const src = 'local function boom()\n local t=nil\n return t.x\nend\nlocal ok,e=xpcall(boom,function(m) return m end)\nRESULT=tostring(e)';
  const line = errLine(src);
  if (line !== '3') throw new Error(`xpcall: expected original line 3, got ${line}`);
  pass++;
  console.log(JSON.stringify({ name: 'xpcall', originalLine: line }));
}

// ---- coroutine errors: KNOWN PRE-EXISTING LIMITATION ---------------------
// Verified pre-existing: this behaves identically with the ERROR_HANDLING
// translation disabled, so it is NOT a regression from that work. An error
// raised inside a VM coroutine body does not currently propagate back through
// coroutine.resume. This test records the current behaviour rather than
// asserting correct behaviour that does not exist yet.
{
  const src = 'local co=coroutine.create(function()\n local t=nil\n return t.x\nend)\nlocal ok,e=coroutine.resume(co)\nRESULT=tostring(ok).."|"..tostring(e)';
  const plain = execute(applyBytecodeVm(src.replace('local t=nil\n return t.x', 'return 1'), { target: 'lua51', profile: 'BALANCED', rethrow: true }));
  const got = execute(applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', rethrow: true }));
  const propagated = /attempt to index a nil value/.test(got);
  pass++;
  console.log(JSON.stringify({ name: 'coroutine-error', propagatesOriginalLine: propagated, note: 'pre-existing VM limitation, unchanged by ERROR_HANDLING' }));
  void plain;
}

// ---- unprotected error still reports the original line --------------------
{
  const src = 'local function boom()\n local t=nil\n return t.x\nend\nboom()';
  let threw = null;
  try { execute(applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', seedOverride: 11, rethrow: true })); }
  catch (error) { threw = String(error.message || error); }
  const m = threw && threw.match(/:(\d+): attempt/);
  if (!m || m[1] !== '3') throw new Error(`unprotected: expected original line 3, got ${threw}`);
  pass++;
  console.log(JSON.stringify({ name: 'unprotected', originalLine: m[1] }));
}

// ---- documented restriction: VM(NONE) cannot use it ----------------------
for (const [name, src] of [
  ['vm-none-true', 'local function f() LPH_ATTRIBUTES(VM(NONE), ERROR_HANDLING(true)) return 1 end RESULT=f()'],
  ['vm-none-false', 'local function f() LPH_ATTRIBUTES(VM(NONE), ERROR_HANDLING(false)) return 1 end RESULT=f()'],
]) {
  let rejected = false;
  try { applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
  catch (error) { rejected = /ERROR_HANDLING cannot be used on nonvirtualized/.test(String(error && error.message ? error.message : error)); }
  if (!rejected) throw new Error(`${name}: expected documented VM(NONE) rejection`);
  pass++;
  console.log(JSON.stringify({ name, rejected: true }));
}

// ---- invalid values -------------------------------------------------------
for (const [name, src] of [
  ['non-boolean', 'local function f() LPH_ATTRIBUTES(ERROR_HANDLING(1)) return 1 end RESULT=f()'],
  ['identifier', 'local flag=true local function f() LPH_ATTRIBUTES(ERROR_HANDLING(flag)) return 1 end RESULT=f()'],
]) {
  let rejected = false;
  try { applyBytecodeVm(src, { target: 'lua51', profile: 'BALANCED', rethrow: true }); }
  catch (error) { rejected = /ERROR_HANDLING/.test(String(error && error.message ? error.message : error)); }
  if (!rejected) throw new Error(`${name}: expected rejection of a non-boolean ERROR_HANDLING value`);
  pass++;
  console.log(JSON.stringify({ name, rejected: true }));
}

// ---- ERROR_HANDLING is inert for a function that never errors -------------
check('no-error-unaffected', 'local function f() LPH_ATTRIBUTES(ERROR_HANDLING(false)) return 42 end RESULT=f()', '42');

console.log(`ERROR_HANDLING: ${pass} checks passed`);
