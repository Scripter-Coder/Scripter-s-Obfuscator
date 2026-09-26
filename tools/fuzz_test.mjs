import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
import fengari from 'fengari';
const { lua,lauxlib,lualib,to_luastring,to_jsstring } = fengari;

function randInt(a,b){ return a+Math.floor(Math.random()*(b-a+1)); }
function choice(arr){ return arr[randInt(0,arr.length-1)]; }

function genExpr(depth=0){
 if(depth>3) return String(randInt(0,20));
 const ops = ['+', '-', '*', '%'];
 if(Math.random()<0.3) return String(randInt(0,20));
 if(Math.random()<0.2) return `(${genExpr(depth+1)} ${choice(ops)} ${genExpr(depth+1)})`;
 if(Math.random()<0.2) return `localVar${randInt(1,3)}`;
 return String(randInt(1,10));
}

function genProgram(){
 let src='';
 const vars=['a','b','c'];
 vars.forEach(v=> src+=`local ${v}=${randInt(1,10)}\n`);
 src+=`local t={}; for i=1,${randInt(2,5)} do t[i]=i*i end\n`;
 src+=`local s=0; for _,v in ipairs(t) do s=s+v end\n`;
 if(Math.random()<0.5){
   src+=`local function f(x) if x%2==0 then return x*2 else return x*3 end end\n`;
   src+=`s=s+f(${randInt(1,10)})\n`;
 }
 src+=`RESULT=tostring(s)\n`;
 return src;
}

function run(src){
 const L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
 const st=lauxlib.luaL_dostring(L,to_luastring(src));
 if(st!==lua.LUA_OK) return {ok:false, err: to_jsstring(lua.lua_tostring(L,-1)).slice(0,500)};
 lua.lua_getglobal(L,to_luastring('RESULT'));
 const res = lua.lua_tostring(L,-1);
 return {ok:true, res: res?to_jsstring(res):'nil'};
}

let pass=0, fail=0;
for(let i=0;i<30;i++){
 const src=genProgram();
 const native=run(src);
 const vm=applyBytecodeVm(src, {profile:'BALANCED'});
 if(!vm){ console.log(`fuzz ${i}: vm fallback (unsupported) skip`); continue; }
 const prot=run(vm);
 if(native.ok!==prot.ok || native.res!==prot.res){
   console.log(`[FAIL] fuzz ${i}: native ${JSON.stringify(native)} vs prot ${JSON.stringify(prot)}`);
   console.log('src:', src.slice(0,500));
   fail++;
   if(fail>=3) break;
 } else {
   pass++;
 }
}
console.log(`Fuzz: ${pass} passed, ${fail} failed out of 30`);
if(fail>0) process.exit(1);
console.log('Fuzz PASS');
