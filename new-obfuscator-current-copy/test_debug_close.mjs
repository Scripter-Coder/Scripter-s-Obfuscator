import { prepareSource } from './src/targets/luau.js';
import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
vmBCSetLuaparse(luaparse);
const tests = [
  `function makeCounter(): ()->number local c=0 return function():number c+=1 return c end end\nlocal cnt=makeCounter()\nprint(cnt())\nprint(cnt())`,
  `function fact(n:number):number if n<=1 then return 1 else return n*fact(n-1) end end\nprint(fact(5))`,
  `function f(n:number):number if n==0 then return 0 else return f(n-1) end end\nprint(f(5))`,
];
for(let i=0;i<tests.length;i++){
  const src=tests[i];
  console.log('--- test', i, '---');
  console.log('src', JSON.stringify(src));
  try{
    const prep = prepareSource(src);
    console.log('prep', JSON.stringify(prep));
    const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seed:12345, rethrow:true});
    console.log('vm ok', vm.length);
  } catch(e){ console.log('err', e.message); }
}
