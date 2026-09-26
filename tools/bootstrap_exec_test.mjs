// =============================================================================
// THE GENERATED BOOTSTRAP MUST ACTUALLY RUN
// =============================================================================
// THE BUG THIS EXISTS FOR
//
// A user ran a published loader and got:
//
//     invalid argument #1 to 'find' (string expected, got nil)
//
// The cause was in luaSessionBootstrap's SHK branch, which parsed the keyed
// delivery envelope like this:
//
//     local nl     = body:find("\n",5)   -- finds the newline ending the key line
//     local rest   = body:sub(nl+1)     -- the ciphertext
//     local second = rest:find("\n")    -- NIL. The ciphertext has no newline.
//     SK = rest:sub(1, second - 1)      -- arithmetic on nil -> chunk dies
//     B  = rest:sub(second + 1)
//
// The worker emits 'SHK\n' + keyLine + '\n' + ciphertext: EXACTLY ONE newline.
// The parser looked for two. So the keyed path - the paid path, the one every
// customer uses - had never run to completion. Not "rarely": never.
//
// WHY A REAL LUA VM AND NOT A STRING COMPARISON
//
// The bootstrap is a string worker.js CONSTRUCTS. Reading it proves nothing, and
// neither does asserting the text contains a substring - the broken version
// contained every substring worth checking. The only thing that catches this is
// EXECUTING the emitted Lua against a response the worker actually produces.
// fengari is a Lua 5.1 interpreter, 5.1 being the dialect executors run, so
// this is the closest thing to an executor that CI can do.
//
// WHAT IS ASSERTED
//
//   cipher  the JS cipher mirror is DIFFERENTIAL-checked against the Lua DEC
//           extracted from the generated bootstrap. A broken mirror reports
//           "Wrong Special Key", which is indistinguishable from a real
//           tampering rejection, so it must be impossible to miss.
//   B1      the generated bootstrap is valid Lua 5.1
//   B2      KEYLESS delivery hands loadstring exactly the payload  (SHL)
//   B3      KEYED delivery hands loadstring exactly the payload    (SHK - the bug)
//   B4      a wrong Special Key fails cleanly, not with a crash
//   B5      malformed envelopes report, never index nil
//   B6      a chain (SHG) response still parses
//   B7      with no `request` global it still works via game:HttpGet
//   B8      with no HTTP at all it reports and does not throw
//
// Run:  node tools/bootstrap_exec_test.mjs
// =============================================================================

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fengari from 'fengari';
import luaparse from 'luaparse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => path.join(ROOT, rel);

let pass = 0, fail = 0;
const problems = [];
const ok = (l) => { pass++; console.log('  OK   ' + l); };
const no = (l) => { fail++; problems.push(l); console.log('  FAIL ' + l); };

// -----------------------------------------------------------------------------
// Load the bootstrap generator out of worker.js
// -----------------------------------------------------------------------------
const workerSrc = fs.readFileSync(p('For Cloudflare/worker.js'), 'utf8');

const SPLITKEY_GENV = (() => {
  const m = workerSrc.match(/const SPLITKEY_GENV\s*=\s*'([^']+)'/);
  if (!m) throw new Error('SPLITKEY_GENV not found in worker.js');
  return m[1];
})();

// luaSessionBootstrap is deliberately NOT exported: adding an export to the
// production worker just to satisfy a test would widen the deployed file for a
// test's convenience. Extract it instead. If it is renamed or reshaped, the
// brace-match below fails loudly rather than silently testing nothing.
//
// THE EXTRACTOR UNDERSTANDS COMMENTS, and it has to. The first version tracked
// only string delimiters, so a ' or a " or a ` appearing anywhere in a COMMENT
// put it into string mode and it never came back out:
//
//     could not brace-match luaSessionBootstrap
//
// which reads like "the worker is malformed" and is actually "somebody wrote
// an apostrophe in a comment". Two separate comments did that in a row - the
// SCRIPT's error, and pcall(function() fn() end) in backticks. Avoiding
// particular characters in prose is not a fix; parsing comments properly is.
function extractBootstrapFn() {
  const start = workerSrc.indexOf('function luaSessionBootstrap(');
  if (start < 0) throw new Error('luaSessionBootstrap not found in worker.js');
  let i = workerSrc.indexOf('{', start);
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (; i < workerSrc.length; i++) {
    const c = workerSrc[i];
    const next = workerSrc[i + 1];

    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }

    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }

    // a '/' can begin a comment, or be division - but inside this function the
    // only '/' we care about is the start of a comment
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }

    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return workerSrc.slice(start, i + 1); }
  }
  throw new Error('could not brace-match luaSessionBootstrap');
}

