// The credential must not be established on ONE path and assumed everywhere else.
//
// THE BUG
//
//     main.js:322   userToken = await shEnsureUserToken();        <- script upload
//     main.js:401   const userToken2 = await shEnsureUserToken(); <- script upload
//
// Those were the only two callers of shEnsureUserToken in the whole file. Sign-in
// never minted a session token. Page load never minted one. So the credential
// every owner panel call authenticates with existed only if that particular tab
// had previously uploaded a script.
//
// The consequence was a lie in the error message. An owner who signed in and
// clicked "Refresh from Cloud" sent no credential at all, and the worker replied
// 401 "Not authorized." - which reads as a permissions problem and is not one. It
// was a session that had never been started.
//
// sessionStorage is per-tab as well, so signing in on one tab and opening the
// admin panel on another produced exactly the same wall, which is why this
// looked like an intermittent auth fault rather than a missing call.
//
// WHAT IS PINNED HERE
//
// That establishing the session is not optional on any path that needs it.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// the helper itself must still exist and still do the real work
if (/async function shEnsureUserToken\(\)/.test(main)) ok('shEnsureUserToken still exists');
else no('shEnsureUserToken is gone');

// 1. shOwnerApi must mint its own credential, not trust the caller
if (/var userTok = shGetUserToken\(\) \|\| '';[\s\S]{0,400}?await shEnsureUserToken\(\)/.test(main)) {
  ok('shOwnerApi mints the token when the tab has none');
} else {
  no('shOwnerApi reads sessionStorage without minting - an admin call can go out unauthenticated');
}

// 2. and it must be awaited, so the credential is real before the request
if (/if \(!userTok\) \{\s*\r?\n\s*try \{ userTok = \(await shEnsureUserToken\(\)\) \|\| ''; \}/.test(main)) {
  ok('the token is awaited before the request is sent');
} else {
  no('shOwnerApi does not await the token - the request would go out before it exists');
}

// 3. signing in must establish the session, not wait for an upload
if (/setCurrentUser\(user\);[\s\S]{0,900}?shEnsureUserToken\(\);/.test(main)) {
  ok('signing in starts the cloud session');
} else {
  no('sign-in does not start the cloud session - the admin panel depends on an upload happening first');
}

// 4. the diagnostics panel must report what will actually be sent
if (/Report the token state AFTER[\s\S]{0,500}?shEnsureUserToken\(\)/.test(main)) {
  ok('the diagnostics panel mints the token before reporting on it');
} else {
  no('the diagnostics panel reports a stale token state');
}

// 5. the regression that matters: the call sites must not ALL be in the upload path
{
  const at = (main.match(/shEnsureUserToken\(\)/g) || []).length;
  if (at >= 4) ok('shEnsureUserToken has ' + at + ' call sites, not just the 2 upload ones');
  else no('shEnsureUserToken has only ' + at + ' call sites - the credential is still path-dependent');
}

// 6. and the token must be readable after signing in on a FRESH tab, which is the
//    case that used to fail: nothing in the upload path has run yet
if (/if \(!userTok\) \{/.test(main)) ok('a token-less tab is recoverable on demand, not a dead end');
else no('a token-less tab has no recovery path');

console.log('');
console.log(fail ? 'SESSION BOOTSTRAP   ' + fail + ' FAILED' : 'SESSION BOOTSTRAP   6 checks passed');
process.exit(fail ? 1 : 0);
