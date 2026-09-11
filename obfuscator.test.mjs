// Verification test for the ScripterHub Custom Obfuscator.
// 1) Generates obfuscated Lua (single + double wrapped)
// 2) Verifies the original source never appears in plaintext
// 3) Re-implements the Lua runtime algorithm in JS and round-trip
//    decodes the generated output back to the original payload
// 4) Validates Lua syntax of every generated artifact with luaparse
import assert from 'assert';
import luaparse from 'luaparse';
import { applyCustomObfuscator } from './custom-obfuscator.js';

globalThis.window = globalThis;

const sample = `-- my secret script
local Players = game:GetService("Players")
local msg = "Hello, secret string!"
print(msg, Players.LocalPlayer.Name)
for i = 1, 10 do
    print("count: " .. i)
end
local function add(a, b) return a + b end
print(add(2, 3))
`;

const opts = {
    intensity: 5,
    antiTamper: true,
    antiSkid: true,
    envLogging: true,
    webhookUrl: 'https://discord.com/api/webhooks/test/hook',
    scriptName: 'TestScript',
    scriptId: 'script_test',
    owner: 'Scripter',
    _debug: true
};

function bytesToUtf8(bytes) {
    const s = bytes.map(b => String.fromCharCode(b)).join('');
    return decodeURIComponent(escape(s));
}

// JS transcription of the generated slot-chain VM (strip noise, checksum,
// unmask START seed, walk the hidden linked list reversing each chain
// layer with cipher feedback) - decodes a loader text back to its source
function decodeLoader(text) {
    const dbgMatch = text.match(/--\[shdebug:(\{.*?\})\]/);
    assert(dbgMatch, 'shdebug header found');
    const dbg = JSON.parse(dbgMatch[1]);

    const payloadMatch = text.match(/"(\\\d{1,3}(?:\\\d{1,3})*)"/);
    assert(payloadMatch, 'payload string found');
    const allBytes = [...payloadMatch[1].matchAll(/\\(\d{1,3})/g)].map(m => parseInt(m[1], 10));

    // slot table: {seed,iv,c1,c2,flags,shift,madd,next} per entry
    const tableMatch = text.match(/local _0x[0-9a-f]+=(\{\{[\d,{}]+\}\})/);
    assert(tableMatch, 'slot table found');
    const entries = [...tableMatch[1].matchAll(/\{([\d,]+)\},(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\}/g)].map(m => ({
        seed: m[1].split(',').map(Number), iv: Number(m[2]), c1: Number(m[3]), c2: Number(m[4]),
        flags: Number(m[5]), shift: Number(m[6]), madd: Number(m[7]), next: Number(m[8])
    }));

    // strip noise (junk where (pos-1) % (stride+1) == stride, 1-based pos)
    const S1 = dbg.stride + 1;
    const T = [];
    for (let pos = 1; pos <= allBytes.length; pos++) {
        if ((pos - 1) % S1 !== dbg.stride) T.push(allBytes[pos - 1]);
    }

    // checksum
    let sum = 0, xf = 0;
    for (const b of T) { sum = (sum + b) % 1000000007; xf = (xf ^ b) & 0xFF; }
    const chk = (sum + xf * 31) % 1000000007;
    assert.strictEqual(chk, dbg.chk, 'runtime checksum matches emitted checksum');

    // unmask START seed (stored XOR chk%256), then walk the hidden chain
    const mod = chk % 256;
    let entry = entries[dbg.start - 1];
    entry.seed = entry.seed.map(b => b ^ mod);
    let en = dbg.start;
    let count = 0;
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
        count++;
        if (count > dbg.layerCount + 5) throw new Error('chain walk overflow - corrupt table');
    }
    assert.strictEqual(count, dbg.layerCount, 'walked exactly the real chain (decoys skipped)');
    return bytesToUtf8(T);
}

