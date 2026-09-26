import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function runNative(src){
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(src));
  if(st!==0) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1))};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const tp=lua.lua_type(L,-1);
  if(tp===lua.LUA_TNIL) return {ok:true, val:'nil'};
  if(tp===lua.LUA_TSTRING) return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
  if(tp===lua.LUA_TNUMBER) return {ok:true, val:String(lua.lua_tonumber(L,-1))};
  if(tp===lua.LUA_TBOOLEAN) return {ok:true, val:String(lua.lua_toboolean(L,-1))};
  return {ok:true, val:'other'};
}
function runVM(src){
  const vm=applyBytecodeVm(src);
  if(!vm) return {ok:false, skip:true};
  const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const st=lauxlib.luaL_dostring(L,to_luastring(vm));
  if(st!==0) return {ok:false, err:to_jsstring(lua.lua_tostring(L,-1)).slice(0,600)};
  lua.lua_getglobal(L,to_luastring('RESULT'));
  const tp=lua.lua_type(L,-1);
  if(tp===lua.LUA_TNIL) return {ok:true, val:'nil'};
  if(tp===lua.LUA_TSTRING) return {ok:true, val:to_jsstring(lua.lua_tostring(L,-1))};
  if(tp===lua.LUA_TNUMBER) return {ok:true, val:String(lua.lua_tonumber(L,-1))};
  if(tp===lua.LUA_TBOOLEAN) return {ok:true, val:String(lua.lua_toboolean(L,-1))};
  return {ok:true, val:'other'};
}

function rnd(n){ return Math.floor(Math.random()*n); }
function rndInt(a,b){ return a+rnd(b-a+1); }

function genExpr(depth){
  if(depth<=0) {
    const c=rnd(4);
    if(c===0) return String(rndInt(0,20));
    if(c===1) return `"s${rndInt(0,100)}"`;
    if(c===2) return rnd(2)===0 ? 'true' : 'false';
    return 'nil';
  }
  const op=['+','-','*','..','==','<'][rnd(6)];
  if(rnd(3)===0) return `(${genExpr(depth-1)} ${op} ${genExpr(depth-1)})`;
  return genExpr(0);
}

function genProgram(seed){
  let s = seed>>>0;
  const srnd=(n)=>{ s=(s*1664525+1013904223)>>>0; return s % n; };
  // generate valid programs from templates
  const templates=[
    ()=>`local s=0; for i=1,${1+srnd(10)} do s=s+i end; RESULT=tostring(s)`,
    ()=>`local t={${Array.from({length:3+srnd(3)},()=>srnd(100)).join(',')}}; RESULT=tostring(t[${1+srnd(3)}])`,
    ()=>`local function f(a,b) return a ${['+','-','*'][srnd(3)]} b end; RESULT=tostring(f(${srnd(20)},${srnd(20)}))`,
    ()=>`local x=${srnd(20)}; if x>${srnd(10)} then RESULT="yes" else RESULT="no" end`,
    ()=>`local s=0; local i=1; while i<=${3+srnd(5)} do s=s+i; i=i+1 end; RESULT=tostring(s)`,
    ()=>`local a="${'a'.repeat(1+srnd(5))}"; local b="${'b'.repeat(1+srnd(5))}"; RESULT=a..b`,
    ()=>`local x=${srnd(2)===0?'true':'false'}; RESULT=tostring(not x)`,
    ()=>`local t={a=${srnd(20)},b=${srnd(20)}}; RESULT=tostring(t.a+t.b)`,
    ()=>`local s=""; for i=1,${2+srnd(5)} do s=s..tostring(i) end; RESULT=s`,
    ()=>`local function outer(a) return function(b) return a+b end end; RESULT=tostring(outer(${srnd(10)})(${srnd(10)}))`,
  ];
  const pick=templates[srnd(templates.length)];
  return pick();
}

let pass=0,fail=0,skip=0;
for(let i=0;i<100;i++){
  const src=genProgram(i* 0x9e3779b9);
  const a=runNative(src);
  const b=runVM(src);
  if(b.skip){ skip++; continue; }
  if(!a.ok){ skip++; continue; } // native syntax error, skip
  if(!b.ok){ console.log(`FUZZ ${i} VM err ${b.err}\nSRC ${src.slice(0,200)}`); fail++; continue; }
  if(a.val===b.val) pass++; else { console.log(`FUZZ ${i} mismatch native ${JSON.stringify(a.val)} vm ${JSON.stringify(b.val)}\nSRC ${src.slice(0,300)}`); fail++; }
}
console.log(`Fuzz 100: ${pass} pass, ${fail} fail, ${skip} skip`);
if(fail>0) process.exit(1);
