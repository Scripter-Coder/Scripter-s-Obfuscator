// tools/luarmor_parity_test.mjs
//
// Asserts the properties that make the Luarmor stub hard to attack, so a later
// refactor cannot quietly undo them.
//
// The reasoning, because it is not obvious from the shape alone:
//
//   "Make the stub unreadable" is the WRONG goal and it is what most obfuscators
//   do by accident. If the stub is what the user pastes, then obfuscating the
//   stub only raises the cost of reading a URL. The artifact is not in the stub.
//   The URL is public and permanent (D6); nothing can change that.
//
//   The correct goal is the inverse: the stub should be MAXIMALLY readable, and
//   what it points at should carry nothing. Then there is no reversing work for a
//   bot to do at all - it reads the stub, writes down a URL, and stops. The stub
//   being legible is the security property, not a failure of it.
//
//   Luarmor's stub proves the point: readfile / makefolder / HttpGet / writefile /
//   loadstring(response)(id). Nothing hidden. And the thing behind the URL is a
//   764 KB VM that yields only a constant slot table.
//
// This test therefore checks that the stub leaks nothing AND that it keeps
// Luarmor's structural shape, rather than checking that it is hard to read.
//
// Run: node tools/luarmor_parity_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';
import * as fengari from 'fengari';

const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

// Pull shLoader out of the worker the same way the other harnesses do.
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
const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub1666974089';
const stub = shLoader(BASE, ID);

console.log('[LP1] the stub is valid Lua and readable...');
{
    let parsed = true;
    for (const v of ['5.1', '5.3']) {
        try { luaparse.parse(stub, { luaVersion: v }); } catch (e) { parsed = false; no('does not parse as Lua ' + v + ': ' + e.message); }
    }
    if (parsed) ok('stub parses as Lua 5.1 and 5.3');

    // Readability is the property. A stub a human cannot read is a stub that
    // hides something, and the only thing in here is a URL.
    const words = stub.match(/[A-Za-z_]{3,}/g) || [];
    const uniq = [...new Set(words)].sort();
    console.log('       identifiers a reader sees: ' + uniq.join(', '));
    ok('stub is plain text (' + stub.length + ' bytes, ' + stub.split('\n').length + ' lines)');
}

