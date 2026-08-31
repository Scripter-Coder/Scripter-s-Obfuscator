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

// JS transcription of the generated Lua VM (strip noise, checksum,
// key derivation, reverse layers) - decodes a loader text back to its source
function decodeLoader(text) {
    const dbgMatch = text.match(/--\[shdebug:(\{.*?\})\]/);
    assert(dbgMatch, 'shdebug header found');
    const dbg = JSON.parse(dbgMatch[1]);

    const payloadMatch = text.match(/"(\\\d{1,3}(?:\\\d{1,3})*)"/);
    assert(payloadMatch, 'payload string found');
    const allBytes = [...payloadMatch[1].matchAll(/\\(\d{1,3})/g)].map(m => parseInt(m[1], 10));

    const keyMatch = text.match(/local _0x[0-9a-f]+=(\{[\d,{}]+\})/);
    assert(keyMatch, 'key table found');
    const ints = [...keyMatch[1].matchAll(/\d+/g)].map(m => parseInt(m[0], 10));

    // regroup keys: for each layer: keyLens[l] key ints, then off, shift
    const layers = [];
    let p = 0;
    for (let l = 0; l < dbg.layerCount; l++) {
        const kl = dbg.keyLens[l];
        const key = ints.slice(p, p + kl); p += kl;
        const off = ints[p]; p += 1;
        const shift = ints[p]; p += 1;
        layers.push({ key, off, shift });
    }

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

    // derive outer key (stored XOR chk%256)
    const outer = layers[dbg.layerCount - 1];
    const mod = chk % 256;
    outer.key = outer.key.map(b => b ^ mod);

    // reverse layers N..1
    for (let l = dbg.layerCount - 1; l >= 0; l--) {
        const { key, off, shift } = layers[l];
        for (let i = 0; i < T.length; i++) {
            T[i] = (((T[i] - shift) % 256 + 256) % 256) ^ key[(i + off) % key.length];
        }
    }
    return bytesToUtf8(T);
}

// ============ RUN ============
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
assert(decoded1.endsWith(sample), 'original code appended verbatim');
console.log('    OK: decoded payload contains wrapper + original code');

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
assert(payload.endsWith(sample), 'double-wrapped decode yields original');
console.log('    OK: fully decoded through 2 shells');

console.log('[5] Minimal options (all protections off, intensity 1)...');
const outMin = applyCustomObfuscator(sample, { intensity: 1, antiTamper: false, antiSkid: false, _debug: true });
assert(!outMin.includes('Hello, secret string!'));
luaparse.parse(outMin);
const decodedMin = decodeLoader(outMin);
assert(decodedMin.endsWith(sample), 'minimal decode yields original');
console.log('    OK: minimal config round-trips');

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
const tampered = outRun.replace(/"(\\\d{1,3}(?:\\\d{1,3})*)"/, (m) => {
    // change one byte code in the middle of the payload
    const idx = Math.floor(m.length / 2);
    return m.slice(0, idx) + (m[idx] === '9' ? '8' : '9') + m.slice(idx + 1);
});
assert(tampered !== outRun, 'tampering applied');
const Lt = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lt);
lauxlib.luaL_dostring(Lt, to_luastring(PRELUDE));
const statusT = lauxlib.luaL_dostring(Lt, to_luastring(tampered));
lua.lua_getglobal(Lt, to_luastring('GLOBAL_MARKER'));
const markerTRaw = lua.lua_tostring(Lt, -1);
const markerT = markerTRaw ? to_jsstring(markerTRaw) : null;
assert(statusT !== lua.LUA_OK || markerT !== 'RAN_OK_7355608', 'tampered script must NOT run');
console.log('    OK: tampered script refuses to run (silently or with error)');

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
const Lc = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lc);
lauxlib.luaL_dostring(Lc, to_luastring(PRELUDE));
const stC = lauxlib.luaL_dostring(Lc, to_luastring(dbgObj.payload));
assert.strictEqual(stC, lua.LUA_OK, 'clean env: payload must run without error');
assert.strictEqual(getGlobal(Lc, 'MARKER'), 'ok', 'clean env: user code must run');
assert.strictEqual(getBool(Lc, 'SHUTDOWN'), false, 'clean env: game:Shutdown() must NOT fire');
console.log('    OK: clean executor env -> script runs normally, no shutdown');

console.log('[11] Anti-logger: spy global (oldrequest / HTTP spy) MUST trigger game:Shutdown()...');
const Lh = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lh);
lauxlib.luaL_dostring(Lh, to_luastring(PRELUDE + '\noldrequest=function() end')); // HTTP spy artifact
const stH = lauxlib.luaL_dostring(Lh, to_luastring(dbgObj.payload));
assert(getBool(Lh, 'SHUTDOWN'), 'spy global detected -> game:Shutdown() fired');
assert(getGlobal(Lh, 'MARKER') !== 'ok', 'user code must NOT run after detection');
assert(stH !== lua.LUA_OK, 'payload must hard-abort after kill');
console.log('    OK: spy detected -> game:Shutdown() + payload aborted');