// ============ RUN ============
// vault markers: every VM pass emits a memo cache table + refs table
function applyVmPassMarker() {
    // stable shape: `local c???????={}` (cache) + `local r???????={{`
    return /local c[0-9a-f]{7}=\{\}\nlocal r[0-9a-f]{7}=\{\{/;
}
assert(applyVmPassMarker().test('local c1234567={}\nlocal r7654321={{1,2}}'), 'marker regex sanity');
assert(applyVmPassMarker().test('local cabcdef0={}\nlocal r1234567={{'), 'hex sanity');

console.log('[1] Generating single-wrap output (intensity 5)...');
const out5 = applyCustomObfuscator(sample, opts);
assert(!out5.includes('Hello, secret string!'), 'source string must not leak');
assert(!out5.includes('LocalPlayer'), 'identifiers must not leak');
assert(!out5.includes('count: '), 'other strings must not leak');
luaparse.parse(out5);
console.log('    OK: no plaintext, valid Lua syntax, size =', out5.length, 'chars');

console.log('[2] Round-trip decode (single wrap)...');
const decoded1 = decodeLoader(out5);
luaparse.parse(decoded1);
const esc = s => [...unescape(encodeURIComponent(s))].map(c => '\\' + c.charCodeAt(0)).join('');
assert(decoded1.includes('-- ==== ORIGINAL SCRIPT ===='));
assert(decoded1.includes(esc('https://discord.com/api/webhooks/test/hook')), 'env logging webhook embedded');
assert(decoded1.includes('ScripterHub Log :: '), 'env logging block present');
// VM PASS: the peeled payload is now VM-ified code, not the original
// source. What must hold: it PARSES and the ORIGINAL strings are ABSENT
// (vaulted). Verifying execution equivalence happens in the fengari
// runtime tests below ([7] etc).
assert(!decoded1.includes('Hello, secret string!'), 'source string must be vaulted away');
assert(applyVmPassMarker().test(decoded1), 'vm vault present (sanity)');
console.log('    OK: decoded payload = wrapper + VM-ified original (strings vaulted)');

console.log('[3] Generating double-wrap output (intensity 10)...');
const out10 = applyCustomObfuscator(sample, { ...opts, intensity: 10 });
assert(!out10.includes('Hello, secret string!'));
luaparse.parse(out10);
console.log('    OK: no plaintext, valid Lua syntax, size =', out10.length, 'chars');

console.log('[4] Round-trip decode (double wrap)...');
const inner = decodeLoader(out10);
luaparse.parse(inner);
const payload = decodeLoader(inner);
luaparse.parse(payload);
// VM pass: peeled result is VM-ified, not the raw sample
assert(!payload.includes('Hello, secret string!'), 'double-wrapped: source must be vaulted away');
assert(applyVmPassMarker().test(payload), 'double-wrapped decode yields VM-ified original');
console.log('    OK: fully decoded through 2 shells (strings vaulted)');

console.log('[5] Minimal options (all protections off, intensity 1)...');
const outMin = applyCustomObfuscator(sample, { intensity: 1, antiTamper: false, antiSkid: false, _debug: true });
assert(!outMin.includes('Hello, secret string!'));
luaparse.parse(outMin);
const decodedMin = decodeLoader(outMin);
luaparse.parse(decodedMin);
assert(!decodedMin.includes('Hello, secret string!'), 'minimal: source must be vaulted');
console.log('    OK: minimal config round-trips (VM-ified)');

console.log('[6] Uniqueness (every generation differs)...');
const a = applyCustomObfuscator(sample, { intensity: 5 });
const b = applyCustomObfuscator(sample, { intensity: 5 });
assert(a !== b, 'each generation must be unique');
console.log('    OK: outputs are unique per generation');

// ============ REAL RUNTIME EXECUTION (fengari = Lua 5.3 VM) ============
const fengari = (await import('fengari')).default;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

// Roblox-like prelude: fakes the executor env. `game:Shutdown()` flips SHUTDOWN.
// NOTE: fengari has a real debug.getinfo, so native functions report what="C"
// exactly like executor C functions - the hook check works without tostring tricks.
const PRELUDE = [
    'SHUTDOWN=false',
    'game={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}',
    'MARKER=nil'
].join('\n');

function runLua(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(PRELUDE));
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const err = to_jsstring(lua.lua_tostring(L, -1));
        throw new Error('Lua runtime error: ' + err);
    }
    return L;
}

