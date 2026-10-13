// Extending the keyless artifact test to cover the DECISION, not just the
// obfuscator's behaviour.
//
// tools/keyless_artifact_test.mjs calls applyCustomObfuscator directly and
// proved the obfuscator is fine. The bug was one layer up: main.js applied
// serverKey unconditionally. That line was untestable because main.js is a
// browser module full of DOM references and cannot be imported into node - so
// the property was unguarded and the bug shipped.
//
// main.js now routes the choice through a pure function, shServerKeyOpts, which
// CAN be lifted out of the source and exercised. This asserts that function
// directly, plus a source-level guard that the call site still goes through it
// rather than inlining the conditional again.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[KD] the split-key DECISION: paid yes, keyless no');
console.log('-'.repeat(72));

// 1. the pure function must exist and be liftable
const fn = src.match(/function shServerKeyOpts\(keyless, wantId\) \{[\s\S]*?\n\}/);
if (!fn) {
  no('shServerKeyOpts(keyless, wantId) is missing from main.js');
  console.log('\nKEYLESS DECISION   ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}
ok('shServerKeyOpts(keyless, wantId) exists');

// SH_STATS_ENDPOINT is a module constant, so supply it to evaluate the body
const shServerKeyOpts = new Function(
  'SH_STATS_ENDPOINT',
  fn[0] + '; return shServerKeyOpts;'
)('https://stats.test/');

// 2. the decision itself
//
// CHANGED. This used to assert a keyless build gets NO serverKey, on the
// reasoning that "a keyless script has no licence to gate, so there is nothing
// for a split key to protect".
//
// That was the bug. The split key is not the licence - it is the last layer of
// the artifact. Without it the file is fully self-contained, so every free
// script was a valid single-sample deobfuscation target: paste the loadstring,
// get the artifact, work on it offline. Nothing about a free script makes that
// acceptable.
//
// What DID need protecting was the envelope: the keyless loader read
// body:sub(5) and never expected a key line. That is now handled by the SHX
// envelope (plain Lua PLUS a key line), not by withholding the key, so the
// free-script UX is unchanged - no key to type, no account.
const free = shServerKeyOpts(true, 'ScripterHub0000000001');
if (free.serverKey && free.serverKey.keyUrl) ok('keyless -> serverKey present, so the artifact is not self-contained');
else no('keyless -> no serverKey: the free script ships fully self-contained');

const paid = shServerKeyOpts(false, 'ScripterHub0000000001');
if (paid.serverKey && paid.serverKey.keyUrl) {
  ok('paid -> serverKey with keyUrl ' + JSON.stringify(paid.serverKey.keyUrl));
} else {
  no('paid -> no serverKey, so paid scripts lost their split-key protection');
}
if (paid.serverKey && paid.serverKey.scriptRef === 'ScripterHub0000000001') {
  ok('paid -> scriptRef is passed through');
} else {
  no('paid -> scriptRef is wrong: ' + JSON.stringify(paid.serverKey && paid.serverKey.scriptRef));
}

// 3. keyless must win even if the caller passes a truthy id, i.e. the flag is
//    the ONLY thing that decides it
// Every build now gets a serverKey, so a truthy `keyless` cannot change the
// outcome either way - and it must not start doing so later, or one call site
// silently ships a self-contained artifact again.
if (shServerKeyOpts(1, 'ScripterHub0000000001').serverKey !== undefined) {
  ok('the keyless flag cannot remove the server-only layer');
} else {
  no('a truthy keyless value removed the split key - the artifact becomes self-contained');
}

// 4. the call site must route through the helper, not inline a conditional
//    again - otherwise the helper is decorative and the bug can return
const callSites = src.split('\n').filter(l => /withServerKey\s*=/.test(l));
if (callSites.length === 0) {
  no('no withServerKey assignment found');
} else {
  const allRouted = callSites.every(l => l.includes('shServerKeyOpts('));
  if (allRouted) ok('every withServerKey assignment routes through shServerKeyOpts');
  else no('a withServerKey assignment bypasses the helper: ' + callSites.find(l => !l.includes('shServerKeyOpts(')).trim());
}

// 5. and the old unconditional form must be gone
if (/serverKey:\s*\{\s*keyUrl:\s*SH_STATS_ENDPOINT/.test(src.split('function shServerKeyOpts')[1] || '')) {
  // it appears inside the helper, which is correct
  ok('the serverKey literal now lives only inside the helper');
} else {
  no('could not find the serverKey literal inside the helper');
}

console.log('-'.repeat(72));
console.log('KEYLESS DECISION   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
