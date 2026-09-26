// A keyless artifact must contain NO key-fetch code.
//
// The bug: main.js applied serverKey unconditionally, so a free script shipped
// with a final-layer key baked in that it could never obtain. The symptom was
//
//     [ScripterHub] Key response too short
//
// on a script whose gate worked and whose Lua compiled perfectly - the payload
// bailed at the `#PT < 3` check after a refused /sh/k fetch.
//
// The fix is one conditional in main.js. Asserting on that line is not enough:
// main.js is a browser bundle, and the thing that matters is the ARTIFACT. So
// this calls applyCustomObfuscator directly, both ways, and inspects the output.
//
// What it checks:
//   * a keyless build has no key URL baked in, and no "Key response too short"
//   * a PAID build still has both - so the fix is not "never use a split key"
//   * both are valid Lua 5.1
//   * both carry the obfuscation (the payload is not trivially readable)
//
// The paid case is the load-bearing one. A fix that simply stopped applying
// serverKey would make free scripts work and silently break every paid script,
// which is a bug that only reaches customers who paid.
import fs from 'node:fs';
import path from 'node:path';
import * as fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[KA] a keyless artifact is self-contained; a paid one is not');
console.log('-'.repeat(72));

const KEY_URL_MARK = 'sh/k';
const SHORT_MSG = 'Key response too short';

// the string the payload uses when /sh/k hands back something unusable
function builds(opts) {
  const dbg = {};
  const code = applyCustomObfuscator('print("hello")', opts, dbg);
  return { code: String(code), dbg };
}

function isLua(src) {
  const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;
  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  const rc = AUX.luaL_loadbuffer(st, fengari.to_luastring(src), null, fengari.to_luastring('@artifact'));
  if (rc !== 0) {
    const err = Buffer.from(fengari.lua_tojsstring(st, -1)).toString();
    LUA.lua_close(st);
    return { ok: false, err };
  }
  LUA.lua_close(st);
  return { ok: true };
}

// ---- keyless: no serverKey ---------------------------------------------
const free = builds({});
if (free.code.includes(KEY_URL_MARK)) {
  no('a keyless artifact has "' + KEY_URL_MARK + '" baked into it - it would try to fetch a key');
} else {
  ok('a keyless artifact contains no key URL');
}
if (free.code.includes(SHORT_MSG)) {
  no('a keyless artifact contains the "' + SHORT_MSG + '" path - it can still bail at runtime');
} else {
  ok('a keyless artifact contains no key-fetch failure path');
}
if (!free.dbg.splitKey || !free.dbg.splitKey.paddedKey) {
  ok('a keyless build reports no split key to the uploader');
} else {
  no('a keyless build still produced a split key');
}
const freeLua = isLua(free.code);
if (freeLua.ok) ok('a keyless artifact is valid Lua 5.1 (' + free.code.length + ' bytes)');
else no('a keyless artifact does not parse: ' + freeLua.err);

// ---- paid: serverKey still applied -------------------------------------
const paid = builds({ serverKey: { keyUrl: 'https://example.test/sh/k', scriptRef: 'ScripterHub0000000001' } });
if (paid.code.includes(SHORT_MSG)) ok('a PAID artifact still has the key-fetch path');
else no('a PAID artifact lost its key-fetch path - the fix is too broad');
if (paid.dbg.splitKey && paid.dbg.splitKey.paddedKey) ok('a PAID build still produces a split key for the worker');
else no('a PAID build no longer produces a split key - paid scripts are broken');
const paidLua = isLua(paid.code);
if (paidLua.ok) ok('a PAID artifact is valid Lua 5.1 (' + paid.code.length + ' bytes)');
else no('a PAID artifact does not parse: ' + paidLua.err);

// ---- both are still actually obfuscated --------------------------------
for (const [label, src] of [['keyless', free.code], ['paid', paid.code]]) {
  const hasRaw = src.includes('print("hello")');
  if (!hasRaw) ok('the ' + label + ' artifact does not contain the plaintext source');
  else no('the ' + label + ' artifact contains the plaintext source verbatim');
}

console.log('-'.repeat(72));
console.log('KEYLESS ARTIFACT   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
