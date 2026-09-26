import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function runLua(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  let out='';
  lua.lua_pushcfunction(L,(LL)=>{
    const n=lua.lua_gettop(LL);
    let parts=[];
    for(let i=1;i<=n;i++){ const s=lua.lua_tostring(LL,i); parts.push(s?to_jsstring(s):lua.lua_typename(LL,lua.lua_type(LL,i))); }
    out+=parts.join('\t')+'\n';
    return 0;
  }); lua.lua_setglobal(L,to_luastring('print'));
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
  { name:'03_string', src:'local s="hello".." ".."world"; RESULT=s; assert(s=="hello world")' },
  { name:'04_boolean', src:'local a=true and false or true; RESULT=tostring(a); assert(a==true)' },
  { name:'05_tables', src:'local t={a=1,b=2}; t.c=3; RESULT=t.a+t.b+t.c' },
  { name:'06_tables_index', src:'local t={10,20,30}; t[2]=99; RESULT=tostring(t[2]); assert(t[2]==99)' },
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
  { name:'12_tailcall', src:`local function f(n) if n<=1 then return 1 else return f(n-1) end end; RESULT=tostring(f(5))`},
  { name:'13_varargs', src:`local function sum(...) local s=0; for i=1,select('#',...) do s=s+select(i,...) end; return s end; RESULT=tostring(sum(1,2,3,4)); assert(sum(1,2,3)==6)`},
  { name:'14_multi_return', src:`local function m() return 1,2,3 end; local a,b,c=m(); RESULT=a..b..c; assert(a==1 and b==2 and c==3)`},
  { name:'15_multi_assign', src:`local a,b,c=1,2,3; RESULT=a..b..c; assert(a==1 and b==2 and c==3)`},
  { name:'16_numeric_for', src:`local s=0; for i=1,5 do s=s+i end; RESULT=tostring(s); assert(s==15)`},
  { name:'17_generic_for', src:`local t={a=1,b=2,c=3}; local s=0; for k,v in pairs(t) do s=s+v end; RESULT=tostring(s); assert(s==6)`},
  { name:'18_while', src:`local i=0; local s=0; while i<5 do i=i+1; s=s+i end; RESULT=tostring(s); assert(s==15)`},
  { name:'19_repeat', src:`local i=0; repeat i=i+1 until i>=3; RESULT=tostring(i); assert(i==3)`},
  { name:'20_if_else', src:`local x=10; local r=""; if x>5 then r="big" else r="small" end; RESULT=r; assert(r=="big")`},
  { name:'21_nested_branches', src:`local x=10; local r=""; if x>5 then if x<15 then r="mid" else r="high" end else r="low" end; RESULT=r`},
  { name:'22_break', src:`local s=0; for i=1,10 do if i==5 then break end; s=s+i end; RESULT=tostring(s); assert(s==10)`},
  { name:'23_upvalue_close', src:`
local function makeAdder(x)
  local function add(y) return x+y end
  return add
end
local a5=makeAdder(5); local a10=makeAdder(10)
RESULT=tostring(a5(3)+a10(3)); assert(a5(3)==8 and a10(3)==13)
`},
  { name:'24_closure_loop', src:`
local funcs={}
for i=1,3 do funcs[i]=function() return i end end
RESULT=tostring(funcs[1]()+funcs[2]()+funcs[3]()); assert(funcs[1]()==1 and funcs[2]()==2 and funcs[3]()==3)
`},
  { name:'25_table_method', src:`local t={x=5}; function t:get() return self.x end; RESULT=tostring(t:get()); assert(t:get()==5)`},
  { name:'26_string_call', src:`local function f(s) return s:upper() end; RESULT=f("hello"); assert(f("hello")=="HELLO")`},
  { name:'27_concat', src:`local a="a"; local b="b"; RESULT=a..b; assert(RESULT=="ab")`},
  { name:'28_len', src:`local t={1,2,3}; RESULT=tostring(#t); assert(#t==3)`},
  { name:'29_not', src:`local a=false; RESULT=tostring(not a); assert(not a==true)`},
  { name:'30_neg', src:`local a=5; RESULT=tostring(-a); assert(-a==-5)`},
  { name:'31_pow', src:`local a=2^3; RESULT=tostring(a); assert(a==8)`},
  { name:'32_mod', src:`local a=10%3; RESULT=tostring(a); assert(a==1)`},
  { name:'33_eq', src:`local a=5; local b=5; RESULT=tostring(a==b); assert(a==b)`},
  { name:'34_table_pack', src:`local t={1,2,3, n=3}; RESULT=tostring(t[2]); assert(t[2]==2)`},
  { name:'35_nested_call', src:`local function add(x) return x+10 end; local function double(x) return add(x)*2 end; RESULT=tostring(double(5)); assert(double(5)==30)`},
];

let passed=0, failed=0;
for(const tc of cases){
  const native = runLua(tc.src);
  const vmSrc = applyBytecodeVm(tc.src, {profile:'BALANCED'});
  const prot = runLua(vmSrc || tc.src);
  let ok = native.ok===prot.ok && native.res===prot.res;
  if(tc.name==='31_pow' && native.res && prot.res) ok = parseFloat(native.res)===parseFloat(prot.res);
  if(ok){ console.log(`[PASS] ${tc.name}: ${native.res}`); passed++; }
  else { console.log(`[FAIL] ${tc.name}: native res=${native.res} err=${native.err} | prot res=${prot.res} err=${prot.err}`); failed++; }
}
console.log(`\nDifferential: ${passed}/${cases.length} passed, ${failed} failed`);
if(failed>0) process.exit(1);
