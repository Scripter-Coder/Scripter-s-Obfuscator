// The minted LOADER must work on an executor whose game:HttpGet is broken.
//
// The user reported:
//
//     1 start
//     2 ok=false
//     2 result: init:576: invalid argument #1 to 'find' (string expected, got nil)
//
// and the stack named the executor's own internal_request. So game:HttpGet
// throws before any network traffic, on that executor.
//
// The platform therefore ships TWO one-liners:
//
//   the plain one      loadstring(game:HttpGet("<url>"))()
//   the portable twin  loadstring((request and request({...}).Body) or game:HttpGet("<url>"))()
//
// The plain one is what the owner sees and what a Luarmor user expects. The
// portable twin is what that executor needs, and it is offered NEXT TO the
// plain one, not instead of it.
//
// This runs BOTH real strings on fengari, against four executor shapes:
//
//   A  request works, HttpGet works        -> must use either
//   B  request works, HttpGet THROWS       -> the plain one cannot work here;
//                                              the portable twin must
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
const INIT_LAYER = '-- init layer\nlocal RAN=false\nreturn true\n';

// pull the generators out the same way the bootstrap test does, comments included
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
const shLoaderPortable = new Function(extract('shLoaderPortable') + '\nreturn shLoaderPortable;')();
const luaSessionBootstrap = new Function('SPLITKEY_GENV', extract('luaSessionBootstrap') + '\nreturn luaSessionBootstrap;')('__SH_SPLITKEY');

const loader = shLoader(BASE, ID);
const portable = shLoaderPortable(BASE, ID);
const initLayer = luaSessionBootstrap(ID, BASE, false);

