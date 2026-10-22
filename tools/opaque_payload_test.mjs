// tools/opaque_payload_test.mjs
//
// THE FILE IS NOT THE SCRIPT.
//
// Luarmor's shape is one opaque blob on the server and a file that asks for
// it. Ours was not: the file carried the constant table in plain text, the
// encrypted constants beside it, and - for every build without a split key -
// the seed that unlocks them. An analyst who had the file could therefore
// read every string in the script by running one function.
//
// This test drives the real obfuscator and asserts the property that closes
// that hole:
//
//   1. the artifact carries no script material - no constants, no constant
//      table, no key
//   2. THE ANALYST'S MOVE does not work: pulling the file's own decoder out
//      of it and calling it yields no strings
//   3. the same file, given the payload the worker holds, runs and produces
//      the script's output
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
    'local ok, bal = tostring(account.balance), greet(account.owner, 2)',
    '_G.__OP_RESULT = ok .. "|" .. bal',
].join('\n');

const SECRETS = ['hello %s #%d', 'scripter', 'table.concat', 'string.format'];

// ---------------------------------------------------------------------------
// A BUILD LIKE THE SITE MAKES: the opaque payload, server-bound seed.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// THE ANALYST'S MOVE.
//
// An analyst does not have to understand the VM. They take the file, find
// the function that turns a constant index into a string, feed it the tables
// it reads from, and call it in a loop. That is the whole deobfuscation when
// the file carries the constants.
//
// This reproduces that move against the artifact, using only what is IN the
// file. If the artifact still carried the script, this would print it.
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
check('and the payload came out with it', String(DBG.vaultB64 || '').length > 0,
    'the payload is empty - the artifact would not run');

// The constants blob used to be a base64 literal in the file, and the
// bytecode blob beside it. Neither may be there now.
const inlineBlobs = [...ART.matchAll(/"([A-Za-z0-9+/=]{100,})"/g)].map(m => m[1]);
check('no inline payload blob is left in the file', inlineBlobs.length === 0,
    inlineBlobs.length + ' blob(s) of ' + (inlineBlobs[0] || '').length + ' chars');

// The constant table used to be a list of {start,len} pairs.
const tables = [...ART.matchAll(/^local\s+(\w+)\s*=\s*(\{.*\})\s*$/gm)];
let populated = 0;
for (const t of tables) {
    const pairs = [...t[2].matchAll(/\{(\d+),(\d+)\}/g)];
    if (pairs.length >= 3) populated++;
}
check('the constant table is not in the file', populated === 0,
    populated + ' table(s) of {start,len} pairs are still there');

// THE SEED.
//
// The vault seed was a plain literal in the file for every build without a
// split key, which made "copy the file, run one function" the whole
// deobfuscation. It is read from the environment now, so the decoder's key
// expression must not be a bare number.
//
// The check looks at the decoders themselves, because a bare number
// elsewhere in the file means nothing - the whole VM is full of them.
const decodersEarly = findDecoders(ART);
let literalSeeds = [];
for (const d of decodersEarly) {
    for (const m of d.body.matchAll(/local\s+b\s*=\s*\(([^)]*)\)/g)) {
        for (const n of m[1].matchAll(/\b(\d{4,})\b/g)) literalSeeds.push(n[1]);
    }
}
check('no decoder holds the vault seed as a literal', literalSeeds.length === 0,
    JSON.stringify(literalSeeds.slice(0, 5)));

for (const s of SECRETS) {
    check('the literal ' + JSON.stringify(s) + ' is not in the file', ART.indexOf(s) === -1);
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP2] THE ANALYST\'S MOVE: pull the decoder out and call it...');
// ---------------------------------------------------------------------------
const decoders = findDecoders(ART);
check('the artifact has a constant decoder to find', decoders.length > 0,
    'none found - the shape changed and this test needs to learn the new one');