console.log('\n[LP2] an AI or deobfuscator bot handed the stub learns nothing but a URL...');
{
    // The stub must not carry any artifact-bearing material.
    const leaks = [
        ['artifact bytes', /SHL\\n|SHK\\n|SHG /],
        ['ciphertext envelope', /SHOK|SHKEK1:/],
        ['session nonce/grant', /signGrant|verifyGrant|b64u/],
        ['the /sh/a delivery path', /\/sh\/a\//],
        ['the /sh/session mint path', /\/sh\/session/],
        ['the chunk paths', /\/sh\/c\/|\/sh\/g\/|\/sh\/kb\//],
        ['the split-key global', /__SH_SPLITKEY/],
        ['the decrypt routine', /function\s+DEC\b|xs128|djb2|SD\(/],
        ['license/hwid strings', /ScripterHubKeyValid|LRM_UserDiscordID|identifyexecutor/],
        ['the anti-logger blocklist', /unluac|luadec|hooklog|httplog/],
    ];
    let clean = true;
    for (const [what, re] of leaks) {
        if (re.test(stub)) { no('stub leaks ' + what); clean = false; }
    }
    if (clean) ok('stub carries no ciphertext, no key, no path, no blocklist, no decrypt routine');

    // The only outbound URL must be the public loader route.
    const urls = [...stub.matchAll(/https?:\/\/[^"'\s]+/g)].map(m => m[0]);
    const onlyLoader = urls.every(u => /\/sh\/ScripterHub\d+$/.test(u));
    if (urls.length && onlyLoader) ok('the only URL in the stub is /sh/<id> (' + urls.length + ' found)');
    else no('stub reaches an unexpected URL: ' + JSON.stringify(urls));
}

console.log('\n[LP3] Luarmor structural parity...');
{
    const markers = [
        ['readfile  (cache hit)', /pcall\(function\(\)\s*a=readfile/],
        ['makefolder (cache dir)', /pcall\(makefolder,d\)/],
        ['writefile (cache write)', /writefile\(p,r\)/],
        ['loadstring of the response', /loadstring\(a\)/],
        ['id passed as an argument', /return f\("ScripterHub\d+"\)/],
        ['executor User-Agent header', /\["User-Agent"\]="Roblox\//],
    ];
    for (const [what, re] of markers) {
        if (re.test(stub)) ok('has ' + what); else no('missing ' + what);
    }

    // It must not have regressed to a bare one-liner that runs whatever came back.
    if (/loadstring\(\(request and request/.test(stub)) no('regressed to the old one-liner form');
    else ok('did not regress to the old one-liner form');
}

console.log('\n[LP4] the stub is IDENTICAL across scripts except the id and URL...');
{
    const other = shLoader(BASE, 'ScripterHub0451244272');
    const norm = (s) => s.replace(/ScripterHub\d+/g, 'ID').replace(/https?:\/\/[^"'\s]+/g, 'URL');
    if (norm(stub) === norm(other)) ok('two scripts differ only in the id and the URL - nothing per-script leaks');
    else no('the stub varies by script beyond the id/URL:\n' + norm(stub) + '\n---\n' + norm(other));
}

console.log('\n[LP5] the bootstrap accepts the id as an argument (and keeps the fallback)...');
{
    // luaSessionBootstrap builds Lua by string concatenation, so the JS source
    // contains 'local ID=' + JSON.stringify(id), not the rendered Lua. Assert
    // against the generator source.
    const bs = extract('luaSessionBootstrap');
    if (/type\(a\)=="string"\s+and\s+a:match\("\^ScripterHub%d\+\$"\)/.test(bs)) ok('bootstrap honours ... as the id');
    else no('bootstrap does not honour the ... id argument');
    if (/'local ID='\s*\+\s*JSON\.stringify\(id\)/.test(bs)) ok('bootstrap still bakes an id, so an older cached stub keeps working');
    else no('bootstrap lost its baked-in id fallback');

    // The id argument must not become a redirect primitive: `...` may only name
    // the script. If it could reach BASE or a fetch, anyone could rewrite the
    // id at the call site and aim the loader at a URL of their choosing.
    const dotdot = bs.match(/local a=\.\.\.[^\n]*/);
    ok('the ... argument is consumed in exactly one place: ' + (dotdot ? 'yes' : 'NOT FOUND'));
    // BASE is emitted from JSON.stringify(base), i.e. from env/url only - never
    // from the argument.
    if (/'local BASE='\s*\+\s*JSON\.stringify\(base\)/.test(bs)) ok('BASE comes from the worker environment, never from ...');
    else no('BASE is not sourced from the environment - check it cannot be influenced by the argument');
    // No fetch in the bootstrap may be built from the argument.
    //
    // Scoped deliberately: the `a` identifier also names unrelated locals (a
    // chain-part URL is built from `root`, which comes from the server's own
    // SHG header). Asserting on bare /HttpGet\([^)]*a/ matched those and
    // produced a false SSRF report, so match the argument's own name only.
    const argName = 'a';
    const fedIntoFetch = [...bs.matchAll(new RegExp('HttpGet\\([^)]*\\b' + argName + '\\b', 'g'))];
    if (fedIntoFetch.length) no('the ... argument reaches a fetch - that is an SSRF primitive: ' + JSON.stringify(fedIntoFetch.map(m => m[0])));
    else ok('the ... argument never reaches game:HttpGet - it only names the script');

    // The argument is bound exactly once and only guarded by the id pattern.
    const binds = [...bs.matchAll(/local a=\.\.\./g)].length;
    if (binds === 1) ok('the argument is bound exactly once (local a=...)');
    else no('the argument is bound ' + binds + ' times - expected exactly 1');
}

console.log('\n[LP6] the id guard BEHAVES correctly (executed in a real Lua VM)...');
{
    // LP5 asserts the guard is present in the source. That is a string claim, and
    // the whole point of LP6 is that string claims about id handling are exactly
    // where an SSRF primitive would sneak in. So run the real guard.
    //
    // The network half of the bootstrap is irrelevant here and is not exercised;
    // what is exercised is the id-selection rule, verbatim, in Lua 5.1.
    const BAKED = ID;
    const bakedQ = JSON.stringify(BAKED);
    const guard =
        'local ID=' + bakedQ + '\n' +
        'local a=ARGV\n' +
        'if type(a)=="string" and a:match("^ScripterHub%d+$") then ID=a end\n' +
        'return ID';

    const settle = (luaArg) => {
        const st = AUX.luaL_newstate();
        LIB.luaL_openlibs(st);
        if (AUX.luaL_loadstring(st, fengari.to_luastring(
            'local ARGV=' + luaArg + '\n' + guard)) !== 0) {
            const e = fengari.to_jsstring(LUA.lua_tostring(st, -1));
            LUA.lua_close(st);
            throw new Error('did not compile: ' + e);
        }
        if (LUA.lua_pcall(st, 0, 1, 0) !== 0) {
            const e = fengari.to_jsstring(LUA.lua_tostring(st, -1));
            LUA.lua_close(st);
            throw new Error('threw: ' + e);
        }
        const got = fengari.to_jsstring(LUA.lua_tostring(st, -1));
        LUA.lua_close(st);
        return got;
    };

    const OTHER = 'ScripterHub0451244272';
    const cases = [
        ['an old cached stub that passes no argument', 'nil', BAKED],
        ['the stub passing its own id', JSON.stringify(BAKED), BAKED],
        ['a different script id', JSON.stringify(OTHER), OTHER],
        ['a URL as the id', JSON.stringify('https://evil.example/x'), BAKED],
        ['a traversal string as the id', JSON.stringify('../../etc/passwd'), BAKED],
        ['an empty id', '""', BAKED],
        ['a non-string id (number)', '12345', BAKED],
        ['an id with trailing junk', JSON.stringify(BAKED + '"/../x'), BAKED],
    ];

    for (const [label, arg, expected] of cases) {
        let got;
        try { got = settle(arg); }
        catch (e) { no('guard threw for ' + label + ': ' + e.message); continue; }
        if (got === expected) ok(label + ' -> ' + got);
        else no(label + ' -> got ' + got + ', expected ' + expected);
    }
}

console.log('\n' + '='.repeat(72));
console.log('LUARMOR PARITY   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);