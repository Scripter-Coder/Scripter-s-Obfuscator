import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;
function run(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,800)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, res: res?to_jsstring(res):'nil'};
}
let src=`local function f(x) if x<0 then error("neg") end return x*2 end
local ok,r=pcall(f,5)
RESULT=tostring(ok)..","..tostring(r)
`;
let off=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, pcall:false});
let on=applyBytecodeVm(src,{profile:'BALANCED', seedOverride:0, pcall:true});
console.log("pcall off vs on diff:", off!==on);
console.log("off", run(off));
console.log("on", run(on));
console.log("native", run(src));

let src2=`local function f(x) error("oops") end
local ok,err=pcall(f)
RESULT=tostring(ok)..":"..tostring(err):sub(1,4)
`;
console.log("pcall error", run(applyBytecodeVm(src2,{profile:'BALANCED', seedOverride:0, pcall:true})));

// xpcall
let src3=`local function f(x) return x*2 end
local function errh(e) return "handled:"..e end
local ok,r=xpcall(function() return f(5) end, errh)
RESULT=tostring(ok)..","..tostring(r)
`;
console.log("xpcall", run(applyBytecodeVm(src3,{profile:'BALANCED', seedOverride:0, pcall:true})));

// nested pcall
let src4=`local function g() error("inner") end
local function f() local ok,err=pcall(g); return ok,err end
local ok,err=pcall(f)
RESULT=tostring(ok)..","..tostring(err):sub(1,2)
`;
console.log("nested pcall", run(applyBytecodeVm(src4,{profile:'BALANCED', seedOverride:0, pcall:true})));

// VM->native
let src5=`local ok,r=pcall(math.sqrt, 4)
RESULT=tostring(ok)..","..tostring(r)
`;
console.log("VM->native pcall", run(applyBytecodeVm(src5,{profile:'BALANCED', seedOverride:0, pcall:true})));

// Check forbidden pattern: VM->VM should not use f(unpack)
let vmOn=applyBytecodeVm(`local function f() return 1 end; pcall(f)`,{profile:'BALANCED', seedOverride:0, pcall:true});
console.log("check forbidden f(unpack) in VM->VM pcall path:", vmOn.includes('f(unpack') ? "FAIL has forbidden" : "PASS no forbidden");

// Structural proof
let buildOff=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, pcall:false});
let buildOn=_vmBcCompile(src,{profile:'BALANCED', seedOverride:0, pcall:true});
console.log("pcall structural diff:", JSON.stringify(buildOff.chunks[0].code).length !== JSON.stringify(buildOn.chunks[0].code).length);
