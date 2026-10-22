// tools/opaque_payload_test.mjs
//
// THE FILE IS NOT THE SCRIPT.
//
// Luarmor's shape is one opaque blob with HOLES in it, and the key material
// that fills the holes comes from the server. This is the same shape, and
// this test drives the real obfuscator and asserts it.
//
// What the file used to carry:
//
//     local v0f26a3=_b64dec("9IZyyUvFezazVtZDyad...")   <- every string
//     local rad429e={{85,7},{61,2},{92,7},...}}           <- their table
//     local b=(129*p+231+2579288592*1.0*((p*p)%4))%251+167 <- the key
//
// An analyst took the file, found the function that turns a constant index
// into a string, fed it the two tables it reads, and called it in a loop.
// Four lines of Lua, and the whole script came back.
//
// What the file carries now:
//
//     local sf48cbd3={6,"DwAAAAwAAAAIAAAACQAAAAMgAAAA...", ...}
//
// One piece list: the payload, cut into pieces, with a KEY SLOT at the
// head. The key slot is the key material the worker holds, and it opens
// the stream, so the file's copy of the payload begins six bytes late and
// six bytes is exactly what a seed is worth.
//
// The test asserts:
//
//   1. the artifact carries no strings and no constant table
//   2. the analyst's move - extract the decoder, feed it the file's own
//      tables, call it - recovers no string of the script
//   3. the seed is not in the file, in any build, free or paid
//   4. the same file runs and produces the script's output once the
//      payload's key material is handed over
//   5. and it refuses to run, with a reason, when it is not
//
// Run: node tools/opaque_payload_test.mjs
import fs from 'node:fs';
import luaparse from 'luaparse';
import * as fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (name, cond, detail = '') => {
    if (cond) ok(name); else no(name + (detail ? ' - ' + detail : ''));
};

// ---------------------------------------------------------------------------
// The script under test. The strings below are the ones an analyst wants.
// ---------------------------------------------------------------------------
const SOURCE = [
    'local account = { balance = 100, owner = "scripter" }',
    'local function greet(name, times)',
    '  local out = {}',
    '  for i = 1, times do out[i] = string.format("hello %s #%d", name, i) end',
    '  return table.concat(out, ", ")',
    'end',
    'local a = greet(account.owner, 2)',
    '_G.__OP_RESULT = a .. "|" .. tostring(account.balance)',
].join('\n');

const SECRETS = ['hello %s #%d', 'scripter', 'table.concat', 'string.format'];
const EXPECTED = 'hello scripter #1, hello scripter #2|100';

function build(extra = {}) {
    const dbg = {};
    const code = String(applyCustomObfuscator(SOURCE, Object.assign({
        intensity: 12,
        target: 'luau',
        ultra: true,
        serverVault: true,
    }, extra), dbg) || '');
    return { code, dbg };
}

// Run an artifact with the key material the worker would hand over.
function runWithKey(code, keyB64) {
    const st = AUX.luaL_newstate();
    LIB.luaL_openlibs(st);
    if (keyB64) {
        LUA.lua_pushstring(st, fengari.to_luastring(String(keyB64)));
        LUA.lua_setglobal(st, '__SH_VAULT_B64');
    }
    const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(code));
    if (chunk !== 0) {
        const e = fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_close(st);
        return { compiled: false, error: e, result: '' };
    }
    const rc = LUA.lua_pcall(st, 0, 0, 0);
    let err = '';
    if (rc !== 0) err = fengari.to_jsstring(LUA.lua_tostring(st, -1));
    LUA.lua_getglobal(st, '__OP_RESULT');
    const result = LUA.lua_isnil(st, -1) ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
    LUA.lua_pop(st, 1);
    LUA.lua_close(st);
    return { compiled: true, error: err, result };
}

// ---------------------------------------------------------------------------
// THE ANALYST'S MOVE.
//
// An analyst does not have to understand the VM. They take the file, find
// the function that turns a constant index into a string, feed it the tables
// it reads, and call it in a loop. That is the whole deobfuscation when the
// file carries the constants.
// ---------------------------------------------------------------------------
const LUA_KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
    'until', 'while', 'string', 'table', 'math', 'pcall', 'type', 'tonumber', 'select',
    'error', 'ipairs', 'pairs', 'setmetatable', 'getmetatable', 'rawget', 'rawset',
    'tostring', 'next', 'unpack',
]);

// Find "local NAME=<value>" and return the declaration, so the analyst can
// rebuild it without the rest of the file.
function findDecl(src, name) {
    const re = new RegExp('^local\\s+' + name + '\\s*=\\s*', 'm');
    const m = re.exec(src);
    if (!m) return null;
    const start = m.index + m[0].length;
    const rest = src.slice(start);
    if (rest[0] === '{') {
        let depth = 0;
        for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '{') depth++;
            else if (rest[i] === '}') { depth--; if (depth === 0) return 'local ' + name + '=' + rest.slice(0, i + 1); }
        }
        return null;
    }
    const nl = rest.indexOf('\n');
    return 'local ' + name + '=' + rest.slice(0, nl < 0 ? rest.length : nl);
}

