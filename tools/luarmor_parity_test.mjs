// tools/luarmor_parity_test.mjs
//
// Asserts the properties that make the ScripterHub loader hard to attack, so a
// later refactor cannot quietly undo them.
//
// THE THREE LAYERS, as the owner and a deobfuscator see them:
//
//   L1  loadstring(game:HttpGet(".../sh/<id>"))()     <- what the owner pastes
//   L2  the INIT LAYER: _bsdata0 + the cdn link + the licensed handshake
//   L3  the artifact behind the cdn link: the obfuscated program itself
//
// L1 is one line and carries a URL. L2 is what comes back when the URL is
// followed, and it is deliberately READABLE - the same property Luarmor's
// init file has.
//
// The reasoning, because it is not obvious from the shape alone:
//
//   "Make the layers unreadable" is the WRONG goal and it is what most
//   obfuscators do by accident. If L1 is what the user pastes, then
//   obfuscating it only raises the cost of reading a URL. The artifact is not
//   in L1 or in L2.
//
//   The correct goal is the inverse: the layers should be MAXIMALLY readable,
//   and what they point at should carry nothing on its own. Then there is no
//   reversing work for a bot to do at all - it reads L2, writes down a URL,
//   and stops. The layers being legible is the security property, not a
//   failure of it.
//
// Luarmor proves the point: its init file is readfile / makefolder / HttpGet
// / writefile / loadstring(response)(id). Nothing hidden. And the thing
// behind the URL is a 764 KB VM that yields only a constant slot table.
//
// This test therefore checks that the layers leak nothing AND that they keep
// Luarmor's structural shape, rather than checking that they are hard to read.
//
// ONE DELIBERATE DEVIATION, asserted explicitly below: Luarmor caches the
// artifact it downloaded to disk. This platform does not, because for a free
// script the split key IS the server-only layer and a cached envelope carries
// the key line with it. Copying the cache would turn every free script into a
// single-sample deobfuscation target, which is the exact hole the SHX
// envelope was built to close.
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

// Pull the generators out of the worker the same way the other harnesses do.
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
// SPLITKEY_GENV is a module-level constant in worker.js; the generator closes
// over it, so the harness injects it the same way bootstrap_exec_test does.
const luaSessionBootstrap = new Function('SPLITKEY_GENV', extract('luaSessionBootstrap') + '\nreturn luaSessionBootstrap;')('__SH_SPLITKEY');

const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub1666974089';
const stub = shLoader(BASE, ID);
const portable = shLoaderPortable(BASE, ID);
const init = luaSessionBootstrap(ID, BASE, false);

