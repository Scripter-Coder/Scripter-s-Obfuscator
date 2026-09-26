import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

function runLua(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  let out='';
  lua.lua_pushcfunction(L,(LL)=>{
    const n=lua.lua_gettop(LL);
    let parts=[];
    for(let i=1;i<=n;i++){
      const s=lua.lua_tostring(LL,i);
      parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i)));
    }
    out+=parts.join('\t')+'\n';
    return 0;
  }); lua.lua_setglobal(L,to_luastring('print'));
  lua.lua_pushcfunction(L,(LL)=>{ out+='ERROR:'+to_jsstring(lua.lua_tostring(LL,1))+'\n'; return 0;}); // dummy
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==lua.LUA_OK){
    const err=to_jsstring(lua.lua_tostring(L,-1));
    return {ok:false, err, out};
  }
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const res = lua.lua_tostring(L,-1);
  return {ok:true, out, res: res?to_jsstring(res):null};
}

const cases = [
  { name:'01_basic', src:'RESULT="ok"; print("hi")' },
  { name:'02_arithmetic', src:'local a=2+3*4; RESULT=tostring(a); assert(a==14)' },
  { name:'05_tables', src:'local t={a=1,b=2}; t.c=3; RESULT=t.a+t.b+t.c' },
  { name:'07_functions', src:'local function add(a,b) return a+b end; RESULT=tostring(add(2,3))' },
  { name:'08_nested', src:'local function outer(x) local function inner(y) return x+y end; return inner(5) end; RESULT=tostring(outer(10))' },
  { name:'09_closures_upvalue', src:`
local function makeCounter()
  local n=0
  return function() n=n+1; return n end
end
local c=makeCounter()
local a=c(); local b=c(); local c2=c()
RESULT=a..","..b..","..c2
assert(a==1 and b==2 and c2==3, "closure broken")
`},
  { name:'10_mutable_upvalues', src:`
local function outer()
  local x=0
  return function() x=x+1; return x end
end
local f=outer(); local g=outer()
local a=f(); local b=f(); local c=g()
RESULT=a..","..b..","..c
assert(a==1 and b==2 and c==1, "mutable upvalue broken")
`},
  { name:'11_recursive', src:`local function fact(n) if n<=1 then return 1 else return n*fact(n-1) end end; RESULT=tostring(fact(5)); assert(fact(5)==120)`},
  { name:'13_varargs', src:`local function sum(...) local s=0; for i=1,select('#',...) do s=s+select(i,...) end; return s end; RESULT=tostring(sum(1,2,3,4)); assert(sum(1,2,3)==6)`},
  { name:'14_multi_return', src:`local function m() return 1,2,3 end; local a,b,c=m(); RESULT=a..b..c; assert(a==1 and b==2 and c==3)`},
  { name:'16_numeric_for', src:`local s=0; for i=1,5 do s=s+i end; RESULT=tostring(s); assert(s==15)`},
  { name:'17_generic_for', src:`local t={a=1,b=2,c=3}; local s=0; for k,v in pairs(t) do s=s+v end; RESULT=tostring(s); assert(s==6)`},
  { name:'21_nested_branches', src:`local x=10; local r=""; if x>5 then if x<15 then r="mid" else r="high" end else r="low" end; RESULT=r`},
];

let passed=0, failed=0;
for(const tc of cases){
  const native = runLua(tc.src);
  const protectedSrc = applyCustomObfuscator(tc.src, {profile:'BALANCED', antiTamper:false, antiSkid:false, antiLogger:false});
  const prot = runLua(protectedSrc);
  const ok = native.ok===prot.ok && native.res===prot.res;
  if(ok){ console.log(`[PASS] ${tc.name}: ${native.res}`); passed++; }
  else { console.log(`[FAIL] ${tc.name}: native res=${native.res} err=${native.err} | prot res=${prot.res} err=${prot.err}`); failed++; }
}
console.log(`\nPhase1 differential: ${passed}/${cases.length} passed, ${failed} failed`);
if(failed>0) process.exit(1);
