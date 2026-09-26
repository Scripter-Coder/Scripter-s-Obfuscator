import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm, _vmBcCompile } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function run(source, target = 'lua51') {
  const artifact = applyBytecodeVm(source, { target, profile: 'OPAL', seedOverride: 41, rethrow: true });
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const status = lauxlib.luaL_dostring(state, to_luastring(artifact));
  return status === lua.LUA_OK ? 'ok' : to_jsstring(lua.lua_tostring(state, -1));
}

const key = 'a'.repeat(64);
const keyBytes = Array.from({ length: 32 }, (_, index) => `0x${key.slice(index * 2, index * 2 + 2)}`).join(',');
if (run('RESULT=LPH_ENCSTR("x", 123, 123)') !== 'ok') throw new Error('LPH_ENCSTR integer key failed');
if (!run('RESULT=LPH_ENCSTR("x", 123, 124)').includes('LPH_ENCSTR')) throw new Error('LPH_ENCSTR mismatch was not rejected');
if (run(`RESULT=LPH_ENCBUF("x", "${key}", "${key}")`, 'luau') !== 'ok') throw new Error('LPH_ENCBUF hex key failed');
if (run(`local runtimeKey={${keyBytes}}; RESULT=LPH_ENCSTR("x", "{${key}}", runtimeKey)`) !== 'ok') throw new Error('LPH_ENCSTR byte-table key failed');
if (run('RESULT=LPH_ENCNUM(4, {[1+1]=2})') !== 'ok') throw new Error('LPH_ENCNUM key table failed');
if (run('local a=VM_STACKALLOC(2, 0); a[0]=7; RESULT=a[0]') !== 'ok') throw new Error('zero-based LPH_STACKALLOC failed');
if (run('local left,right,offset=1,2,3; RESULT=tostring(LPH_REWRITE((left+right)*offset, {preset="strong", budget="small", context={left,right}}))') !== 'ok') throw new Error('documented LPH_REWRITE options failed');
for (const source of ['RESULT=LPH_REWRITE(4/2)', 'RESULT=LPH_REWRITE(f(1))', 'RESULT=LPH_REWRITE(t.x)']) {
  let rejected = false;
  try { applyBytecodeVm(source, { profile: 'OPAL', seedOverride: 41, rethrow: true }); } catch (error) { rejected = /LPH_REWRITE/.test(String(error)); }
  if (!rejected) throw new Error(`undocumented rewrite form accepted: ${source}`);
}
let missingContextRejected = false;
try { applyBytecodeVm('RESULT=LPH_REWRITE(42)', { profile: 'OPAL', seedOverride: 41, rethrow: true }); } catch (error) { missingContextRejected = /context/.test(String(error)); }
if (!missingContextRejected) throw new Error('constant LPH_REWRITE without context was accepted');
const attrBuild = _vmBcCompile('local function f() LPH_ATTRIBUTES(VM(NONE), PRESET(FAST)) return 3 end RESULT=f()', { target: 'lua51', profile: 'OPAL', seedOverride: 41 });
if (attrBuild.nativeFns.length !== 1) throw new Error('LPH_ATTRIBUTES(VM(NONE)) was not applied');
for (const source of [
  'local function f() local x=1; LPH_ATTRIBUTES(VM(NONE)); return x end RESULT=f()',
  'local function f() LPH_ATTRIBUTES(VM(NONE)); local a=VM_STACKALLOC(2); return a[1] end RESULT=f()',
]) {
  let rejected = false;
  try { _vmBcCompile(source, { target: 'lua51', profile: 'OPAL', seedOverride: 41 }); } catch (error) { rejected = /LPH_ATTRIBUTES|VM_STACKALLOC|public LPH/.test(String(error)); }
  if (!rejected) throw new Error(`invalid attribute usage was accepted: ${source}`);
}
console.log('documented V15 contract tests: PASS');
