import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
vmBCSetLuaparse(luaparse);
function test(name, src){
  try{
    let out = applyBytecodeVm(src, {profile:'FAST', target:'luau', seedOverride:12345, rethrow:true});
    console.log(name, 'OK', out ? out.slice(0,200) : 'null');
  }catch(e){
    console.log(name, 'ERR', e.message, e.stack?.slice(0,2000));
  }
}
test('arith','print(1+2*3)');
test('global_rw','x=10; print(x); x=20; print(x); y=x+5; print(y)');
test('global_rw2','x=10; print(x); x=20; print(x); y=x+5; print(y); print(_G.print and "has" or "no")');
test('continue','for i=1,5 do if i==3 then continue end print(i) end');
test('global_simple','x=10; print(x)');
test('global_read_print','print("hi")');
