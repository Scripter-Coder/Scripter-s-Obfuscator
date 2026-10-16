// Can a script over 60 KB be obfuscated with the owner's PC off?
//
// THE REQUIREMENT
//
//   "if my PC is off then obfuscating scripts less than 60 KB has to work, and
//    if your code is big it just has to turn into like 1-10 KB, or failing that
//    try an alternative method for obfuscating more than 60 KB scripts"
//
// Two halves, and they have to be proved separately.
//
//   1. THE ROUTING. Everything above SH_HOST_MIN_SOURCE used to be handed to the
//      owner's machine, so a large script only obfuscated while that PC was
//      awake. Asserted here against main.js, because a regression here is
//      invisible until a user with a 300 KB script cannot obfuscate at all.
//
//   2. THE BUILD. Routing is only half the answer. A browser can be sent a job
//      it cannot finish: the bytecode VM expands a 302 KB source by 36.9x, so
//      ~45 MB of output plus the AST, the IR and the instruction stream is what
//      killed the tab, and "go compile it on the owner's PC" was the only
//      answer on offer. The tier picker now picks the strongest tier that FITS,
//      so the honest question is whether a source this size actually completes
//      with no VM at all. This runs that build for real, in this process, with
//      no host in the path - if it throws or comes back over budget, the
//      fallback the user is relying on does not exist.
//
// Run: node tools/bigscript_pc_off_test.mjs

import fs from 'node:fs';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// a Lua source of a target size, in the shape the repo's own benches use
//
// Sized by LENGTH, not by a guessed bytes-per-line: the first version of this
// asked for 300 KB and produced 165 KB, and then "over 60 KB" was quietly
// being tested by a source that was not.
// ---------------------------------------------------------------------------
function makeLua(kb) {
    const target = kb * 1024;
    const out = [
        'local Players = game:GetService("Players")',
        'local CF = {}',
        'local cache = {}',
        'local function fmt(n) return string.format("%s-%s", tostring(n), "x") end'
    ];
    let i = 0;
    while (out.join('\n').length < target) {
        out.push(
            `function CF.step${i}(a, b, c)` +
            ` local t = (a or 0) + (b or 1) * ${i % 97 + 1} + (c or 2)` +
            ` local s = fmt(t) .. "n${i}"` +
            ` cache[${i}] = s return t, s`);
        i++;
    }
    out.push('return CF');
    return out.join('\n');
}

function build(srcKB, cfg) {
    const src = makeLua(srcKB);
    const dbg = {};
    const t0 = Date.now();
    let out = null, err = null;
    try {
        out = applyCustomObfuscator(src, Object.assign({
            antiTamper: true, antiSkid: false, antiLogger: false,
            intensity: 10, scriptName: 'bigscript'
        }, cfg), dbg);
    } catch (e) { err = e; }
    return { src, out, dbg, err, ms: Date.now() - t0 };
}

// ===========================================================================
console.log('the browser builds EVERY script, and asks the PC only as a rescue');
// ===========================================================================
{
    // The dispatch function itself, so a routing branch added above it cannot
    // be mistaken for the decision.
    const fn = (main.match(/function shObfuscateInWorker\([^]*?\n\}\r?\n/) || [''])[0];
    check('shObfuscateInWorker exists', fn.length > 0);

    check('it builds locally first, before anything else',
        /shObfuscateLocally\(code, engine, options\)/.test(fn),
        'the local build has to come before any host decision');

    check('it does NOT send a big source to the host',
        !/code\.length\s*>=\s*SH_HOST_MIN_SOURCE[\s\S]{0,200}shObfuscateOnHost/.test(fn),
        'a source over 60 KB is still routed to the owner\'s machine');

    check('the host is reachable only from a rescue branch',
        /shIsOutOfMemory\(err\)/.test(fn) && /shObfuscateOnHost\(code, options\)/.test(fn),
        'no rescue path exists at all, so an OOM just fails');

    check('and the rescue asks whether the PC is even up',
        /shHostReady\(\)/.test(fn),
        'an OOM with the PC asleep would otherwise hang on the tunnel');

    check('a non-memory failure is re-thrown, not retried on the PC',
        /if \(!shIsOutOfMemory\(err\)\) throw err;/.test(fn),
        'a parse error would be retried on the host and reported as OOM');

    // The threshold still exists as a named constant, so the "60 KB" the owner
    // was promised is one number rather than a comment that can drift.
    check('the 60 KB threshold is still a named constant',
        /var SH_HOST_MIN_SOURCE = 60 \* 1024;/.test(main));
}

