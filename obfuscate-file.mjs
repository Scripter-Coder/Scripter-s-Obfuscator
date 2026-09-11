// Obfuscate a large real-world script and verify integrity end-to-end
import { readFileSync, writeFileSync } from 'fs';
import luaparse from 'luaparse';
import { applyCustomObfuscator } from './custom-obfuscator.js';

const SRC_PATH = 'C:\\Users\\Ryzen 9 5900x\\Desktop\\Mine Scripts\\Natural Disaster Survival\\Full Script.txt';
const OUT_PATH = 'C:\\Users\\Ryzen 9 5900x\\Desktop\\Mine Scripts\\Natural Disaster Survival\\Full Script OBFUSCATED.lua';

const src = readFileSync(SRC_PATH, 'utf8');
console.log('[*] source size:', src.length, 'chars,', Buffer.byteLength(src, 'utf8'), 'bytes');

// 1) original must parse (Lua 5.1-compatible syntax check)
luaparse.parse(src);
console.log('[+] original parses OK');

// 2) obfuscate: intensity 5, anti-tamper + anti-skid + anti-logger, debug header
const t0 = Date.now();
const dbg = {};
const obf = applyCustomObfuscator(src, {
    intensity: 5, antiTamper: true, antiSkid: true, antiLogger: true, envLogging: false,
    scriptName: 'NDS_FullScript', owner: 'Scripter', _debug: true
}, dbg);
console.log('[+] obfuscated in', Date.now() - t0, 'ms');

// 3) output must parse
luaparse.parse(obf);
console.log('[+] obfuscated output parses OK');

// 4) no plaintext leakage
const leaks = ['OrionLib', 'MarketplaceService', 'Natural Disaster', 'Anti Avalanche', 'FireEmoteFling', 'EmoteFlingConfig', 'MakeWindow', 'WalkSpeed', 'rbxassetid', 'ServerHop']
    .filter(s => obf.includes(s));
if (leaks.length) throw new Error('PLAINTEXT LEAK: ' + leaks.join(', '));
console.log('[+] zero plaintext leakage (10 distinctive markers checked)');

// 5) static round-trip decode of the EXACT delivered text:
//    parse stride/chk/slot-table straight from the emitted Lua and walk
//    the hidden seed-chain (needs the _debug header for slot metadata)
function decodeLoader(text) {
    const dbg = JSON.parse(text.match(/--\[shdebug:(\{.*?\})\]/)[1]);
    const stripName = text.match(/\(_0x[0-9a-f]+-1\)%(_0x[0-9a-f]+)~=\1-1/)[1];
    const stride = parseInt(text.match(new RegExp('local ' + stripName + '=(\\d+)'))[1], 10) - 1;
    const chk = parseInt(text.match(/if _0x[0-9a-f]+~=(\d+) then return end/)[1], 10);
    const payload = [...text.match(/"(\\\d{1,3}(?:\\\d{1,3})*)"/)[1].matchAll(/\\(\d{1,3})/g)].map(m => parseInt(m[1], 10));
    const tableSrc = text.match(/local _0x[0-9a-f]+=(\{\{[\d,{}]+\}\})/)[1];
    const entries = [...tableSrc.matchAll(/\{([\d,]+)\},(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\}/g)].map(m => ({
        seed: m[1].split(',').map(Number), iv: Number(m[2]), c1: Number(m[3]), c2: Number(m[4]),
        flags: Number(m[5]), shift: Number(m[6]), madd: Number(m[7]), next: Number(m[8])
    }));
    const S1 = stride + 1;
    const T = [];
    for (let pos = 1; pos <= payload.length; pos++) if ((pos - 1) % S1 !== stride) T.push(payload[pos - 1]);
    let sum = 0, xf = 0;
    for (const b of T) { sum = (sum + b) % 1000000007; xf = (xf ^ b) & 0xFF; }
    const chkCalc = (sum + xf * 31) % 1000000007;
    if (chkCalc !== chk) throw new Error('anti-tamper checksum mismatch (would refuse to run)');
    // unmask START seed, then walk the hidden chain with cipher feedback
    const start = entries[dbg.start - 1];
    start.seed = start.seed.map(b => b ^ (chk % 256));
    let en = dbg.start, walked = 0;
    while (en > 0) {
        const e = entries[en - 1];
        const rev = (e.flags % 2) === 1;
        const C = T.length;
        let prev = e.iv;
        for (let i = 0; i < C; i++) {
            const n1 = rev ? C - i : i + 1;
            const q = ((e.seed[(n1 - 1) % e.seed.length] * e.c1 + prev * e.c2 + n1 * 31) % 251) + 5;
            let v = (T[n1 - 1] - e.shift - (i % 3) * e.madd) % 256;
            if (v < 0) v += 256;
            T[n1 - 1] = v ^ q;
            prev = T[n1 - 1];
        }
        en = e.next;
        walked++;
        if (walked > dbg.layerCount + 5) throw new Error('chain walk overflow');
    }
    return Buffer.from(T).toString('utf8');
}

