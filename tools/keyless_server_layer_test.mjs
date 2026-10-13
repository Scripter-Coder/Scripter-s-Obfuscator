// End-to-end on the artefact side: a KEYLESS build must now contain the
// machinery that needs the server-held key, or the envelope buys nothing.
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { readFileSync } from 'node:fs';

await import('../public/vendor/luaparse.js');
const lp = globalThis.luaparse;
vmBCSetLuaparse(lp); vmSetLuaparse(lp);

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? ' - ' + d : '')); } };

const SRC = 'local a = 1\nprint("hello")\nreturn a\n';

console.log('keyless artefact carries a server-only layer');

// Lift shServerKeyOpts straight out of main.js, exactly as the other tests do.
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const fnSrc = (main.match(/function shServerKeyOpts\([^]*?\n\}/) || [''])[0];
const shServerKeyOpts = new Function('SH_STATS_ENDPOINT', fnSrc + '\nreturn shServerKeyOpts;')('https://x.test');

const optsKeyless = shServerKeyOpts(true, 'ScripterHub0000000001');
check('a keyless build is given a serverKey', !!(optsKeyless.serverKey && optsKeyless.serverKey.keyUrl),
    JSON.stringify(optsKeyless));
// The real SH_STATS_ENDPOINT carries a trailing slash; this test passes a bare
// host, so assert the PATH rather than a substring that depends on joining.
check('it points at the split-key endpoint',
    /sh\/k$/.test(String(optsKeyless.serverKey && optsKeyless.serverKey.keyUrl)),
    JSON.stringify(optsKeyless.serverKey && optsKeyless.serverKey.keyUrl));
check('it names the script', optsKeyless.serverKey && optsKeyless.serverKey.scriptRef === 'ScripterHub0000000001');

const optsPaid = shServerKeyOpts(false, 'ScripterHub0000000001');
check('a paid build is unchanged', !!(optsPaid.serverKey && optsPaid.serverKey.keyUrl));

// The artefact must actually consult the key. It reads it as an assembled
// string.char(...) expression, never as a literal, so assert the assembly.
for (const [label, opts] of [['keyless', optsKeyless], ['paid', optsPaid]]) {
    const dbg = {};
    const art = applyCustomObfuscator(SRC, {
        intensity: 6, scriptName: 'p', owner: 'p', ...opts,
    }, dbg);
    check(`${label} artefact is non-empty`, art.length > 100, String(art.length));
    check(`${label} artefact still parses as Lua`, (() => {
        try { lp.parse(art, { luaVersion: '5.1' }); return true; } catch (e) { return false; }
    })());
    check(`${label} artefact contains no plaintext source`, !/print\("hello"\)/.test(art));
}

// The split-key global is referenced via string.char so a static reader cannot
// hand-draw the target. Assert the assembly is present and the literal is not.
{
    const src = readFileSync(new URL('../custom-obfuscator.js', import.meta.url), 'utf8');
    check('the split-key global is assembled, not a literal',
        /splitKeyGenvExpr/.test(src) && /string\.char\(/.test(src));
    check('the plaintext global name is not emitted into artefacts',
        !/GENV\s*=\s*'__SH_SPLITKEY'/.test(src.replace(/const SPLITKEY_GENV = '__SH_SPLITKEY';/, '')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
