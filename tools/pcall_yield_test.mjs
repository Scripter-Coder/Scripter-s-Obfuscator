// THE REPRODUCTION, from the executor.
//
// The user ran this 12-line snippet on Solara. Obfuscated it printed "start" and then
// stopped: "pcall ok:" never appeared, and no error was reported. That is the whole bug
// in miniature, and it is the first failing case in this investigation small enough to
// read.
//
// The shape that matters is not the signal connection, it is:
//
//     pcall(function() ... task.wait(...) ... end)
//
// A VM closure handed to the HOST pcall which YIELDS inside it. That is the deepest
// re-entry there is - host function, VM frame, host yield, coroutine switch - with the
// interpreter's register state saved and restored around it and the VM's own pcall
// protection metadata on the stack. A GUI script is full of these; a thread-only script
// is not, which is exactly the difference between the user's two scripts.
//
// The silence matters as much as the failure: pcall RETURNS, but "pcall ok:" never
// printed, so control never came back to the chunk. That is a state-machine failure
// rather than an exception, and no error handler will report it.
//
// MEASUREMENT NOTE
//
// Three attempts to read a log back out of fengari failed and each one made the whole
// file report "no regression" while measuring nothing: a table read back with lua_pcall
// returned nothing, and calling lua_type before pcall left the stack in a state pcall
// rejected ("attempt to call a string value"). What works is a STRING global appended by
// the stub's own print, read with getglobal + pcall and nothing else on the stack. The
// stub is patched rather than overridden here so both the plain and obfuscated runs see
// identical instrumentation.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const RAW = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');

// print appends to a string, so the run's progress is readable afterwards.
const STUB = RAW.replace(/MISSING = \{\}/, [
  'MISSING = {}',
  '_VMLOG = ""',
  'print = function(...)',
  '  local t = ""',
  '  for _i = 1, select("#", ...) do t = t .. tostring((select(_i, ...))) .. " " end',
  '  _VMLOG = _VMLOG .. "[" .. t .. "]"',
  'end',
  // GetPropertyChangedSignal must be callable and return a signal, as in Roblox. The
  // stub's version was a function but the signal it handed back had no Connect, so the
  // user's snippet died with "attempt to call a table value (method
  // 'GetPropertyChangedSignal')" before reaching anything interesting.
  'local function _sig() return { Conn = {}, Connect = function(self, f) table.insert(self.Conn, f); return { Disconnect = function() end } end } end',
].join('\n'));

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) {
        return { ok: false, err: 'STUB: ' + to_jsstring(lua.lua_tostring(L, -1)), log: '' };
    }
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    for (let i = 0; i < 6; i++) { lua.lua_getglobal(L, to_luastring('PUMP')); lua.lua_pushinteger(L, 1); lua.lua_pcall(L, 1, 0, 0); }
    // getglobal + tostring, with NO lua_pcall. lua_pcall in this fengari build fails
    // with "attempt to call a string value" for a plain zero-arg call, so every readback
    // that used it returned nothing - and the variant table below reported five silent
    // failures that were purely a broken measurement. Verified working in
    // tools/_readback.mjs, which is why the log is a string and not a table.
    lua.lua_getglobal(L, to_luastring('_VMLOG'));
    const s = lua.lua_tostring(L, -1);
    return {
        ok: st === lua.LUA_OK,
        err: e ? to_jsstring(e) : '',
        errTail: e ? to_jsstring(e).split('\n').slice(-2).join(' ').slice(0, 150) : '',
        log: s ? to_jsstring(s) : '(empty)',
    };
}
function canary(o) {
    const c = String(o).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return c ? '_G.' + c[1] + '=' + c[2] + '\n' : '';
}

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

// The user's snippet, and a reduction of it. Each drops one element so the minimum
// failing shape can be named rather than guessed at.
const VARIANTS = [
  ['the snippet as the user ran it', `
print("start")
local ok, err = pcall(function()
    local t = Instance.new("Frame")
    t.Visible = true
    local done = false
    t:GetPropertyChangedSignal("Visible"):Connect(function() done = true end)
    t.Visible = false
    task.wait(0.2)
    print("callback ran:", done)
end)
print("pcall ok:", ok, err)
`, /pcall ok/],
  ['signal connection removed', `
print("start")
local ok, err = pcall(function()
    local t = Instance.new("Frame")
    t.Visible = true
    task.wait(0.2)
end)
print("pcall ok:", ok, err)
`, /pcall ok/],
  ['task.wait removed', `
print("start")
local ok, err = pcall(function()
    local t = Instance.new("Frame")
    t.Visible = true
    print("inside")
end)
print("pcall ok:", ok, err)
`, /pcall ok/],
  ['pcall + task.wait only', `
print("start")
local ok, err = pcall(function()
    task.wait(0.2)
    print("inside")
end)
print("pcall ok:", ok, err)
`, /pcall ok/],
  ['task.wait alone, no pcall', `
print("start")
task.wait(0.2)
print("after")
`, /after/],
  ['pcall around a plain function', `
print("start")
local ok, err = pcall(function() return 1 end)
print("pcall ok:", ok, err)
`, /pcall ok/],
];

console.log('does the OBFUSCATED build return control to the chunk? (plain is the control)\n');
for (const [name, src, reaches] of VARIANTS) {
    const plain = run(src);
    let g;
    try { g = applyBytecodeVm(src, { profile: 'FAST' }); } catch (e) { no(name + ' - generator threw ' + e.message.slice(0, 50)); continue; }
    const obf = run(canary(g) + g);

    const pReached = reaches.test(plain.log);
    const oReached = reaches.test(obf.log);
    const silent = !oReached && plain.ok;
    if (silent) {
        no(name);
        console.log('        plain  : ' + JSON.stringify(plain.log.slice(0, 90)));
        console.log('        obf    : ' + JSON.stringify(obf.log.slice(0, 90)) + (obf.errTail ? ' err=' + obf.errTail.slice(0, 70) : ''));
        console.log('        -> the obfuscated chunk never returned control. This is the executor\'s symptom.');
    } else {
        ok(name + ' (plain ' + (pReached ? 'complete' : 'partial') + ', obfuscated ' + (oReached ? 'complete' : 'partial') + ')');
    }
}

console.log('');
console.log(fail ? 'PCALL YIELD   ' + pass + ' passed, ' + fail + ' SILENT FAILURE(S)' : 'PCALL YIELD   ' + pass + ' passed, 0 silent failures');
process.exit(fail ? 1 : 0);
