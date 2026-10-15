// Every authenticated call must survive an EXPIRED cached token.
//
// THE BUG
//
// The worker issues user tokens with a short TTL - SH_URL_TOKEN_TTL_SECONDS is
// 15 minutes - and the client cached one in localStorage with no expiry and no
// validation. shEnsureUserToken() returned whatever it found there without ever
// asking the server, so once the token aged out:
//
//   * every authenticated call 401'd
//   * the only way out was to sign in again BY HAND
//   * the cached token shadowed that, so it never even prompted
//
// Reported as "worked yesterday, today obfuscation AND cloud refresh both
// fail", which reads as two faults but is one expired string.
//
// WHY A STRING CHECK ON main.js IS NOT ENOUGH
//
// The fix has three moving parts that have to agree: the retry must fire on 401,
// it must actually obtain a NEW token, and the login call inside that refresh
// must NOT itself trigger a refresh. The last one is a recursion, and recursion
// does not show up as a readable substring - it hangs the page. So these checks
// assert the shape of all three, plus that no authenticated endpoint is left on
// the raw, unguarded path.

import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

console.log('an expired token recovers instead of bricking the page');

// --- the retry itself ------------------------------------------------------
{
    const fn = (main.match(/function shRetryOnceAfter401\([^]*?\n\}/) || [''])[0];
    check('a retry helper exists', fn.length > 0);
    check('it fires only on 401', /first\.status !== 401/.test(fn));
    check('it asks for a FRESH token, not the cached one',
        /shForceUserToken\(\)/.test(fn));
    check('it reports the ORIGINAL failure when no new token is obtainable',
        /if \(!fresh\) return first/.test(fn),
        'otherwise the real reason is replaced by a vaguer one');
    check('it is re-entrancy guarded, so a 401 cannot loop forever',
        /shRefreshingToken/.test(fn),
        'recursion would hang the page rather than report the failure');
    check('and it always clears the guard, including on rejection',
        (fn.match(/shRefreshingToken = false/g) || []).length >= 2,
        'a thrown refresh would leave the guard set and disable recovery forever');
}

// --- the refresh itself ----------------------------------------------------
{
    check('the cached token can be discarded',
        /function shInvalidateUserToken\(\)/.test(main));
    check('and it clears BOTH storages',
        /sessionStorage\.removeItem\('sh_user_token'\)/.test(main)
        && /localStorage\.removeItem\('sh_user_token'\)/.test(main));
    check('shEnsureUserToken accepts a force flag',
        /async function shEnsureUserToken\(force\)/.test(main),
        'without it, the refresh would return the same stale token');
    check('force ignores the cache',
        /var existing = force \? null : shGetUserToken\(\)/.test(main));
    check('a token exists but is unchecked - the defect - is gone',
        !/async function shEnsureUserToken\(\)\s*\{\s*var existing = shGetUserToken\(\);\s*if \(existing\) return existing;/.test(main));
}

// --- no recursion ----------------------------------------------------------
{
    const fn = (main.match(/async function shEnsureUserToken\([^]*?\n\}/) || [''])[0];
    const loginCalls = (fn.match(/await shApi\('sh\/user-login'/g) || []).length;
    const rawCalls = (fn.match(/await shApiRaw\('sh\/user-login'/g) || []).length;
    check('the login call inside the refresh uses the RAW helper',
        rawCalls >= 1 && loginCalls === 0,
        loginCalls + ' shApi calls here would re-enter the retry and recurse');
}

// --- every authenticated endpoint is guarded -------------------------------
{
    // shApi and shApiGet retry. Anything that calls the worker with raw fetch is
    // not covered, and that is precisely how the host-compile path escaped it.
    const rawAuth = [...main.matchAll(/fetch\(SH_STATS_ENDPOINT \+ 'sh\/([a-z-]+)'/g)]
        .map(m => m[1])
        // health is unauthenticated by design; login IS the refresh target.
        .filter(p => !['health', 'login'].includes(p));
    check('no authenticated endpoint is left on a raw fetch',
        rawAuth.length === 0,
        'unguarded: ' + rawAuth.join(', '));
    check('shApiGet retries too - cloud refresh used it',
        /shApiGetRaw\(endpoint, params\)\.then/.test(main));
    check('the host ticket route goes through the guarded helper',
        /shApi\('sh\/obfuscate-ticket'/.test(main),
        'it used a raw fetch, which is why obfuscation failed while the rest recovered');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
