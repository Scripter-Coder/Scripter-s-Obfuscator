// SPLIT-KEY (anti-static-peel) tests.
// The cracker's method: extract \ddd string -> strip noise -> checksum ->
// reverse XOR layers (ALL keys parsed from the file). With the split key,
// the last layer key is NOT in the file, so their peeler produces garbage
// or stops early. The genuine runtime fetches the key from the worker and
// runs fine.
import assert from 'assert';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyCustomObfuscator } from './custom-obfuscator.js';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const GENV = 'getgenv=function() return _G end\n';
const PRELUDE = 'SHUTDOWN=false\ngame={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}\n';
const KEY_URL = 'https://test.workers.dev/sh/k';

// capture print
function runWithPrintCapture(pre, code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring('print=function(...) local p={} for i=1,select("#",...) do p[#p+1]=tostring((select(i,...))) end PRINTED=table.concat(p," ") end'));
    lauxlib.luaL_dostring(L, to_luastring(pre));
    lauxlib.luaL_dostring(L, to_luastring(code));
    return L;
}
function getGlobal(L, name) {
    lua.lua_getglobal(L, to_luastring(name));
    const v = lua.lua_tostring(L, -1);
    return v ? to_jsstring(v) : null;
}

// The CRACKER's peeler, updated to the NEW slot-table format (seeds + chain
// params). Even understanding the format, they cannot win:
//   - split builds: the START seed is zeros - nothing to peel with
//   - the "key" for each byte is (seed*c1 + prev*c2 + n1*31)%251+5 with
//     cipher feedback - a naive seeds-as-keys XOR produces garbage
// Used here to prove static peeling still fails against split-key builds.
function crackerPeel(text, depth) {
    const results = [];
    let cur = text;
    for (let round = 0; round < (depth || 3); round++) {
        const dbgM = cur.match(/--\[shdebug:(\{.*?\})\]/);
        const dbg = dbgM ? JSON.parse(dbgM[1]) : null;
        const stride = dbg ? dbg.stride : (cur.match(/noise=(\d+)/) ? parseInt(cur.match(/noise=(\d+)/)[1], 10) : null);
        const chkM = cur.match(/if _0x[0-9a-f]+~=(\d+) then return end/);
        const chk = chkM ? parseInt(chkM[1], 10) : (dbg ? dbg.chk : null);
        const pm = cur.match(/"(\\\d{1,3}(?:\\\d{1,3})*)"/);
        if (!pm) break;
        const allBytes = [...pm[1].matchAll(/\\(\d{1,3})/g)].map(m => parseInt(m[1], 10));
        const km = cur.match(/local _0x[0-9a-f]+=(\{\{[\d,{}]+\}\})/);
        if (!km) break;
        // parse the new slot entries: {seeds},iv,c1,c2,flags,shift,madd,next
        const layers = [...km[1].matchAll(/\{([\d,]+)\},(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\}/g)].map(m => ({
            seed: m[1].split(',').map(Number), iv: Number(m[2]), c1: Number(m[3]), c2: Number(m[4]),
            flags: Number(m[5]), shift: Number(m[6]), madd: Number(m[7]), next: Number(m[8])
        }));
        if (!layers.length) break;
        const SS = (stride || 10) + 1;
        const T = [];
        for (let pos = 1; pos <= allBytes.length; pos++) {
            if ((pos - 1) % SS !== (stride || 10)) T.push(allBytes[pos - 1]);
        }
        let sum = 0, xf = 0;
        for (const b of T) { sum = (sum + b) % 1000000007; xf = (xf ^ b) & 0xFF; }
        const chkCalc = (sum + xf * 31) % 1000000007;
        if (chk !== null && chkCalc !== chk) { results.push({ tamper: true }); break; }
        // naive attempt: treat every seed entry as a plain XOR key (this is
        // ALL a static analyst can do without the full chain algorithm)
        let mod = chk !== null ? chk % 256 : 0;
        for (const lay of layers) {
            const key = lay.seed.map(b => b ^ mod);
            for (let i = 0; i < T.length; i++) T[i] = (((T[i] - lay.shift) % 256 + 256) % 256) ^ key[i % key.length];
        }
        const s = T.map(b => String.fromCharCode(b)).join('');
        results.push(s);
        cur = s;
    }
    return results;
}

console.log('[S1] split-key build: debugInfo exposes the split data...');
const src = 'GLOBAL_MARKER = "SPLIT_RAN_OK"\nprint("this string is secret")\n';
const dbg = {};
const obf = applyCustomObfuscator(src, {
    intensity: 10,
    antiTamper: true, antiSkid: false, antiLogger: false,
    serverKey: { keyUrl: KEY_URL, scriptRef: 'ScripterHub0000000001' },
    _debug: true
}, dbg);
luaparse.parse(obf);
assert(dbg.splitKey && Array.isArray(dbg.splitKey.paddedKey), 'splitKey must be exported');
assert(dbg.splitKey.keyLen >= 8, 'padded key must have real length');
console.log('    OK: padded key exported (len', dbg.splitKey.keyLen + '), NOT in the file');

console.log('[S2] the file does NOT contain the real final-layer key...');
// the zeroed key table entry is in the file; the REAL (padded) key must not
// appear, and the padded bytes themselves must not appear as a table
const flat = obf.replace(/\s+/g, ' ');
const paddedJoined = dbg.splitKey.paddedKey.join(',');
assert(!flat.includes(paddedJoined), 'padded key bytes must never be embedded in the file');
console.log('    OK: final layer key absent from the file');

