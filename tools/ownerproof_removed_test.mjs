// PHASE 1 REGRESSION: ownerProof is dead everywhere.
//
// ownerProof was the base64 of the owner account's PASSWORD, accepted by
// isOwnerRequest() and by /sh/upload. It was reachable as a query-string
// parameter on the admin panel, which put a password-equivalent credential
// into proxy logs, browser history and Referer headers.
//
// This test proves the credential no longer authorizes ANY admin operation.
// It is a source-level test on purpose: the point is that the string is not
// merely unused but ABSENT, so it cannot be reintroduced by accident.

import assert from 'assert';
import fs from 'node:fs';

const WORKER = 'For Cloudflare/worker.js';
const MAIN = 'main.js';

const worker = fs.readFileSync(WORKER, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log('  OK   ' + name); }
    catch (e) { failures++; console.log('  FAIL ' + name + '\n         ' + e.message); }
}

console.log('[P1] ownerProof is removed as an authorization credential...');

// Documentation comments may still mention the removed name; that is
// deliberate, so the removal is not silently forgotten. What must not exist
// is LIVE CODE that reads the credential. These helpers strip comments and
// string literals before checking, so a stale doc comment cannot mask a real
// reference and a real reference cannot hide behind a comment.
//
// NOTE: strings are blanked, so a check for a route path must use `worker`
// (raw), not `workerCode`.
function stripCommentsAndStrings(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')      // line comments
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")        // single-quoted strings
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')        // double-quoted strings
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');         // template literals
}
const workerCode = stripCommentsAndStrings(worker);
const mainCode = stripCommentsAndStrings(main);

check('worker: isOwnerRequest no longer compares the owner password', () => {
    const fn = workerCode.slice(workerCode.indexOf('async function isOwnerRequest'));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    assert.ok(!/ownerProof/.test(body), 'isOwnerRequest still reads ownerProof');
    assert.ok(!/loadUsersMap/.test(body), 'isOwnerRequest still loads the user map to compare a password');
});

// The generic "no live reference anywhere" checks below already cover the
// upload route, so this one only asserts the route still exists and is
// reachable after the refactor (i.e. the removal did not break publishing).
check('worker: the /sh/upload route still exists and authenticates', () => {
    // raw source: string literals are blanked in workerCode
    assert.ok(/url\.pathname === '\/sh\/upload'/.test(worker), 'upload route not found');
    assert.ok(/verifyUserToken/.test(workerCode), 'upload no longer verifies a user session token');
    assert.ok(/verifyToken/.test(workerCode), 'owner token verification is missing');
});

check('worker: no endpoint reads ownerProof from a query string', () => {
    assert.ok(!/searchParams\.get\(\s*[\'"]ownerProof[\'"]\s*\)/.test(workerCode),
        'a route still accepts ?ownerProof= from the URL');
});

check('worker: no live ownerProof reference remains anywhere', () => {
    const hits = workerCode.split('\n')
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => /ownerProof/.test(l));
    assert.strictEqual(hits.length, 0,
        'live ownerProof references remain at lines: ' + hits.map(([n]) => n).join(', '));
});

check('main.js: shOwnerProof() is gone and unused', () => {
    assert.ok(!/function shOwnerProof/.test(mainCode), 'shOwnerProof is still defined');
    assert.ok(!/shOwnerProof\(\)/.test(mainCode), 'shOwnerProof is still called');
});

check('main.js: no owner credential is put in a query string', () => {
    assert.ok(!/ownerProof=/.test(mainCode), 'main.js still appends ownerProof= to a URL');
});

check('main.js: no live ownerProof reference remains anywhere', () => {
    const hits = mainCode.split('\n')
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => /ownerProof/.test(l));
    assert.strictEqual(hits.length, 0,
        'live ownerProof references remain at lines: ' + hits.map(([n]) => n).join(', '));
});

check('main.js: owner admin calls go through shOwnerApi with a header', () => {
    assert.ok(/function shOwnerApi/.test(main), 'shOwnerApi helper is missing');
    assert.ok(/'X-SH-Token':/.test(main), 'the owner token is not sent as a header');
    // every owner route that used ownerProof must now use shOwnerApi
    for (const route of ['sh/users', 'sh/users-delete', 'sh/users-clear', 'sh/licenses', 'sh/killswitch', 'sh/license-reset', 'sh/license-ban']) {
        assert.ok(new RegExp('shOwnerApi\\(\\s*[\'"]' + route).test(main),
            route + ' does not use shOwnerApi');
    }
});

console.log('');
if (failures) {
    console.log('OWNERPROOF REMOVAL TEST: ' + failures + ' FAILED');
    process.exit(1);
}
console.log('OWNERPROOF REMOVAL TEST: PASS - the password credential is gone end to end.');
