// A refresh must never be able to destroy an account or end a session.
//
// THE BUG THIS PINS
//
// shRefreshOwnCloudRecord ran on every page load:
//
//     const d = await shApi('sh/user-get', { email, password: localRecord.password });
//     if (!d.ok || !d.user) {
//         if (/invalid|disabled|not found/i.test(err) && users[email]) {
//             delete users[email];
//             logout();
//             showNotification('Account Deleted', 'Your account was deleted by admin...');
//
// localRecord.password is btoa(password). The worker verifies with verifyPassword,
// which for a PBKDF2 record HASHES WHATEVER IT IS GIVEN, so a base64 string can
// never match. And the worker migrates legacy records on first login, so this
// failed for every account anyone had actually used.
//
// A failed credential was therefore treated as PROOF OF DELETION. Accounts
// vanished and everyone was signed out with "Your account was deleted by admin."
//
// The two rules that follow, and that this file enforces:
//
//   1. Identity comes from the SESSION TOKEN, via GET /sh/user-me. The client
//      stores btoa(password) and nothing else, so the raw password is
//      unrecoverable - the fix cannot live in the client.
//   2. A refresh failure is NOT a deletion. Not a 401, not a 404, not a network
//      error, not an unrecognised error string. Only an explicit `disabled` -
//      an administrative decision the server stated - may act, and even then it
//      informs rather than deletes.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

const at = main.indexOf('async function shRefreshOwnCloudRecord');
if (at < 0) { console.error('shRefreshOwnCloudRecord not found'); process.exit(1); }
const seg = main.slice(at, at + 5000);
const end = seg.indexOf('\n}\n');
const body = seg.slice(0, end < 0 ? 5000 : end);

// ---- 1. no destruction, anywhere in the function ----
if (!/delete\s+users\[/.test(body)) ok('it never deletes a local account');
else no('it still deletes a local account on a failed refresh');

if (!/\blogout\s*\(/.test(body)) ok('it never ends the session');
else no('it still logs the user out on a failed refresh');

if (!/location\.reload\(\)/.test(body)) ok('it never reloads the page out from under the user');
else no('it still force-reloads the page');

// ---- 2. identity is the session token, not the b64 password ----
if (/shApiGet\('sh\/user-me'/.test(body)) ok('it reads the account with the session token');
else no('it does not use the token-authenticated /sh/user-me');

if (!/shApi\('sh\/user-get'/.test(body)) ok('it no longer proves identity with the b64 password');
else no('it still posts the base64 password to /sh/user-get');

// ---- 3. only an explicit `disabled` may act, and it must not delete ----
if (/d\.disabled === true/.test(body)) ok('only an explicit disabled flag is acted on');
else no('there is no disabled check, so a 403 would be treated as unknown');

// `delete shown.password` strips the password from a COPY of the record that is
// about to be handed to updateUIForUser - it is not a deletion of anything. Only
// a delete of the stored record counts here.
if (/Account Disabled/.test(body) && !/delete\s+(users\[|lu\b|localRecord)/.test(body)) {
  ok('a disabled account is reported, not deleted');
} else {
  no('the disabled path deletes the stored record');
}

// ---- 4. no credential means no action at all ----
if (/if \(!tok\) return;/.test(body)) ok('no session token means the function does nothing');
else no('it proceeds without a session token');

// ---- 5. the field lists it merges with must exist and be split correctly ----
if (/const PLAN_FIELDS = \[/.test(main) && /const IMAGE_FIELDS = \[/.test(main)) {
  ok('PLAN_FIELDS and IMAGE_FIELDS are declared');
} else {
  no('the merge field lists are missing');
}

// The distinction is the whole point of the merge: the cloud owns plan and
// flags, but must never blank an image the cloud has not seen yet - that would
// undo a save the user just watched succeed.
{
  const plan = /const PLAN_FIELDS = \[([^\]]*)\]/.exec(main);
  const img = /const IMAGE_FIELDS = \[([^\]]*)\]/.exec(main);
  if (plan && /plan/.test(plan[1])) ok('PLAN_FIELDS includes the plan');
  else no('PLAN_FIELDS does not include the plan');
  if (img && /customBackground/.test(img[1]) && /bannerImage/.test(img[1]) && /profileImage/.test(img[1])) {
    ok('IMAGE_FIELDS covers profile, banner and the custom background');
  } else {
    no('IMAGE_FIELDS is missing one of the three images');
  }
  if (plan && img && /plan/.test(plan[1]) && /customBackground/.test(img[1]) && !/customBackground/.test(plan[1])) {
    ok('the two lists do not overlap - an image is never treated as a plan field');
  } else {
    no('the two lists overlap, so an image could be overwritten by a plan refresh');
  }
}

// ---- 6. the worker must actually have the route, or the client is guessing ----
{
  const w = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
  if (/url\.pathname === '\/sh\/user-me'/.test(w)) ok('the worker serves /sh/user-me');
  else no('the client calls /sh/user-me but the worker has no such route');
  if (/verifyUserToken/.test(w.slice(w.indexOf("/sh/user-me"), w.indexOf("/sh/user-me") + 1200))) {
    ok('/sh/user-me authenticates with verifyUserToken, not a password');
  } else {
    no('/sh/user-me does not verify the session token');
  }
  // 404 (gone) and 403 (disabled) must stay distinguishable. Anchored on the
  // route itself - the first textual mention of /sh/user-me is in a comment, and
  // slicing from there can miss the code entirely.
  const ri = w.indexOf("url.pathname === '/sh/user-me'");
  const r = w.slice(ri, ri + 1200);
  if (ri < 0) {
    no('the /sh/user-me route was not found');
  } else if (/404/.test(r) && /403/.test(r) && /disabled: true/.test(r)) {
    ok('/sh/user-me distinguishes 404 (no such account) from 403 (disabled)');
  } else {
    no('/sh/user-me collapses 404 and 403, so a missing account looks like a disabled one');
  }
}

// ---- 7. /sh/user-sync must accept the token too, or nothing saves to the cloud ----
{
  const w = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
  const s = w.slice(w.indexOf("url.pathname === '/sh/user-sync'"), w.indexOf("url.pathname === '/sh/user-sync'") + 2500);
  if (/tokenOk/.test(s) && /verifyUserToken/.test(s)) ok('/sh/user-sync accepts a session token bound to the account');
  else no('/sh/user-sync still requires the base64 password, so profile saves never reach the cloud');
  if (/tokenOk = !!\(u && String\(u\.email \|\| ''\)\.toLowerCase\(\) === email\.toLowerCase\(\)\)/.test(s)) {
    ok('the token is bound to the account it is claiming to write');
  } else {
    no('the sync token is not bound to the account - any valid token would authorise any write');
  }
}

console.log('');
console.log(fail ? 'NON-DESTRUCTIVE REFRESH  ' + fail + ' FAILED' : 'NON-DESTRUCTIVE REFRESH  all checks passed');
process.exit(fail ? 1 : 0);
