// Generate a password + PBKDF2 hash in the worker's EXACT format.
//
// The parameters are copied from worker.js and must not drift:
//   PBKDF2_ITERATIONS = 100000, PBKDF2_SALT_BYTES = 16, PBKDF2_KEY_BYTES = 32
//   hash = SHA-256, format = 'pbkdf2$<iters>$<b64 salt>$<b64 dk>'
//   pepper: SH_KDF_PEPPER is NOT set on this worker, so no pepper is prepended.
//
// A mismatch here does not fail loudly - it writes a hash the worker then
// refuses forever, which is indistinguishable from "the site is broken".
// So this asserts the format and prints what it produced.
//
// Usage: node tools/gen_owner_password.mjs [password]
//   no argument -> generates a strong random one
//
// It PRINTS the hash. It does not write anything - writing to the live account
// is a separate, deliberate step.

import crypto from 'node:crypto';

const ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

// b64bytes() in the worker is btoa over the raw bytes, which is standard base64.
const b64 = (buf) => Buffer.from(buf).toString('base64');

const arg = process.argv[2];
const password = arg || (() => {
    // 24 random bytes -> 32 chars of base64url. No symbols that need shell
    // quoting or escaping on any platform.
    return crypto.randomBytes(24).toString('base64url');
})();

const salt = crypto.randomBytes(SALT_BYTES);
const dk = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, KEY_BYTES, 'sha256');
const hash = 'pbkdf2$' + ITERATIONS + '$' + b64(salt) + '$' + b64(dk);

// The check that matters: re-derive from the stored form and compare. If the
// format were wrong, this would throw or mismatch and we would know NOW,
// rather than after writing to a live account.
const parts = hash.split('$');
if (parts.length !== 4 || parts[0] !== 'pbkdf2' || Number(parts[1]) !== ITERATIONS) {
    throw new Error('format is wrong: ' + hash);
}
const saltCheck = Buffer.from(parts[2], 'base64');
const dkCheck = Buffer.from(parts[3], 'base64');
if (saltCheck.length !== SALT_BYTES || dkCheck.length !== KEY_BYTES) {
    throw new Error('salt/key length is wrong');
}
const verify = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), saltCheck, Number(parts[1]), KEY_BYTES, 'sha256');
if (!crypto.timingSafeEqual(verify, dkCheck)) {
    throw new Error('the hash does not verify against the password');
}

console.log('PASSWORD=' + password);
console.log('HASH=' + hash);
console.log('VERIFIED=ok  (re-derived from the stored form and compared)');
console.log('');
console.log('Record this in the KV value as the "password" field. Nothing was written.');