console.log('[7] REAL EXECUTION of obfuscated script in Lua VM (single wrap)...');
// game-free script so it can run outside Roblox; anti-skid off (no game/executor here)
const runnable = 'GLOBAL_MARKER = "RAN_OK_7355608"\nlocal x = 0\nfor i = 1, 10 do x = x + i end\nassert(x == 55, "math broken")\n';
const outRun = applyCustomObfuscator(runnable, { intensity: 5, antiTamper: true, antiSkid: false });
const t0 = Date.now();
const L = runLua(outRun);
lua.lua_getglobal(L, to_luastring('GLOBAL_MARKER'));
const marker = to_jsstring(lua.lua_tostring(L, -1));
assert.strictEqual(marker, 'RAN_OK_7355608', 'script must actually execute after decryption');
console.log('    OK: decrypted + executed in', Date.now() - t0, 'ms (marker =', marker + ')');

console.log('[8] REAL EXECUTION of double-wrapped script (intensity 10)...');
const outRun10 = applyCustomObfuscator(runnable, { intensity: 10, antiSkid: false });
const t1 = Date.now();
const L2 = runLua(outRun10);
lua.lua_getglobal(L2, to_luastring('GLOBAL_MARKER'));
const marker2 = to_jsstring(lua.lua_tostring(L2, -1));
assert.strictEqual(marker2, 'RAN_OK_7355608', 'double-wrapped script must execute');
console.log('    OK: decrypted through 2 shells + executed in', Date.now() - t1, 'ms');

console.log('[9] Anti-tamper: flipping ONE byte must break the script...');
const t9dbg = {};
const outRun9 = applyCustomObfuscator(runnable, { intensity: 5, antiTamper: true, antiSkid: false, _debug: true }, t9dbg);
const t9stride = t9dbg ? (JSON.parse(outRun9.match(/--\[shdebug:(\{.*?\})\]/)[1]).stride) : 19;
const tampered = outRun9.replace(/"(\\\d{1,3}(?:\\\d{1,3})*)"/, (m) => {
    // flip a REAL payload byte: noise bytes sit at every (stride+1)th
    // position; flipping those does nothing (they are stripped). Pick the
    // middle-most NON-noise byte so the flip always changes the payload.
    const seqs = [...m.matchAll(/\\\d{1,3}/g)].map(x => ({ i: x.index, s: x[0] }));
    const SS = t9stride + 1;
    for (let off = 0; off < seqs.length; off++) {
        for (const cand of [Math.floor(seqs.length / 2) + off, Math.floor(seqs.length / 2) - off]) {
            if (cand < 0 || cand >= seqs.length) continue;
            const pos1 = cand + 1; // 1-based position of this byte
            if ((pos1 - 1) % SS === t9stride) continue; // noise position - skip
            const s = seqs[cand];
            const flipped = s.s.startsWith('\\9') ? s.s.replace(/9/, '8') : s.s.replace(/\\(\d?)/, '\\9');
            if (flipped !== s.s) return m.slice(0, s.i) + flipped + m.slice(s.i + s.s.length);
        }
    }
    return m.replace(/\\(\d)/, '\\9');
});
assert(tampered !== outRun9, 'tampering applied');
const Lt = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lt);
lauxlib.luaL_dostring(Lt, to_luastring(PRELUDE));
const statusT = lauxlib.luaL_dostring(Lt, to_luastring(tampered));
lua.lua_getglobal(Lt, to_luastring('GLOBAL_MARKER'));
const markerTRaw = lua.lua_tostring(Lt, -1);
const markerT = markerTRaw ? to_jsstring(markerTRaw) : null;
assert(markerT !== 'RAN_OK_7355608', 'tampered script must NOT run the real code');
console.log('    OK: tampered script refuses to run the real code');

// ============ ANTI-LOGGER DETECTION TESTS ============
// payload is directly executable; PRELUDE fakes the Roblox executor env
function getGlobal(L, name) {
    lua.lua_getglobal(L, to_luastring(name));
    const v = lua.lua_tostring(L, -1);
    return v ? to_jsstring(v) : null;
}
function getBool(L, name) {
    lua.lua_getglobal(L, to_luastring(name));
    return lua.lua_toboolean(L, -1) === true;
}

