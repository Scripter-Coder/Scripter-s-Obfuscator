// The artifact-size model must PREDICT, not merely admit uncertainty.
//
// HISTORY, because this test exists because the model was wrong by 5.7x.
//
// The budget used to model output as source x 4.5*(i/4)^1.73 - a multiplier
// rising from 0.4x at intensity 1 to 86x at intensity 22 - and it "clamped
// intensity" to hold the artifact down. Measured with the layer pass and wraps
// isolated:
//
//     srcKB    i=1   i=4   i=10  i=22
//       1.0     33    34    37    117
//       4.2     46    48    50     48
//      17.2    100   102   104    102
//      43.7    211   212   214    213
//
// Intensity does not move the output. Three of four rows are flat to within
// 2 KB across a 22x change in intensity. So the clamp was a no-op that reported
// success: the post-VM clamp fired on every measurement while the artifact
// stayed 2-4x over the budget it claimed to enforce.
//
// The replacement is the measured fit: outKB = 29 + 4.15 * inputKB, applied to
// the VM's REAL output rather than to the source - the bytecode VM runs after
// the first pass and was invisible to it.
//
// These checks run the real obfuscator, because a model checked only against
// itself proves nothing.

import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { readFileSync } from 'node:fs';

const readFile = () => readFileSync(new URL('../custom-obfuscator.js', import.meta.url), 'utf8');