const factory = new Function('SPLITKEY_GENV', extractBootstrapFn() + '\nreturn luaSessionBootstrap;')(SPLITKEY_GENV);

const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub1234567890';

// -----------------------------------------------------------------------------
// fengari helpers
// -----------------------------------------------------------------------------
// luaL_* helpers live on `lauxlib`. lua_pushlstring and friends live on `lua`.
// Getting this backwards costs a confusing "not a function" an hour later.
const LUA = fengari.lua;
const AUX = fengari.lauxlib;
const LIB = fengari.lualib;

const tls = (s) => fengari.to_luastring(s);

// Human-facing text. Falls back to a printable view so an error is legible.
const tjs = (s) => {
  if (s === null || s === undefined) return null;
  try { return fengari.to_jsstring(s); } catch { return '[non-utf8] ' + tbin(s); }
};

// BINARY. latin1 is a 1:1 byte map, so length and content both survive. Using
// the UTF-8 reader here made a correct delivery compare as 163 bytes against an
// expected 101.
const tbin = (s) => (s === null || s === undefined ? null : Buffer.from(s).toString('latin1'));

// fengari exposes LUA_REGISTRYINDEX as a CONSTANT on the lua module. There is no
// luaL_regindex() function, which is the obvious thing to reach for.
const REG = fengari.lua.LUA_REGISTRYINDEX;

// Push a JS string into Lua as RAW BYTES, not as UTF-8.
//
// Two details, both of which cost real time.
//
// 1. to_luastring UTF-8 encodes, so a ciphertext byte of 0x9E becomes two bytes
//    and the bootstrap decrypts the wrong thing - 105 bytes of cipher arrived in
//    Lua as 146. charCodeAt of a latin1 view IS the byte value, so
//    Buffer.from(s, 'latin1') is exactly the right buffer.
//
// 2. The API is called on the MODULE, not on the state. Inside a C function the
//    first parameter is the lua_State, and `state.lua_pushlstring` is undefined.
//    That raised "L.lua_pushlstring is not a function" INSIDE the callback, and
//    the bootstrap's own pcall swallowed it - so the visible symptom was
//    "Could not reach the license server", pointing at the network instead of at
//    the harness. Hence guard() below: a JS error in a cfunction is reported
//    rather than vanishing into somebody else's error handling.
const pushBytes = (L, s) => {
  const buf = Buffer.from(String(s), 'latin1');
  fengari.lua.lua_pushlstring(L, new Uint8Array(buf), buf.length);
};

// A JS error inside a cfunction is invisible by default: fengari lets it escape,
// the bootstrap's pcall catches it, and the user-visible message blames the
// network. Report it instead.
function guard(label, body) {
  return (s) => {
    try {
      return body(s);
    } catch (e) {
      console.error('    HARNESS ERROR in ' + label + ': ' + e.message);
      fengari.lua.lua_pushnil(s);
      return 1;
    }
  };
}

// -----------------------------------------------------------------------------
// The cipher, mirrored in JS so the harness can build a valid envelope
// -----------------------------------------------------------------------------
function xorMix(a, b) {
  a = a % 4294967296; b = b % 4294967296;
  let r = 0, p = 1;              // Lua: local r,p=0.0,1.0 - p MUST start at 1.0
  for (let i = 0; i < 32; i++) {
    const x = a % 2, y = b % 2;
    if (x !== y) r += p;
    a = (a - x) / 2; b = (b - y) / 2; p *= 2;
  }
  return r;
}
function seedOf(k, i) {
  let h = 5381.0 + i * 7;
  for (let j = 0; j < k.length; j++) h = ((h * 33 + k.charCodeAt(j)) % 4294967296);
  return h;
}