console.log('[12] Anti-logger: Lua-wrapped loadstring (many executors) must NOT trigger...');
const Lw = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lw);
const hookPre = PRELUDE + '\nlocal _ls=load or loadstring\nloadstring=function(s) return _ls(s) end'; // Lua-implemented loadstring (executor reality)
const preW = lauxlib.luaL_dostring(Lw, to_luastring(hookPre));
assert.strictEqual(preW, lua.LUA_OK, 'hook prelude must be valid');
lauxlib.luaL_dostring(Lw, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Lw, 'SHUTDOWN'), false, 'Lua-wrapped loadstring must NOT trigger (executors do this legitimately)');
assert.strictEqual(getGlobal(Lw, 'MARKER'), 'ok', 'user code must run');
console.log('    OK: Lua-wrapped loadstring -> no false positive (was the real-world killer)');

console.log('[13] Anti-logger: NATIVE loadstring (real executor) must NOT trigger...');
const Ln = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Ln);
// a C-registered loadstring, like every real executor provides
lauxlib.luaL_dostring(Ln, to_luastring(PRELUDE + '\nloadstring=load'));
lauxlib.luaL_dostring(Ln, to_luastring(dbgObj.payload));
assert.strictEqual(getBool(Ln, 'SHUTDOWN'), false, 'native loadstring must NOT trigger shutdown');
assert.strictEqual(getGlobal(Ln, 'MARKER'), 'ok', 'user code must run with native loadstring');
console.log('    OK: native C loadstring (executor-style) -> no false positive');

console.log('[14] Anti-logger: overridden print/warn (executor console) must NOT trigger...');
const Lp = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lp);
// executors replace print/warn with their own logger console functions
lauxlib.luaL_dostring(Lp, to_luastring(PRELUDE + '\nprint=function() end\nwarn=function() end'));
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
const preE = lauxlib.luaL_dostring(Le, to_luastring(execEnv));
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
lauxlib.luaL_dostring(Lb, to_luastring(execEnv + '\n' + taskEnv));
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
assert(!kgObf.includes(VALID_KEY) && !kgObf.includes('EXPIRED-KEY-9999'), 'keys must NEVER appear in plaintext');
assert(kgDbg.payload && !kgDbg.payload.includes(VALID_KEY), 'keys must never appear in decrypted wrapper either');
console.log('[17] Key gate: keys embedded hashed, zero plaintext...');
console.log('    OK: no key string in output or wrapper');

console.log('[18] Key gate: NO key -> script must abort...');
const Lk0 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk0);
lauxlib.luaL_dostring(Lk0, to_luastring(PRELUDE + '\n' + GENV));
lauxlib.luaL_dostring(Lk0, to_luastring(kgDbg.payload));
assert.notStrictEqual(getGlobal(Lk0, 'MARKER'), 'ok', 'no key -> user code must NOT run');
console.log('    OK: no key -> aborted');

console.log('[19] Key gate: WRONG key -> script must abort...');
const Lk1 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk1);
lauxlib.luaL_dostring(Lk1, to_luastring(PRELUDE + '\n' + GENV + '\nScripterHubKey="WRONG-KEY-0000"'));
lauxlib.luaL_dostring(Lk1, to_luastring(kgDbg.payload));
assert.notStrictEqual(getGlobal(Lk1, 'MARKER'), 'ok', 'wrong key -> user code must NOT run');
console.log('    OK: wrong key -> aborted');

console.log('[20] Key gate: VALID key -> script must run...');
const Lk2 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk2);
lauxlib.luaL_dostring(Lk2, to_luastring(PRELUDE + '\n' + GENV + '\nScripterHubKey="' + VALID_KEY + '"'));
lauxlib.luaL_dostring(Lk2, to_luastring(kgDbg.payload));
assert.strictEqual(getGlobal(Lk2, 'MARKER'), 'ok', 'valid key -> user code MUST run');
console.log('    OK: valid key -> script runs');

console.log('[21] Key gate: EXPIRED key -> script must abort...');
const Lk3 = lauxlib.luaL_newstate();
lualib.luaL_openlibs(Lk3);
lauxlib.luaL_dostring(Lk3, to_luastring(PRELUDE + '\n' + GENV + '\nScripterHubKey="EXPIRED-KEY-9999"'));
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

console.log('\nALL TESTS PASSED - Custom Obfuscator works.');
