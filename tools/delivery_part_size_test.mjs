// Pin the invariant that killed "Unrecognised delivery format." and "toobig".
//
// THE BUG
//
// Delivery refuses to inline a body over INLINE_DELIVERY_MAX (~6 MB) because a
// response that large comes back from Cloudflare as 524/502 with an HTML error
// page, which the bootstrap reports as "Unrecognised delivery format."
//
// Artifacts therefore have to arrive as CHAIN PARTS. But the uploader was
// slicing at 40 MB, so an 18 MB artifact produced n = 1 - a script that was
// "chunked" with exactly one part, delivered as one 18 MB response. Same
// failure, reached a different way.
//
// Separately, the KV writer split at CHUNK_THRESHOLD (~25 MB, a storage limit)
// while delivery inlined at 6 MB (a delivery limit). Anything between the two
// was stored whole with no parts: neither inlinable nor chainable, so refused.
//
// THE INVARIANT
//
// Every unit of a delivery - the inline body AND every chain part - must fit
// in one response. Storage must therefore split exactly where delivery stops
// inlining, so no artifact can land in a gap between the two paths.
//
// These checks read the real source files, so they fail if either number is
// edited away rather than passing against a copy that drifted.

import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// Read and EVALUATE a `const NAME = <arithmetic>;` declaration.
//
// This must not regex out the first number it sees. Doing that is how this test
// was wrong once already: `40 * 1024 * 1024` matched as `40`, which is under
// the cap, so every check passed WITH the bug reintroduced - the exact failure
// this test exists to prevent. The whole expression is evaluated instead.
function constOf(src, name) {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;\\r\\n]+);'));
    if (!m) return null;
    const expr = m[1].trim();
    // Only pure arithmetic over numeric literals. Anything else (a reference to
    // another constant, a function call) must be reported, not guessed at.
    if (!/^[0-9_\s()*+\-/.]+$/.test(expr)) return NaN;
    try {
        // eslint-disable-next-line no-new-func
        return Function('"use strict";return (' + expr.replace(/_/g, '') + ')')();
    } catch (e) {
        return NaN;
    }
}

// Read a `const NAME = <identifier>;` declaration - i.e. one that DERIVES its
// value from another constant instead of repeating a literal.
function derivedOf(src, name) {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*;'));
    return m ? m[1] : null;
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

console.log('delivery part sizing');

// --- worker: the two numbers that must not drift apart ---------------------
const INLINE = constOf(worker, 'INLINE_DELIVERY_MAX');
check('INLINE_DELIVERY_MAX is defined', INLINE !== null, 'not found');
check('INLINE_DELIVERY_MAX is a readable number', Number.isFinite(INLINE), 'could not evaluate: ' + INLINE);
check('INLINE_DELIVERY_MAX is a sane 6 MB', INLINE === 6000000, 'got ' + INLINE);

const CHUNK_DELIVERY = constOf(worker, 'CHUNK_DELIVERY_MAX');
check('CHUNK_DELIVERY_MAX is defined', CHUNK_DELIVERY !== null || derivedOf(worker, 'CHUNK_DELIVERY_MAX') !== null, 'not found');

// The whole point: storage splits where delivery stops inlining. Deriving it
// from the inline cap - rather than repeating a second literal - is what makes
// drift impossible, so that is what is asserted: a second number is exactly
// how the original gap opened.
check('storage split size is DERIVED from the inline cap, not a second literal',
    derivedOf(worker, 'CHUNK_DELIVERY_MAX') === 'INLINE_DELIVERY_MAX',
    'derived from ' + derivedOf(worker, 'CHUNK_DELIVERY_MAX') + ' - a second literal can drift apart again');

// If it is a literal after all, it still must not exceed the inline cap.
// A DERIVED value cannot be compared numerically (constOf returns NaN for a
// reference), and that is fine: derivation is the stronger guarantee, already
// asserted above. Only a literal is held to the numeric comparison.
check('storage splits no later than delivery inlines',
    derivedOf(worker, 'CHUNK_DELIVERY_MAX') === 'INLINE_DELIVERY_MAX'
    || (Number.isFinite(CHUNK_DELIVERY) && CHUNK_DELIVERY <= INLINE),
    'split at ' + CHUNK_DELIVERY + ' but delivery inlines to ' + INLINE);

// putBlob must actually use it, not the old 25 MB storage constant.
const putBlobBody = (worker.match(/async function putBlob[\s\S]*?\r?\n\}\r?\n/) || [''])[0];
check('putBlob splits on CHUNK_DELIVERY_MAX',
    /s\.length <= CHUNK_DELIVERY_MAX/.test(putBlobBody),
    'the whole-value branch still tests something else');
check('putBlob no longer splits on CHUNK_THRESHOLD',
    !/s\.length <= CHUNK_THRESHOLD/.test(putBlobBody),
    'still splits at the storage limit, reopening the dead zone');
