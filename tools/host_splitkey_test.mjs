// The split key must reach the upload from EVERY path that still exists.
//
// THE BUG THIS WAS WRITTEN FOR
//
// `host_obfuscate.mjs` (the owner's PC) emitted the split key as a SIBLING of
// dbgInfo:
//
//     { ok, code, elapsedMs, dbgInfo: {...}, splitKey: {...} }
//
// while the in-browser path nests it:
//
//     { ok, result, dbgInfo: { ..., splitKey: {...} } }
//
// `shCompileDirect` copied `data.dbgInfo` and dropped the sibling. The host
// path was every script over SH_HOST_MIN_SOURCE - which is exactly the large
// ones - so they always produced no split key, obfuscateScriptCode took its
// `else` branch, the upload carried none, and the server refused it:
//
//     POST /sh/upload 400
//     this build has no server-held key
//
// The server was right. Small scripts compiled in the browser, took the other
// shape, and never hit it - so the symptom read as "large scripts are broken"
// rather than "one field is dropped in one caller".
//
// WHY THE FILE STILL EXISTS, IN THIS SHAPE
//
// The host path is GONE - the owner's PC is not part of this product any
// more - so the specific bridge no longer has a client to feed. What is left
// to protect is the part that IS still there: one producer, one consumer, one
// upload. The checks below assert that the split key cannot be dropped by
// anything that still runs, and that no new call site appears that forgets it.
//
// A test that only described a deleted path would rot quietly. This one now
// describes the contract that replaced it.

import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// The code, without the prose.
//
// A grep over the raw file cannot tell a function from a comment about that
// function, and main.js deliberately NAMES the removed host functions in its
// comments - they record why the host path is gone, which is worth keeping.
// So comments are stripped before the code is inspected.
//
// Only whole-line comments are removed. A trailing `//` on a line of code is
// left alone, because stripping to the first `//` would eat a URL like
// "https://..." and take the rest of the line with it.
function codeOnly(src) {
    return src
        .split('\n')
        .filter(line => !/^\s*\/\//.test(line))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
}

console.log('the split key reaches the upload from every path that still exists');

// --- the host path is gone, so there is no second shape to disagree with ----
{
    check('there is no host-compile path left in the client',
        !/shCompileDirect|shObfuscateOnHost|shMintHostTicket|shHostReady/.test(codeOnly(main)),
        'a path that can still compile on the owner\'s machine is a path that can still drop a key');
    check('and no host-compile path in the worker',
        !/hmacHex\(String\(env\.SH_STORE_TOKEN\), payload\)/.test(codeOnly(readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8'))),
        'the worker still mints a pass to the owner\'s machine');
}

// --- the one producer and the one consumer ---------------------------------
{
    const idx = main.indexOf('function obfuscateScriptCode(');
    const body = main.slice(idx, main.indexOf('\nfunction ', idx + 10));
    check('obfuscateScriptCode reads dbgInfo.splitKey',
        /dbg\.splitKey && dbg\.splitKey\.paddedKey/.test(body),
        'the consumer moved; the producer and the upload guard must follow');
    check('and resolves a bare string only when there is genuinely no key',
        /resolve\(out\);/.test(body));
}

// --- the upload actually sends it -----------------------------------------
{
    check('the upload attaches splitKey when present',
        /if \(splitKey\) \{/.test(main),
        'the split key is produced and then not sent');
    // The keeper call site that used to be here is gone with the keeper path.
    // What is left to check is that nothing new appeared in its place - a
    // call site that forgets splitKey strands the key on a machine that does
    // not exist, and the server refuses the upload with a message about a
    // "version mismatch" that names nothing about the real cause.
    check('no call site can drop it',
        (main.match(/shUploadKeeper\(\{[^}]*\}/g) || []).length === 0,
        'a keeper call site that does not forward splitKey strands the key');
    check('and the keeper bridge is not called at all',
        !/sh\/kb-put|sh\/kb-finalize/.test(main),
        'the client is still talking to the keeper');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