// ===========================================================================
console.log('\nan ordinary failure is not mistaken for an out-of-memory one');
// ===========================================================================
{
    const fn = (main.match(/function shIsOutOfMemory\([^]*?\n\}/) || [''])[0];
    check('shIsOutOfMemory exists', fn.length > 0);
    check('it matches the real OOM wording', /out of memory/i.test(fn));
    check('it does not match a syntax error',
        !/unexpected symbol|expected identifier|parse error/i.test(fn),
        'a source that does not parse fails the same way on the host');
}

// ===========================================================================
console.log('\na SMALL script still builds here, unchanged');
// ===========================================================================
{
    const r = build(8, {});
    check('it completes', !!r.out && !r.err, r.err && String(r.err.message));
    check('and it stays inside what an executor tolerates',
        !!r.out && r.out.length <= 600 * 1024,
        r.out && Math.round(r.out.length / 1024) + ' KB');
}

// ===========================================================================
console.log('\na 70 KB script builds with no host in the path  (just over 60 KB)');
// ===========================================================================
{
    const r = build(70, {});
    check('the source really is over the 60 KB threshold',
        r.src.length > 60 * 1024, Math.round(r.src.length / 1024) + ' KB');
    check('the build completes in this process', !!r.out && !r.err,
        r.err && String(r.err.message));
    if (r.out) {
        const outKB = Math.round(r.out.length / 1024);
        console.log(`       ${Math.round(r.src.length / 1024)} KB source -> ${outKB} KB artifact in ${(r.ms / 1000).toFixed(1)}s (tier: ${r.dbg.sourceTierChosen})`);
        check('the artifact is small enough to run', outKB <= 600,
            outKB + ' KB - an artifact this size never executes on an executor');
    }
}

// ===========================================================================
console.log('\na 300 KB script builds with no host in the path  (far over 60 KB)');
// ===========================================================================
{
    const r = build(300, {});
    check('the build completes in this process', !!r.out && !r.err,
        r.err && String(r.err.message));
    if (r.out) {
        const outKB = Math.round(r.out.length / 1024);
        console.log(`       ${Math.round(r.src.length / 1024)} KB source -> ${outKB} KB artifact in ${(r.ms / 1000).toFixed(1)}s (tier: ${r.dbg.sourceTierChosen})`);
        check('the tier was chosen to FIT, not hoped for',
            r.dbg.sourceTierChosen === 'none' || r.dbg.sourceTierChosen === 'lite',
            'tier ' + r.dbg.sourceTierChosen);
        check('the artifact is small enough to run', outKB <= 2048,
            outKB + ' KB - the reported symptom of a build that cannot execute');
        check('and it is not wildly larger than the source',
            outKB < 300 * 8, outKB + ' KB from a 300 KB source');
    }
}

// ===========================================================================
console.log('\nthe owner\'s PC is not asked about storage either');
// ===========================================================================
{
    const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    check('SH_STORE_URL is not bound', !/^SH_STORE_URL\s*=/m.test(toml),
        'the worker still points at the tunnel, so a PC-off site logs a failure on every delivery');
    const worker = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');
    check('the worker only asks the PC when it is configured',
        /function storeConfigured\(env\)\s*\{\s*return !!\(env && env\.SH_STORE_URL && env\.SH_STORE_TOKEN\)/.test(worker));
}

console.log('\nBIG SCRIPT, PC OFF   ' + (fails ? fails + ' CHECK(S) FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);
