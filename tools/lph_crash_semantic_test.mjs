import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  return status === lua.LUA_OK
    ? { ok: true }
    : { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)) };
}

function build(src, profile = 'OPAL') {
  return applyBytecodeVm(src, { profile, seedOverride: 4242, rethrow: true });
}

let passed = 0;
function check(name, fn) {
  fn();
  console.log(JSON.stringify({ test: name, pass: true }));
  passed++;
}

// 1. direct call must fail (not succeed)
check('direct', () => {
  const r = run(build('LPH_CRASH()'));
  if (r.ok) throw new Error('direct crash unexpectedly succeeded');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('direct crash wrong error: ' + r.error);
});

// 2. inside pcall: VM context must be corrupted; pcall must NOT report
// ordinary recoverable success. Documented behavior is uncatchable: the
// crash bypasses VM-level pcall handling and corrupts the context, so the
// outer run must fail (not continue to set RESULT).
check('pcall', () => {
  const r = run(build('local ok,err=pcall(function() LPH_CRASH() end); RESULT=tostring(ok)..":"..tostring(err)'));
  if (r.ok) throw new Error('pcall swallowed crash into recoverable success (RESULT set)');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('pcall crash wrong outer error: ' + r.error);
});

// 3. inside xpcall
check('xpcall', () => {
  const r = run(build('local ok,err=xpcall(function() LPH_CRASH() end, function(e) return "h:"..tostring(e) end); RESULT="xpcall-continued"'));
  if (r.ok) throw new Error('xpcall swallowed crash into recoverable success');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('xpcall crash wrong outer error: ' + r.error);
});

// 4. nested calls
check('nested', () => {
  const r = run(build('local function a() LPH_CRASH() end local function b() a() end local function c() b() end c()'));
  if (r.ok) throw new Error('nested crash unexpectedly succeeded');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('nested crash wrong error: ' + r.error);
});

// 5. after VM/NONE transition (NONE function calling back into VM crash)
check('vm-none', () => {
  const src = '-- VMATTR(VM=NONE)\nlocal function native_cb(fn) return fn() end\nlocal function vm_crash() LPH_CRASH() end\nRESULT=native_cb(vm_crash)';
  let artifact;
  try {
    artifact = build(src);
  } catch (e) {
    // If NONE + macro validation rejects, adjust: put crash in VM chunk
    // called via native boundary the other direction.
    throw new Error('vm-none build failed: ' + String(e && e.message || e));
  }
  const r = run(artifact);
  if (r.ok) throw new Error('vm-none crash unexpectedly succeeded');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('vm-none crash wrong error: ' + r.error);
});

// 6. subsequent execution must not continue normally: code after crash
// must not run (RESULT must not be set to post-crash value).
check('no-continue', () => {
  const r = run(build('LPH_CRASH(); RESULT="reached"'));
  if (r.ok) throw new Error('post-crash code unexpectedly succeeded');
  if (!/LPH_CRASH/.test(r.error)) throw new Error('no-continue wrong error: ' + r.error);
});

// 7. crash artifact must not be plain error() (must contain crash marker path)
check('artifact-marker', () => {
  const a = build('LPH_CRASH()');
  if (!/__lph_crash/.test(a)) throw new Error('artifact lacks crash marker');
  if (!/LPH_CRASH/.test(a)) throw new Error('artifact lacks LPH_CRASH string');
});

check('mutable-error', () => {
  const r = run(build('error=function() return "swallowed" end; RESULT=tostring(LPH_CRASH())'));
  if (r.ok || !/LPH_CRASH/.test(r.error)) throw new Error('mutable error bypassed crash poisoning: ' + JSON.stringify(r));
});

check('host-pcall-reentry', () => {
  const src = '-- VMATTR(VM=NONE)\nlocal function native_pcall(fn) local ok=pcall(fn) return tostring(ok) end\nlocal function vm_crash() LPH_CRASH() end\nRESULT=native_pcall(vm_crash)';
  const r = run(build(src));
  if (r.ok || !/LPH_CRASH/.test(r.error)) throw new Error('host pcall re-entry recovered from crash: ' + JSON.stringify(r));
});

console.log(`LPH_CRASH semantic matrix: ${passed}/9 passed`);
