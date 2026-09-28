// A removal must survive the next sync, and must never be available for an
// account that is not allowed to be removed.
//
// THE BUG
//
// panelDeleteUser deleted the LOCAL record and fired shDeleteCloudUser without
// awaiting it, swallowing the result. When the worker refused - which it did
// whenever the owner call was not authorised - the account survived on the
// server. Then four separate sync loops re-add any cloud account missing
// locally, so the next Refresh brought the bot straight back.
//
//     delete users[email]; saveUsers(); shDeleteCloudUser(email);   // and that's it
//     ...
//     if (!lu) { users[k] = cu; changed = true; }                   // four of these
//
// Deleting could never win against a rule that adds unconditionally.
//
// THE FIX
//
// A tombstone: the removal is recorded durably and locally, and every pull from
// the cloud skips tombstoned emails. The cloud delete still happens and still
// matters for other devices, but the two are decoupled, so a failed cloud delete
// can no longer resurrect the account.
//
// SAFETY
//
// The owner, the admin, and whoever is currently signed in can never be
// tombstoned, and that is checked where the tombstone is WRITTEN rather than
// where it is read - otherwise a tampered local list could be used to lock the
// owner out of their own site.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- the store ----
for (const [n, re] of [
  ['a durable tombstone key exists', /SH_TOMBSTONES_KEY = 'sh_removed_accounts'/],
  ['shTombstone() exists', /function shTombstone\(email\)/],
  ['shIsRemoved() exists', /function shIsRemoved\(email\)/],
  ['shSkipRemoved() exists', /function shSkipRemoved\(rec\)/],
  ['shUntombstone() exists so a mistake is reversible', /function shUntombstone\(email\)/],
]) re.test(main) ? ok(n) : no(n);

// ---- EVERY cloud re-add branch must be guarded ----
{
  // the shape is always "no local record yet, so take the cloud one"
  const branches = [];
  const lines = main.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/if \(!lu\b/.test(lines[i])) continue;
    // the next 3 lines are the body
    const body = lines.slice(i, i + 4).join('\n');
    if (!/users\[\w+\] = c/.test(body)) continue;   // not a re-add
    branches.push({ line: i + 1, text: body });
  }
  if (branches.length === 0) { no('no cloud re-add branch found - the test cannot see the fix'); }
  else {
    let unguarded = 0;
    for (const b of branches) {
      // Two equivalent guard shapes are accepted, and both are correct:
      //
      //   if (!lu && !shSkipRemoved(cu)) { users[k] = cu; ... }   // combined
      //   if (!lu) { if (shSkipRemoved(cu)) return false;          // early return
      //              users[k] = cu; ... }
      //
      // The second is what the four merge loops were collapsed into
      // (shMergeCloudUser). It is the same rule, so a checker that only knows the
      // first shape reports a correctly-guarded branch as a resurrection path - and
      // a false positive here trains the reader to ignore the test that exists to
      // stop deleted accounts coming back.
      const guarded = /!lu && !shSkipRemoved\(/.test(b.text) ||
                      /if \(!lu\) return/.test(b.text) ||
                      (/if \(!lu\)/.test(b.text) && /if \(shSkipRemoved\(.*\)\) return/.test(b.text));
      if (!guarded) { unguarded++; console.log('         unguarded at line ' + b.line + ': ' + b.text.split('\n')[0].trim()); }
    }
    if (unguarded === 0) ok('all ' + branches.length + ' cloud re-add branches skip removed accounts');
    else no(unguarded + ' of ' + branches.length + ' re-add branches would resurrect a removed account');
  }
}

// ---- the delete must tombstone BEFORE anything that can fail ----
{
  const at = main.indexOf('function panelDeleteUser()');
  const body = main.slice(at, at + 2200);
  const t = body.indexOf('shTombstone(email)');
  const del = body.indexOf('delete users[email]');
  if (t < 0) { no('panelDeleteUser does not tombstone at all'); }
  else if (del >= 0 && t < del) { ok('the tombstone is recorded before the local delete'); }
  else if (del < 0) { no('panelDeleteUser no longer deletes the local record'); }
  else { no('the tombstone is written after the delete, so a failure between them loses the removal'); }
}

// ---- exemptions ----
{
  if (/SH_NEVER_REMOVE = \['dubovikstanislav51@gmail\.com', 'admin@example\.com'\]/.test(main)) {
    ok('the owner and admin accounts are on the never-remove list');
  } else {
    no('the never-remove list is missing or does not name the owner and admin');
  }
  const at = main.indexOf('function shTombstone(email)');
  const body = main.slice(at, at + 700);
  if (/shIsNeverRemovable\(email\)/.test(body)) ok('shTombstone refuses a protected account');
  else no('shTombstone does not check the exemption before writing');

  const na = main.indexOf('function shIsNeverRemovable(email)');
  const nb = main.slice(na, na + 600);
  if (/currentUser/.test(nb)) ok('the signed-in account cannot tombstone itself out of the site');
  else no('the currently signed-in account is not protected');
}

// ---- the outcome must be reported, not swallowed ----
{
  const at = main.indexOf('function panelDeleteUser()');
  const body = main.slice(at, at + 2200);
  if (/shDeleteCloudUser\(email\)\.then/.test(body)) ok('the cloud delete result is awaited and inspected');
  else no('the cloud delete is still fire-and-forget');
  if (/Removed Here Only/.test(body)) ok('a failed cloud delete is stated plainly rather than hidden');
  else no('a failed cloud delete is still reported as a success');
}

// ---- and the user must not be able to do it themselves ----
{
  if (/if \(user\.isScripter\)/.test(main.slice(main.indexOf('function panelDeleteUser'), main.indexOf('function panelDeleteUser') + 2200))) {
    ok('the creator account is still blocked outright');
  } else {
    no('the creator account check is gone from panelDeleteUser');
  }
}

console.log('');
console.log(fail ? 'DELETION TOMBSTONES  ' + fail + ' FAILED' : 'DELETION TOMBSTONES  all checks passed');
process.exit(fail ? 1 : 0);
