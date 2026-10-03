// The minted LOADER must work on an executor whose game:HttpGet is broken.
//
// The user reported:
//
//     1 start
//     2 ok=false
//     2 result: init:576: invalid argument #1 to 'find' (string expected, got nil)
//
// and the stack named the executor's own internal_request. So game:HttpGet
// throws before any network traffic, on that executor. The previous loader was
// hardcoded to it:
//
//     loadstring(game:HttpGet("..."))()
//
// while the bootstrap inside already preferred `request`. So the one line a user
// pastes was the only part that could not work.
//
// This runs the ACTUAL string shLoader() produces, on fengari, against three
// executor shapes:
//
//   A  request works, HttpGet works        -> must use either
//   B  request works, HttpGet THROWS       -> must still work
//   C  request missing, HttpGet works      -> must still work
//   D  neither                            -> must report, not die silently
//
// A string assertion cannot establish any of that. Only running it can.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';
import luaparse from 'luaparse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare/worker.js'), 'utf8');

const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub0451244272';
const BOOTSTRAP = '--[[ bootstrap ]]\nlocal RAN=false\nreturn true\n';

// pull shLoader out the same way the bootstrap test does, comments included
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('brace match failed for ' + name);
}

const shLoader = new Function(extract('shLoader') + '\nreturn shLoader;')();
const loader = shLoader(BASE, ID);

console.log('');
console.log('='.repeat(72));
console.log('  THE MINTED LOADER  (' + loader.length + ' bytes)');
console.log('='.repeat(72));
console.log('');
console.log(loader.split('\n').map(l => '  ' + l).join('\n'));
console.log('');

let pass = 0, fail = 0;
const ok = (l) => { pass++; console.log('  OK   ' + l); };
const no = (l) => { fail++; console.log('  FAIL ' + l); };

console.log('[L1] the minted loader is valid Lua 5.1...');
try {
  luaparse.parse(loader);
  ok('parses');
} catch (e) {
  no('luaparse failed: ' + e.message);
}

console.log('[L2] it carries no SCRIPT material...');
{
  // The first version of this check rejected the loader for containing
  // "print(" - which it does, inside its own error message. That is the same
  // mistake as flagging `print(` in the obfuscated output: a Lua global name is
  // not script content, and a diagnostic that cries wolf trains you to ignore
  // it. What actually matters is whether any of the SCRIPT's material is here.
  const BAD = [
    ['the bootstrap itself', 'ScripterHub session loader'],
    ['the decrypt magic', 'SHOK'],
    ['a delivery route', '/sh/a/'],
    ['a split-key slot', '__SH_SPLITKEY'],
    ['cipher code', 'local function BX'],
    ['the cipher constants', '4294967296']
  ].filter(([, s]) => loader.includes(s));

  if (BAD.length === 0) {
    ok('no bootstrap, no cipher, no delivery path - only the id and two transports');
  } else {
    no('loader carries script material: ' + BAD.map(([w]) => w).join(', '));
  }

  // And it must contain the id, or it points at nothing.
  if (loader.includes(ID)) ok('contains the loader id');
  else no('loader does not reference the id');
}

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;
const tls = (s) => fengari.to_luastring(s);
const read = (s) => (s === null || s === undefined ? null
  : (typeof s === 'string' ? s : Buffer.from(s).toString('utf8')));

