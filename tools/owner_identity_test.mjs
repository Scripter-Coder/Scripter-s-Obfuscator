// tools/owner_identity_test.mjs
//
// Guards a bug that locked the site owner out of the admin panel.
//
// The symptom: the owner, signed in to their own Scripter account, changed a
// plan and got
//
//   HTTP 401 from sh/users: Not authorized. The account session was sent but
//   the worker did not accept it as the owner. Sign in as the owner account
//   on THIS tab.
//
// The token was never the problem. verifyUserToken() returned the record
// correctly, and the gate then compared `u.email` against OWNER_EMAIL. A
// record stored with `id` and no `email` has no such field, so the
// comparison was "" === "dubovikstanislav51@gmail.com" -> false, and a
// legitimately signed-in owner was refused with an instruction to sign in
// again - which could not help, because they were already signed in.
//
// It was invisible for two reasons: the same wrong assumption is repeated at
// three sites (the owner gate, and the two role derivations), and
// verifyUserToken() wraps everything in `catch { return null }`, so any
// unrelated fault also surfaces as "not authorized".
//
// The fix normalises identity in loadUserRecord, the one function every
// caller reads through. These checks run the SHIPPED functions, extracted from
// worker.js, rather than a reimplementation.
//
// Run: node tools/owner_identity_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

const OWNER_EMAIL = 'dubovikstanislav51@gmail.com';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

// Extract a shipped function, brace-matched, ignoring braces inside strings
// and comments - the same technique the repo's other harnesses use.
function extractFn(name) {
    const a1 = src.indexOf('async function ' + name + '(');
    const a2 = src.indexOf('function ' + name + '(');
    const at = a1 >= 0 ? a1 : a2;
    if (at < 0) throw new Error('not found in worker.js: ' + name);
    let i = src.indexOf('{', at), depth = 0, s = null, il = false, ib = false;
    for (; i < src.length; i++) {
        const c = src[i], n2 = src[i + 1];
        if (il) { if (c === '\n') il = false; continue; }
        if (ib) { if (c === '*' && n2 === '/') { ib = false; i++; } continue; }
        if (s) { if (c === '\\') { i++; continue; } if (c === s) s = null; continue; }
        if (c === '/' && n2 === '/') { il = true; i++; continue; }
        if (c === '/' && n2 === '*') { ib = true; i++; continue; }
        if (c === "'" || c === '"' || c === '`') { s = c; continue; }
        if (c === '{') depth++;
        if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('brace mismatch: ' + name);
}

const FNS = ['userKvKey', 'unameKvKey', 'sha256Hex', 'b64url', 'unb64url',
    'loadUserRecord', 'normalizeUserIdentity', 'verifyUserToken', 'hashEqual',
    'sessionSecret', 'credentialFingerprint', 'd1UserId', 'storageSafeUser',
    'capImageFields', 'signSessionToken', 'verifySessionSignature', 'hmacHex',
    'getCodeHashes', 'verifyToken', 'bootstrapOwnerCode', 'isOwnerRequest',
    'isOwnerSessionOrAccount'];

const CONSTS = [
    'const TOKEN_TTL = 12 * 60 * 60 * 1000;',
    "const USER_PREFIX = 'sh_user_';",
    "const UNAME_PREFIX = 'sh_uname_';",
    "const USERS_KV_KEY = 'sh_users_db';",
    "const CODE_KV_KEY = 'sh_access_code';",
    "const CODE_SET_KEY = 'sh_code_set_at';",
    `const OWNER_EMAIL = '${OWNER_EMAIL}';`,
];

let W;
try {
    W = new Function([...CONSTS, FNS.map(extractFn).join('\n'),
        'return { loadUserRecord, verifyUserToken, isOwnerSessionOrAccount, '
        + 'credentialFingerprint, sha256Hex, signSessionToken, normalizeUserIdentity };'].join('\n'))();
} catch (e) {
    console.error('Could not assemble the worker helpers: ' + e.message);
    process.exit(2);
}

function makeKV(seed) {
    const store = new Map(Object.entries(seed || {}));
    return {
        store,
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, v); },
        async list({ prefix } = {}) {
            return { keys: [...store.keys()].filter(k => !prefix || k.startsWith(prefix)).map(name => ({ name })) };
        }
    };
}

const PASSWORD = 'owner password';
const ch = await W.sha256Hex(PASSWORD);

console.log('\n[OI1] the owner is recognised from their own session token');
console.log('-'.repeat(72));

// The shape that broke it, plus the shapes that already worked. If the fix
// regressed a previously-passing shape this is where it would show.
const shapes = [
    ['email + password (current shape)', { email: OWNER_EMAIL, username: 'Scripter', password: ch, plan: 'God' }, true],
    ['email + password + isScripter', { email: OWNER_EMAIL, username: 'Scripter', password: ch, plan: 'God', isScripter: true }, true],
    ['email UPPERCASED', { email: OWNER_EMAIL.toUpperCase(), password: ch, plan: 'God' }, true],
    ['no password field', { email: OWNER_EMAIL, plan: 'God' }, true],
    ['disabled: false explicitly', { email: OWNER_EMAIL, password: ch, plan: 'God', disabled: false }, true],
    ['password as a pbkdf2$ hash', { email: OWNER_EMAIL, password: 'pbkdf2$210000$abc$def', plan: 'God' }, true],
    // THE BUG: pre-migration record, `id` instead of `email`.
    ['id instead of email (THE BUG)', { id: OWNER_EMAIL, username: 'Scripter', password: ch, plan: 'God' }, true],
];

