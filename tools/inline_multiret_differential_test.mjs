import luaparse from 'luaparse';
import fengari from 'fengari';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const LUA = 'C:/Users/Ryzen 9 5900x/Downloads/Lua Files/lua-5.1.5/lua-5.1.5/src/lua.exe';

const M = 'local function m() return 1,2,3 end\n';
const F = {
  f0: 'local function f0() return 7 end',
  f1: 'local function f1(a) return a end',
  f2: 'local function f2(a,b) return a+b end',
  f3: 'local function f3(a,b,c) return a+b+c end',
  f4: 'local function f4(a,b,c,d) return (a or -9)..(b or -9)..(c or -9)..(d or -9) end',
  g2: 'local function g2(a,b) local t=a*b return t end',
  s2: 'local function s2(a,b) return a-b end',
  d2: 'local function d2(a,b) local q=a local w=b return q..w end',
  p3: 'local function p3(a,b,c) local x,y,z=a,b,c return x*y*z end',
};

// Each case: [source, expected-output-file, expected-error?]
const CASES = {
  'f2(m())':            [M + F.f2 + ' OUT(f2(m()))', '3'],
  'f2(9,m())':          [M + F.f2 + ' OUT(f2(9,m()))', '10'],
  'f2(9,9,m())':        [M + F.f2 + ' OUT(f2(9,9,m()))', '18'],
  'f3(m())':            [M + F.f3 + ' OUT(f3(m()))', '6'],
  'f3(9,m())':          [M + F.f3 + ' OUT(f3(9,m()))', '12'],
  'f3(9,9,m())':        [M + F.f3 + ' OUT(f3(9,9,m()))', '19'],
  'f4(m())':            [M + F.f4 + ' OUT(f4(m()))', '123-9'],
  'f4(9,m())':          [M + F.f4 + ' OUT(f4(9,m()))', '9123'],
  'f1(m())':            [M + F.f1 + ' OUT(f1(m()))', '1'],
  'f0()':               [M + F.f0 + ' OUT(f0())', '7'],
  'f2(1,2) no multi':   [M + F.f2 + ' OUT(f2(1,2))', '3'],
  'f2(m(),9) trunc':    [M + F.f2 + ' OUT(f2(m(),9))', '10'],
  'g2(m()) mul':        [M + F.g2 + ' OUT(g2(m()))', '2'],
  'g2(9,m())':          [M + F.g2 + ' OUT(g2(9,m()))', '9'],
  's2(m()) sub':        [M + F.s2 + ' OUT(s2(m()))', '-1'],
  's2(9,m())':          [M + F.s2 + ' OUT(s2(9,m()))', '8'],
  'd2(m()) concat+stmt':[M + F.d2 + ' OUT(d2(m()))', '12'],
  'p3(m()) prelude':    [M + F.p3 + ' OUT(p3(m()))', '6'],
  'p3(9,m())':          [M + F.p3 + ' OUT(p3(9,m()))', '18'],
  'f3(f2(m()),9) nest': [M + F.f2 + '\n' + F.f3 + '\nOUT(f3(f2(m()),9))', '12'],
  'f2(1,2) manyargs':   [M + F.f2 + ' OUT(f2(1,2)) OUT(f2(m())) OUT(f2(9,9,m()))', '3|3|18'],
};

const PRELUDE = 'OUT=function(s) _acc=_acc..tostring(s).."|" end _acc=""\n';

function readAcc(L) {
  lua.lua_getglobal(L, to_luastring('_acc'));
  const s = lua.lua_tostring(L, -1);
  const v = s ? to_jsstring(s) : '';
  return v.replace(/\|$/, '');
}

function runReal(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zi-'));
  const f = path.join(dir, 'a.lua');
  fs.writeFileSync(f, PRELUDE + src + '\nprint(_acc)\n', 'utf8');
  let out;
  try { out = String(execFileSync(LUA, [f], { encoding: 'utf8' })).trim(); }
  catch (e) {
    const msg = String((e && e.stderr) || (e && e.message) || '').trim().split('\n').filter(Boolean).pop() || 'ERR';
    out = 'LUA-ERR:' + msg.slice(0, 45);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return out.replace(/\|$/, '');
}

function runVm(src, opts) {
  let art;
  try { art = applyBytecodeVm(PRELUDE + src, Object.assign({ rethrow: true }, opts)); }
  catch (e) { return { v: 'BUILD: ' + String(e.message).slice(0, 60) }; }
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  if (lauxlib.luaL_dostring(L, to_luastring(art)) !== lua.LUA_OK) {
    return { v: 'VM-ERR: ' + to_jsstring(lua.lua_tostring(L, -1)).replace(/^.*\]:/, '').slice(0, 55) };
  }
  return { v: readAcc(L) };
}

let pass = 0, fail = 0;
const failures = [];
for (const [name, [src, want]] of Object.entries(CASES)) {
  const real = runReal(src);
  const on = runVm(src, {});
  const off = runVm(src, { inline: false });
  // Agreement rule: the VM must match plain Lua. When plain Lua raises an
  // error the VM must also raise (a matching failure is correct behaviour,
  // not a regression); otherwise the values must be identical.
  const realErr = /^LUA-ERR:/.test(real);
  const agrees = (a, b) => (realErr ? /ERR:/.test(a) : a === real) && (realErr ? /ERR:/.test(b) : b === real);
  const okReal = realErr ? true : real === want;
  const okOn = agrees(on.v, off.v) && agrees(on.v, real);
  const ok = okReal && okOn;
  if (ok) pass++;
  else { fail++; failures.push({ name, want, real, on: on.v, off: off.v }); }
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(mark + ' ' + name.padEnd(24) +
    'want=' + String(want).padEnd(12) +
    'lua=' + String(real).padEnd(30) +
    'inlineON=' + String(on.v).padEnd(30) +
    'inlineOFF=' + off.v);
}
console.log('\npass=' + pass + ' fail=' + fail);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f.name + ' want=' + f.want + ' lua=' + f.real + ' on=' + f.on + ' off=' + f.off);
}