await import('../public/vendor/luaparse.js');
const lp = globalThis.luaparse;
vmBCSetLuaparse(lp);
vmSetLuaparse(lp);
if (!lp) {
    console.error('luaparse unavailable - the bytecode tier cannot be measured');
    process.exit(1);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

function mk(n) {
    const out = ['local Players = game:GetService("Players")', 'local speed = 0'];
    for (let i = 0; i < n; i++) {
        out.push(`local function f${i}(a, b) local t = (a or 0) * ${i + 1} + (b or 1) return t % 97 end`);
        out.push(`speed = speed + f${i}(speed, ${i})`);
    }
    return out.join('\n');
}

function build(src, opts) {
    const dbg = {};
    const out = applyCustomObfuscator(src, {
        intensity: 6, ultra: true, scriptName: 't', owner: 't', keyless: true, ...opts,
    }, dbg);
    return { out, dbg, actualKB: out.length / 1024 };
}

console.log('artifact size model');

// --- the prediction has to be accurate -------------------------------------
// Measured before this model was written: bytecode 310/472/981/2503 KB and
// vm-lite 223/304/555/1238 KB for sources of 1/2/6/19 KB. A 25% band is loose
// enough for seed-driven variation and far tighter than the 5.7x it replaced.
const TOLERANCE = 0.25;
for (const [label, opts] of [['bytecode', {}], ['vm-lite', { vmTier: 'lite' }], ['no-vm', { vmPass: false }]]) {
    for (const n of [3, 18]) {
        const { dbg, actualKB } = build(mk(n), opts);
        const pred = dbg.postVmEstimatedOutputKB;
        const err = Math.abs(pred - actualKB) / actualKB;
        check(`${label} ${dbg.sourceKB}KB source: predicted ${Math.round(pred)}KB vs actual ${Math.round(actualKB)}KB`,
            err <= TOLERANCE, `off by ${(err * 100).toFixed(0)}%`);
    }
}

// --- intensity is NOT a size lever, and must not be sold as one -------------
{
    const src = mk(30);
    const lo = build(src, { intensity: 1, ultra: false, vmPass: false, doubleWrap: false, tripleWrap: false });
    const hi = build(src, { intensity: 20, ultra: true, vmPass: false, doubleWrap: false, tripleWrap: false });
    const delta = Math.abs(hi.actualKB - lo.actualKB) / lo.actualKB;
    check('intensity 1 vs 20 barely changes artifact size (it is not the size lever)',
        delta < 0.15, `size moved ${(delta * 100).toFixed(0)}%`);
    check('the SIZE PREDICTION is the measured linear fit, not the old curve',
        /LAYER_SLOPE = 4\.15/.test(readFile()) && /LAYER_FIXED_KB = 29/.test(readFile()),
        'the measured model was replaced');
}

// --- over-budget must be flagged, and blamed on the right thing ------------
{
    const big = build(mk(60), {});
    // CHANGED. These used to assert a large build IS over budget, which was
    // true only while every script silently took the bytecode VM regardless of
    // size. The tier is now chosen by what fits, so a large build is expected
    // to come back UNDER budget - and if it does not, that is the failure.
    check('a large build is downgraded to a tier that fits',
        big.dbg.sourceTierChosen === 'none' || big.dbg.sourceTierChosen === 'lite',
        'chose ' + big.dbg.sourceTierChosen);
    check('the downgraded artifact is inside the budget',
        big.dbg.artifactOverBudget !== true,
        `predicted ${big.dbg.postVmEstimatedOutputKB}KB, tier ${big.dbg.sourceTierChosen}`);
    check('the downgrade is reported, not silent',
        big.dbg.sourceTierExplicit === false && typeof big.dbg.noVmMaxSourceKB === 'number');
    check('the VM output is still reported so the jump is visible',
        typeof big.dbg.vmOutputKB === 'number' && big.dbg.vmOutputKB > 0);

    const small = build(mk(3), {});
    check('a small build keeps the strongest tier',
        small.dbg.sourceTierChosen === 'bytecode',
        'chose ' + small.dbg.sourceTierChosen + ', vmApplied=' + small.dbg.vmAppliedTier);
    check('a small build under budget is NOT flagged', small.dbg.artifactOverBudget !== true,
        `predicted ${small.dbg.postVmEstimatedOutputKB}KB`);
}

// --- the tier thresholds are what make large uploads work ------------------
{
    const small = build(mk(3), {});
    // Measured expansion per tier: bytecode 36.9x, lite 16.9x, none 1.0x.
    // The ceilings must follow from those, not from taste.
    const expectBytecode = Math.floor((600 - 29) / (36.9 * 4.15));
    const expectLite = Math.floor((600 - 29) / (16.9 * 4.15));
    const expectNone = Math.floor((600 - 29) / (1.0 * 4.15));
    check('bytecode ceiling matches its measured expansion',
        Math.abs(small.dbg.bytecodeMaxSourceKB - expectBytecode) <= 1,
        `${small.dbg.bytecodeMaxSourceKB} vs ${expectBytecode}`);
    check('vm-lite ceiling matches its measured expansion',
        Math.abs(small.dbg.liteMaxSourceKB - expectLite) <= 1,
        `${small.dbg.liteMaxSourceKB} vs ${expectLite}`);
    check('no-VM ceiling matches its measured expansion',
        Math.abs(small.dbg.noVmMaxSourceKB - expectNone) <= 1,
        `${small.dbg.noVmMaxSourceKB} vs ${expectNone}`);
    check('the ceilings strictly decrease (stronger tier, smaller reach)',
        small.dbg.bytecodeMaxSourceKB < small.dbg.liteMaxSourceKB
        && small.dbg.liteMaxSourceKB < small.dbg.noVmMaxSourceKB);
}

// --- the budget must be checked against the VM, not the source -------------
{
    // The source is small; the VM output is not. A budget reading the source
    // calls this fine, which is exactly the 5.7x blind spot.
    const r = build(mk(60), {});
    check('the authoritative estimate is the VM-based one, not the source-based one',
        r.dbg.estimatedOutputKB === r.dbg.postVmEstimatedOutputKB
        && r.dbg.estimatedOutputKB > r.dbg.preVmEstimatedOutputKB * 3,
        `pre-VM ${r.dbg.preVmEstimatedOutputKB}KB vs authoritative ${r.dbg.estimatedOutputKB}KB`);
    check('the VM output is reported so the caller can see the jump',
        typeof r.dbg.vmOutputKB === 'number' && r.dbg.vmOutputKB > 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
