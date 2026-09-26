import pathlib
content = '''import { applyBytecodeVm, vmBCSetLuaparse } from './vm-bytecode.js';
import luaparse from 'luaparse';
vmBCSetLuaparse(luaparse);
import fs from 'fs';
import { spawnSync } from 'child_process';
const luauExe = 'C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\Lua Files\\\\luau-windows\\\\luau.exe';
const src='RESULT = 5';
const vm = applyBytecodeVm(src, {target:'luau', profile:'FAST', seedOverride:12345, rethrow:true});
console.log(vm.slice(0,800));
fs.writeFileSync('C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_debug.lua', vm + '\\nprint("after vm, RESULT", RESULT)\\nprint("getfenv", getfenv(0).RESULT)\\nprint(" _G", _G.RESULT)', 'utf8');
let r = spawnSync(luauExe, ['C:\\\\Users\\\\Ryzen 9 5900x\\\\Downloads\\\\new-obfuscator-current\\\\new-obfuscator\\\\tmp_debug.lua'], {encoding:'utf8'});
console.log('stdout', JSON.stringify(r.stdout));
console.log('stderr', JSON.stringify(r.stderr));
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_debug_luau.mjs')
target.write_text(content, encoding='utf-8')
print('written')