for (const [label, rec, shouldPass] of shapes) {
    const env = {
        LOADERS_KV: makeKV({ ['sh_user_' + OWNER_EMAIL]: JSON.stringify(rec) }),
        SESSION_SECRET: 'test-secret',
    };
    const tok = await W.signSessionToken(env, {
        kind: 'user',
        sub: rec.email || rec.id || OWNER_EMAIL,
        e: rec.email || rec.id || OWNER_EMAIL,
        pwd: await W.credentialFingerprint(env, String(rec.password || '')),
        t: Date.now(),
    });
    let gate = false, verified = null;
    try { verified = await W.verifyUserToken(tok, env); } catch (e) { /* */ }
    try { gate = await W.isOwnerSessionOrAccount(env, null, { userToken: tok }, { headers: { get: () => '' } }); } catch (e) { /* */ }
    const want = shouldPass ? 'ACCEPT' : 'REJECT';
    if (want === 'ACCEPT' && gate) ok(label);
    else no(label + ' -> ' + (gate ? 'ACCEPT' : 'REJECT') + ' (expected ' + want + ')' + (verified ? '' : ', token itself did not verify'));
}

console.log('\n[OI2] the fix must NOT weaken who gets in');
console.log('-'.repeat(72));
{
    // A normal, non-owner user with a perfectly valid token stays locked out.
    const other = 'somebody.else@example.com';
    const env = {
        LOADERS_KV: makeKV({
            ['sh_user_' + OWNER_EMAIL]: JSON.stringify({ email: OWNER_EMAIL, password: ch, plan: 'God' }),
            ['sh_user_' + other]: JSON.stringify({ email: other, password: await W.sha256Hex('their password'), plan: 'Basic' }),
        }),
        SESSION_SECRET: 'test-secret',
    };
    const otherCh = await W.sha256Hex('their password');
    const tok = await W.signSessionToken(env, {
        kind: 'user', sub: other, e: other,
        pwd: await W.credentialFingerprint(env, otherCh), t: Date.now(),
    });
    const gate = await W.isOwnerSessionOrAccount(env, null, { userToken: tok }, { headers: { get: () => '' } });
    if (!gate) ok('a valid token for a NON-owner is still refused');
    else no('a non-owner token was accepted - that is a privilege escalation');
}
{
    // A disabled owner must stay locked out. Identity normalisation must not
    // bypass the disabled check.
    const env = {
        LOADERS_KV: makeKV({
            ['sh_user_' + OWNER_EMAIL]: JSON.stringify({ id: OWNER_EMAIL, password: ch, plan: 'God', disabled: true }),
        }),
        SESSION_SECRET: 'test-secret',
    };
    const tok = await W.signSessionToken(env, {
        kind: 'user', sub: OWNER_EMAIL, e: OWNER_EMAIL,
        pwd: await W.credentialFingerprint(env, ch), t: Date.now(),
    });
    const gate = await W.isOwnerSessionOrAccount(env, null, { userToken: tok }, { headers: { get: () => '' } });
    if (!gate) ok('a DISABLED owner record is still refused');
    else no('a disabled owner was accepted - the identity fix bypassed the disabled check');
}
{
    // A garbage token must not be accepted.
    const env = { LOADERS_KV: makeKV({ ['sh_user_' + OWNER_EMAIL]: JSON.stringify({ email: OWNER_EMAIL, password: ch }) }), SESSION_SECRET: 'test-secret' };
    const gate = await W.isOwnerSessionOrAccount(env, null, { userToken: 'not-a-token' }, { headers: { get: () => '' } });
    if (!gate) ok('a malformed token is refused');
    else no('a malformed token was accepted');
}

console.log('\n[OI3] normalising must not overwrite a correct email');
console.log('-'.repeat(72));
{
    const rec = { id: 'legacy-id', email: OWNER_EMAIL, password: ch };
    const out = W.normalizeUserIdentity(rec);
    if (out.email === OWNER_EMAIL) ok('an existing email is preserved, never replaced by id');
    else no('email was overwritten: ' + out.email);
}
{
    const rec = { id: OWNER_EMAIL, password: ch };
    const out = W.normalizeUserIdentity(rec);
    if (out.email === OWNER_EMAIL) ok('a missing email is filled from id');
    else no('email was not filled from id: ' + out.email);
}
{
    const out = W.normalizeUserIdentity({ username: 'x' });
    if (!('email' in out)) ok('a record with neither id nor email is left alone (no invented identity)');
    else no('an email was invented: ' + out.email);
}

console.log('\n' + '='.repeat(72));
console.log('OWNER IDENTITY   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);