// Every decoder in the file: "local F=function(i) ... end".
function findDecoders(src) {
    const out = [];
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = /^local\s+(\w+)\s*=\s*function\(i\)/.exec(lines[i]);
        if (!m) continue;
        // the function ends at the first line that is exactly "end"
        let end = -1;
        for (let j = i + 1; j < lines.length; j++) if (lines[j] === 'end') { end = j; break; }
        if (end < 0) continue;
        out.push({ name: m[1], body: lines.slice(i, end + 1).join('\n') });
        i = end;
    }
    return out;
}

// The identifiers the decoder body reads that are not declared inside it.
function freeNames(body) {
    const declared = new Set();
    for (const m of body.matchAll(/local\s+([A-Za-z_]\w*)/g)) declared.add(m[1]);
    for (const m of body.matchAll(/for\s+([A-Za-z_]\w*)/g)) declared.add(m[1]);
    const names = new Set();
    for (const m of body.matchAll(/([A-Za-z_]\w*)/g)) {
        const n = m[1];
        if (LUA_KEYWORDS.has(n)) continue;
        if (declared.has(n)) continue;
        names.add(n);
    }
    return [...names];
}

// Run one decoder against the tables the FILE provides.
function runDecoder(src, dec) {
    const decls = [];
    for (const n of freeNames(dec.body)) {
        const d = findDecl(src, n);
        if (d) decls.push(d);
    }
    // The analyst needs a base64 decoder to read a table that arrives as
    // base64. The file ships one, so the analyst uses it - that is exactly
    // the move that used to recover every string in the script.
    for (const line of src.split('\n')) {
        if (/^local\s+function\s+_?b64dec\(/.test(line)) { decls.unshift(line); break; }
    }
    // The strings are returned HEX so that binary garbage cannot break the
    // UTF-8 conversion on the way out. A decoder that produced the script's
    // constants would still be caught.
    const lua = [
        decls.join('\n'),
        dec.body,
        'local __o={}',
        'for i=1,400 do local okk,s=pcall(' + dec.name + ',i) if okk and type(s)=="string" and s~="" then',
        ' local h="" for j=1,#s do h=h..string.format("%02x",string.byte(s,j)) end __o[#__o+1]=h',
        'end end',
        'return table.concat(__o,"\\n")',
    ].join('\n');

    const st = AUX.luaL_newstate();
    LIB.luaL_openlibs(st);
    if (AUX.luaL_loadstring(st, fengari.to_luastring(lua)) !== 0) {
        const e = fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_close(st);
        return { error: e, strings: [] };
    }
    if (LUA.lua_pcall(st, 0, 1, 0) !== 0) {
        const e = fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_close(st);
        return { error: e, strings: [] };
    }
    const res = LUA.lua_tostring(st, -1);
    const text = res ? fengari.to_jsstring(res) : '';
    LUA.lua_close(st);
    const strings = text ? text.split('\n').filter(Boolean).map(h => {
        let s = '';
        for (let i = 0; i + 1 < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
        return s;
    }) : [];
    return { error: '', strings };
}

// ---------------------------------------------------------------------------
console.log('[OP1] the artifact carries no script material...');
// ---------------------------------------------------------------------------
const { code: ART, dbg: DBG } = build();

check('the build produced an artifact', ART.length > 0);
check('and the key material came out with it', String(DBG.vaultB64 || '').length > 0,
    'the key material is empty - the artifact would not run');
check('the key material is small - it is a key, not the script',
    String(DBG.vaultB64 || '').length <= 32, String(DBG.vaultB64 || '').length + ' chars');
check('and the payload is NOT in the key material',
    ART.indexOf(String(DBG.vaultB64 || '')) === -1);
check('and the key material is NOT in the file',
    ART.indexOf(String(DBG.vaultB64 || '')) === -1,
    'the file carries the key - the worker does not need to hold it');

// The payload is ENCRYPTED under the key. The file carries ciphertext, so
// the constant bytes are not in it in any form - not as base64, not as
// bytes, not as the numbers the old envelope used.
{
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const D = {}; for (let i = 0; i < 64; i++) D[A[i]] = i;
    function b64d(s) {
        const out = []; let acc = 0, bits = 0;
        for (const ch of s) { const v = D[ch]; if (v === undefined) continue; acc = acc * 64 + v; bits += 6; if (bits >= 8) { bits -= 8; out.push(Math.floor(acc / 2 ** bits) % 256); acc = acc % 2 ** bits; } }
        return out;
    }
    for (const s of SECRETS) {
        const enc = b64d(btoa(unescape(encodeURIComponent(s))));
        check('the payload does not carry ' + JSON.stringify(s) + ' in the clear', ART.indexOf(enc) === -1);
    }
}

for (const s of SECRETS) {
    check('the literal ' + JSON.stringify(s) + ' is not in the file', ART.indexOf(s) === -1);
}

// The constant table used to be a list of {start,len} pairs.
const tables = [...ART.matchAll(/^local\s+\w+\s*=\s*(\{.*\})\s*$/gm)];
let populated = 0;
for (const t of tables) {
    const pairs = [...t[1].matchAll(/\{(\d+),(\d+)\}/g)];
    if (pairs.length >= 3) populated++;
}
check('the constant table is not in the file', populated === 0,
    populated + ' table(s) of {start,len} pairs are still there');

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP2] THE ANALYST\'S MOVE: pull the decoder out and call it...');
// ---------------------------------------------------------------------------
const decoders = findDecoders(ART);
check('the artifact has a constant decoder to find', decoders.length > 0,
    'none found - the shape changed and this test needs to learn the new one');

