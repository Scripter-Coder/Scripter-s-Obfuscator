import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import { vmSetLuaparse, applyVmPass } from './vm-pass.js';
vmSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const src = 'GLOBAL_MARKER = "RAN_OK"; local x=0; for i=1,10 do x=x+i end; assert(x==55)';

function bench(label, vmSrc){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const t0=Date.now();
  const st=lauxlib.luaL_dostring(L,to_luastring(vmSrc));
  const dt=Date.now()-t0;
  const err = st!==lua.LUA_OK ? to_jsstring(lua.lua_tostring(L,-1)).slice(0,400) : 'ok';
  console.log(label, 'st', st, 'dt', dt, 'len', vmSrc.length, 'err', err);
}

const vm = applyBytecodeVm(src);
bench('vm-bytecode only', vm);
const lite = applyVmPass(src);
bench('vm-pass lite', lite);

import { applyCustomObfuscator } from './custom-obfuscator.js';
const opts1 = { intensity:1, antiTamper:false, antiSkid:false, antiLogger:false, _debug:true };
const out1 = applyCustomObfuscator(src, opts1);
bench('custom 1 layer debug', out1);
const opts2 = { intensity:5, antiTamper:true, antiSkid:false, antiLogger:false, _debug:true };
const out2 = applyCustomObfuscator(src, opts2);
bench('custom 5 layers debug', out2);
const opts3 = { intensity:5, antiTamper:true, antiSkid:false, antiLogger:false };
const out3 = applyCustomObfuscator(src, opts3);
bench('custom 5 layers prod (16r)', out3);