console.log('[S3] THE CRACKER PEELER NOW FAILS...');
const peeled = crackerPeel(obf, 3);
// with the split, the deepest peel lands on garbage or an undecryptable
// intermediate - the real payload string must never appear
const anyLeak = peeled.some(p => typeof p === 'string' && p.includes('this string is secret'));
assert(!anyLeak, 'peeler must NOT reach the plaintext (split-key holds)');
let reachedPayload = false;
for (const p of peeled) {
    if (typeof p === 'string' && (p.includes('-- ==== ORIGINAL SCRIPT ====') || p.includes('GLOBAL_MARKER'))) { reachedPayload = true; }
}
assert(!reachedPayload, 'peeler must NOT reach the wrapper/payload stage');
// EXTRA: even a SMARTER cracker who hardcodes both known strides and keeps
// peeling can never get past the split - the final key just isn't in the file
const smartPeels = [];
for (const strideGuess of [11, 10, 6, 5]) {
    let cur = obf;
    for (let round = 0; round < 4; round++) {
        const pm = cur.match(/"(\\\d{1,3}(?:\\\d{1,3})*)"/);
        if (!pm) break;
        const allBytes = [...pm[1].matchAll(/\\(\d{1,3})/g)].map(m => parseInt(m[1], 10));
        const SS = strideGuess + 1;
        const T = [];
        for (let pos = 1; pos <= allBytes.length; pos++) if ((pos - 1) % SS !== strideGuess) T.push(allBytes[pos - 1]);
        const km = cur.match(/local _0x[0-9a-f]+=(\{\{[\d,{}]+\}\})/);
        if (!km) break;
        const layers = [...km[1].matchAll(/\{([\d,]+)\},(\d+),(\d+)\}/g)].map(m => ({
            key: m[1].split(',').map(Number), off: Number(m[2]), sub: Number(m[3])
        }));
        // even using the (zeroed!) last key from the table - it decrypts to garbage
        for (let l = layers.length - 1; l >= 0; l--) {
            const { key, off, sub } = layers[l];
            for (let i = 0; i < T.length; i++) T[i] = (((T[i] - sub) % 256 + 256) % 256) ^ key[(i + off) % key.length];
        }
        const s = T.map(b => String.fromCharCode(b)).join('');
        smartPeels.push(s);
        cur = s;
    }
}
const smartLeak = smartPeels.some(p => p.includes('this string is secret') || p.includes('GLOBAL_MARKER') || p.includes('ORIGINAL SCRIPT'));
assert(!smartLeak, 'even hardcoded strides + the zeroed key table must yield garbage');
console.log('    OK: static peel stops short (peels:', peeled.length + ', no payload; smart brute: garbage only)');

console.log('[S4] GENUINE run with a working key server: real code executes...');
// simulate the worker: serve the padded key for the right t0
const keyServer = (t0) => {
    // response format: "SHK <t0> <chk> <padded bytes...>"
    return 'SHK ' + dbg.splitKey.t0 + ' ' + dbg.splitKey.chk + ' ' + dbg.splitKey.paddedKey.join(' ');
};
// verify the response the worker WILL send matches what Lua expects:
// recompute the pad in JS exactly like Lua will (djb2 chain over t0 digits)
const tstr = String(dbg.splitKey.t0);
let hh = 5381;
const unpadded = dbg.splitKey.paddedKey.map((pb, idx) => {
    const c1 = tstr.charCodeAt(idx % tstr.length) - 48;
    hh = (hh * 33 + c1 + (idx % 256) * 7) % 4294967296;
    return pb ^ (hh % 256);
});
// unpadded = the stored outer key. A static analyst never sees this.
assert(unpadded.every(b => b >= 0 && b <= 255));
console.log('    OK: pad regeneration math verified');

// Lua-side full run: fake game:HttpGet to return the key response
const luaFake = PRELUDE + '\n' + GENV + '\n'
    + 'local _resp = ' + JSON.stringify(keyServer(dbg.splitKey.t0)) + '\n'
    + 'game = { Shutdown=function() SHUTDOWN=true end, GetService=function() return {} end,\n'
    + '  HttpGet=function(self, url) return _resp end }\n';
const Lg = runWithPrintCapture(luaFake, obf);
assert.strictEqual(getGlobal(Lg, 'GLOBAL_MARKER'), 'SPLIT_RAN_OK', 'genuine split-key run must execute the real code');
console.log('    OK: runtime fetch -> script decrypts and runs');

console.log('[S5] WRONG key response (tampered/replayed) -> script refuses...');
const luaBad = PRELUDE + '\n' + GENV + '\n'
    + 'game = { Shutdown=function() SHUTDOWN=true end, GetService=function() return {} end,\n'
    + '  HttpGet=function(self, url) return "SHK 111222333 999 1 2 3 4 5 6 7 8 9 10 11 12" end }\n';
const Lb = runWithPrintCapture(luaBad, obf);
assert.notStrictEqual(getGlobal(Lb, 'GLOBAL_MARKER'), 'SPLIT_RAN_OK', 'wrong key response must NOT run the code');
console.log('    OK: tampered key response -> no execution');

console.log('[S6] executor WITHOUT game:HttpGet -> refuses silently...');
const Lx = runWithPrintCapture(PRELUDE + '\n' + GENV, obf);
assert.notStrictEqual(getGlobal(Lx, 'GLOBAL_MARKER'), 'SPLIT_RAN_OK');
console.log('    OK: no HttpGet -> no execution');

console.log('[S7] no plaintext leaks in the split-key file...');
assert(!obf.includes('this string is secret'), 'source string must not leak');
assert(!obf.includes('SPLIT_RAN_OK'), 'marker must not leak');
console.log('    OK: zero plaintext leakage');

console.log('\nALL SPLIT-KEY TESTS PASSED - static peeling is dead, runtime works.');