console.log('[10] Anti-logger: CLEAN environment must NOT trigger...');
const dbgObj = {};
const detSrc = 'MARKER="ok"\n';
const detObf = applyCustomObfuscator(detSrc, { intensity: 3, antiTamper: true, antiSkid: false, antiLogger: true }, dbgObj);
luaparse.parse(detObf);
assert(dbgObj.payload && dbgObj.payload.includes('Shutdown'), 'payload must contain kill logic');
// anti-crack: payload-only runs need the loader's canary preset. Extract
// name+magic from the emitted loader (genuine runs register it).
function canaryPrelude(obfText) {
    const m = obfText.match(/do local g=\(getgenv and getgenv\(\)\) or _G g\.(_shc[0-9a-f]+)=(\d+) end/);
    assert(m, 'loader must register the anti-crack canary');
    return '_G.' + m[1] + '=' + m[2] + '\n';
}
const DET_CANARY = canaryPrelude(detObf);
const Lc = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lc);
lauxlib.luaL_dostring(Lc, to_luastring(PRELUDE + '\n' + DET_CANARY));
const stC = lauxlib.luaL_dostring(Lc, to_luastring(dbgObj.payload));
assert.strictEqual(stC, lua.LUA_OK, 'clean env: payload must run without error');
assert.strictEqual(getGlobal(Lc, 'MARKER'), 'ok', 'clean env: user code must run');
assert.strictEqual(getBool(Lc, 'SHUTDOWN'), false, 'clean env: game:Shutdown() must NOT fire');
console.log('    OK: clean executor env -> script runs normally, no shutdown');

console.log('[11] Anti-logger: spy global (oldrequest / HTTP spy) MUST trigger game:Shutdown()...');
const Lh = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lh);
lauxlib.luaL_dostring(Lh, to_luastring(PRELUDE + '\n' + DET_CANARY + 'oldrequest=function() end')); // HTTP spy artifact
const stH = lauxlib.luaL_dostring(Lh, to_luastring(dbgObj.payload));
assert(getBool(Lh, 'SHUTDOWN'), 'spy global detected -> game:Shutdown() fired');
assert(getGlobal(Lh, 'MARKER') !== 'ok', 'user code must NOT run after detection');
assert(stH !== lua.LUA_OK, 'payload must hard-abort after kill');
console.log('    OK: spy detected -> game:Shutdown() + payload aborted');

console.log('[12] Anti-logger: Lua-wrapped loadstring (many executors) must NOT trigger...');
const Lw = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lw);
const hookPre = PRELUDE + '\nlocal _ls=load or loadstring\nloadstring=function(s) return _ls(s) end'; // Lua-implemented loadstring (executor reality)
const preW = lauxlib.luaL_dostring(Lw, to_luastring(hookPre + '\n' + DET_CANARY));
assert.strictEqual(preW, lua.LUA_OK, 'hook prelude must be valid');
lauxlib.luaL_dostring(Lw, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Lw, 'SHUTDOWN'), false, 'Lua-wrapped loadstring must NOT trigger (executors do this legitimately)');
assert.strictEqual(getGlobal(Lw, 'MARKER'), 'ok', 'user code must run');
console.log('    OK: Lua-wrapped loadstring -> no false positive (was the real-world killer)');

console.log('[13] Anti-logger: NATIVE loadstring (real executor) must NOT trigger...');
const Ln = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Ln);
// a C-registered loadstring, like every real executor provides
lauxlib.luaL_dostring(Ln, to_luastring(PRELUDE + '\n' + DET_CANARY + 'loadstring=load'));
lauxlib.luaL_dostring(Ln, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Ln, 'SHUTDOWN'), false, 'native loadstring must NOT trigger shutdown');
assert.strictEqual(getGlobal(Ln, 'MARKER'), 'ok', 'user code must run with native loadstring');
console.log('    OK: native C loadstring (executor-style) -> no false positive');

console.log('[14] Anti-logger: overridden print/warn (executor console) must NOT trigger...');
const Lp = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lp);
// executors replace print/warn with their own logger console functions
lauxlib.luaL_dostring(Lp, to_luastring(PRELUDE + '\n' + DET_CANARY + 'print=function() end\nwarn=function() end'));
lauxlib.luaL_dostring(Lp, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Lp, 'SHUTDOWN'), false, 'overridden print/warn must NOT trigger (regression fix)');
assert.strictEqual(getGlobal(Lp, 'MARKER'), 'ok', 'user code must run');
console.log('    OK: overridden print/warn -> no false positive (the bug you hit)');

