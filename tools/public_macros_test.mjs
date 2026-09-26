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

const macroSource = 'local f=LPH_ENCFUNC(function(x) return x+1 end); local b=LPH_ENCBUF("buf"); RESULT=LPH_ENCSTR("ok")..b..tostring(f(LPH_ENCNUM(4)))..":"..tostring(LPH_OBFUSCATED)..":"..tostring(LPH_LINE())';
let rejected = false;
try {
  applyBytecodeVm(macroSource, { target: 'lua51', profile: 'BALANCED', seedOverride: 19, rethrow: true });
} catch (error) {
  rejected = /LPH_ENCBUF/.test(String(error));
}
if (!rejected) throw new Error('lua51 did not reject LPH_ENCBUF');

const guarded = applyBytecodeVm(
  'LPH_PRECHECK(function() return 123 end, 123); ' + macroSource,
  { target: 'luau', profile: 'ONYX', seedOverride: 19, rethrow: true, obfuscated: true },
);
const good = run(guarded);
if (!good.ok) throw new Error(`precheck mismatch: ${JSON.stringify(good)}`);

const unobfuscated = applyBytecodeVm('RESULT=tostring(LPH_OBFUSCATED)', {
  profile: 'OPAL', seedOverride: 19, rethrow: true, obfuscated: false,
});
if (!run(unobfuscated).ok) throw new Error('unobfuscated mode failed');

const crashArtifact = applyBytecodeVm('LPH_CRASH()', { profile: 'OPAL', seedOverride: 19, rethrow: true });
if (run(crashArtifact).ok) throw new Error('LPH_CRASH did not fail at runtime');
let malformedRejected = false;
try {
  applyBytecodeVm('RESULT=LPH_ENCNUM("not-a-number")', { profile: 'OPAL', seedOverride: 19, rethrow: true });
} catch (error) {
  malformedRejected = /LPH_ENCNUM/.test(String(error));
}
if (!malformedRejected) throw new Error('malformed LPH_ENCNUM was accepted');

let noUpvaluesRejected = false;
try {
  applyBytecodeVm('-- LPH_ATTRIBUTES(NO_UPVALUES=true)\nlocal x=4\nlocal function f() return x end\nRESULT=tostring(f())', {
    profile: 'OPAL', seedOverride: 19, rethrow: true,
  });
} catch (error) {
  noUpvaluesRejected = /NO_UPVALUES/.test(String(error));
}
if (!noUpvaluesRejected) throw new Error('NO_UPVALUES did not reject a captured local');
console.log('public macro regression: PASS');