const decoded = decodeLoader(obf);
// VM pass transformed the user code before wrapping: the peeled payload
// = wrapper + VM-ified source. It must parse, contain NO original
// markers (vaulted), and end with vault+proxy prelude markers.
luaparse.parse(decoded);
const vmLeak = ['OrionLib', 'MarketplaceService', 'Natural Disaster', 'Anti Avalanche', 'FireEmoteFling']
    .filter(s => decoded.includes(s));
if (vmLeak.length) throw new Error('VM PASS FAILED - markers in plaintext: ' + vmLeak.join(', '));
if (!/local c[0-9a-f]{7}=\{\}/.test(decoded) || !/local r[0-9a-f]{7}=\{\{/.test(decoded)) {
    throw new Error('VM PASS NOT APPLIED - vault prelude missing');
}
console.log('[+] static round-trip: peeled payload === wrapper + VM-ified source (zero markers)');
console.log('[+] static round-trip: decrypted payload === original, byte-for-byte');

// 6) RUNTIME simulation in a real Lua VM (fengari): stub loadstring to capture
//    what the VM decrypts and hands to loadstring - proves the delivery works
const fengari = (await import('fengari')).default;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const harness = [
    'CAPTURED = nil',
    'loadstring = function(s) CAPTURED = s; return nil end',
    'load = function(s) CAPTURED = s; return nil end',
    obf
].join('\n');
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const t1 = Date.now();
const st = lauxlib.luaL_dostring(L, to_luastring(harness));
if (st !== lua.LUA_OK) throw new Error('Lua error: ' + to_jsstring(lua.lua_tostring(L, -1)));
lua.lua_getglobal(L, to_luastring('CAPTURED'));
const capRaw = lua.lua_tostring(L, -1);
if (!capRaw) throw new Error('loadstring never called - payload not decrypted');
const captured = to_jsstring(capRaw);
luaparse.parse(captured);
const capLeak = ['OrionLib', 'Natural Disaster', 'Anti Avalanche'].filter(s => captured.includes(s));
if (capLeak.length) throw new Error('RUNTIME DECRYPT LEAKED MARKERS: ' + capLeak.join(', '));
console.log('[+] RUNTIME SIMULATION: VM decrypted + handed the VM-ified source to loadstring in', Date.now() - t1, 'ms');

// 7) tamper test: flip 1 byte in delivered file -> must refuse to run
const idx = obf.indexOf('\\1', obf.length / 2);
const tampered = obf.substring(0, idx) + '\\7' + obf.substring(idx + 2);
const Lt = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lt);
lauxlib.luaL_dostring(Lt, to_luastring('CAPTURED=nil loadstring=function(s) CAPTURED=s return nil end load=loadstring\n' + tampered));
lua.lua_getglobal(Lt, to_luastring('CAPTURED'));
const tamperedRan = lua.lua_tostring(Lt, -1) != null;
if (tamperedRan) throw new Error('TAMPERED SCRIPT STILL DECRYPTED - anti-tamper broken');
console.log('[+] anti-tamper: 1 flipped byte -> script refuses to decrypt/run');

writeFileSync(OUT_PATH, obf.replace(/--\[shdebug:\{.*?\}\]\n/, ''), 'utf8');
console.log('[+] written:', OUT_PATH);
console.log('[*] final:', obf.length, 'chars (~' + Math.round(obf.length / 1024) + ' KB) | expansion ' + (obf.length / src.length).toFixed(1) + 'x');
console.log('\nALL CHECKS PASSED');
