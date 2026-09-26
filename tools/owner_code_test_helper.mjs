// Test-only owner credentials.
//
// PHASE 1 CONTEXT
// ---------------
// The worker used to accept a hard-coded owner access code, the literal
// "ScripterHub". It was removed because it was never a secret: it is the
// product name and appeared in the page title, so anyone who read the source
// or guessed the obvious could authenticate as owner.
//
// Owner access is now EXPLICIT. In tests we do not mint a random code (that
// would be non-deterministic and unrepeatable); we inject the hash directly
// via the SH_OWNER_CODE_HASH env binding, and log in with the matching
// plaintext. This exercises the same comparison path production uses.
//
// Production never sets SH_OWNER_CODE_HASH unless the operator chooses to.
// Without it the worker mints a 192-bit code on first use and prints it once
// to the worker log (see bootstrapOwnerCode in worker.js).
//
// TO MIGRATE AN EXISTING TEST:
//   1. add   SH_OWNER_CODE_HASH: OWNER_CODE_HASH   to the `env` object
//   2. import { OWNER_CODE_PLAIN, OWNER_CODE_HASH } from './owner_code_test_helper.mjs'
//   3. replace  { code: 'ScripterHub' }  with  { code: OWNER_CODE_PLAIN }
//
// This helper is a FIXTURE, not a credential. It is committed on purpose so
// the test suite is deterministic; it grants access to nothing that is
// deployed.

import { webcrypto as crypto } from 'node:crypto';

export const OWNER_CODE_PLAIN = 'test-owner-access-code-do-not-use-in-production';
export const OWNER_CODE_HASH = await (async () => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(OWNER_CODE_PLAIN));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
})();

// Spread into the env object passed to worker.fetch().
export const OWNER_ENV = { SH_OWNER_CODE_HASH: OWNER_CODE_HASH };

// For test assertions: the plaintext the worker must now REJECT.
export const FORBIDDEN_LEGACY_CODE = 'ScripterHub';
