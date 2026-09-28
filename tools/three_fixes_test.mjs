// Three things that were each wrong in a way the symptom did not describe.
import fs from 'node:fs';

const main = fs.readFileSync('main.js', 'utf8');
const worker = fs.readFileSync('For Cloudflare/worker.js', 'utf8');

let fail = 0;
const ok = m => console.log('  OK   ' + m);
const no = m => { fail++; console.log('  FAIL ' + m); };

// brace-matched body of a top-level function
function bodyOf(src, name) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const at = m.index;
  let d = 0, s = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { d++; s = true; }
    else if (src[i] === '}') { d--; if (s && d === 0) return src.slice(at, i + 1); }
  }
  return null;
}

console.log('[1] the backdrop must be VISIBLE, not merely painted');
{
  if (/const SH_BACKDROP_DIM = 0\.42/.test(main)) ok('the dim is a named constant at 0.42, down from 0.74');
  else no('the dim is still 0.74 - only 26% of the image survives it');

  if (/const SH_BACKDROP_CARD_ALPHA = 0\.62/.test(main)) ok('the card alpha is a named constant at 0.62, down from 0.8');
  else no('the card surfaces are still 0.8 opaque - the backdrop cannot show through them');

  if (/rgba\(8,8,18,0\.74\)/.test(main)) no('the hard-coded 0.74 gradient survives');
  else ok('the hard-coded gradient is gone');

  // 0.26 * 0.20 was 5% visible; the new numbers must be materially better
  const before = 0.26 * 0.2;
  const after = (1 - 0.42) * (1 - 0.62);
  if (after > before * 4) ok('visible image rises from ' + (before * 100).toFixed(0) + '% to ' + (after * 100).toFixed(0) + '%');
  else no('the arithmetic does not actually improve visibility: ' + (after * 100).toFixed(0) + '% vs ' + (before * 100).toFixed(0) + '%');

  if (/function shWithAlpha\(/.test(main)) ok('there is a colour rewriter, so an unexpected theme value is passed through rather than mangled');
  else no('no safe colour rewriter - a non-rgba theme colour would be corrupted');

  // the tint must be reverted, or removing the backdrop would leave glass panels
  const paint = bodyOf(main, 'applyCustomBackground');
  const clear = bodyOf(main, 'clearCustomBackground');
  if (paint && /shRefreshCardTint\(\)/.test(paint)) ok('painting the backdrop re-tints the cards');
  else no('painting does not re-tint the cards');
  if (clear && /shRefreshCardTint\(\)/.test(clear)) ok('removing the backdrop restores the opaque cards');
  else no('removing the backdrop leaves the cards translucent forever');

  // applyTheme must agree with both, or a theme change re-opaques the panels
  const theme = bodyOf(main, 'applyTheme');
  if (theme && /SH_CUSTOM_BG_ACTIVE \? shWithAlpha\(theme\.card/.test(theme)) ok('applyTheme respects the backdrop state');
  else no('applyTheme re-opaques the cards while a backdrop is active');
}

console.log('');
console.log('[2] signup must not hash the password twice');
{
  if (/signupToken = await signSessionToken/.test(worker)) ok('the worker issues a session token during signup');
  else no('signup issues no token, so the client must pay a second PBKDF2 to get one');
  if (/if \(signupToken\) out\.token = signupToken;/.test(worker)) ok('the token is returned to the client');
  else no('the token is created but not returned');

  // it must be a real session token: fingerprint-bound, so a password change revokes it
  const at = worker.indexOf('signupToken = await signSessionToken');
  const seg = worker.slice(at, at + 700);
  if (/credentialFingerprint/.test(seg)) ok('the signup token carries the credential fingerprint, so a password change revokes it');
  else no('the signup token has no fingerprint - a password change would not revoke it');

  if (/if \(d && d\.token\) \{ shSaveUserToken\(d\.token\); return; \}/.test(main)) ok('the client takes the signup token');
  else no('the client ignores the signup token');
  if (/shMintUserToken\(email, password\);/.test(main)) ok('the older-worker fallback is retained, so this is safe before a redeploy');
  else no('the fallback is gone - an older worker would leave new accounts with no session');

  if (/if \(d && d\.ok\) return d;/.test(main)) ok('pushToCloud returns the response instead of discarding it');
  else no('pushToCloud still discards the response, so the token is thrown away');

  if (!/setTimeout\(r, 1200\)/.test(main)) ok('the mint retry backoff is no longer a flat 1200ms');
  else no('the 1200ms backoff survives - it was a guess and it is on the critical path');
}

console.log('');
console.log('[3] a device must not hold a password the server disagrees with');
{
  const login = bodyOf(main, 'handleLogin');
  if (!login) { no('handleLogin is missing'); }
  else {
    // the local branch has to reach the server
    if (/shApi\('sh\/user-login', \{ emailOrUsername: emailOrUsername, password: password \}\)/.test(login)) {
      ok('the local-match branch also calls the server');
    } else {
      no('the local-match branch still signs in with no server call - that is how the drift persisted');
    }
    // only a real 401 refuses; a network failure must not lock anyone out
    if (/d\.ok === false && d\.status === 401/.test(login)) ok('only a real 401 refuses the sign-in');
    else no('a network failure is treated as a rejection, which would lock offline users out');
    if (/\.catch\(function \(\) \{/.test(login) && /shFinishLocalLogin/.test(login)) ok('an unreachable server falls back to a local sign-in');
    else no('no offline fallback');
    // and the local branch must not keep its own copy of the sign-in steps
    // The CLOUD branch legitimately has its own sign-in steps: that path signs in
    // with the user object the server returned, not the local one. The property
    // worth asserting is narrower - the LOCAL branch, everything after the cloud
    // branch's own call, must delegate rather than carry a second copy that can
    // drift from the helper.
    // The CLOUD branch legitimately has its own sign-in steps: that path signs in
    // with the user object the server returned, not the local one. So the
    // assertion has to isolate the LOCAL branch, and the only unambiguous
    // boundary is the local branch's own opening comment - it appears there and
    // nowhere else. Slicing from the cloud branch's shApi call does NOT work: it
    // includes the cloud branch's own closeModal.
    const localAt = login.indexOf('// The password matched what THIS DEVICE has stored');
    if (localAt < 0) {
      no('the local branch was not found inside handleLogin');
    } else {
      const localBranch = login.slice(localAt);
      if (!/closeModal\('login'\)/.test(localBranch)) {
        ok('the local branch delegates to the shared helper instead of duplicating the sign-in steps');
      } else {
        no('the local branch still carries its own copy of the sign-in steps, which can drift from the helper');
      }
      if (/shFinishLocalLogin\(foundUser, password\)/.test(localBranch)) ok('the local branch calls the shared helper');
      else no('the local branch does not call the shared helper');
    }
  }

  const helper = bodyOf(main, 'shFinishLocalLogin');
  if (helper) {
    if (/closeModal\('login'\)/.test(helper) && /shSyncUsersOnLogin/.test(helper)) ok('the shared helper does the sign-in work');
    else no('the shared helper is incomplete');
    if (!/sh\/user-login/.test(helper)) ok('the helper does not itself call the server - it is the right copy');
    else no('the helper contains a login call, so the branch is wrapped in a copy of itself');
  } else {
    no('the shared sign-in helper is missing');
  }

  // and no half-applied duplicate anywhere
  if ((main.match(/The password matched what THIS DEVICE has stored/g) || []).length === 1) ok('the explanation appears exactly once');
  else no('the explanation is duplicated - a patch script ran twice');
  if ((main.match(/function shFinishLocalLogin\(foundUser, password\) \{/g) || []).length === 1) ok('the helper is defined exactly once');
  else no('the helper is defined more than once');

  // a multi-line string literal is a syntax error and must never survive
  if (/sign out and sign in\r?\n/.test(main)) no('a string literal spans a newline, which does not parse');
  else ok('no string literal spans a newline');
}

console.log('');
console.log(fail ? 'THREE FIXES      ' + fail + ' FAILED' : 'THREE FIXES      all checks passed');
process.exit(fail ? 1 : 0);
