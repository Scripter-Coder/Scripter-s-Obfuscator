import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const source = `
-- VMATTR(PRESET=FAST, TRANSFORM=NO_FUSION)
local function cheap(x) return x + 1 end
-- VMATTR(VM=ONYX, PRESET=SECURE)
local function sensitive(x) return x * 2 end
RESULT=tostring(cheap(4)+sensitive(5))
`;
let build;
const vm = applyBytecodeVm(source, { profile: 'BALANCED', seedOverride: 77, rethrow: true, onBuild: value => { build = value; } });
const reports = build.pipeline.reports;
const profiles = reports.map(report => `${report.vm}:${report.profile}`);
const profilePass = profiles.includes('OPAL:FAST') && profiles.includes('ONYX:SECURE');
console.log(`[${profilePass ? 'PASS' : 'FAIL'}] per-function profiles: ${profiles.join(',')}`);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const status = lauxlib.luaL_dostring(L, to_luastring(vm));
if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
lua.lua_getglobal(L, to_luastring('RESULT'));
const result = to_jsstring(lua.lua_tostring(L, -1));
console.log(`[${result === '15' ? 'PASS' : 'FAIL'}] mixed-function result: ${result}`);
if (!profilePass || result !== '15') process.exit(1);
