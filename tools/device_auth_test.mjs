// A FRESH device must be able to obtain a user token from the stored password.
//
// THE BUG
//
// Both the signup and login handlers stored `btoa(password)` - base64, not
// encryption - while `shEnsureUserToken()` replayed that stored value straight to
// /sh/user-login. The worker hashes whatever it is given, so for a PBKDF2 record
// a base64 string can never match:
//
//     This browser has no session for your account
//     (the server refused the sign-in (HTTP 401):
//      Invalid email/username or password.)
//
// WHY IT LOOKED LIKE A PHONE BUG AND NOT AN AUTH BUG
//
// `shEnsureUserToken()` returns early when a token is already cached. A desktop
// that has obfuscated before holds one, so it never reached the broken line. A
// FRESH device has no cache, so re-authentication was the only way in - and it
// failed. The desktop was not working; it was skipping the defect.
//
// That asymmetry is the point of this file: the same code must work on a device
// with no cached token, so the checks below run that path explicitly.
//
// The helpers are lifted out of main.js and exercised for real.

import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// Lift the real helper out of the file so this is not a copy that can drift.
//
// A MISSING helper must report as a failed check, not crash the run. The first
// draft threw, so running this against the pre-fix main.js produced no output at
// all - which reads as "nothing to check" rather than "the fix is absent".
function lift(name, src) {
    const fn = (src.match(new RegExp('function ' + name + '\\([^]*?\\n\\}')) || [''])[0];
    if (!fn) {
        check(name + ' exists', false, 'not found in main.js - the fix is absent');
        return () => undefined;
    }
    // eslint-disable-next-line no-new-func
    return new Function(fn + '\nreturn ' + name + ';')();
}

const shStoredPassword = lift('shStoredPassword', main);
const shDecodeLegacyPassword = lift('shDecodeLegacyPassword', main);

console.log('a fresh device can re-authenticate');

// --- nothing stores base64 any more ----------------------------------------
{
    // The WRITE sites. A base64 write here is the whole bug returning.
    const signup = (main.match(/var user = \{[\s\S]*?password: [^,]+,/) || [''])[0];
    check('signup stores the plaintext password',
        /password: password,/.test(signup) && !/password: btoa\(password\)/.test(signup),
        signup.trim().split('\n').pop());

    const loginWrite = (main.match(/users\[d\.user\.email\]\.password = [^;]+;/) || [''])[0];
    check('login stores the plaintext password',
        /users\[d\.user\.email\]\.password = password;/.test(loginWrite),
        loginWrite.trim());

    const remaining = [...main.matchAll(/password:\s*btoa\(/g)].length;
    check('no handler writes btoa(password) any more', remaining === 0,
        remaining + ' remaining');
}

// --- the local comparison accepts what is already on disk -------------------
{
    const cmp = (main.match(/if \(!foundUser \|\| \(foundUser\.password[^)]*\)\)/) || [''])[0];
    check('the local check accepts BOTH the plaintext and the legacy base64 form',
        /foundUser\.password !== password/.test(cmp) && /btoa\(password\)/.test(cmp),
        'a record written by an older build would be rejected and sent to the cloud for nothing');
}

// --- the legacy fallback actually recovers a base64 record ------------------
{
    check('a plaintext record is returned as-is',
        shStoredPassword({ password: 'hunter2' }) === 'hunter2');
    check('a missing record yields an empty string, not undefined',
        shStoredPassword({}) === '' && shStoredPassword(null) === '');

    const legacy = btoa('hunter2');
    check('a legacy base64 record decodes to the password',
        shDecodeLegacyPassword(legacy) === 'hunter2',
        'got ' + shDecodeLegacyPassword(legacy));
    check('a plaintext password is NOT base64-decoded',
        shDecodeLegacyPassword('hunter2') === null,
        'atob is lenient and returns mojibake instead of throwing, so the decode is gated on a canonical btoa round trip');
    check('a password that IS canonical base64 still decodes',
        shDecodeLegacyPassword(btoa('aVeryLongPassword123!')) === 'aVeryLongPassword123!',
        'the round trip must not reject genuine legacy records');
    check('non-canonical base64 is rejected',
        shDecodeLegacyPassword('hunter2') === null && shDecodeLegacyPassword('aGVsbG8') === null);
    check('empty input yields null rather than throwing',
        shDecodeLegacyPassword('') === null && shDecodeLegacyPassword(null) === null);
    check('invalid base64 yields null rather than throwing',
        shDecodeLegacyPassword('!!!not base64!!!') === null);
}

// --- the order shEnsureUserToken uses --------------------------------------
{
    const fn = (main.match(/async function shEnsureUserToken\([^]*?\n\}/) || [''])[0];
    // The login call uses the RAW helper so it cannot re-enter the 401 retry and
    // recurse. Matched on the argument rather than the fetch helper name, so the
    // check survives either spelling of the call.
    check('shEnsureUserToken tries the stored value FIRST',
        /sh\/user-login'[\s\S]{0,120}password: stored/.test(fn),
        'it should not lead with the legacy decode');
    check('and falls back to the legacy decode when that is refused',
        /!d \|\| !d\.ok/.test(fn) && /shDecodeLegacyPassword/.test(fn));
    check('and MIGRATES the record once the fallback works',
        /u\.password = legacy/.test(fn),
        'without migration the fallback costs two requests on every call, forever');
    check('a genuine refusal still reports the server reason',
        /shEnsureUserTokenReason = 'the server refused the sign-in'/.test(fn));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
