// Stamp the cache-busting version into index.html.
//
// WHY THIS IS A SCRIPT AND NOT A NUMBER I REMEMBER TO CHANGE
//
// The site is served as bare ES modules straight from the repository, so
// main.js has no hash in its URL and a browser is free to keep serving the
// copy it already has. A version query fixes that - but only if the version
// actually changes when the file changes.
//
// It did not. A fix was pushed, the version was left alone, and the browser
// served the OLD main.js for the whole test - so the fix looked like it had
// not worked. The failure is silent: the page loads, the old code runs, and
// the only symptom is that the thing you just fixed is still broken.
//
// So the version IS the content. The stamp is the first 12 hex characters of
// the file's SHA-256, which changes if and only if the file changes. There is
// nothing to remember, and there is no way to ship a change with a stale
// stamp.
//
// Run:  node tools/stamp_version.mjs
// Then: tools/version_stamp_test.mjs fails if the stamp was not refreshed.

import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const indexPath = new URL('index.html', ROOT);

// The files that are loaded by URL, and therefore need a stamp.
const STAMPED = ['main.js', 'rewards.js'];

function sha12(file) {
    const buf = fs.readFileSync(new URL(file, ROOT));
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

const index = fs.readFileSync(indexPath, 'utf8');
let out = index;
const stamps = {};

for (const file of STAMPED) {
    const stamp = sha12(file);
    stamps[file] = stamp;
    // ./main.js?v=OLD  ->  ./main.js?v=NEW
    const re = new RegExp('(\\./' + file.replace('.', '\\.') + '\\?v=)[A-Za-z0-9._-]+', 'g');
    if (!re.test(out)) {
        console.error('[stamp] ' + file + ' is not referenced with a ?v= stamp in index.html.');
        console.error('        Add it, or the browser will keep serving a stale copy.');
        process.exit(1);
    }
    out = out.replace(re, '$1' + stamp);
}

if (out !== index) {
    fs.writeFileSync(indexPath, out, 'utf8');
    console.log('[stamp] index.html updated:');
    for (const file of STAMPED) console.log('        ' + file + ' -> v=' + stamps[file]);
} else {
    console.log('[stamp] already current:');
    for (const file of STAMPED) console.log('        ' + file + ' -> v=' + stamps[file]);
}

// ---- reward.html, which has no <script> tag to hang a stamp on ----
//
// reward.html is reached by NAVIGATION to reward.html?rid=..., so the ?v= trick
// used for main.js has nothing to attach to: there is no reference to rewrite.
// GitHub Pages serves HTML with a short max-age, so a visitor who had the page
// open before the fix keeps the broken one until it expires.
//
// The stamp therefore goes where the link is built. rewardLink() in rewards.js
// appends it, so the URL a visitor opens changes exactly when reward.html does.
// Without this, "I fixed the ad popup" and "the visitor still sees a tab stuck
// on about:blank" are the same outcome, and the only fix is telling people to
// hard-refresh.
//
// Written into rewards.js as a constant rather than computed at runtime,
// because a browser cannot hash a file it has not fetched.
const rewardStamp = sha12('reward.html');
const rsPath = new URL('rewards.js', ROOT);
const rsSrc = fs.readFileSync(rsPath, 'utf8');
const RS_RE = /const REWARD_PAGE_STAMP = '[A-Za-z0-9._-]*';/;
if (!RS_RE.test(rsSrc)) {
    console.error('[stamp] rewards.js has no REWARD_PAGE_STAMP declaration to update.');
    console.error('        It must be exactly:  const REWARD_PAGE_STAMP = \'...\';');
    process.exit(1);
}
const rsOut = rsSrc.replace(RS_RE, "const REWARD_PAGE_STAMP = '" + rewardStamp + "';");
if (rsOut !== rsSrc) {
    fs.writeFileSync(rsPath, rsOut, 'utf8');
    console.log('[stamp] rewards.js updated: REWARD_PAGE_STAMP = ' + rewardStamp);
} else {
    console.log('[stamp] REWARD_PAGE_STAMP already current: ' + rewardStamp);
}
