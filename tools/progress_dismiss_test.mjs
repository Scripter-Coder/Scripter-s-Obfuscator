// A failed obfuscation must never leave the progress overlay on screen.
//
// THE BUG
//
//     Waiting for the host... (infinite time)
//
// with nothing else. shObfuscateOnHost called shProgressHide() on ONE branch -
// the "no token" case - and attached no catch to the rest of the chain. A refused
// ticket, an expired token the refresh could not replace, a network failure: all
// of them rejected with the overlay still up.
//
// The error was NOT lost. Both call sites attach a catch that calls
// showNotification('Obfuscation Failed', ...). But the overlay is
// `z-index: 99999` with a near-opaque full-screen backdrop, so the notification
// rendered BEHIND it. The user got a stuck dialog and no visible reason, which
// is why it was reported as "hangs forever" rather than "shows an error".
//
// So there are two defects stacked: the panel is never dismissed, and the reason
// is invisible while it is up. Both have to be fixed or the fix is invisible.
//
// These are static checks, because the overlay is z-indexed in CSS: only the
// source can tell whether the dismissal is attached to every exit path.

import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

console.log('a failed obfuscation always dismisses the overlay');

// --- the local build path ---------------------------------------------------
//
// The host path this file used to check (shObfuscateOnHost) is gone with the
// rest of the PC path. The browser build has the SAME defect waiting in it -
// a rejected build that leaves a full-screen overlay up - so the checks move
// to the path that actually runs now. The overlay is z-indexed and nearly
// opaque, so a failure report rendered behind it is invisible: the user gets a
// stuck dialog and no reason.
{
    const fn = (main.match(/function shObfuscateLocally\([^]*?\n\}\r?\n/) || [''])[0];
    check('shObfuscateLocally exists', fn.length > 0);
    check('it dismisses the overlay when the worker reports an error',
        /if \(m\.type === 'error'\) \{ finish\(reject/.test(fn),
        'a build that fails in the worker leaves the overlay up');
    check('it dismisses the overlay when the worker itself dies',
        /worker\.onerror = function \(err\) \{[\s\S]{0,200}?finish\(reject/.test(fn),
        'a worker that throws leaves the overlay up');
    check('and the finish helper hides it on every exit',
        /function finish\(fn, arg\) \{[\s\S]{0,400}?shProgressHide\(\)/.test(fn),
        'the overlay is not dismissed on the settled path');
    check('and there is no host path left to get stuck',
        !/shObfuscateOnHost/.test(main.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')),
        'the host path is gone; a leftover would be a path that can still hang');
}

// --- every call site that owns a button ------------------------------------
{
    // Each of these shows 'Obfuscation Failed'. Without a dismissal the user
    // never sees it.
    const sites = [...main.matchAll(/showNotification\('Obfuscation Failed'/g)];
    check('there are obfuscation-failure reports to guard', sites.length >= 2,
        'got ' + sites.length);
    let unguarded = 0;
    for (const m of sites) {
        // Look back a little from the notification to the catch that owns it.
        const win = main.slice(Math.max(0, m.index - 400), m.index);
        if (!/shProgressHide\(\);/.test(win)) unguarded++;
    }
    check('every one of them dismisses the overlay first',
        unguarded === 0,
        unguarded + ' failure report(s) render behind the stuck overlay');
}

// --- the overlay is what makes it invisible -------------------------------
{
    // Stated so a future "make the overlay lighter" edit knows this was the
    // reason the error was unreadable, not a stylistic choice.
    check('the overlay is still full-screen and opaque',
        /position:fixed',? 'inset:0'/.test(main.replace(/\s+/g, '').replace(/', /g, "','"))
        || /inset:0/.test(main));
    check('and sits above the notification layer',
        /z-index:99999/.test(main),
        'if this drops below the notification z-index the ordering below stops mattering - re-check both');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