// The magic goes INSIDE the encrypted region, exactly as sh-crypto.js does:
//
//     const bytes = new TextEncoder().encode('SHOK' + text);
//
// Prepending 'SHOK' to the ALREADY-encrypted output shifts the keystream by four
// bytes, so DEC returns something whose first four characters are not the magic,
// and the bootstrap reports "Wrong Special Key" - a security verdict caused by
// an encryption bug in the harness.
function encrypt(specKey, payload) {
  const text = 'SHOK' + payload;
  const s = [seedOf(specKey, 0) || 1, seedOf(specKey, 1) || 2, seedOf(specKey, 2) || 3, seedOf(specKey, 3) || 4];
  let out = '';
  for (let i = 0; i < text.length; i++) {
    let x = s[0];
    x = xorMix(x, (x * 8192) % 4294967296);
    x = xorMix(x, Math.floor(x / 131072));
    x = xorMix(x, (x * 32) % 4294967296);
    s[0] = s[1]; s[1] = s[2]; s[2] = s[3]; s[3] = x;
    out += String.fromCharCode(xorMix(text.charCodeAt(i), x % 256) & 0xff);
  }
  return out;
}

// -----------------------------------------------------------------------------
// The payload the bootstrap is supposed to end up executing
// -----------------------------------------------------------------------------
const MARKER = 'SH_TEST_MARKER_RAN';
const PAYLOAD = 'local G=(getgenv and getgenv()) or _G\n' +
  'G.' + MARKER + '=1\n' +
  'G.SH_TEST_SPLITKEY_SLOT=' + JSON.stringify(SPLITKEY_GENV) + '\n';

// -----------------------------------------------------------------------------
// DIFFERENTIAL CIPHER CHECK - before any security assertion is evaluated
// -----------------------------------------------------------------------------
// Runs the bootstrap's OWN decrypt routine, extracted from the GENERATED Lua
// (not from worker.js, whose source holds Lua inside JS string literals), and
// compares the result against the JS mirror.
//
// ORDER MATTERS. Lua resolves an identifier when the enclosing function is
// COMPILED, so a `local B` declared AFTER `function DEC(...)` leaves the B inside
// DEC bound to the GLOBAL B, which is nil. The real bootstrap declares
// `local SK, B` before the cipher block, and the extracted block starts at
// `local function BX`, so that declaration has to be recreated in the same order.
console.log('[cipher] the JS mirror is checked against the real Lua DEC...');
{
  const generated = factory(ID, BASE, true);
  const cs = generated.indexOf('local function BX(a,b)');
  const ce = generated.indexOf('local src=B', cs);
  if (cs < 0 || ce < 0) { console.error('FATAL: cipher block not found in the generated bootstrap'); process.exit(2); }
  const cipherSrc = generated.slice(cs, ce);

  const K = 'mirror-check-key';
  const plain = 'the quick brown fox 0123456789 !@#$%^&*()';
  const ct = encrypt(K, plain);

  // Lua 5.1 has no \xNN and no \uNNNN, and JSON.stringify emits both, so a
  // ciphertext with any byte >= 0x80 will not compile. And a decimal escape must
  // be EXACTLY three digits: Lua reads digits while the accumulator is <= 255, so
  // "\10" followed by "4" is read as \104, not 10 then 52.
  const luaStr = (s) => '"' + [...s].map(c => '\\' + String(c.charCodeAt(0)).padStart(3, '0')).join('') + '"';

  const chunk = 'local B=' + luaStr(ct) + '\n' + cipherSrc + '\nreturn DEC(' + luaStr(K) + ')\n';

  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  if (AUX.luaL_loadstring(st, fengari.to_luastring(chunk)) !== 0) {
    console.error('FATAL: cipher check did not compile: ' + tjs(LUA.lua_tostring(st, -1)));
    process.exit(2);
  }
  if (LUA.lua_pcall(st, 0, 1, 0) !== 0) {
    console.error('FATAL: cipher check threw: ' + tjs(LUA.lua_tostring(st, -1)));
    process.exit(2);
  }
  const got = tbin(LUA.lua_tostring(st, -1));
  LUA.lua_close(st);

  if (got !== plain) {
    console.error('');
    console.error('FATAL: THE JS CIPHER MIRROR DISAGREES WITH THE LUA.');
    console.error('  lua decrypts to : ' + JSON.stringify(got));
    console.error('  js mirror built : ' + JSON.stringify(plain));
    console.error('  Every "Wrong Special Key" below would be THIS bug, not a');
    console.error('  protection failure. Do not go looking for an attacker.');
    process.exit(2);
  }
  ok('mirror verified - seeds, keystream and a full round trip all agree');
}

