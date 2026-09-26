import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const src = `
local function makeCounter(start)
    local n = start
    return function(x, ...)
        n = n + x
        local t = {
            value = n,
            args = {...}
        }
        if n % 2 == 0 then
            t.kind = "even"
        else
            t.kind = "odd"
        end
        return t.value, t.kind, n
    end
end
local a = makeCounter(10)
local b = makeCounter(100)
local v1,k1,n1 = a(2, "x", "y")
RESULT = v1..","..k1..","..n1
`;
try {
  const vm = applyBytecodeVm(src, {profile:'BALANCED', rethrow:true});
  console.log("vm len", vm ? vm.length : null);
  if(!vm) { console.log("vm null"); process.exit(1); }
  console.log(vm.slice(0,500));
} catch(e) {
  console.error(e.stack);
}
