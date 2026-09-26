// =============================================================================
// AT-REST ARTIFACT ENCRYPTION (Phase 4)
// =============================================================================
// SH_ARTIFACT_KEK is OPTIONAL, which is the whole difficulty. An optional
// encryption switch has three states, not two, and the third one is the one
// that loses data:
//
//   1. no KEK, plaintext stored        -> works
//   2. KEK set, envelope stored        -> works
//   3. envelope stored, KEK removed   -> UNREADABLE FOREVER
//
// State 3 is why this exists as a test rather than a comment. A future edit
// that changes the marker, the derivation, or the pass-through behaviour on a
// missing key would move a live deployment from 1 or 2 into 3, and the
// symptom would be "every script stopped working" with no error anywhere.
//
// So the assertions here are mostly about FAILURE MODES, not the happy path.
//
// Run:  node tools/artifact_crypto_test.mjs
// =============================================================================

import assert from 'assert';
import {
    encryptAtRest, decryptAtRest, tryDecryptAtRest,
    isEncrypted, kekConfigured, _resetKekCache
} from '../For Cloudflare/worker.js';

const KEK = 'a-test-kek-0123456789abcdef';
const envKek = { SH_ARTIFACT_KEK: KEK };
const envNone = {};

let pass = 0, fail = 0;
const problems = [];
function ok(n) { pass++; console.log('  OK   ' + n); }
function bad(n, w) { fail++; problems.push(n + ': ' + w); console.log('  FAIL ' + n + '\n         ' + w); }
async function check(name, fn) {
  _resetKekCache();
  try { const r = await fn(); if (r === false) bad(name, 'returned false'); else ok(name); }
  catch (e) { bad(name, (e && e.message) || String(e)); }
}

console.log('[K1] configuration detection...');
await check('a KEK of a sane length counts as configured', () => {
  assert.ok(kekConfigured({ SH_ARTIFACT_KEK: KEK }));
  assert.ok(kekConfigured({ SH_ARTIFACT_KEK: KEK }), 'cached result must be stable');
  return true;
});
await check('absent, empty or too-short KEKs do NOT count as configured', () => {
  // 16 bytes minimum. A 4-character KEK is a config typo, and treating it as
  // valid would give the operator a false sense of at-rest encryption.
  assert.ok(!kekConfigured(envNone));
  assert.ok(!kekConfigured({ SH_ARTIFACT_KEK: '' }));
  assert.ok(!kekConfigured({ SH_ARTIFACT_KEK: 'short' }));
  assert.ok(!kekConfigured({ SH_ARTIFACT_KEK: '123456789012345' }), '15 chars is below the floor');
  return true;
});

console.log('[K2] round trip...');
await check('plaintext survives a round trip', async () => {
  const src = '-- the artifact\nprint("hello")\n';
  const enc = await encryptAtRest(envKek, src);
  assert.ok(enc !== src, 'nothing was encrypted');
  assert.strictEqual(await decryptAtRest(envKek, enc), src);
  return true;
});
await check('the marker is present and detectable', async () => {
  const enc = await encryptAtRest(envKek, 'x');
  assert.ok(enc.startsWith('SHKEK1:'), 'no marker: ' + enc.slice(0, 20));
  assert.ok(isEncrypted(enc));
  assert.ok(!isEncrypted('plain text'));
  assert.ok(!isEncrypted(null));
  assert.ok(!isEncrypted(12345));
  return true;
});
await check('the ciphertext does not contain the plaintext', async () => {
  const src = 'UNIQUEMARKERSTRING';
  const enc = await encryptAtRest(envKek, src);
  assert.ok(!enc.includes('UNIQUEMARKER'), 'the plaintext survived into the envelope');
  return true;
});
await check('unicode and newlines survive', async () => {
  const src = '-- ünïcödé ✅\nline2\r\nline3\ttab\n';
  assert.strictEqual(await decryptAtRest(envKek, await encryptAtRest(envKek, src)), src);
  return true;
});
await check('a large payload round trips', async () => {
  const src = 'A'.repeat(300000);
  const t0 = Date.now();
  const enc = await encryptAtRest(envKek, src);
  const back = await decryptAtRest(envKek, enc);
  assert.strictEqual(back.length, 300000);
  assert.ok(back === src, 'large payload did not round trip');
  void t0;
  return true;
});

console.log('[K3] identical inputs must NOT produce identical ciphertext...');
await check('two encryptions of the same text differ', async () => {
  // GCM with a reused nonce under one key is catastrophic, and the reason a
  // deterministic scheme would be a mistake here rather than an optimisation.
  const a = await encryptAtRest(envKek, 'same input');
  const b = await encryptAtRest(envKek, 'same input');
  assert.notStrictEqual(a, b, 'the same plaintext produced identical ciphertext - the IV is not random');
  assert.strictEqual(await decryptAtRest(envKek, a), 'same input');
  assert.strictEqual(await decryptAtRest(envKek, b), 'same input');
  return true;
});

