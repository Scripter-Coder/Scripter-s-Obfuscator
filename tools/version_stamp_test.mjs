// The cache-busting stamp must match the file it busts.
//
// THE FAILURE THIS EXISTS FOR
//
// A fix to main.js was pushed. The version query in index.html was left as it
// was, so the URL did not change, so the browser served the OLD main.js -
// and the fix appeared not to work, in a test, on the live site, after a
// successful deploy.
//
// Nothing in the build or the deploy notices that. The page loads, the old
// code runs, and the only symptom is that the thing you just fixed is still
// broken. That is the worst possible failure for a cache: it is invisible,
// and it looks exactly like the fix not working.
//
// So the stamp is CHECKED, not trusted: it must be the first 12 hex characters
// of the SHA-256 of the file it refers to. A changed file with an unchanged
// stamp fails here, and the fix is one command.
//
// Run: node tools/version_stamp_test.mjs

import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const index = fs.readFileSync(new URL('index.html', ROOT), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

const STAMPED = ['main.js', 'rewards.js'];

console.log('[VS] the cache-busting stamp matches the file');
console.log('-'.repeat(72));

for (const file of STAMPED) {
    const buf = fs.readFileSync(new URL(file, ROOT));
    const expected = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    const m = new RegExp('\\./' + file.replace('.', '\\.') + '\\?v=([A-Za-z0-9._-]+)').exec(index);
    if (!m) {
        check(file + ' is referenced with a stamp', false,
            'no ?v= query on ./' + file + ' - the browser may serve a stale copy');
        continue;
    }
    check(file + ' is referenced with a stamp', true);
    check(file + " stamp matches its content", m[1] === expected,
        'index.html says v=' + m[1] + ', the file hashes to ' + expected +
        ' - run: node tools/stamp_version.mjs');
}

// The stamp only works if the page itself is not cached. A cached page can
// carry a stale stamp, which is the same failure one level up.
check('the page is served no-store',
    /http-equiv="Cache-Control"[^>]*no-store/.test(index),
    'a cached index.html can carry a stale stamp, so the whole scheme collapses');

console.log('');
console.log('VERSION STAMP   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