check('putBlob slice uses CHUNK_DELIVERY_MAX',
    /slice\(i \* CHUNK_DELIVERY_MAX/.test(putBlobBody));

// --- the part size lives in the WORKER now ---------------------------------
//
// It used to be SH_KEEPER_PART_SIZE in main.js, because the parts were stored
// on the owner's PC. Nothing is stored there any more, so the client has no
// part size to keep in step with anything - the worker owns it, as
// CHUNK_DELIVERY_MAX, which is DERIVED from INLINE_DELIVERY_MAX (asserted
// above, so there is still exactly one number).
//
// The property that matters is unchanged and is asserted against the worker:
// a part must fit in ONE response, or the loader receives an HTML error page
// and reports "Unrecognised delivery format".
const WORKER_PART = INLINE;
check('the worker defines CHUNK_DELIVERY_MAX', CHUNK_DELIVERY !== null || derivedOf(worker, 'CHUNK_DELIVERY_MAX') !== null, 'not found');
check('a chain part fits in one response (<= inline cap)',
    Number.isFinite(WORKER_PART) && WORKER_PART <= INLINE,
    'part is ' + WORKER_PART + ' bytes, inline cap is ' + INLINE + ' - this is the 524 bug');
check('part size is not the old 40 MB value', WORKER_PART !== 40 * 1024 * 1024, 'reverted to the 40 MB bug');
check('the client has no part size of its own to drift',
    constOf(main, 'SH_KEEPER_PART_SIZE') === null,
    'the client still carries a part size, so the two can disagree again');

// The concrete reported artifact, sliced the new way.
const REPORTED = 18592590;
const parts = Math.ceil(REPORTED / WORKER_PART);
check('the reported 18.5 MB artifact now splits into a real chain',
    parts > 1, 'still n = 1, so there is no chain to fall back on');
check('every part of that artifact is deliverable',
    REPORTED / parts <= INLINE,
    'largest part would be ' + Math.ceil(REPORTED / parts) + ' bytes');

// --- the whole host compile path is gone, in BOTH halves --------------------
//
// The client used to reach the owner's machine for a big script, and the
// worker used to mint it a signed pass. Both are removed: a product that
// compiles in the browser cannot be broken by a PC that is off, and a route
// that hands out a pass to a machine is an attack surface with no user left
// to serve it.
check('the relaying /sh/obfuscate proxy is gone',
    !/fetch\(String\(env\.SH_STORE_URL\)[^)]*\/v1\/obfuscate/.test(worker),
    'a subrequest relay is back - a 100s compile through a Worker is the 520');
check('the host routes answer with a reload instruction, not a ticket',
    /reason: 'stale'/.test(worker) && /Reload it/.test(worker));
check('the worker no longer mints a pass to the owner\'s machine',
    !/hmacHex\(String\(env\.SH_STORE_TOKEN\), payload\)/.test(worker),
    'a ticket route that outlives its caller is a door left open');
check('the worker no longer probes the PC for health',
    !/\/v1\/obfuscate\/health/.test(worker),
    'the worker still asks the PC whether it is awake');
check('the client has no host-compile path left',
    !/shObfuscateOnHost|shHostReady|shMintHostTicket|shCompileDirect|shUploadKeeper/.test(codeOnly(main)),
    'a function that can still reach for the PC is a function that will be used again');
check('and no error message tells the user to start a service',
    !/Start the Storage Keeper/i.test(codeOnly(main)),
    'the message is the reason people believed the site needed their PC');

// --- localStorage: sized before writing, not caught after ------------------
// The fix is that the payload is measured and trimmed BEFORE the write, so the
// common case never raises QuotaExceededError at all. Asserting the shape of
// the function is more honest than asserting a comment exists.
const saveProjectsBody = (main.match(/function saveProjects[\s\S]*?\r?\n\}\r?\n/) || [''])[0];
check('saveProjects compares against a declared budget', /SH_LOCAL_BUDGET/.test(saveProjectsBody));
check('saveProjects serialises before attempting the write',
    /payload = JSON\.stringify\(projects\)/.test(saveProjectsBody)
    && saveProjectsBody.indexOf('payload = JSON.stringify(projects)') < saveProjectsBody.indexOf('localStorage.setItem'),
    'it still writes first and reacts afterwards');
check('saveProjects trims in a loop until the payload fits',
    /pass\s*<\s*2/.test(saveProjectsBody) && /codeStripped\s*=\s*true/.test(saveProjectsBody));
check('the red QuotaExceededError console.error is gone',
    !/console\.error\('Error saving projects:'/.test(main),
    'a successful build still prints a red error');
check('a stripped script explains itself in Script Settings',
    /strippedHtml/.test(main) && /codeStripped/.test(main));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
