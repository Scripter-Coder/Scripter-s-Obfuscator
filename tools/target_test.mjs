import { applyCustomObfuscator } from '../custom-obfuscator.js';
import luaparse from 'luaparse';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
const src='print(1)';
try{
  const out=applyCustomObfuscator(src, {target:'lua54'});
  console.log('lua54 should have thrown but got len', out.length);
} catch(e){
  console.log('lua54 correctly rejected:', e.message.slice(0,120));
}
try{
  const out2=applyCustomObfuscator(src, {target:'lua51'});
  console.log('lua51 ok len', out2.length);
} catch(e){ console.log('lua51 failed', e.message);}
