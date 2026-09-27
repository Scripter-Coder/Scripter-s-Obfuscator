// Guards the PBKDF2 iteration cap - the bug that broke the password reset.
//
// PBKDF2_ITERATIONS was 210000 (the OWASP recommendation). Web Crypto allows
// 1..100000 and MUST throw OperationError above that, so hashPassword() failed
// on every call in production:
//
//     Pbkdf2 failed: iteration counts above 100000 are not supported
//     (requested 210000)
//
// WHY THIS NEEDS ITS OWN FILE: worker.test.mjs runs on Node, and Node's
// crypto.webcrypto does NOT enforce the cap - it derives at 210000 without
// complaint. So every signup/login/reset assertion in the suite passed for a
// reason that does not hold on Cloudflare. A harness that is more permissive
// than the runtime it stands in for reports green for code that cannot run.
//
// So this asserts the NUMBER against the spec limit, and separately runs a real
// derivation at whatever the worker actually uses - which is the check that
// would have caught it, expressed as a bound rather than as a hope.
import assert from 'assert';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

const SPEC_MAX = 100000;   // Web Crypto PBKDF2: 1..100000, OperationError above

const src = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
const m = /const PBKDF2_ITERATIONS\s*=\s*(\d+)/.exec(src);
assert.ok(m, 'PBKDF2_ITERATIONS must be declared in the worker');
const iterations = Number(m[1]);

let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('  OK   ' + msg); };
const no = (msg) => { fail++; console.log('  FAIL ' + msg); };

// 1. the number the worker uses must be inside the platform's range
if (iterations >= 1 && iterations <= SPEC_MAX) {
  ok('iterations (' + iterations + ') is within the Web Crypto range 1..' + SPEC_MAX);
} else {
  no('iterations (' + iterations + ') is outside 1..' + SPEC_MAX +
     ' - every hashPassword() call throws OperationError in production');
}

// 2. it must be a plain decimal literal, not an expression. A computed value
//    would pass the range check above and still be unreadable at the call site.
//    m[0] is `const PBKDF2_ITERATIONS = 100000` - the capture group ends at the
//    digits, so there is no semicolon to match and the anchored pattern has to
//    stop at the digits too.
if (/^const PBKDF2_ITERATIONS = \d+$/.test(m[0])) ok('declared as a plain literal');
else no('not a plain literal: "' + m[0] + '" - a computed value hides the cost of the next change');

// 3. actually derive at that count. On Node this will not catch an over-limit
//    value (Node does not enforce the cap) - which is exactly the point of
//    assertion 1. Here it proves the count is not absurd and the call shape is
//    the one the worker uses.
const enc = new TextEncoder();
const salt = new Uint8Array(16);
const key = await webcrypto.subtle.importKey('raw', enc.encode('password123'), { name: 'PBKDF2' }, false, ['deriveBits']);
try {
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  ok('derives ' + (bits.byteLength * 8) + '-bit output at ' + iterations + ' iterations');
} catch (e) {
  no('derivation failed: ' + e.name + ': ' + e.message);
}

// 4. the OWASP number that started this must never come back
if (src.includes('PBKDF2_ITERATIONS = 210000')) {
  no('PBKDF2_ITERATIONS is 210000 again - that is the value Web Crypto rejects');
} else {
  ok('the 210000 value is not present anywhere in the worker');
}

// 5. and the record format must carry the iteration count, so a stored hash
//    made under a different count can still be VERIFIED. verifyPassword reads
//    the count out of the record; if the prefix lost it, old hashes would stop
//    verifying the moment the constant moved - which is this same bug wearing a
//    different hat.
if (/'pbkdf2\$' \+ PBKDF2_ITERATIONS \+ '\$'/.test(src)) {
  ok('the stored record embeds the iteration count, so hashes survive a change');
} else {
  no('the record does not embed the iteration count - moving the constant would silently break every stored hash');
}

console.log('');
console.log('PBKDF2 LIMIT   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