console.log('[15] Anti-logger: REAL executor env (decompile + 20 built-ins) must NOT trigger...');
const Le = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Le);
const execEnv = PRELUDE + '\n' + [
    'decompile=function() end', 'identifyexecutor=function() return "Delta" end',
    'hookfunction=function() end', 'hookmetamethod=function() end',
    'request=function() end', 'http_request=function() end', 'getgenv=function() return _G end',
    'writefile=function() end', 'readfile=function() return "" end', 'appendfile=function() end',
    'isfile=function() return false end', 'makefolder=function() end', 'setclipboard=function() end',
    'gethwid=function() return "hwid" end', 'fireclickdetector=function() end',
    'getconnections=function() return {} end', 'getcallingscript=function() end',
    'cloneref=function(x) return x end', 'gethui=function() return {} end',
    'checkcaller=function() return true end', 'syn={request=function() end}',
    'http={request=function() end}', 'websocket={connect=function() end}',
    'loadstring=load', 'setreadonly=function() end'
].join('\n');
const preE = lauxlib.luaL_dostring(Le, to_luastring(execEnv + '\n' + DET_CANARY));
assert.strictEqual(preE, lua.LUA_OK, 'executor env prelude must be valid');
lauxlib.luaL_dostring(Le, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Le, 'SHUTDOWN'), false, 'executor built-ins incl. decompile must NOT trigger (the v3.0 bug you hit)');
assert.strictEqual(getGlobal(Le, 'MARKER'), 'ok', 'user code must run in full executor env');
console.log('    OK: real executor env with decompile + 25 built-ins -> no false positive');

console.log('[16] Anti-logger: spy loaded AFTER script start still gets caught (background watcher)...');
const Lb = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lb);
// fake task lib BEFORE payload so the watcher registers: spawn stores the
// callback; wait succeeds once per "tick" then aborts the loop (one scan/run)
const taskEnv = 'local _t={} _WATCHERS=_t _WOK=true task={spawn=function(f) table.insert(_t,f) end,wait=function() if _WOK then _WOK=false else error("stop") end end,delay=function() end,defer=function(f) f() end}';
lauxlib.luaL_dostring(Lb, to_luastring(execEnv + '\n' + DET_CANARY + '\n' + taskEnv));
lauxlib.luaL_dostring(Lb, to_luastring(dbgObj.payload)); // clean start, watcher registered
// tick 1: clean environment -> no kill
lauxlib.luaL_dostring(Lb, to_luastring('_WOK=true for _,f in ipairs(_WATCHERS) do pcall(f) end'));
assert.strictEqual(getBool(Lb, 'SHUTDOWN'), false, 'clean tick must not kill');
// tick 2: user executed a spy script AFTER ours -> watcher catches it
lauxlib.luaL_dostring(Lb, to_luastring('oldrequest=function() end _WOK=true for _,f in ipairs(_WATCHERS) do pcall(f) end'));
assert(getBool(Lb, 'SHUTDOWN'), 'spy injected after start must trigger shutdown via watcher');
console.log('    OK: spy executed AFTER the obfuscated script -> watcher catches it');

// ============ KEY GATE TESTS ============
const GENV = 'getgenv=function() return _G end\n';
const VALID_KEY = 'ABCD-1234-EFGH-5678';
const kgOpts = {
    intensity: 3, antiTamper: true, antiSkid: false, antiLogger: false,
    keyGate: {
        keys: [
            { key: VALID_KEY, expires: null },
            { key: 'EXPIRED-KEY-9999', expires: Date.now() - 86400000 }
        ]
    }
};
const kgDbg = {};
const kgObf = applyCustomObfuscator('MARKER="ok"\n', kgOpts, kgDbg);
luaparse.parse(kgObf);
const KG_CANARY = canaryPrelude(kgObf);
assert(!kgObf.includes(VALID_KEY) && !kgObf.includes('EXPIRED-KEY-9999'), 'keys must NEVER appear in plaintext');
assert(kgDbg.payload && !kgDbg.payload.includes(VALID_KEY), 'keys must never appear in decrypted wrapper either');
console.log('[17] Key gate: keys embedded hashed, zero plaintext...');
console.log('    OK: no key string in output or wrapper');