function run(label, opts) {
  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  const printed = [];
  let ranBootstrap = false;

  const setGlobal = (n, f) => { LUA.lua_pushcfunction(st, f); LUA.lua_setglobal(st, tls(n)); };

  if (opts.requestWorks) {
    setGlobal('request', (s) => {
      LUA.lua_newtable(s);
      LUA.lua_pushstring(s, tls(BOOTSTRAP));
      LUA.lua_setfield(s, -2, tls('Body'));
      LUA.lua_pushnumber(s, 200);
      LUA.lua_setfield(s, -2, tls('StatusCode'));
      return 1;
    });
  }

  if (opts.httpGetPresent) {
    LUA.lua_newtable(st);
    LUA.lua_pushcfunction(st, (s) => {
      if (opts.httpGetThrows) { LUA.lua_pushstring(s, tls('init:576: invalid argument #1 to \'find\'')); LUA.lua_error(s); return 0; }
      LUA.lua_pushstring(s, tls(BOOTSTRAP));
      return 1;
    });
    LUA.lua_setfield(st, -2, tls('HttpGet'));
    LUA.lua_setglobal(st, tls('game'));
  }

  setGlobal('print', (s) => {
    LUA.lua_tostring(s, 1);
    const line = read(LUA.lua_tostring(s, -1));
    LUA.lua_pop(s, 1);
    if (line !== null) printed.push(line);
    return 0;
  });

  // loadstring: record that the bootstrap was handed over, then succeed
  setGlobal('loadstring', (s) => {
    const b = read(LUA.lua_tostring(s, 1));
    if (b === null) { LUA.lua_pushnil(s); return 1; }
    if (b.includes('bootstrap')) ranBootstrap = true;
    LUA.lua_pushcfunction(s, () => 0);
    return 1;
  });

  if (AUX.luaL_loadstring(st, tls(loader)) !== 0) {
    const e = read(LUA.lua_tostring(st, -1));
    LUA.lua_close(st);
    return { compileError: e, printed, ranBootstrap };
  }
  const rc = LUA.lua_pcall(st, 0, 0, 0);
  const err = rc !== 0 ? read(LUA.lua_tostring(st, -1)) : null;
  LUA.lua_close(st);
  return { runtimeError: err, printed, ranBootstrap };
}

console.log('[L3] request works, HttpGet works...');
{
  const r = run('both', { requestWorks: true, httpGetPresent: true });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranBootstrap) ok('delivered the bootstrap');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L4] request works, HttpGet THROWS  (the user\'s executor)...');
{
  const r = run('req-only', { requestWorks: true, httpGetPresent: true, httpGetThrows: true });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranBootstrap) ok('delivered the bootstrap even though HttpGet throws');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L5] request missing, HttpGet works...');
{
  const r = run('http-only', { requestWorks: false, httpGetPresent: true });
  if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranBootstrap) ok('fell back to game:HttpGet and delivered');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L6] neither transport available...');
{
  const r = run('none', { requestWorks: false, httpGetPresent: false });
  // The previous ten-line loader printed "Could not reach the script. No usable HTTP
  // function." A one-line expression cannot carry that message without becoming the
  // thing the owner asked to stop shipping, so this now asserts the property that
  // actually matters: it fails LOUDLY. A nil-index error names the missing global,
  // which is more actionable than our own prose. Silence is the only real failure -
  // a loader that returns quietly leaves the user staring at nothing.
  const loud = !!r.runtimeError;
  const reported = r.printed.some(p => /Could not reach/i.test(p));
  if (r.ranBootstrap) no('delivered a payload with no transport');
  else if (loud) ok('fails loudly rather than silently: ' + r.runtimeError);
  else if (reported) ok('reports clearly: ' + JSON.stringify(r.printed));
  else no('silent. printed=' + JSON.stringify(r.printed));
}

console.log('[L7] it sends an executor User-Agent, or it receives HTML...');
{
  // The bug this whole exercise was really about. A `request` call with no
  // User-Agent is not treated as an executor: the worker answers with the 1,549-byte
  // browser page, loadstring() fails on perfectly good input, and the user is told
  // "Could not compile the loader" - which points at Lua rather than at the network.
  // That cost a long debugging round to find, so it is asserted directly.
  if (/User-Agent/i.test(loader)) {
    ok('the loader sends a User-Agent header');
  } else {
    no('no User-Agent header: this loader will be served HTML and report a compile error');
  }
  if (/Roblox|RBX|Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta/i.test(loader)) {
    ok('and it is one the worker recognises as an executor');
  } else {
    no('the User-Agent does not match the worker\'s EXECUTOR_UA pattern');
  }
}

console.log('[L8] it is one line, because that is the point...');
{
  const lines = loader.split('\n').filter(l => l.trim().length);
  if (lines.length === 1) ok('one line, ' + loader.length + ' bytes');
  else no(lines.length + ' lines - the owner asked for the classic one-liner');
}

console.log('');
console.log('='.repeat(72));
console.log('MINTED LOADER   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