// -----------------------------------------------------------------------------
// Harness: run the generated Lua with mocked executor globals
// -----------------------------------------------------------------------------
function runBootstrap(lua, opts) {
  const state = AUX.luaL_newstate();
  LIB.luaL_openlibs(state);
  const notifications = [];
  const printed = [];
  const delivered = [];
  const genv = { ScripterHubKey: opts.license || 'TEST-LICENSE-KEY' };

  const setGlobal = (name, fn) => {
    LUA.lua_pushcfunction(state, fn);
    LUA.lua_setglobal(state, tls(name));
  };

  // getgenv: ONE persistent table in the registry. Returning a fresh table per
  // call meant the payload wrote its marker somewhere unobservable, which
  // reported as an ambiguous "never ran".
  if (opts.getgenv) {
    LUA.lua_newtable(state);
    for (const [k, v] of Object.entries(genv)) {
      LUA.lua_pushstring(state, tls(k));
      LUA.lua_pushstring(state, tls(String(v)));
      LUA.lua_rawset(state, -3);
    }
    LUA.lua_pushvalue(state, -1);
    const genvRef = AUX.luaL_ref(state, REG);
    setGlobal('getgenv', (s) => {
      LUA.lua_rawgeti(s, REG, genvRef);
      return 1;
    });
  }

  // game: a TABLE, not a function. The bootstrap calls it with colon syntax, and
  // a colon call is a field lookup on the receiver - a function has no fields,
  // which produced "attempt to index a function value (global 'game')".
  if (opts.httpGet) {
    LUA.lua_newtable(state);
    LUA.lua_pushcfunction(state, (ls) => {
      const url = tjs(LUA.lua_tostring(ls, 2));
      const body = opts.httpGet(url);
      if (body === null || body === undefined) { LUA.lua_pushnil(ls); return 1; }
      pushBytes(ls, String(body));
      return 1;
    });
    LUA.lua_setfield(state, -2, tls('HttpGet'));
    LUA.lua_pushcfunction(state, (ls) => {
      LUA.lua_newtable(ls);
      LUA.lua_pushcfunction(ls, (ss) => {
        LUA.lua_getfield(ss, 3, tls('Text'));
        const text = tbin(LUA.lua_tostring(ss, -1));
        LUA.lua_pop(ss, 1);
        if (text !== null) notifications.push(text);
        return 0;
      });
      LUA.lua_setfield(ls, -2, tls('SetCore'));
      return 1;
    });
    LUA.lua_setfield(state, -2, tls('GetService'));
    LUA.lua_setglobal(state, tls('game'));
  }

  if (opts.request) {
    setGlobal('request', (s) => {
      // capital U: the bootstrap sends { Url = ..., Method = ... }
      LUA.lua_getfield(s, 1, tls('Url'));
      const url = tjs(LUA.lua_tostring(s, -1));
      LUA.lua_pop(s, 1);
      const body = opts.request(url);
      LUA.lua_newtable(s);
      pushBytes(s, body === null || body === undefined ? '' : String(body));
      LUA.lua_setfield(s, -2, tls('Body'));
      LUA.lua_pushnumber(s, body === null || body === undefined ? 500 : 200);
      LUA.lua_setfield(s, -2, tls('StatusCode'));
      return 1;
    });
  }

  // print: capture what the user would actually see.
  //
  // DIE() does BOTH a notification and a print. The notification goes through
  // game:GetService("StarterGui"):SetCore, which only exists when a `game` mock
  // is supplied, so a case with no transport could not assert on it - the
  // message went to the real stdout and the notifications array stayed empty.
  // Capturing print makes the user-visible text assertable in every case, and it
  // is the text a user reads when something fails.
  setGlobal('print', (s) => {
    LUA.lua_tostring(s, 1);
    const line = tbin(LUA.lua_tostring(s, -1));
    LUA.lua_pop(s, 1);
    if (line !== null) printed.push(line);
    return 0;
  });

  if (opts.identifyexecutor) {
    setGlobal('identifyexecutor', (s) => { LUA.lua_pushstring(s, tls('Fluxus')); return 1; });
  }

  // loadstring: the real thing, plus a record of what it was handed. A Lua chunk
  // IS a function, so the compiled chunk is returned directly. An earlier version
  // also pushed a C closure, so "return 1" returned the closure - whose body
  // called lua_call(0), i.e. itself - and the payload never ran.
  setGlobal('loadstring', (s) => {
    const src = tbin(LUA.lua_tostring(s, 1));
    if (src === null) { LUA.lua_pushnil(s); return 1; }
    delivered.push(src);
    if (AUX.luaL_loadstring(s, tls(src)) !== 0) { LUA.lua_pop(s, 1); LUA.lua_pushnil(s); return 1; }
    return 1;
  });

  const finish = (extra) => {
    LUA.lua_close(state);
    return Object.assign({ delivered, notifications, printed, genv }, extra);
  };

  if (AUX.luaL_loadstring(state, tls(lua)) !== 0) {
    return finish({ compileError: tjs(LUA.lua_tostring(state, -1)) });
  }
  if (LUA.lua_pcall(state, 0, 0, 0) !== 0) {
    return finish({ runtimeError: tjs(LUA.lua_tostring(state, -1)) });
  }
  return finish({});
}