console.log('[18] Key gate: NO key -> script must abort...');
const Lk0 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk0);
lauxlib.luaL_dostring(Lk0, to_luastring(PRELUDE + '\n' + GENV + KG_CANARY));
lauxlib.luaL_dostring(Lk0, to_luastring(kgDbg.payload));
assert.notStrictEqual(getGlobal(Lk0, 'MARKER'), 'ok', 'no key -> user code must NOT run');
console.log('    OK: no key -> aborted');

console.log('[19] Key gate: WRONG key -> script must abort...');
const Lk1 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk1);
lauxlib.luaL_dostring(Lk1, to_luastring(PRELUDE + '\n' + GENV + '\n' + KG_CANARY + 'ScripterHubKey="WRONG-KEY-0000"'));
lauxlib.luaL_dostring(Lk1, to_luastring(kgDbg.payload));
assert.notStrictEqual(getGlobal(Lk1, 'MARKER'), 'ok', 'wrong key -> user code must NOT run');
console.log('    OK: wrong key -> aborted');

console.log('[20] Key gate: VALID key -> script must run...');
const Lk2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk2);
lauxlib.luaL_dostring(Lk2, to_luastring(PRELUDE + '\n' + GENV + '\n' + KG_CANARY + 'ScripterHubKey="' + VALID_KEY + '"'));
lauxlib.luaL_dostring(Lk2, to_luastring(kgDbg.payload));
assert.strictEqual(getGlobal(Lk2, 'MARKER'), 'ok', 'valid key -> user code MUST run');
console.log('    OK: valid key -> script runs');

console.log('[21] Key gate: EXPIRED key -> script must abort...');
const Lk3 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk3);
lauxlib.luaL_dostring(Lk3, to_luastring(PRELUDE + '\n' + GENV + '\n' + KG_CANARY + 'ScripterHubKey="EXPIRED-KEY-9999"'));
lauxlib.luaL_dostring(Lk3, to_luastring(kgDbg.payload));
assert.notStrictEqual(getGlobal(Lk3, 'MARKER'), 'ok', 'expired key -> user code must NOT run');
console.log('    OK: expired key -> aborted');

console.log('[22] Key gate: full obfuscated file (not just payload) with key...');
const kgFull = applyCustomObfuscator('MARKER="ok"\n', kgOpts);
luaparse.parse(kgFull);
const Lk4 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk4);
lauxlib.luaL_dostring(Lk4, to_luastring(PRELUDE + '\n' + GENV + '\nScripterHubKey="' + VALID_KEY + '"'));
const stK = lauxlib.luaL_dostring(Lk4, to_luastring(kgFull));
assert.strictEqual(stK, lua.LUA_OK, 'full obf file with valid key must run without error');
assert.strictEqual(getGlobal(Lk4, 'MARKER'), 'ok', 'full obf file with valid key -> runs');
const Lk5 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk5);
lauxlib.luaL_dostring(Lk5, to_luastring(PRELUDE + '\n' + GENV));
lauxlib.luaL_dostring(Lk5, to_luastring(kgFull));
assert.notStrictEqual(getGlobal(Lk5, 'MARKER'), 'ok', 'full obf file without key -> aborts');
console.log('    OK: full pipeline respects key gate');