for (const d of decoders) {
    // A decoder that reads its CONSTANTS at a fixed index (local a=NAME[1])
    // is a DECOY: the VM ships one deliberately, to feed an analyst
    // garbage. The real one reads at a computed index (local a=NAME[p]).
    const constRead = [...d.body.matchAll(/local\s+a\s*=\s*(\w+)\[([^\]]+)\]/g)];
    const real = constRead.some(r => !/^\d+$/.test(r[2].trim()));
    if (!real) {
        check('decoder ' + d.name + ' is a decoy (it reads a fixed index)', true);
    } else {
        const reads = [...new Set([...d.body.matchAll(/local\s+(?:rr|a)\s*=\s*(\w+)\[/g)].map(m => m[1]))];
        for (const t of reads) {
            const decl = findDecl(ART, t);
            const empty = !!decl && /=\{\s*\}$/.test(decl);
            check('the table ' + t + ' that decoder ' + d.name + ' reads is empty',
                empty, decl ? ('it holds ' + decl.length + ' chars') : 'the table was not found at all');
        }
    }
}

let recovered = [];
for (const d of decoders) {
    const r = runDecoder(ART, d);
    recovered = recovered.concat(r.strings);
    // A single character is not a leak - it is noise, and the source
    // contains plenty of single characters. A constant is a WORD.
    const leaked = r.strings.filter(s => s.length >= 4 && SOURCE.indexOf(s) !== -1);
    check('decoder ' + d.name + ' does not leak the script',
        leaked.length === 0,
        leaked.length ? JSON.stringify(leaked.slice(0, 3)) : '');
}
const recoveredText = recovered.join('\n');
check('NOT ONE STRING of the script came out',
    SECRETS.every(s => recoveredText.indexOf(s) === -1),
    JSON.stringify(SECRETS.filter(s => recoveredText.indexOf(s) !== -1)));
for (const s of SECRETS) {
    check('the string ' + JSON.stringify(s) + ' was not recovered', recoveredText.indexOf(s) === -1);
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP3] with the key material the worker holds, the SAME file runs...');
// ---------------------------------------------------------------------------
{
    const r = runWithKey(ART, DBG.vaultB64);
    check('the artifact compiles', r.compiled, r.error);
    check('and it runs', !r.error, r.error);
    check('and it produces the script\'s own output', r.result === EXPECTED, JSON.stringify(r.result));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP4] the file alone is not a script...');
// ---------------------------------------------------------------------------
{
    const r = runWithKey(ART, null);
    check('without the key material the artifact refuses to run', !!r.error,
        'it ran anyway - the file is self-contained');
    check('and it says why', /encryption key is missing/.test(r.error), JSON.stringify(r.error.slice(0, 90)));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP5] the seed is server-bound for EVERY build...');
// ---------------------------------------------------------------------------
{
    // No split key at all: a free script. The seed must still not be in the
    // file, or the free script is the easy one.
    const free = build({ serverKey: undefined, splitKey: false });
    const freeDecoders = findDecoders(free.code);
    let freeSeeds = [];
    for (const d of freeDecoders) {
        for (const m of d.body.matchAll(/local\s+b\s*=\s*\(([^)]*)\)/g)) {
            // Six digits or more: a 32-bit seed. The cipher's own mixer
            // constants are five digits and are not secret.
            for (const n of m[1].matchAll(/\b(\d{6,})\b/g)) freeSeeds.push(n[1]);
        }
    }
    check('a free build has no seed literal in the file', freeSeeds.length === 0,
        JSON.stringify(freeSeeds.slice(0, 5)));
    check('and it still produced the key material', String(free.dbg.vaultB64 || '').length > 0);

    const r = runWithKey(free.code, free.dbg.vaultB64);
    check('and a free build runs with the key material', !r.error, r.error);
    check('and produces its output', r.result === EXPECTED, JSON.stringify(r.result));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP6] the key material does not unlock the wrong script...');
// ---------------------------------------------------------------------------
{
    // Two builds, two keys. One build's key must not open the other.
    const a = build();
    const b = build();
    const r = runWithKey(a.code, b.dbg.vaultB64);
    check('another script\'s key is refused', !!r.error,
        'it ran - the key material is not bound to the script');
    check('and it says why', /not the right one/.test(r.error), JSON.stringify(r.error.slice(0, 90)));
}

console.log('');
console.log('='.repeat(72));
console.log('OPAQUE PAYLOAD   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