console.log('[K4] TAMPERING IS DETECTED...');
await check('a flipped ciphertext byte fails the auth tag', async () => {
  const enc = await encryptAtRest(envKek, 'integrity matters here');
  const body = enc.slice(enc.indexOf(':') + 1);
  // swap the first ciphertext character for a different one
  const flipped = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
  const tampered = enc.slice(0, enc.indexOf(':') + 1) + flipped;
  const r = await tryDecryptAtRest(envKek, tampered);
  assert.ok(!r.ok, 'a tampered envelope decrypted successfully');
  return true;
});
await check('a tampered IV fails', async () => {
  const enc = await encryptAtRest(envKek, 'iv matters too');
  const sep = enc.indexOf(':');
  const iv = enc.slice('SHKEK1:'.length, sep);
  const badIv = (iv[0] === 'A' ? 'B' : 'A') + iv.slice(1);
  const tampered = 'SHKEK1:' + badIv + enc.slice(sep);
  const r = await tryDecryptAtRest(envKek, tampered);
  assert.ok(!r.ok, 'a tampered IV decrypted successfully');
  return true;
});
await check('a truncated envelope fails', async () => {
  const enc = await encryptAtRest(envKek, 'truncate me please');
  const r = await tryDecryptAtRest(envKek, enc.slice(0, Math.floor(enc.length / 2)));
  assert.ok(!r.ok, 'a truncated envelope decrypted successfully');
  return true;
});
await check('a malformed envelope is rejected, not misread', async () => {
  const r = await tryDecryptAtRest(envKek, 'SHKEK1:no-separator-here');
  assert.ok(!r.ok, 'a malformed envelope was accepted');
  return true;
});

console.log('[K5] THE WRONG KEY IS REFUSED, NOT SILENTLY WRONG...');
await check('a different KEK cannot decrypt', async () => {
  // This is the assertion that found the un-keyed cache. Encrypt with one
  // secret, decrypt with another, in the SAME process — which is exactly what
  // a rotated secret, a preview env, or `wrangler dev` looks like.
  const enc = await encryptAtRest({ SH_ARTIFACT_KEK: 'kek-number-one-0123456789' }, 'secret');
  const r = await tryDecryptAtRest({ SH_ARTIFACT_KEK: 'kek-number-two-0123456789' }, enc);
  assert.ok(!r.ok, 'a different KEK decrypted the envelope');
  return true;
});
await check('the right KEK still works after a different one was used', async () => {
  // The other half of the same bug: a cache that is merely "cleared" would
  // pass the test above and then fail this one. Both KEKs must coexist.
  const encA = await encryptAtRest({ SH_ARTIFACT_KEK: 'kek-alpha-0123456789abcdef' }, 'alpha');
  const encB = await encryptAtRest({ SH_ARTIFACT_KEK: 'kek-bravo-0123456789abcdef' }, 'bravo');
  assert.strictEqual(await decryptAtRest({ SH_ARTIFACT_KEK: 'kek-alpha-0123456789abcdef' }, encA), 'alpha');
  assert.strictEqual(await decryptAtRest({ SH_ARTIFACT_KEK: 'kek-bravo-0123456789abcdef' }, encB), 'bravo');
  assert.strictEqual(await decryptAtRest({ SH_ARTIFACT_KEK: 'kek-alpha-0123456789abcdef' }, encA), 'alpha');
  return true;
});

console.log('[K6] THE THREE STATES, AND STATE 3 IS THE DANGEROUS ONE...');
await check('state 1: no KEK, plaintext is stored as-is', async () => {
  // The default. Opt-in means opt-in, and it must not half-apply.
  const out = await encryptAtRest(envNone, 'untouched');
  assert.strictEqual(out, 'untouched', 'a value was modified with no KEK configured');
  return true;
});
await check('state 1: plaintext in KV is still READABLE with no KEK', async () => {
  // A script published before the KEK was set must keep working. This is why
  // the marker exists at all.
  assert.strictEqual(await decryptAtRest(envNone, 'legacy plaintext'), 'legacy plaintext');
  return true;
});
await check('state 2: KEK set, the value round trips', async () => {
  const enc = await encryptAtRest(envKek, 'state two');
  assert.ok(isEncrypted(enc));
  assert.strictEqual(await decryptAtRest(envKek, enc), 'state two');
  return true;
});
await check('state 3: an envelope with NO KEK REFUSES rather than passing through', async () => {
  // THE load-bearing assertion.
  //
  // The tempting behaviour is to return the raw string when the KEK is absent.
  // That would hand the caller a payload starting "SHKEK1:..." which fails
  // the SHOK magic check, so the user sees "wrong Special Key" and the
  // operator sees a flood of support messages about a key that is correct.
  // Refusing means the delivery is refused and the log says why.
  const enc = await encryptAtRest(envKek, 'written while the KEK was set');
  _resetKekCache();
  const r = await tryDecryptAtRest(envNone, enc);
  assert.ok(!r.ok, 'an envelope was passed through with no KEK - that is silent data loss');
  assert.ok(/SH_ARTIFACT_KEK/.test(r.error), 'the error does not name the missing variable: ' + r.error);
  assert.ok(!r.text, 'a text value came back alongside the failure');
  return true;
});
await check('state 3: it THROWS from the strict path, it does not return raw', async () => {
  const enc = await encryptAtRest(envKek, 'x');
  _resetKekCache();
  let threw = false;
  try { await decryptAtRest(envNone, enc); } catch (e) { threw = true; }
  assert.ok(threw, 'decryptAtRest returned a value with no KEK instead of throwing');
  return true;
});

console.log('[K7] the KEK cache cannot leak across configurations...');
await check('a changed KEK is picked up after the cache expires', async () => {
  const envA = { SH_ARTIFACT_KEK: 'kek-alpha-0123456789abcdef' };
  const encA = await encryptAtRest(envA, 'alpha data');
  _resetKekCache();
  const r = await tryDecryptAtRest(envKek, encA);
  assert.ok(!r.ok, 'the previous KEK was reused from the module cache');
  return true;
});
await check('_resetKekCache exists as a test seam', () => {
  assert.strictEqual(typeof _resetKekCache, 'function');
  return true;
});

console.log('');
console.log('='.repeat(70));
console.log(`AT-REST ARTIFACT CRYPTO   ${pass} passed, ${fail} failed`);
console.log('='.repeat(70));
if (fail) {
  console.log('');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