// ============ CUSTOM KEY MODE + API GLOBALS TESTS ============
console.log('[23] Custom key mode: API globals + no built-in UI, silent wait for ScripterHubKey...');
const customOpts = {
    intensity: 3, antiTamper: true, antiSkid: false, antiLogger: false,
    keyGate: { keys: [{ key: VALID_KEY, expires: null }], mode: 'custom' }
};
const customDbg = {};
const customObf = applyCustomObfuscator('MARKER="ok"\n', customOpts, customDbg);
luaparse.parse(customObf);
const CUSTOM_CANARY = canaryPrelude(customObf);
assert(customDbg.payload.includes('ScripterHubKeyStatus'), 'custom payload must expose API globals');
assert(!customDbg.payload.includes('SendNotification') || customDbg.payload.includes('pcall'), 'notifications only via pcall');
// no key -> custom mode aborts silently, but sets globals first
const Lc1 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lc1);
lauxlib.luaL_dostring(Lc1, to_luastring(PRELUDE + '\n' + GENV + CUSTOM_CANARY));
lauxlib.luaL_dostring(Lc1, to_luastring(customDbg.payload));
assert.notStrictEqual(getGlobal(Lc1, 'MARKER'), 'ok', 'custom mode: no key -> no run');
lua.lua_getglobal(Lc1, to_luastring('ScripterHubKeyIncorrect'));
assert.strictEqual(lua.lua_toboolean(Lc1, -1), true, 'ScripterHubKeyIncorrect must be true');
lua.lua_getglobal(Lc1, to_luastring('ScripterHubKeyValid'));
assert.strictEqual(lua.lua_toboolean(Lc1, -1), false, 'ScripterHubKeyValid must be false');
assert.strictEqual(getGlobal(Lc1, 'ScripterHubKeyStatus'), 'Incorrect', 'ScripterHubKeyStatus must be "Incorrect"');
assert.strictEqual(getGlobal(Lc1, 'ScripterHubWebsiteStatus'), 'Online', 'ScripterHubWebsiteStatus must be "Online"');
console.log('    OK: no key -> Incorrect globals set, script aborts');
// valid key -> runs + Valid globals
const Lc2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lc2);
lauxlib.luaL_dostring(Lc2, to_luastring(PRELUDE + '\n' + GENV + '\n' + CUSTOM_CANARY + 'ScripterHubKey="' + VALID_KEY + '"'));
lauxlib.luaL_dostring(Lc2, to_luastring(customDbg.payload));
assert.strictEqual(getGlobal(Lc2, 'MARKER'), 'ok', 'custom mode: valid key -> runs');
assert.strictEqual(getGlobal(Lc2, 'ScripterHubKeyStatus'), 'Valid', 'ScripterHubKeyStatus must be "Valid"');
lua.lua_getglobal(Lc2, to_luastring('ScripterHubKeyValid'));
assert.strictEqual(lua.lua_toboolean(Lc2, -1), true, 'ScripterHubKeyValid must be true');
console.log('    OK: valid key -> Valid globals, script runs');

console.log('[24] No-key scripts: API globals say "No Key Required"...');
const noKeyObf = applyCustomObfuscator('MARKER="ok"\n', { intensity: 2 });
const Ln2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Ln2);
lauxlib.luaL_dostring(Ln2, to_luastring(PRELUDE + '\n' + GENV));
lauxlib.luaL_dostring(Ln2, to_luastring(noKeyObf));
assert.strictEqual(getGlobal(Ln2, 'MARKER'), 'ok', 'no-key script must run');
assert.strictEqual(getGlobal(Ln2, 'ScripterHubKeyStatus'), 'No Key Required', 'status must be No Key Required');
lua.lua_getglobal(Ln2, to_luastring('ScripterHubKeyValid'));
assert.strictEqual(lua.lua_toboolean(Ln2, -1), true, 'ScripterHubKeyValid must be true for keyless scripts');
console.log('    OK: keyless scripts expose No Key Required + run');

console.log('[25] Stats beacon: worker endpoint embedded when statsEndpoint set...');
const beaconDbg = {};
const beaconObf = applyCustomObfuscator('MARKER="ok"\n', { intensity: 2, statsEndpoint: 'https://scripterhub-stats.test.workers.dev' }, beaconDbg);
luaparse.parse(beaconObf);
assert(beaconDbg.payload.includes('/track'), 'beacon must ping /track');
// URL is escaped as \ddd byte sequences inside the Lua string - check its escaped form
const escUrl = 'https://scripterhub-stats.test.workers.dev'.split('').map(c => '\\' + c.charCodeAt(0)).join('');
assert(beaconDbg.payload.includes(escUrl), 'worker URL embedded (escaped)');
assert(beaconDbg.payload.includes('identifyexecutor'), 'beacon reports executor name');
const plainDbg = {};
applyCustomObfuscator('MARKER="ok"\n', { intensity: 2 }, plainDbg);
assert(!plainDbg.payload.includes('/track'), 'no beacon when statsEndpoint not set');
console.log('    OK: beacon only present when statsEndpoint configured');