// The structural half: the tables the REAL constant decoder reads have to be
// empty. That is the shape of the leak - the constants and their table in
// one place.
//
// A decoder that reads a FIXED index (local a=NAME[1]) is a DECOY: the VM
// ships one deliberately, to feed an analyst garbage. Its table is meant to
// be full, so it is not judged here - it is judged by whether the script
// comes out of it.
for (const d of decoders) {
    // A decoder that reads its CONSTANTS at a fixed index (local a=NAME[1])
    // is a DECOY: the VM ships one deliberately, to feed an analyst
    // garbage. The real one reads at a computed index (local a=NAME[p]).
    const constRead = [...d.body.matchAll(/local\s+a\s*=\s*(\w+)\[([^\]]+)\]/g)];
    const real = constRead.some(r => !/^\d+$/.test(r[2].trim()));
    if (!real) {
        check('decoder ' + d.name + ' is a decoy (it reads a fixed index)', true);
        continue;
    }
    const reads = [...new Set([...d.body.matchAll(/local\s+(?:rr|a)\s*=\s*(\w+)\[/g)].map(m => m[1]))];
    for (const t of reads) {
        const decl = findDecl(ART, t);
        const empty = !!decl && /=\{\s*\}$/.test(decl);
        check('the table ' + t + ' that decoder ' + d.name + ' reads is empty',
            empty, decl ? ('it holds ' + decl.length + ' chars') : 'the table was not found at all');
    }
}

// The behavioural half: pull the decoder out of the file, feed it the file's
// own tables and call it. That is the whole deobfuscation when the file
// carries the constants.
//
// Some decoders are DECOYS: they exist to feed an analyst garbage, and
// garbage is not a failure. What must never happen is the SCRIPT coming
// out of any of them.
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
console.log('[OP3] with the payload the worker holds, the SAME file runs...');
// ---------------------------------------------------------------------------
{
    const st = AUX.luaL_newstate();
    LIB.luaL_openlibs(st);
    // The init layer hands the payload over in this slot.
    LUA.lua_pushstring(st, fengari.to_luastring(String(DBG.vaultB64)));
    LUA.lua_setglobal(st, '__SH_VAULT_B64');
    const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(ART));
    check('the artifact compiles', chunk === 0,
        chunk === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1)));
    const rc = chunk === 0 ? LUA.lua_pcall(st, 0, 0, 0) : -1;
    check('and it runs', rc === 0,
        rc === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1)));
    LUA.lua_getglobal(st, '__OP_RESULT');
    const got = LUA.lua_isnil(st, -1) ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
    LUA.lua_pop(st, 1);
    LUA.lua_close(st);
    check('and it produces the script\'s own output', got === '100|hello scripter #1, hello scripter #2',
        JSON.stringify(got));
}

// ---------------------------------------------------------------------------
console.log('');
console.log('[OP4] the file alone is not a script...');
// ---------------------------------------------------------------------------
{
    const st = AUX.luaL_newstate();
    LIB.luaL_openlibs(st);
    const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(ART));
    const rc = chunk === 0 ? LUA.lua_pcall(st, 0, 0, 0) : -1;
    const msg = rc === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
    LUA.lua_close(st);
    check('without the payload the artifact refuses to run', rc !== 0,
        'it ran anyway - the file is self-contained');
    check('and it says why', /payload is missing/.test(msg), JSON.stringify(msg.slice(0, 90)));
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
            for (const n of m[1].matchAll(/\b(\d{4,})\b/g)) freeSeeds.push(n[1]);
        }
    }
    check('a free build has no seed literal in the file', freeSeeds.length === 0,
        JSON.stringify(freeSeeds.slice(0, 5)));
    check('and it still produced a payload', String(free.dbg.vaultB64 || '').length > 0);

    const st = AUX.luaL_newstate();
    LIB.luaL_openlibs(st);
    LUA.lua_pushstring(st, fengari.to_luastring(String(free.dbg.vaultB64)));
    LUA.lua_setglobal(st, '__SH_VAULT_B64');
    const chunk = AUX.luaL_loadstring(st, fengari.to_luastring(free.code));
    const rc = chunk === 0 ? LUA.lua_pcall(st, 0, 0, 0) : -1;
    LUA.lua_getglobal(st, '__OP_RESULT');
    const got = LUA.lua_isnil(st, -1) ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1));
    LUA.lua_pop(st, 1);
    LUA.lua_close(st);
    check('and a free build runs with the payload', rc === 0,
        rc === 0 ? '' : fengari.to_jsstring(LUA.lua_tostring(st, -1)));
    check('and produces its output', got === '100|hello scripter #1, hello scripter #2', JSON.stringify(got));
}

console.log('');
console.log('='.repeat(72));
console.log('OPAQUE PAYLOAD   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
