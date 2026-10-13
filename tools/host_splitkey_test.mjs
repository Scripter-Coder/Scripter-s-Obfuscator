// The host response and the browser response must reach the same place.
//
// THE BUG
//
// `host_obfuscate.mjs` emits the split key as a SIBLING of dbgInfo:
//
//     { ok, code, elapsedMs, dbgInfo: {...}, splitKey: {...} }
//
// while the in-browser worker path nests it:
//
//     { ok, result, dbgInfo: { ..., splitKey: {...} } }
//
// `shCompileDirect` copied `data.dbgInfo` and dropped the sibling. The host
// path is every script over SH_HOST_MIN_SOURCE - which is exactly the large
// ones - so they always produced no split key, obfuscateScriptCode took its
// `else` branch, the upload carried none, and the server refused it:
//
//     POST /sh/upload 400
//     this build has no server-held key
//
// The server was right. Small scripts compile in the worker, take the other
// shape, and never hit it - so the symptom read as "large scripts are broken"
// rather than "one field is dropped in one caller".
//
// These checks pin the field to BOTH shapes, and pin the bridge's own contract,
// because the fix is worthless if either side moves again.

import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const bridge = readFileSync(
    new URL('../Storage Keeper/host_obfuscate.mjs', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

console.log('the split key reaches the upload from every path');

// --- the bridge's contract -------------------------------------------------
{
    // It emits splitKey as a sibling. That is the shape the client must handle,
    // and a future "tidying" that moves it into dbgInfo must update both sides.
    check('the bridge emits splitKey at the top level',
        /payload = \{[\s\S]*?splitKey: dbgInfo\.splitKey \|\| null/.test(bridge),
        'if this shape changed, shCompileDirect must change with it');
    check('and NOT inside dbgInfo',
        !/dbgInfo: \{[^}]*splitKey/.test(bridge));
}

// --- the client handles it -------------------------------------------------
{
    const fn = (main.match(/function shCompileDirect\([^]*?\n\}/) || [''])[0];
    check('shCompileDirect lifts the top-level splitKey into dbgInfo',
        /if \(data\.splitKey && !dbgInfo\.splitKey\) dbgInfo\.splitKey = data\.splitKey;/.test(fn),
        'the sibling is still being dropped');
    check('and returns the merged dbgInfo, not the raw one',
        /dbgInfo: dbgInfo/.test(fn),
        'it returns data.dbgInfo verbatim, so the merge is discarded');
    check('the old drop-everything form is gone',
        !/return \{ result: data\.code, dbgInfo: data\.dbgInfo \|\| \{\}/.test(fn));
}

// --- and the consumer needs it in exactly one place ------------------------
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
    check('both keeper call sites forward it',
        (main.match(/shUploadKeeper\(\{[^}]*splitKey:/g) || []).length >= 2,
        'a large script takes a keeper call site that drops it');
    check('kb-finalize receives it',
        /splitKey: o\.splitKey/.test(main));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