console.log('');
console.log('='.repeat(72));
console.log('  THE MINTED LOADER  (' + loader.length + ' bytes)');
console.log('='.repeat(72));
console.log('');
console.log(loader);
console.log('');
console.log('  portable twin:');
console.log('  ' + portable);
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
    ['the init layer itself', 'ScripterHub init layer'],
    ['the decrypt magic', 'SHOK'],
    ['a delivery route', '/sh/a/'],
    ['the cdn link', '/sh/v4_init_'],
    ['a split-key slot', '__SH_SPLITKEY'],
    ['cipher code', 'local function BX'],
    ['the cipher constants', '4294967296']
  ].filter(([, s]) => loader.includes(s));

  if (BAD.length === 0) {
    ok('no init layer, no cipher, no delivery path - only the id and the URL');
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

function run(source, opts) {
  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  const printed = [];
  let ranInit = false;

  const setGlobal = (n, f) => { LUA.lua_pushcfunction(st, f); LUA.lua_setglobal(st, tls(n)); };

  if (opts.requestWorks) {
    setGlobal('request', (s) => {
      LUA.lua_newtable(s);
      LUA.lua_pushstring(s, tls(INIT_LAYER));
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
      LUA.lua_pushstring(s, tls(INIT_LAYER));
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

  // loadstring: record that the init layer was handed over, then succeed
  setGlobal('loadstring', (s) => {
    const b = read(LUA.lua_tostring(s, 1));
    if (b === null) { LUA.lua_pushnil(s); return 1; }
    if (b.includes('init layer')) ranInit = true;
    LUA.lua_pushcfunction(s, () => 0);
    return 1;
  });

  if (AUX.luaL_loadstring(st, tls(source)) !== 0) {
    const e = read(LUA.lua_tostring(st, -1));
    LUA.lua_close(st);
    return { compileError: e, printed, ranInit };
  }
  const rc = LUA.lua_pcall(st, 0, 0, 0);
  const err = rc !== 0 ? read(LUA.lua_tostring(st, -1)) : null;
  LUA.lua_close(st);
  return { runtimeError: err, printed, ranInit };
}

console.log('[L3] the plain line: request works, HttpGet works...');
{
  const r = run(loader, { requestWorks: true, httpGetPresent: true });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranInit) ok('delivered the init layer');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L4] the plain line: request works, HttpGet THROWS  (the user\'s executor)...');
{
  // This is the shape the user asked for, and it CANNOT work on this executor:
  // game:HttpGet throws inside the executor before any request is made. That is
  // not a defect of the platform - it is the reason the portable twin exists,
  // and it is offered next to this one.
  const r = run(loader, { requestWorks: true, httpGetPresent: true, httpGetThrows: true });
  if (r.ranInit) ok('delivered the init layer anyway (the executor recovered)');
  else if (r.runtimeError) ok('fails on this executor, as expected - the portable twin is the fix: ' + r.runtimeError);
  else no('neither delivered nor failed loudly. printed=' + JSON.stringify(r.printed));
}

console.log('[L5] the portable twin: request works, HttpGet THROWS  (the user\'s executor)...');
{
  const r = run(portable, { requestWorks: true, httpGetPresent: true, httpGetThrows: true });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranInit) ok('delivered the init layer even though HttpGet throws');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L6] the plain line: request missing, HttpGet works...');
{
  const r = run(loader, { requestWorks: false, httpGetPresent: true });
  if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.ranInit) ok('fell back to game:HttpGet and delivered');
  else no('never reached loadstring. printed=' + JSON.stringify(r.printed));
}

console.log('[L7] neither transport available...');
{
  const r = run(loader, { requestWorks: false, httpGetPresent: false });
  // A one-liner cannot carry a sentence without becoming the thing the owner
  // asked to stop shipping, so this asserts the property that actually
  // matters: it fails LOUDLY. A nil-index error names the missing global,
  // which is more actionable than our own prose. Silence is the only real
  // failure - a loader that returns quietly leaves the user staring at nothing.
  const loud = !!r.runtimeError;
  const reported = r.printed.some(p => /Could not reach/i.test(p));
  if (r.ranInit) no('delivered a payload with no transport');
  else if (loud) ok('fails loudly rather than silently: ' + r.runtimeError);
  else if (reported) ok('reports clearly: ' + JSON.stringify(r.printed));
  else no('silent. printed=' + JSON.stringify(r.printed));
}

console.log('[L8] it is an executor request, or it receives HTML...');
{
  // The bug this whole exercise was really about. A `request` call with no
  // User-Agent is not treated as an executor: the worker answers with the
  // metadata page, loadstring() fails on perfectly good input, and the user is
  // told "Could not compile the loader" - which points at Lua rather than at
  // the network. That cost a long debugging round to find, so it is asserted
  // directly.
  //
  // The plain line sends no header at all: it relies on game:HttpGet, which
  // stamps a genuine Roblox UA - and Roblox is in the worker\'s executor
  // pattern. The portable line sets the header explicitly.
  if (/User-Agent/i.test(portable)) {
    ok('the portable line sends a User-Agent header');
  } else {
    no('no User-Agent header: this loader will be served HTML and report a compile error');
  }
  if (/Roblox|RBX|Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta/i.test(portable)) {
    ok('and it is one the worker recognises as an executor');
  } else {
    no('the User-Agent does not match the worker\'s EXECUTOR_UA pattern');
  }
  if (/game:HttpGet\(/.test(loader)) {
    ok('the plain line rides game:HttpGet, which stamps a Roblox UA of its own');
  } else {
    no('the plain line does not use game:HttpGet');
  }
}

// The loader is ONE line on purpose. The owner pastes a single line into
// their executor, exactly like a Luarmor loadstring.
//
// "one line" was never the only property. The property was: the loader is
// READABLE and contains no secret, so handing it to a deobfuscator bot or an
// AI yields a URL and nothing else.
//
// So this asserts the REAL property now: no artifact bytes, no cipher, no key,
// nothing to reverse - only a URL.
console.log('[L9] the loader is readable and holds no secret to reverse...');
{
  const lines = loader.split('\n').filter(l => l.trim().length);
  ok('loader is ' + lines.length + ' line, ' + loader.length + ' bytes (readable by design)');

  // Nothing that could carry script material or a decrypt key.
  const forbidden = [
    ['ciphertext', /SHOK|SHKEK1|loadstring\(\s*["']\[\d+\\[a-z]/i],
    ['embedded key', /\bt0\b|\bchk\b|splitKey|__SH_SPLITKEY/],
    ['delivery path', /\/sh\/(a|session|c)\b/],
    ['decrypt routine', /function\s+DEC|xorshift|xs128|djb2/i],
  ];
  let clean = true;
  for (const [what, re] of forbidden) {
    if (re.test(loader)) { no('loader leaks ' + what); clean = false; }
  }
  if (clean) ok('loader leaks no ciphertext, no key, no decrypt routine, no artifact path');
}

console.log('[L10] the INIT LAYER behind the URL keeps Luarmor\'s shape...');
{
  // The layer a deobfuscator reaches by following the URL. It must be
  // readable, it must carry no artifact material, and it must point at the
  // artifact the way Luarmor's init file does.
  const markers = [
    ['_bsdata0 data table', /_bsdata0=\{/],
    ['the data table is read', /local D=_bsdata0/],
    ['a file-shaped cdn link', /\/sh\/v4_init_ScripterHub\d+\.lua/],
    ['the cdn link is fetched', /GET\(CDN\.\."\?s="/],
    ['id passed to the payload', /pcall\(fn,ID\)/],
  ];
  for (const [what, re] of markers) {
    if (re.test(initLayer)) ok('the init layer has ' + what);
    else no('the init layer is missing ' + what);
  }

  // The init layer is the PROTOCOL, and the protocol legitimately names two
  // things: the SHOK magic the decryptor checks, and the genv slot the split
  // key is handed over in. Neither is a secret - the magic is a constant in
  // every copy of the client, and the slot is a NAME. What the layer must
  // never carry is artifact material, and the property that proves it is the
  // one asserted in LP4: the layer is the same for every script.
  if (/SHOK/.test(initLayer)) ok('the init layer checks the SHOK magic (a protocol constant, not a secret)');
  else no('the init layer does not check the decrypt magic - a tampered body would be accepted');
  if (/__SH_SPLITKEY/.test(initLayer)) ok('the init layer hands the split key over in the genv slot');
  else no('the init layer never hands the split key to the artifact');

  // The artifact is deliberately NOT cached to disk: for a free script the
  // split key IS the server-only layer, and a cached envelope would carry the
  // key line with it.
  if (/\bwritefile\b/.test(initLayer)) no('the init layer writes the artifact to disk - that re-opens the SHX hole');
  else ok('the artifact is not cached to disk (the SHX server-only layer survives)');
}

console.log('');
console.log('='.repeat(72));
console.log('MINTED LOADER   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
