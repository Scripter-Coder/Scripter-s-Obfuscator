// Two properties that a session token must have, both learned the hard way.
//
// 1. IT MUST BE CAPTURED WHERE THE PASSWORD EXISTS.
//
//    The worker issues one at login -
//
//        return jsonResponse({ ok: true, user: publicUser(found), token });
//
//    and handleLogin read `d.user` and discarded `d.token`. The only way the
//    client ever obtained a token was by replaying the locally-stored
//    btoa(password) to /sh/user-login, and that works ONLY for a legacy record:
//    for a PBKDF2 record the worker hashes whatever it is given, so a base64
//    string can never match.
//
//    The worker then migrates legacy records on the first successful login
//    (found.password = await hashPassword(...)), so the very act of logging in
//    destroyed the only fallback every later action depended on. The account
//    authenticated once and then could never authenticate itself again.
//
//    The raw password exists in exactly two places - handleLogin and
//    handleSignup - and that is where the token must be taken.
//
// 2. SIGNING OUT MUST REVOKE IT.
//
//    logout() cleared no token at all. It changed the UI and nothing else, so
//    shGetUserToken() kept returning the previous account's session and every
//    owner call kept using it. The next person to sign in on a shared browser
//    inherited that authority. Now that the token is also kept in localStorage
//    so a new tab works, an un-cleared logout would persist it across browser
//    restarts - a straight upgrade from a nuisance into privilege escalation.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- the writers and the clearer exist ----
for (const [n, re] of [
  ['shSaveUserToken exists', /function shSaveUserToken\(tok\)/],
  ['shMintUserToken exists', /async function shMintUserToken\(/],
  ['shClearUserToken exists', /function shClearUserToken\(\)/],
]) re.test(main) ? ok(n) : no(n);

// ---- 1. capture where the password exists ----
{
  // the cloud login branch must keep the token the server issued
  if (/shApi\('sh\/user-login'[^\n]*\)\.then\(function\(d\)[\s\S]{0,900}?shSaveUserToken\(d\.token\)/.test(main)) {
    ok('the cloud login keeps the token the worker issued, instead of discarding it');
  } else {
    no('the cloud login still discards d.token - the panel will have no credential');
  }

  // the local-only branch makes no server call, so it must mint one
  if (/var userData = \{ \.\.\.foundUser \};[\s\S]{0,400}?shMintUserToken\(emailOrUsername, password\)/.test(main)) {
    ok('the local-only login path mints a token - that path never called the worker');
  } else {
    no('the local-only login path makes no server call and never mints a token');
  }

  // signup
  if (/shMintUserToken\(email, \w*[Pp]assword\w*\);/.test(main)) {
    ok('signup mints a token for the new account');
  } else {
    no('signup does not mint a token');
  }
}

// ---- 2. signing out revokes it ----
{
  if (/function logout\(\) \{[\s\S]{0,400}?shClearUserToken\(\);/.test(main)) {
    ok('logout() revokes the session token');
  } else {
    no('logout() does not revoke the session token - the next sign-in inherits it');
  }

  // and the token must be cleared in BOTH stores, not just sessionStorage.
  // The body is taken as a fixed window rather than a brace match, so a `}` on a
  // `try { } catch (e) {}` line cannot truncate it.
  const clearAt = main.indexOf('function shClearUserToken() {');
  const clearBody = clearAt < 0 ? '' : main.slice(clearAt, clearAt + 320);
  if (clearBody.includes("sessionStorage.removeItem('sh_user_token')") &&
      clearBody.includes("localStorage.removeItem('sh_user_token')")) {
    ok('signing out clears both stores');
  } else {
    no('shClearUserToken does not clear both stores - a stale token survives a restart');
  }

  // Every removal must live inside shClearUserToken. A removal anywhere else
  // clears one store only, which is the original defect: the token outlives a
  // sign-out in whichever store was missed.
  {
    const outside = [];
    let from = 0;
    const clearEnd = clearAt < 0 ? -1 : clearAt + 320;
    for (const mm of main.matchAll(/removeItem\('sh_user_token'\)/g)) {
      if (mm.index < clearAt || mm.index > clearEnd) outside.push(mm.index);
    }
    if (outside.length === 0) ok('every token removal goes through shClearUserToken');
    else no(outside.length + ' token removal(s) sit outside shClearUserToken, so a single-store clear survives');
  }
}

// ---- 3. the read must see both stores, or a new tab is signed out ----
{
  const rdAt = main.indexOf('function shGetUserToken() {');
  const rd = rdAt < 0 ? '' : main.slice(rdAt, rdAt + 400);
  if (rd.includes("sessionStorage.getItem('sh_user_token')") &&
      rd.includes("localStorage.getItem('sh_user_token')")) {
    ok('a new tab finds the session - both stores are read');
  } else {
    no('the token is not read from both stores, so a new tab is silently signed out');
  }
}

// ---- 4. the b64 replay must be labelled as the legacy path it is ----
{
  // The explanation sits in the comment ABOVE the function, so the window has to
  // start before it. Reading only from `async function` onwards would miss the
  // very thing being asserted - which is how this check first reported a failure
  // against code that was already correct.
  const at = main.indexOf('async function shEnsureUserToken');
  const win = at < 0 ? '' : main.slice(Math.max(0, at - 1200), at + 700);
  if (/LAST RESORT/i.test(win) && /legacy/i.test(win) && /PBKDF2/i.test(win)) {
    ok('the b64 replay is documented as a legacy-only last resort, with the PBKDF2 reason');
  } else {
    no('shEnsureUserToken still presents b64 replay as a general solution');
  }
}

console.log('');
console.log(fail ? 'TOKEN LIFECYCLE  ' + fail + ' FAILED' : 'TOKEN LIFECYCLE  all checks passed');
process.exit(fail ? 1 : 0);
