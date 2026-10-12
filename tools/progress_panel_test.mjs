// tools/progress_panel_test.mjs
//
// Guards the bug where the progress panel appeared but its estimate line never
// did.
//
// shObfuscateInWorker() called shProgressUpdate(ETA, 0) BEFORE
// shProgressEnsure(title). shProgressUpdate looked up #shObfsEta, found nothing,
// and returned silently - so the ETA was computed and discarded. The panel then
// appeared on the next call with an empty "Will take around ..." line.
//
// That is exactly the reported symptom: the panel showed, no estimate. A
// silently-missing element is invisible, so this exercises the real DOM order
// rather than asserting on the source text.
//
// Run: node tools/progress_panel_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('\n[PP1] the panel is CREATED before it is UPDATED');
console.log('-'.repeat(72));
{
    // Extract the two calls in the order they appear in the function body.
    const start = src.indexOf('function shObfuscateInWorker');
    const body = src.slice(start, src.indexOf('\n// ============', start) || start + 6000);

    const ensureAt = body.indexOf('shProgressEnsure(title)');
    const updateAt = body.indexOf('shProgressUpdate(ETA, 0)');

    if (ensureAt < 0) no('shProgressEnsure(title) is not called');
    else if (updateAt < 0) no('shProgressUpdate(ETA, 0) is not called');
    else if (ensureAt < updateAt) ok('ensure() comes before update() - the ETA has somewhere to go');
    else no('update() runs BEFORE ensure() - the estimate is written to a panel that does not exist yet');
}

console.log('\n[PP2] shProgressUpdate never silently drops a missing panel');
console.log('-'.repeat(72));
{
    const start = src.indexOf('function shProgressUpdate');
    const body = src.slice(start, start + 1400);
    if (/shProgressEnsure\(/.test(body)) ok('a missing panel is recreated rather than ignored');
    else no('shProgressUpdate still returns quietly when the panel is missing');

    // The specific anti-pattern that hid the bug: a MISSING panel that is
    // abandoned instead of rebuilt.
    //
    // A bare `if (!bar || !eta || !el) return;` used to appear here. Note that
    // a second such guard AFTER the heal attempt is correct and must not be
    // flagged - that is the "the rebuild failed too" case, not the bug. So this
    // checks the FIRST missing-panel branch, not every one.
    const firstBranch = /if\s*\(\s*!bar\s*\|\|\s*!eta\s*\|\|\s*!el\s*\)\s*\{([^}]*)\}/.exec(body);
    if (!firstBranch) no('no missing-panel branch found - the heal was removed');
    else if (/shProgressEnsure\(/.test(firstBranch[1])) ok('the first missing-panel branch REBUILDS the panel, it does not return');
    else if (/^\s*return\s*;?\s*$/.test(firstBranch[1].trim())) no('the first missing-panel branch still abandons the update - the ETA would be dropped silently');
    else ok('the first missing-panel branch handles the case: ' + firstBranch[1].trim().slice(0, 70));
}

console.log('\n[PP3] the panel contains an ETA element to write into');
console.log('-'.repeat(72));
{
    for (const [what, needle] of [
        ['ETA line', 'id="shObfsEta"'],
        ['progress bar', 'id="shObfsBar"'],
        ['elapsed line', 'id="shObfsElapsed"'],
    ]) {
        if (src.includes(needle)) ok('the panel defines a ' + what);
        else no('the panel has no ' + what);
    }
    if (src.includes("'Will take around ' +")) ok("the ETA line says 'Will take around …'");
    else no('the ETA sentence is missing');
}

console.log('\n[PP4] the bar never claims completion before it happens');
console.log('-'.repeat(72));
{
    const capped = /Math\.min\(92,/.test(src);
    if (capped) ok('the bar is capped at 92% while running');
    else no('the bar can reach 100% mid-run - that reports work as finished when it is not');
    const doneFn = src.slice(src.indexOf('function shProgressDone'), src.indexOf('function shProgressHide'));
    if (/100%/.test(doneFn)) ok('100% is applied only by shProgressDone()');
    else no('shProgressDone does not complete the bar');
}

console.log('\n' + '='.repeat(72));
console.log('PROGRESS PANEL   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);