// -----------------------------------------------------------------------------
console.log('[B1] the generated bootstrap is valid Lua 5.1...');
// -----------------------------------------------------------------------------
{
  let bad = null;
  for (const [label, keyless] of [['keyless', true], ['keyed', false]]) {
    try { luaparse.parse(factory(ID, BASE, keyless)); }
    catch (e) { bad = label + ': ' + e.message; }
  }
  if (bad) no(bad);
  else ok('both the keyless and keyed forms parse');
}

// -----------------------------------------------------------------------------
console.log('[B2] KEYLESS delivery hands loadstring the payload  (SHL envelope)...');
// -----------------------------------------------------------------------------
{
  const body = 'SHL\n' + PAYLOAD;
  const r = runBootstrap(factory(ID, BASE, true), {
    request: (url) => url.includes('/sh/session') ? 'SHS sid123 nonce456 1700000000' : body,
    getgenv: true, identifyexecutor: true
  });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.delivered.length === 1 && r.delivered[0] === PAYLOAD)
    ok('session minted, envelope parsed, loadstring got EXACTLY the payload (' + r.delivered[0].length + ' bytes)');
  else if (r.delivered.length === 1)
    no('loadstring got ' + r.delivered[0].length + ' bytes, expected ' + PAYLOAD.length);
  else
    no('loadstring never called. notif: ' + JSON.stringify(r.notifications));
}

// -----------------------------------------------------------------------------
console.log('[B3] KEYED delivery hands loadstring the payload  (SHK - the bug)...');
// -----------------------------------------------------------------------------
{
  const SPEC = 'my-special-key';
  const keyLine = '1790442165935 4242 ' + [11, 22, 33, 44, 55, 66, 77, 88].join(' ');
  // EXACTLY the worker's format: ONE newline, terminating the key line.
  const body = 'SHK\n' + keyLine + '\n' + encrypt(SPEC, PAYLOAD);
  const r = runBootstrap(factory(ID, BASE, false), {
    request: (url) => url.includes('/sh/session') ? 'SHS sid123 nonce456 1700000000' : body,
    license: SPEC,
    getgenv: true, identifyexecutor: true
  });
  if (r.compileError) no('compile error: ' + r.compileError);
  else if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.delivered.length === 1 && r.delivered[0] === PAYLOAD)
    ok('key line parsed, ciphertext decrypted, loadstring got EXACTLY the payload (' + r.delivered[0].length + ' bytes)');
  else if (r.delivered.length === 1)
    no('loadstring got ' + r.delivered[0].length + ' bytes, expected the decrypted ' + PAYLOAD.length);
  else
    no('loadstring never called - the delivery did not decrypt. notif: ' + JSON.stringify(r.notifications));
}

// -----------------------------------------------------------------------------
console.log('[B4] a wrong Special Key fails cleanly, not with a crash...');
// -----------------------------------------------------------------------------
{
  const body = 'SHK\n' + '1790442165935 4242 11 22 33' + '\n' + encrypt('the-right-key', PAYLOAD);
  const r = runBootstrap(factory(ID, BASE, false), {
    request: (url) => url.includes('/sh/session') ? 'SHS s n 1700000000' : body,
    license: 'the-wrong-key',
    getgenv: true, identifyexecutor: true
  });
  // Assert on what the USER sees. DIE() both raises a notification and prints,
  // but the notification needs a `game` mock and this case has none, so `printed`
  // is the reliable signal.
  const said = r.printed.concat(r.notifications);
  const clean = !r.compileError && !r.runtimeError && r.delivered.length === 0 &&
    said.some(n => /Special Key|tampered/i.test(n));
  if (clean) ok('reports "Wrong Special Key" instead of dying: ' + JSON.stringify(said));
  else no('expected a clean rejection. err=' + (r.runtimeError || r.compileError) +
    ' delivered=' + r.delivered.length + ' said=' + JSON.stringify(said));
}