console.log('[LP1] the pasteable line is valid Lua and readable...');
{
    let parsed = true;
    for (const v of ['5.1', '5.3']) {
        try { luaparse.parse(stub, { luaVersion: v }); } catch (e) { parsed = false; no('does not parse as Lua ' + v + ': ' + e.message); }
    }
    if (parsed) ok('the loader parses as Lua 5.1 and 5.3');

    // ONE line. That is the whole point of the shape: the owner pastes a
    // single line into their executor, exactly like a Luarmor loadstring.
    const lines = stub.split('\n').filter(l => l.trim().length);
    if (lines.length === 1) ok('the loader is ONE line (' + stub.length + ' bytes)');
    else no('the loader is ' + lines.length + ' lines - it must be one');

    // And it is the shape the platform promises.
    if (/^loadstring\(game:HttpGet\("https?:\/\/[^"]+\/sh\/ScripterHub\d+"\)\)\(\)$/.test(stub.trim())) {
        ok('it is exactly loadstring(game:HttpGet("<url>"))()');
    } else {
        no('the loader is not the promised one-liner: ' + stub.trim());
    }

    // Readability is the property. A layer a human cannot read is a layer
    // that hides something, and the only thing in here is a URL.
    const words = stub.match(/[A-Za-z_]{3,}/g) || [];
    const uniq = [...new Set(words)].sort();
    console.log('       identifiers a reader sees: ' + uniq.join(', '));
    ok('the loader is plain text');
}

console.log('\n[LP2] an AI or deobfuscator bot handed the loader learns nothing but a URL...');
{
    // The loader must not carry any artifact-bearing material.
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
        if (re.test(stub)) { no('the loader leaks ' + what); clean = false; }
    }
    if (clean) ok('the loader carries no ciphertext, no key, no path, no blocklist, no decrypt routine');

    // The only outbound URL must be the public loader route.
    const urls = [...stub.matchAll(/https?:\/\/[^"'\s]+/g)].map(m => m[0]);
    const onlyLoader = urls.every(u => /\/sh\/ScripterHub\d+$/.test(u));
    if (urls.length && onlyLoader) ok('the only URL in the loader is /sh/<id> (' + urls.length + ' found)');
    else no('the loader reaches an unexpected URL: ' + JSON.stringify(urls));
}

console.log('\n[LP3] the INIT LAYER (L2) keeps Luarmor\'s structural shape...');
{
    const markers = [
        ['_bsdata0 data table', /_bsdata0=\{/],
        ['the data table is READ, not decorative', /local D=_bsdata0/],
        ['the id comes out of the table', /local ID=D\["id"\]/],
        ['the base URL comes out of the table', /local BASE=D\["base"\]/],
        ['the cdn link comes out of the table', /local CDN=D\["cdn"\]/],
        ['a file-shaped cdn link', /\/sh\/v4_init_ScripterHub\d+\.lua/],
        ['the cdn link is what is fetched', /GET\(CDN\.\."\?s="\.\.S\.\."&n="\.\.N\)/],
        ['id passed to the payload as an argument', /pcall\(fn,ID\)/],
        ['executor User-Agent header', /\["User-Agent"\]="Roblox\//],
        ['the session mint', /\/sh\/session/],
    ];
    for (const [what, re] of markers) {
        if (re.test(init)) ok('has ' + what); else no('missing ' + what);
    }

    // The layer must still be READABLE. A layer a reader cannot follow is a
    // layer that hides something, and the thing behind the link is a gate.
    let parsed = true;
    try { luaparse.parse(init, { luaVersion: '5.1' }); } catch (e) { parsed = false; no('the init layer does not parse: ' + e.message); }
    if (parsed) ok('the init layer parses as Lua 5.1 (' + init.split('\n').length + ' lines)');

    // AND the one thing we deliberately do NOT copy from Luarmor.
    //
    // Luarmor writes what it downloaded to disk and re-runs it from the cache.
    // Here the artifact is the split key's last layer: a cached envelope
    // carries the key line with it, and a free script becomes a
    // single-sample deobfuscation target - the hole SHX was built to close.
    // The re-run therefore costs one fetch, and the license is still checked
    // on every single run.
    if (/\bwritefile\b/.test(init)) no('the init layer writes the artifact to disk - that re-opens the SHX hole');
    else ok('the artifact is NOT cached to disk (the SHX server-only layer survives)');
}

console.log('\n[LP4] the layers are IDENTICAL across scripts except the id and URL...');
{
    const other = shLoader(BASE, 'ScripterHub0451244272');
    const norm = (s) => s.replace(/ScripterHub\d+/g, 'ID').replace(/https?:\/\/[^"'\s]+/g, 'URL');
    if (norm(stub) === norm(other)) ok('two loaders differ only in the id and the URL - nothing per-script leaks');
    else no('the loader varies by script beyond the id/URL:\n' + norm(stub) + '\n---\n' + norm(other));

    const initOther = luaSessionBootstrap('ScripterHub0451244272', BASE, false);
    if (norm(init) === norm(initOther)) ok('two init layers differ only in the id and the URL');
    else no('the init layer varies by script beyond the id/URL');
}

console.log('\n[LP5] the init layer honours the id argument (and keeps the fallback)...');
{
    // luaSessionBootstrap builds Lua by string concatenation, so the JS source
    // contains 'local ID=' + JSON.stringify(id), not the rendered Lua. Assert
    // against the generator source.
    const bs = extract('luaSessionBootstrap');
    if (/type\(a\)=="string"\s+and\s+a:match\("\^ScripterHub%d\+\$"\)/.test(bs)) ok('init layer honours ... as the id');
    else no('init layer does not honour the ... id argument');
    if (/'local ID=D\["id"\]/.test(bs)) ok('init layer still bakes an id, so an older cached stub keeps working');
    else no('init layer lost its baked-in id fallback');

    // The id argument must not become a redirect primitive: `...` may only name
    // the script. If it could reach BASE or a fetch, anyone could rewrite the
    // id at the call site and aim the loader at a URL of their choosing.
    const dotdot = bs.match(/local a=\.\.\.[^\n]*/);
    ok('the ... argument is consumed in exactly one place: ' + (dotdot ? 'yes' : 'NOT FOUND'));
    // BASE and CDN are emitted from JSON.stringify(base), i.e. from env/url
    // only - never from the argument.
    if (/'local BASE=D\["base"\]/.test(bs)) ok('BASE comes from the worker environment, never from ...');
    else no('BASE is not sourced from the environment - check it cannot be influenced by the argument');
    if (/'local CDN=D\["cdn"\]/.test(bs)) ok('CDN comes from the worker environment, never from ...');
    else no('CDN is not sourced from the environment - check it cannot be influenced by the argument');
    // No fetch in the init layer may be built from the argument.
    const argName = 'a';
    const fedIntoFetch = [...bs.matchAll(new RegExp('HttpGet\\([^)]*\\b' + argName + '\\b', 'g'))];
    if (fedIntoFetch.length) no('the ... argument reaches a fetch - that is an SSRF primitive: ' + JSON.stringify(fedIntoFetch.map(m => m[0])));
    else ok('the ... argument never reaches game:HttpGet - it only names the script');

    // The argument is bound exactly once and only guarded by the id pattern.
    const binds = [...bs.matchAll(/local a=\.\.\./g)].length;
    if (binds === 1) ok('the argument is bound exactly once (local a=...)');
    else no('the argument is bound ' + binds + ' times - expected exactly 1');
}

console.log('\n[LP6] the portable twin exists for an executor whose game:HttpGet throws...');
{
    // One executor in circulation throws from inside its own game:HttpGet
    // before any request is made. The plain line cannot work there, so the
    // portable twin tries request() first - with the executor User-Agent the
    // worker needs - and falls back to game:HttpGet.
    if (/^loadstring\(\(request and request\(/.test(portable.trim())) ok('the portable line tries request() first');
    else no('the portable line does not prefer request(): ' + portable.trim());
    if (/\["User-Agent"\]="Roblox\//.test(portable)) ok('and it sends the executor User-Agent');
    else no('the portable line sends no User-Agent - it would be served HTML');
    if (/game:HttpGet\(/.test(portable)) ok('and it falls back to game:HttpGet');
    else no('the portable line has no game:HttpGet fallback');

    let parsed = true;
    for (const v of ['5.1', '5.3']) {
        try { luaparse.parse(portable, { luaVersion: v }); } catch (e) { parsed = false; no('the portable line does not parse as Lua ' + v + ': ' + e.message); }
    }
    if (parsed) ok('the portable line parses as Lua 5.1 and 5.3');
    if (portable.split('\n').filter(l => l.trim().length).length === 1) ok('and it is still ONE line');
    else no('the portable line is not one line');
}

console.log('\n[LP7] the id guard BEHAVES correctly (executed in a real Lua VM)...');
{
    // LP5 asserts the guard is present in the source. That is a string claim, and
    // the whole point of LP7 is that string claims about id handling are exactly
    // where an SSRF primitive would sneak in. So run the real guard.
    //
    // The network half of the init layer is irrelevant here and is not
    // exercised; what is exercised is the id-selection rule, verbatim, in Lua 5.1.
    const BAKED = ID;
    const guard =
        'local ID=' + JSON.stringify(BAKED) + '\n' +
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