// ============ ANTI-CRACK CANARY / DECOY TESTS ============
// capture prints so we can verify the decoy output
function runWithPrintCapture(pre, code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring('print=function(...) local p={} for i=1,select("#",...) do p[#p+1]=tostring((select(i,...))) end PRINTED=table.concat(p," ") end'));
    lauxlib.luaL_dostring(L, to_luastring(pre));
    lauxlib.luaL_dostring(L, to_luastring(code));
    return L;
}

console.log('[26] Anti-crack: loader registers canary before loadstring...');
assert(canaryPrelude(beaconObf), 'canary registration present in loader output');
console.log('    OK: canary emitted');

console.log('[27] Anti-crack: DUMPED payload (standalone run) must hit the DECOY, not the real code...');
const acSrc = 'MARKER="REAL_CODE_RAN"\n';
const acDbg = {};
const acObf = applyCustomObfuscator(acSrc, { intensity: 3, antiTamper: true, antiSkid: false, antiLogger: false }, acDbg);
luaparse.parse(acObf);
assert(!acDbg.payload.includes('Goodluck Sonion'), 'decoy message must be encrypted, never plaintext');
// the dump: run the payload standalone WITHOUT the loader's registration
const Ld = runWithPrintCapture(PRELUDE + '\n' + GENV, acDbg.payload);
assert.notStrictEqual(getGlobal(Ld, 'MARKER'), 'REAL_CODE_RAN', 'dumped payload must NOT run the real code');
const dumped = getGlobal(Ld, 'PRINTED') || '';
assert(dumped.includes('Goodluck Sonion'), 'dump must print the anti-crack message, got: ' + JSON.stringify(dumped));
console.log('    OK: dump attack -> decoy fires ("' + dumped + '")');

console.log('[28] Anti-crack: GENUINE run (canary registered by loader) must run the real code...');
const Lg = runWithPrintCapture(PRELUDE + '\n' + GENV, acObf);
assert.strictEqual(getGlobal(Lg, 'MARKER'), 'REAL_CODE_RAN', 'genuine run must execute the real code');
console.log('    OK: genuine run -> real code executes');

console.log('[29] Anti-crack: canary is ONE-SHOT (re-running the dump again fails too)...');
// run 1 WITH the canary pre-registered = genuine; then clear MARKER and run
// the same payload again: the canary was consumed -> run 2 must hit the decoy
const Ls = runWithPrintCapture(PRELUDE + '\n' + GENV + canaryPrelude(acObf), acDbg.payload);
assert.strictEqual(getGlobal(Ls, 'MARKER'), 'REAL_CODE_RAN', 'run 1 (canary present) must run the real code');
lauxlib.luaL_dostring(Ls, to_luastring('MARKER=nil PRINTED=nil'));
lauxlib.luaL_dostring(Ls, to_luastring(acDbg.payload));
assert.notStrictEqual(getGlobal(Ls, 'MARKER'), 'REAL_CODE_RAN', 'second run must not re-run real code');
const printed2 = getGlobal(Ls, 'PRINTED') || '';
assert(printed2.includes('Goodluck Sonion'), 'second run must hit the decoy too');
console.log('    OK: one-shot canary -> re-run lands on decoy');

console.log('[30] Anti-crack: custom anti-crack message honored + never leaked...');
const acCustomDbg = {};
const acCustom = applyCustomObfuscator(acSrc, { intensity: 2, antiCrackMessage: 'nice try skid', _debug: true }, acCustomDbg);
luaparse.parse(acCustom);
assert(!acCustom.includes('nice try skid'), 'custom message must not leak in plaintext');
const Lcc = runWithPrintCapture(PRELUDE + '\n' + GENV, acCustomDbg.payload);
// (decoded payload = what a cracker would dump)
const printed3 = getGlobal(Lcc, 'PRINTED') || '';
assert(printed3.includes('nice try skid'), 'custom decoy message must fire');
console.log('    OK: custom message fires on dump');

console.log('\nALL TESTS PASSED - Custom Obfuscator works.');
