import { applyCustomObfuscator } from '../custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse); vmBCSetLuaparse(luaparse);
for (const target of ['lua52','lua53','lua54','luajit']) {
  try { const out=applyCustomObfuscator('RESULT=1',{target,vmTier:'bytecode',profile:'FAST'}); console.log(target,'backend compile PASS len',out.length); }
  catch(e){ console.log(target,'backend compile FAIL',e.message); process.exitCode=1; }
}
try { applyCustomObfuscator('local ffi=require("ffi"); RESULT=1',{target:'lua51',vmTier:'bytecode'}); console.log('lua51 FFI gate FAIL'); process.exitCode=1; }
catch(e) { console.log('lua51 FFI gate PASS:',e.message.slice(0,120)); }
try { const out=applyCustomObfuscator('local x: number = 1; RESULT=x',{target:'luau',vmTier:'bytecode'}); console.log('luau 0.709 backend normalization PASS len',out.length); }
catch(e){ console.log('luau backend FAIL',e.message); process.exitCode=1; }
