import luaparse from 'luaparse'; import {vmBCSetLuaparse,applyBytecodeVm} from '../vm-bytecode.js'; vmBCSetLuaparse(luaparse);
const src=`local function add(a,b) return a.v+b.v end local mt={__add=add} local co=coroutine.create(function() local a=setmetatable({v=2},mt) local b=setmetatable({v=3},mt) local x=a+b return x end) local ok,v=coroutine.resume(co) RESULT=tostring(ok)..":"..tostring(v)`;
applyBytecodeVm(src,{profile:'BALANCED',seedOverride:424242,rethrow:true,onBuild:b=>{console.log(JSON.stringify(b.chunks,null,2));}});