// -----------------------------------------------------------------------------
console.log('[B5] malformed envelopes report instead of indexing nil...');
// -----------------------------------------------------------------------------
{
  const cases = [
    ['SHK, no key line at all', 'SHK\njustciphertextwithnolnewline'],
    ['SHK, no newline at all', 'SHK\nonlyciphertext'],
    ['SHG, no newline', 'SHG 2 root gen'],
    ['empty body', ''],
    ['garbage', 'nonsense']
  ];
  const broken = [];
  for (const [label, body] of cases) {
    const r = runBootstrap(factory(ID, BASE, false), {
      request: (url) => url.includes('/sh/session') ? 'SHS s n 1700000000' : body,
      getgenv: true, identifyexecutor: true
    });
    if (r.compileError || r.runtimeError) broken.push(label + ' -> ' + (r.runtimeError || r.compileError));
  }
  if (broken.length === 0) ok(cases.length + ' malformed envelopes all report, none crash on nil');
  else { no(broken.length + ' malformed envelope(s) produced a raw Lua error:'); for (const b of broken) console.log('         ' + b); }
}

// -----------------------------------------------------------------------------
console.log('[B6] a chain (SHG) response still parses...');
// -----------------------------------------------------------------------------
{
  const body = 'SHG 2 https://x/root gen99\n1790442165935 4242 11 22 33\n';
  const r = runBootstrap(factory(ID, BASE, false), {
    request: (url) => url.includes('/sh/session') ? 'SHS s n 1700000000' : body,
    httpGet: () => 'part-bytes',
    getgenv: true, identifyexecutor: true
  });
  if (r.runtimeError || r.compileError) no('crashed: ' + (r.runtimeError || r.compileError));
  else ok('chain header parsed without crashing');
}

// -----------------------------------------------------------------------------
console.log('[B7] with no `request` global it still works via game:HttpGet...');
// -----------------------------------------------------------------------------
{
  const SPEC = 'my-special-key';
  const body = 'SHK\n' + '1790442165935 4242 11 22 33' + '\n' + encrypt(SPEC, PAYLOAD);
  const r = runBootstrap(factory(ID, BASE, false), {
    // deliberately no request: only the HttpGet fallback exists
    httpGet: (url) => url.includes('/sh/session') ? 'SHS sid123 nonce456 1700000000' : body,
    license: SPEC,
    getgenv: true, identifyexecutor: true
  });
  if (r.runtimeError) no('runtime error: ' + r.runtimeError);
  else if (r.delivered.length === 1 && r.delivered[0] === PAYLOAD)
    ok('degraded to the HttpGet transport and still delivered the exact payload');
  else
    no('did not deliver the payload without a request global. delivered=' + r.delivered.length +
      ' notif: ' + JSON.stringify(r.notifications));
}

// -----------------------------------------------------------------------------
console.log('[B8] with no HTTP at all it reports and does not throw...');
// -----------------------------------------------------------------------------
{
  const r = runBootstrap(factory(ID, BASE, true), { getgenv: true, identifyexecutor: true });
  if (r.runtimeError) no('threw with no transport available: ' + r.runtimeError);
  else if (r.delivered.length) no('delivered a payload with no transport, which should be impossible');
  else ok('reports "Could not reach the license server" and returns cleanly');
}

console.log('');
console.log('='.repeat(72));
console.log('BOOTSTRAP EXECUTION   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
if (fail) {
  console.log('');
  console.log('  This runs the Lua the worker actually emits, on a real Lua 5.1');
  console.log('  interpreter, against envelopes built the way the worker builds');
  console.log('  them. A substring assertion could not have caught the keyed-path bug -');
  console.log('  the broken version contained every substring worth checking.');
  console.log('');
  for (const pr of problems) console.log('  ' + pr);
  process.exit(1);
}
