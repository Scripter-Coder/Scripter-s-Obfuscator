// =============================================================================
// SECURITY GATES — ScripterHub hosted platform
// =============================================================================
// This is the measuring instrument. It exists BEFORE any of the security work
// so that every claim we make afterwards is backed by a gate that fails
// without the protection.
//
// WHY THIS SHAPE
//
// A previous audit produced a flattering number that was wrong: it reported
// "70% resistant" while missing an entire class of handler. The lesson was that
// an instrument which flatters is worse than none. So:
//
//   * Every gate asserts the DESIRED behaviour, never the current behaviour.
//     A gate that passes means the property holds.
//   * `xfail` = a hole we have already confirmed and not yet closed.
//   * `pass`   = must hold. If one of these starts failing, that is a
//                REGRESSION and the harness exits non-zero.
//   * `deferred` = not testable until a later phase lands (needs D1).
//   * If an `xfail` gate starts PASSING, the harness says so loudly. That
//     means the hole got closed and the gate must be promoted to `pass`, or
//     the gate is not testing what it claims to test.
//
// Run:  node tools/security_gates_test.mjs
//       npm run test:gates
//
// Exit code is 0 while any xfail remains. It becomes non-zero only on a
// regression in a `pass` gate, or if a gate is malformed.
// =============================================================================

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const worker = (await import('../For Cloudflare/worker.js')).default;

const SCHEMA = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------
function makeKV() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); },
    _store: store
  };
}

// A REAL D1, not a mock.
//
// Phase 3 made the delivery gate refuse everything when the state layer is
// absent, which is the honest behaviour, but it also means a gate harness with
// no database would report EVERY delivery property as "closed" for the wrong
// reason: the routes would be refusing because D1 is missing, not because
// sessions are single-use.
//
// That is exactly the failure mode this file was written to prevent, so the
// harness supplies a real one. D1 *is* SQLite and the state layer in worker.js already
// normalises the two calling conventions, so a DatabaseSync is a faithful
// stand-in and the SQL under test is the SQL that will run in production.
function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
// An attacker picks this string. It costs nothing and is not a secret.
const SPOOFED_UA = 'Roblox/570 Delta Executor';
const ID = 'ScripterHub1234567890';
const ID2 = 'ScripterHub0987654321';

function makeEnv(opts = {}) {
  const env = {
    LOADERS_KV: makeKV(),
    SH_SETUP_TOKEN: 'SETUPTOK',
    SH_BASE_URL: 'https://audit.workers.dev',
    SH_SESSION_SECRET: 'a-real-server-only-secret-for-gates'
  };
  // opt out for the one gate that specifically asserts the missing-D1
  // behaviour, so every other gate is measuring what it claims to measure.
  if (!opts.noD1) env.SH_DB = makeD1();
  return env;
}

async function call(env, method, path, body, ua, headers) {
  const h = Object.assign({ 'User-Agent': ua || BROWSER_UA }, headers || {});
  if (body) h['Content-Type'] = 'application/json';
  const req = new Request('https://audit.workers.dev' + path, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined
  });
  const r = await worker.fetch(req, env, { waitUntil() {} });
  return { status: r.status, type: r.headers.get('Content-Type'), body: await r.text() };
}
const get = (env, p, ua, h) => call(env, 'GET', p, null, ua, h);

// Seed a keyed+authRequired script exactly as a real upload would leave it.
function seedScript(env, id, opts = {}) {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  env.LOADERS_KV._store.set('sh_loader_' + id, b64(opts.plain || 'REAL KEYED SOURCE'));
  env.LOADERS_KV._store.set('sh_meta_' + id, JSON.stringify(Object.assign({
    name: 'p', user: 'owner', keyless: false, authRequired: true
  }, opts.meta || {})));
  env.LOADERS_KV._store.set('sh_skey_' + id, JSON.stringify({ paddedKey: [1, 2, 3], t0: 1700000000, chk: 424242 }));
}

// Mirror a license into KV (what the panel reads).
function seedLicense(env, key, rec) {
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({ [key]: Object.assign({ key, scriptId: ID }, rec) }));
}

// The full honest path: mint a REAL session through /sh/session, then spend it
// through the gate. Every delivery gate below goes through this rather than
// fabricating a token, because a fabricated token is refused for the trivial
// reason that it is fabricated — and a gate that asserts "the forged thing is
// rejected" while never proving the REAL thing is accepted passes without
// testing anything.
//
// Returns { sid, nonce, mint, deliver } or throws, so a broken setup reports as
// a gate setup error rather than as a security pass.
async function authorizedSession(env, opts = {}) {
  const key = opts.key || 'LIC';
  const id = opts.id || ID;
  seedLicense(env, key, { hwid: 'HW', expiresAt: 0, banned: false, ...(opts.lic || {}) });
  const mint = await call(env, 'POST', '/sh/session', { id, k: key, h: 'HW' }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.20' });
  if (mint.status !== 200 || !/^SHS /.test(mint.body)) {
    throw new Error('gate setup failed: could not mint a session (' + mint.status + ' ' + mint.body.slice(0, 80) + ')');
  }
  const [, sid, nonce] = mint.body.trim().split(/\s+/);
  return { sid, nonce, key, id, mint };
}

// An owner token, via the real claim + login path.
//
// G05, G06, G22 and G23 need to act as the OWNER (apply a ban, re-sync a
// license, read the kill switch). Writing KV directly was the first version of
// G05 and it was measuring the wrong thing: the worker's ban path is
// `/sh/license-ban` -> saveLicenses() -> mirror into the table the gate reads,
// and a test that skips straight to KV never exercises any of it. It also
// "passed" for a completely wrong reason — the mirror never ran, so the gate
// was asserting that a ban which had not been applied did not take effect.
//
// TWO rate-limit hazards here, both real and both hit while writing this:
//
//   1. /sh/login is limited to 10/min. Memoising per-env is NOT enough, because
//      every gate builds a fresh env, so a WeakMap never gets a cache hit and
//      each gate spends the same shared budget.
//   2. rateIdentity() falls back to the literal 'anon' when there is no
//      CF-Connecting-IP header, so EVERY gate's login lands in ONE bucket — and
//      G04 deliberately fires five near-miss logins at it, and G20 fires more.
//
// The fix is to give each owner login its own identity, which is also what a
// real second browser looks like. A gate failing on a 429 that has nothing to
// do with what it is testing is the worst kind of test failure: it looks like
// a security regression.
let ownerIpSeq = 0;
const OWNER_TOKENS = new WeakMap();
async function ownerToken(env) {
  if (OWNER_TOKENS.has(env)) return OWNER_TOKENS.get(env);
  const ip = '198.51.100.' + (150 + (ownerIpSeq++ % 40));
  const hdr = { 'CF-Connecting-IP': ip };
  const claim = await call(env, 'POST', '/sh/owner-claim', { setupToken: 'SETUPTOK' }, BROWSER_UA, hdr);
  let c = null;
  try { const d = JSON.parse(claim.body); if (d.ok && d.code) c = d.code; } catch (e) {}
  need(c, 'gate setup failed: could not claim the owner code (' + claim.body.slice(0, 90) + ')');
  const li = await call(env, 'POST', '/sh/login', { code: c }, BROWSER_UA, hdr);
  need(/"ok":true/.test(li.body), 'gate setup failed: owner login failed (' + li.body.slice(0, 90) + ')');
  const tok = JSON.parse(li.body).token;
  OWNER_TOKENS.set(env, tok);
  return tok;
}

async function spend(env, s, ua) {
  return get(env, `/sh/a/${s.id}?s=${s.sid}&n=${s.nonce}`, ua || SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.20' });
}

// Reproduce the worker's own token derivation, which is fully specified by
// makeAuthToken: HMAC-SHA256 keyed by SHA-256("SHAUTH::"+key) over key|hwid|t0,
// truncated to 32 hex chars. Everything in that expression is known to any
// client that already holds the key, which is the whole point of gate G09.
async function forgeToken(key, hwid, t0) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode('SHAUTH::' + key));
  const sk = await crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', sk, enc.encode(key + '|' + hwid + '|' + t0));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const GATES = [];
const gate = (id, name, status, fn) => GATES.push({ id, name, status, fn });

// ===========================================================================
// CORE DELIVERY
// ===========================================================================

// G01 REWRITTEN IN PHASE 3.
//
// The original asserted `status !== 200`, which encoded an assumption that has
// changed: /sh/<id> now SERVES 200 on purpose, because it returns a bootstrap.
// A gate that keeps asserting non-200 would have "passed" the moment the
// bootstrap shipped, while the actual property it cares about — no artifact
// bytes — was never checked.
//
// So the assertion is now about the ARTIFACT, not the status. It is also
// strictly stronger than the original, because it inspects the bytes rather
// than the envelope: a 200 that leaks the source would still fail this.
gate('G01', 'Loader URL with no credential returns no artifact bytes', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const secretB64 = env.LOADERS_KV._store.get('sh_loader_' + ID);
  const secretPlain = Buffer.from(secretB64, 'base64').toString('utf8');
  const r = await get(env, '/sh/' + ID, SPOOFED_UA);

  // 1. the artifact must not be present in any form
  if (r.body.includes(secretB64)) throw new Error('the artifact cipher is in the /sh/<id> response');
  if (r.body.includes(secretPlain)) throw new Error('the artifact plaintext is in the /sh/<id> response');
  // 2. nor the split key that would decrypt it.
  //
  //    Checked by VALUE, not by the literal "SHK". The bootstrap legitimately
  //    contains "SHK" as a wire-format marker — it has to, to know how to parse
  //    a delivery — so matching the marker tests nothing. The padded key and
  //    the check value are the actual secrets, and those are what is asserted
  //    here. An earlier revision of this gate matched "SHK" and reported a
  //    leak that did not exist.
  const sk = JSON.parse(env.LOADERS_KV._store.get('sh_skey_' + ID));
  if (r.body.includes(String(sk.chk))) throw new Error('the split-key check value is in the /sh/<id> response');
  if (r.body.includes(String(sk.t0))) throw new Error('the split-key t0 is in the /sh/<id> response');
  if (r.body.includes(sk.paddedKey.join(' '))) throw new Error('the padded key is in the /sh/<id> response');
  // 3. and the response must be a fixed protocol script, not a payload in
  //    disguise. The bootstrap is identical for every script except the id,
  //    so it must be small and must not scale with the artifact.
  if (r.body.length > 12000) {
    throw new Error(`/sh/<id> returned ${r.body.length} bytes - too large to be a fixed bootstrap`);
  }
  // 4. the honest counter-check: the same script DOES deliver bytes once a
  //    real session is spent. Without this the gate would pass simply by
  //    serving nothing at all, forever, which is not a working product.
  const s = await authorizedSession(env);
  const ok = await spend(env, s);
  need(ok.status === 200, 'gate setup failed: an authorized session did not deliver (' + ok.body.slice(0, 80) + ')');
  // The stored artifact IS base64 (that is what an upload produces), so the
  // delivery must contain the base64 form, not the decoded form.
  if (!ok.body.includes(secretB64)) throw new Error('gate setup failed: the authorized delivery did not contain the artifact');
});

gate('G02', 'No artifact bytes escape without a minted, single-use session', 'pass', async () => {
  const env = makeEnv();
  const secret = '-- OBFUSCATED FREE PAYLOAD';
  env.LOADERS_KV._store.set('sh_loader_' + ID2, secret);
  env.LOADERS_KV._store.set('sh_meta_' + ID2, JSON.stringify({ name: 'f', user: 'u', keyless: true }));

  // 1. the public loader must not carry it. Nothing a browser or a scrapper
  //    can fetch anonymously contains a single artifact byte.
  const boot = await get(env, '/sh/' + ID2, SPOOFED_UA);
  if (boot.body.includes(secret)) throw new Error('exact artifact bytes returned by the public loader');

  // 2. no unauthenticated delivery route exists that would hand it over. A
  //    fabricated session id and nonce must not be enough, because the nonce
  //    is 192 bits of crypto random and is spent with UPDATE ... RETURNING.
  const direct = await get(env, `/sh/a/${ID2}?s=made-up&n=made-up`, SPOOFED_UA);
  if (direct.status === 200 && direct.body.includes(secret)) {
    throw new Error('the delivery gate served a keyless artifact to a fabricated session');
  }

  // 3. D1 was reversed: an anonymous mint IS allowed now. Making users paste
  //    an email into an executor costs privacy and friction, and the gate also
  //    demanded a signed user token the loader could not carry - so the free
  //    tier was not gated, it was undeliverable. What replaced it:
  //
  //      a. the minted session is SINGLE USE, so one execution costs one
  //         round trip and cannot be replayed, and
  //      b. anonymous minting is RATE LIMITED, so a catalogue cannot be
  //         harvested in a loop.
  //
  //    Neither stops one deliberate fetch. Nothing delivered to a client can:
  //    whoever runs the code can read it. That is a property of shipping code
  //    to an executor, not a hole in this gate, and it is recorded as benchmark
  //    row A9 (accepted by design) rather than asserted here as a falsehood.
  const anon = await call(env, 'POST', '/sh/session', { id: ID2 }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.21' });
  if (!/^SHS /.test(anon.body)) {
    throw new Error('a keyless script no longer mints an anonymous session at all. If that is a\n'
      + 'deliberate change then re-state it here - otherwise the loader cannot run a free script. got: '
      + anon.body.trim().slice(0, 80));
  }

  // 3a. single use: the same session + nonce must not deliver twice
  const parts = anon.body.trim().split(/\s+/);
  const sid = parts[1], nonce = parts[2];
  need(sid && nonce, 'the mint did not return a session id and nonce');
  const first = await get(env, `/sh/a/${ID2}?s=${sid}&n=${nonce}`, SPOOFED_UA);
  if (first.status !== 200 || !first.body.includes(secret)) {
    throw new Error('gate setup failed: a freshly minted session did not deliver the artifact');
  }
  const second = await get(env, `/sh/a/${ID2}?s=${sid}&n=${nonce}`, SPOOFED_UA);
  if (second.status === 200 && second.body.includes(secret)) {
    throw new Error('the delivery gate let one session be spent TWICE - replay, not single use');
  }

  // 3b. bulk: the session bucket is 30/min per identity, so a loop runs out of
  //     budget long before it runs out of scripts
  let refused = 0, allowed = 0;
  for (let i = 0; i < 45; i++) {
    const r = await call(env, 'POST', '/sh/session', { id: ID2 }, SPOOFED_UA,
      { 'CF-Connecting-IP': '198.51.100.22' });
    if (r.status === 429) refused++;
    else if (/^SHS /.test(r.body)) allowed++;
  }
  if (!refused || !allowed) {
    throw new Error('the rate limit is not doing its job: ' + allowed + ' allowed, ' + refused + ' refused');
  }
});

gate('G03', 'Browser loader page embeds no artifact bytes', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const cipher = env.LOADERS_KV._store.get('sh_loader_' + ID);
  const r = await get(env, '/sh/' + ID, BROWSER_UA);
  if (r.body.includes(cipher)) throw new Error('artifact cipher is embedded in the HTML page');
  // The old page shipped a working JS decryptor. Its absence is the property.
  if (/function dec\(/.test(r.body) || /atob\(/.test(r.body)) {
    throw new Error('the HTML page still ships a decryptor - it can only do that if it has the cipher');
  }
  // and the page must not be a copy of the artifact with a wrapper
  if (r.body.includes(Buffer.from(cipher, 'base64').toString('utf8'))) {
    throw new Error('artifact plaintext is embedded in the HTML page');
  }
});

// G10 REWRITTEN IN PHASE 3.
//
// `visibility` was a localStorage field, so "private" hid a script in the UI
// while /sh/<id> served anyone who asked. The original gate sent a spoofed
// EXECUTOR User-Agent, and the natural fix — 403 the bootstrap too — is wrong:
// the bootstrap is artifact-free and identical for every script, so refusing it
// protects nothing and breaks the owner.
//
// So visibility is asserted where it actually matters: the browser page (the
// existence of the script is itself information) and the session mint (the
// gate is where a private script must become unrunnable).
gate('G10', 'private script: no browser page, no session for an outsider', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID, { meta: { visibility: 'private' } });

  const page = await get(env, '/sh/' + ID, BROWSER_UA);
  if (page.status !== 403) {
    throw new Error(`a private script rendered a page to a browser (HTTP ${page.status})`);
  }
  if (page.body.includes(env.LOADERS_KV._store.get('sh_loader_' + ID))) {
    throw new Error('the private script page embedded the artifact');
  }

  seedLicense(env, 'LIC', { hwid: 'HW', expiresAt: 0 });
  const mint = await call(env, 'POST', '/sh/session', { id: ID, k: 'LIC', h: 'HW' }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.22' });
  if (/^SHS /.test(mint.body)) {
    throw new Error('an outsider with a valid license minted a session for a PRIVATE script');
  }

  // the property must be real, not "everything is broken": an ordinary script
  // with the same license DOES mint, so this gate cannot pass by disabling
  // delivery altogether.
  const env2 = makeEnv();
  seedScript(env2, ID2, { id: ID2, meta: { visibility: 'anyone' } });
  seedLicense(env2, 'LIC', { hwid: 'HW', expiresAt: 0 });
  const ok = await call(env2, 'POST', '/sh/session', { id: ID2, k: 'LIC', h: 'HW' }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.23' });
  need(/^SHS /.test(ok.body), 'gate setup failed: a public script was refused too (' + ok.body.slice(0, 80) + ')');
});

// ===========================================================================
// EXPIRY / REVOCATION / REPLAY  (enforced at DELIVERY, not just at /auth)
//
// ALL FIVE REWRITTEN IN PHASE 3, and the rewrite is the important part.
//
// The originals forged a token and asserted the server refused it. Under the
// new design a forged token is refused for the trivial reason that it is
// forged, so all five "passed" the moment Phase 3 landed — while proving
// nothing about replay, expiry or revocation, which are properties of a REAL
// session. A gate suite that reports nine closed holes when five of them were
// never exercised is worse than no suite, because it ends the work.
//
// Each gate below mints a real session, proves the artifact DOES come back on
// the honest path, and then asserts the specific property. The counter-check
// in every one of them is what stops a gate passing by breaking delivery.
// ===========================================================================

// A license can be banned AFTER a session was minted, and the delivery must
// still refuse. This is the difference between "checked at login" and
// "checked at the door", and it is the specific hole the audit recorded.
gate('G05', 'A license banned after minting gets no artifact at delivery', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  // The ban is applied THROUGH THE PRODUCT while the session is still live:
  // /sh/license-ban -> saveLicenses() -> mirror into D1. That mirror is the
  // thing under test, so bypassing it (as an earlier version of this gate did
  // by writing KV directly) would assert nothing.
  const tok = await ownerToken(env);
  const ban = await call(env, 'POST', '/sh/license-ban',
    { token: tok, key: s.key, banned: true, reason: 'banned mid-session' },
    BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.27' });
  need(/"ok":true/.test(ban.body), 'gate setup failed: the ban was not applied (' + ban.body.slice(0, 90) + ')');

  // and the ban must actually be in the gate's table, not only in KV
  const row = env.SH_DB.prepare('SELECT revoked_at FROM licenses WHERE key = ?').get(s.key);
  need(row, 'gate setup failed: the license never reached the D1 table the gate reads');
  if (row.revoked_at === null) {
    throw new Error('the ban is in KV but not in D1 - the gate would still honour it');
  }

  const r = await spend(env, s);
  if (r.status === 200 && r.body.includes('SHK')) {
    throw new Error('a license banned AFTER minting still received the artifact');
  }
  // and the gate must still work for a good license, or this proves nothing
  const env2 = makeEnv();
  seedScript(env2, ID);
  const s2 = await authorizedSession(env2);
  const ok = await spend(env2, s2);
  need(ok.status === 200, 'gate setup failed: a valid license was refused after the ban test');
});

gate('G06', 'An expired license gets no artifact', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  // expiry in the past, so the mint itself must already refuse
  seedLicense(env, 'EXPIRED1', { hwid: 'HW', expiresAt: Date.now() - 60000 });
  const mint = await call(env, 'POST', '/sh/session', { id: ID, k: 'EXPIRED1', h: 'HW' }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.24' });
  if (/^SHS /.test(mint.body)) throw new Error('an expired license was allowed to mint a session');

  // The stronger case: mint while VALID, then let it expire before delivery.
  // Applied through the product's own sync path so the gate's table is what
  // actually changes.
  const s = await authorizedSession(env);
  const tok = await ownerToken(env);
  await call(env, 'POST', '/sh/licenses', {
    token: tok,
    licenses: { [s.key]: { hwid: 'HW', expiresAt: Date.now() - 1000, banned: false } }
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.24' });
  const row = env.SH_DB.prepare('SELECT expires_at FROM licenses WHERE key = ?').get(s.key);
  need(row && row.expires_at !== null, 'gate setup failed: the expiry never reached the D1 table');
  if (row.expires_at > Date.now()) {
    throw new Error('the expiry is not in the past in the gate\'s table - the test would prove nothing');
  }

  const r = await spend(env, s);
  if (r.status === 200 && r.body.includes('SHK')) {
    throw new Error('a license that expired after minting still received the artifact');
  }
  const env2 = makeEnv();
  seedScript(env2, ID);
  const s2 = await authorizedSession(env2);
  need((await spend(env2, s2)).status === 200, 'gate setup failed: a valid license was refused');
});

gate('G07', 'A session cannot be replayed', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  const first = await spend(env, s);
  need(first.status === 200 && first.body.includes('SHK'),
    'gate setup failed: the first (and only legitimate) delivery was refused (' + first.body.slice(0, 80) + ')');

  // same sid, same nonce, any number of times
  for (let i = 0; i < 3; i++) {
    const again = await spend(env, s);
    if (again.status === 200 && again.body.includes('SHK')) {
      throw new Error('the same session was accepted a second time - it is not one-time');
    }
  }
  // and a replayed NONCE with a different (fresh) session must not work either
  const s2 = await authorizedSession(env, { key: 'LIC2' });
  const crossed = await get(env, `/sh/a/${s2.id}?s=${s2.sid}&n=${s.nonce}`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.25' });
  if (crossed.status === 200 && crossed.body.includes('SHK')) {
    throw new Error("another session's nonce was accepted - the nonce is not bound to its session");
  }
});

gate('G08', 'A session expires server-side, not just on an advisory timestamp', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  // The worker advertises a 45s session TTL (SHS carries the expiry, and the
  // expiry is in the response as an ISO string a client can ignore). What
  // matters is that the SERVER refuses past it.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 46 * 1000;   // past SESSION_TTL_MS
    const late = await spend(env, s);
    if (late.status === 200 && late.body.includes('SHK')) {
      throw new Error('a session was still honoured 46s after issue - the TTL is advisory to the client, not enforced');
    }
    // and it must not be revivable by going back in time within the same
    // process: the row is spent/expired in the database, not in a Map
    Date.now = realNow;
    const revive = await spend(env, s);
    if (revive.status === 200 && revive.body.includes('SHK')) {
      throw new Error('an expired session was accepted again once the clock was restored');
    }
  } finally { Date.now = realNow; }
});

gate('G09', 'A token the client computed for itself is rejected', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  // The OLD credential: HMAC(key|hwid|t0) keyed by SHA-256("SHAUTH::"+key).
  // Every input is known to anyone holding the key, so it could be computed
  // with no server involvement at all. It must now be worthless.
  const forged = await forgeToken(s.key, 'HW', 1700000000);
  const viaLegacy = await get(env, `/sh/k/${s.id}?t=1700000000&a=${forged}&k=${s.key}&h=HW`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.26' });
  if (viaLegacy.status === 200) {
    throw new Error('the server accepted a credential the client computed offline - it is not proof of anything');
  }

  // The NEW credential must also not be derivable: guessing a sid/nonce pair
  // that the server never issued must fail even with a valid license.
  const guessed = await get(env, `/sh/a/${s.id}?s=sid_${'0'.repeat(48)}&n=n_${'0'.repeat(48)}`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.26' });
  if (guessed.status === 200 && guessed.body.includes('SHK')) {
    throw new Error('a fabricated session id + nonce was accepted');
  }

  // counter-check: the real one still works
  const ok = await spend(env, s);
  need(ok.status === 200 && ok.body.includes('SHK'),
    'gate setup failed: the genuine session was refused - this gate would pass by breaking delivery');
});

// ===========================================================================
// CREDENTIALS
// ===========================================================================

gate('G04', 'The hard-coded default access code is rejected', 'pass', async () => {
  // NOTE: this gate intentionally runs with NO owner code configured, which is
  // the pre-Phase-1 state. In that state a login attempt triggers the
  // bootstrap path, so it also proves the bootstrap cannot be reached with a
  // guessable default. The claim endpoint itself is covered by G20.
  const env = makeEnv();
  const r = await call(env, 'POST', '/sh/login', { code: 'ScripterHub' });
  if (r.status === 200 && /"ok"\s*:\s*true/.test(r.body)) {
    throw new Error('the published literal "ScripterHub" still authenticates as owner');
  }
  // A near-miss must not be accepted either: the old comparison hashed the
  // whole string, but a prefix/extension of the old default is the next
  // thing an attacker would try.
  for (const variant of ['scripterhub', 'ScripterHub ', 'ScripterHub1', 'Scripter']) {
    const v = await call(env, 'POST', '/sh/login', { code: variant });
    if (v.status === 200 && /"ok"\s*:\s*true/.test(v.body)) {
      throw new Error(`a variant of the legacy default was accepted: ${JSON.stringify(variant)}`);
    }
  }
  // And the operator-configured path must still work, or this gate would
  // "pass" simply by breaking owner login entirely.
  const env2 = makeEnv();
  env2.SH_OWNER_CODE_HASH = await (async () => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a-real-owner-code'));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  })();
  const good = await call(env2, 'POST', '/sh/login', { code: 'a-real-owner-code' });
  if (!(good.status === 200 && /"ok"\s*:\s*true/.test(good.body))) {
    throw new Error('a correctly configured owner code was rejected — gate would pass by breaking login');
  }
});

gate('G13', 'Stored credentials are not recoverable from state', 'pass', async () => {
  const env = makeEnv();
  const pw = 'Sup3rSecretPassw0rd';
  const su = await call(env, 'POST', '/sh/user-signup', { email: 'a@t.com', username: 'Alice', password: pw }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.1' });
  need(su.status === 200, `signup rejected (${su.status})`);
  // the users map lives under sh_users_db, not sh_users
  const raw = env.LOADERS_KV._store.get('sh_users_db');
  need(typeof raw === 'string' && raw.length > 0, 'no user map was written, so nothing was actually inspected');
  if (raw.includes(Buffer.from(pw, 'utf8').toString('base64'))) {
    throw new Error('password is recoverable from state — it is base64-encoded, not hashed');
  }
  if (raw.includes(pw)) throw new Error('the plaintext password appears in stored state');

  // The stored value must be a real KDF record, not merely "not base64".
  const rec = JSON.parse(raw)['a@t.com'];
  need(rec && typeof rec.password === 'string', 'no password field on the record');
  if (!/^pbkdf2\$\d+\$/.test(rec.password)) {
    throw new Error(`stored credential is not a PBKDF2 record: ${rec.password.slice(0, 24)}...`);
  }

  // Salt must be per-user: two accounts with the SAME password must not
  // produce the same stored record, or the DB leaks equality.
  const env2 = makeEnv();
  const shared = 'SamePassword123';
  for (const email of ['x@t.com', 'y@t.com']) {
    const s = await call(env2, 'POST', '/sh/user-signup', { email, username: 'U' + email[0], password: shared }, BROWSER_UA,
      { 'CF-Connecting-IP': '198.51.100.7' });
    need(s.status === 200, `second signup rejected (${s.status})`);
  }
  const map2 = JSON.parse(env2.LOADERS_KV._store.get('sh_users_db'));
  const hx = map2['x@t.com'].password, hy = map2['y@t.com'].password;
  if (hx === hy) throw new Error('two identical passwords produced identical records — the salt is not per-user');

  // A correct password must still log in, and a wrong one must not. The gate
  // must not pass by breaking authentication entirely.
  const env3 = makeEnv();
  await call(env3, 'POST', '/sh/user-signup', { email: 'z@t.com', username: 'Zed', password: 'CorrectHorse99' }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.8' });
  const good = await call(env3, 'POST', '/sh/user-login', { emailOrUsername: 'z@t.com', password: 'CorrectHorse99' }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.8' });
  if (!/\"ok\":true/.test(good.body)) throw new Error('the correct password was rejected — gate would pass by breaking login');
  const bad = await call(env3, 'POST', '/sh/user-login', { emailOrUsername: 'z@t.com', password: 'WrongPassword99' }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.8' });
  if (/\"ok\":true/.test(bad.body)) throw new Error('an incorrect password was accepted');
});

gate('G19', 'Session tokens are signed, not self-certifying', 'pass', async () => {
  // The old token was base64({t, ch, k: sha256(ch+t)}): the value used to
  // validate it travelled inside it, so one observed token allowed minting
  // unlimited valid ones. It also CONTAINED the stored password hash.
  const env = makeEnv();
  env.SH_SESSION_SECRET = 'a-real-server-only-secret';
  await call(env, 'POST', '/sh/user-signup', { email: 's@t.com', username: 'Sam', password: 'samsecret123' }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.11' });
  const li = await call(env, 'POST', '/sh/user-login', { emailOrUsername: 's@t.com', password: 'samsecret123' }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.11' });
  need(/\"ok\":true/.test(li.body), 'login failed: ' + li.body.slice(0, 80));
  const token = JSON.parse(li.body).token;
  need(typeof token === 'string' && token.length > 20, 'no token issued');

  // 1. it must not embed the credential in any decodable form
  const mapRaw = env.LOADERS_KV._store.get('sh_users_db') || '';
  const storedHash = (JSON.parse(mapRaw)['s@t.com'] || {}).password || '';
  need(storedHash.length > 0, 'could not read the stored hash to check for leakage');
  const decoded = Buffer.from(token, 'base64').toString('utf8');
  if (decoded.includes(storedHash)) throw new Error('the session token contains the stored password hash');
  if (decoded.includes('samsecret123')) throw new Error('the session token contains the plaintext password');

  // 2. tampering must invalidate it
  const [body, sig] = token.split('.');
  if (!sig) throw new Error('the token is not signed (no signature segment)');
  const tamperedBody = Buffer.from(JSON.stringify({ kind: 'user', e: 's@t.com', t: Date.now(), pwd: 'x' })).toString('base64url');
  const forged = tamperedBody + '.' + sig;
  const r = await call(env, 'POST', '/sh/upload', { userToken: forged, name: 'x', plainCode: 'p', keyless: true }, BROWSER_UA,
    { 'CF-Connecting-IP': '198.51.100.11' });
  if (r.status === 200) throw new Error('a token with a swapped payload was accepted — the signature is not covering the body');
});

gate('G12', 'body.user must match the authenticated identity', 'pass', async () => {
  const env = makeEnv();
  const tok = await loginUserToken(env, 'owner@t.com', 'ownpass123');
  const r = await call(env, 'POST', '/sh/upload', {
    userToken: tok, name: 'x', user: 'somebody-else', plainCode: 'print(1)', keyless: true
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.2' });
  need(r.status === 200, `upload rejected (${r.status}) — cannot test impersonation if the upload itself fails`);
  let d; try { d = JSON.parse(r.body); } catch (e) { throw new Error('gate setup: upload body was not JSON'); }
  const meta = JSON.parse(env.LOADERS_KV._store.get('sh_meta_' + d.id) || '{}');
  need(typeof meta.user === 'string' && meta.user.length > 0, 'no user was recorded against the script');
  if (meta.user !== 'owner@t.com') {
    throw new Error(`the script was attributed to ${JSON.stringify(meta.user)} but the token proved owner@t.com`);
  }
});

gate('G11', 'A user cannot overwrite another user\'s script id', 'pass', async () => {
  const env = makeEnv();
  // MUST be ScripterHub + exactly 10 digits: loaderId() falls back to a
  // RANDOM id when wantId does not match, which would make this gate "pass"
  // while never touching the victim at all.
  const victim = 'ScripterHub5550001111';
  need(/^ScripterHub\d{10}$/.test(victim), 'gate setup: bad victim id shape');
  env.LOADERS_KV._store.set('sh_meta_' + victim, JSON.stringify({ name: 'victim', user: 'owner@other.com', keyless: false }));
  env.LOADERS_KV._store.set('sh_loader_' + victim, 'VICTIM PAYLOAD');
  const tok = await loginUserToken(env, 'mallory@t.com', 'mallorypass');

  // 1. the cross-user overwrite must be refused outright
  const r = await call(env, 'POST', '/sh/upload', {
    userToken: tok, name: 'evil', user: 'mallory@t.com', wantId: victim, plainCode: 'OVERWRITTEN', keyless: true
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.3' });
  if (env.LOADERS_KV._store.get('sh_loader_' + victim) !== 'VICTIM PAYLOAD') {
    throw new Error('a different user overwrote an existing script by supplying its wantId');
  }
  if (r.status === 200) {
    // Silently minting a different id is NOT an acceptable pass: the caller
    // asked for a specific id and must be told, not handed a working
    // loadstring for a different script than the one it meant to publish.
    let d; try { d = JSON.parse(r.body); } catch (e) { throw new Error('gate setup: upload body was not JSON'); }
    if (d.id !== victim) throw new Error('the id was silently reassigned instead of refusing the request');
    throw new Error('200 with the victim id but an intact payload — server behaviour is unclassifiable');
  }
  if (r.status !== 403) throw new Error(`expected 403 for a cross-user overwrite, got HTTP ${r.status}`);

  // 2. re-publishing to your OWN existing id must still work, or this gate
  //    would pass by breaking the republish flow the split-key URL depends on
  const mine = await call(env, 'POST', '/sh/upload', {
    userToken: tok, name: 'mine', user: 'mallory@t.com', plainCode: 'V1', keyless: true
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.3' });
  need(mine.status === 200, `own upload failed (${mine.status}) — legitimate publishing is broken`);
  const myId = JSON.parse(mine.body).id;
  const again = await call(env, 'POST', '/sh/upload', {
    userToken: tok, name: 'mine', user: 'mallory@t.com', wantId: myId, plainCode: 'V2', keyless: true
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.3' });
  if (again.status !== 200) throw new Error(`re-uploading to your own id was refused (${again.status}) — split-key republish would break`);
  if (env.LOADERS_KV._store.get('sh_loader_' + myId) !== 'V2') {
    throw new Error('own re-upload returned 200 but did not replace the artifact');
  }
});

// helper: register a user and return its session token.
//
// NOTE the field name: /sh/upload reads the OWNER access-code token from
// body.token but a USER session token from body.userToken. Passing a user
// token as `token` yields 401, which looks exactly like "correctly rejected"
// — that mistake made this gate pass vacuously once already.
async function loginUserToken(env, email, password) {
  const ip = { 'CF-Connecting-IP': '198.51.100.9' };
  const su = await call(env, 'POST', '/sh/user-signup', { email, username: 'U' + email[0], password }, BROWSER_UA, ip);
  if (su.status !== 200) throw new Error(`gate setup failed: signup rejected (${su.status} ${su.body.slice(0, 90)})`);
  const r = await call(env, 'POST', '/sh/user-login', { emailOrUsername: email, password }, BROWSER_UA, ip);
  let d;
  try { d = JSON.parse(r.body); } catch (e) { throw new Error('gate setup failed: login body was not JSON'); }
  if (!d.ok || !d.token) throw new Error(`gate setup failed: login did not issue a token (${r.status})`);
  return d.token;
}

// A gate must NEVER pass because its setup silently did nothing. Every
// precondition is asserted with this, so a broken gate reports as an ERROR
// rather than quietly inflating the closed count.
function need(cond, why) { if (!cond) throw new Error('gate setup failed: ' + why); }

// ===========================================================================
// OWNER CREDENTIAL HANDLING
// ===========================================================================

gate('G20', 'The owner code is never written to a log', 'pass', async () => {
  // An earlier revision printed the generated owner code with console.log.
  // Cloudflare retains worker logs and anyone with dashboard access can read
  // them, so "printed once" still leaves a permanent copy in a place designed
  // to keep it. The claim endpoint must be the ONLY path to the plaintext.
  const env = makeEnv();
  env.SH_SETUP_TOKEN = 'the-setup-token';
  const logs = [];
  const realLog = console.log, realWarn = console.warn, realErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  let claim;
  try {
    const r = await call(env, 'POST', '/sh/owner-claim', { setupToken: 'the-setup-token' });
    claim = { status: r.status, body: r.body };
  } finally {
    console.log = realLog; console.warn = realWarn; console.error = realErr;
  }

  let code = null;
  try { const d = JSON.parse(claim.body); if (d.ok && d.code) code = d.code; } catch (e) {}
  need(code, 'the claim endpoint did not return a code: ' + claim.body.slice(0, 110));

  // 1. the plaintext must appear nowhere in what was logged
  const blob = logs.join('\n');
  if (blob.includes(code)) {
    throw new Error('the owner code was written to the worker log — it must only exist in the HTTP response');
  }
  // nothing that looks like a generated code may be logged either
  const codeLike = blob.match(/\b[A-HJ-NP-Z2-9]{6}(?:-[A-HJ-NP-Z2-9]{6}){2,}\b/g);
  if (codeLike) throw new Error('a credential-shaped value was logged: ' + codeLike.join(','));

  // 2. only the hash may be persisted
  const rec = JSON.parse(env.LOADERS_KV._store.get('sh_access_code') || '{}');
  need(rec && rec.hash, 'no code record was written');
  if (JSON.stringify(rec).includes(code)) throw new Error('the plaintext code was persisted in KV');
  if (!/^[0-9a-f]{64}$/.test(String(rec.hash))) throw new Error('the stored code is not a SHA-256 hex digest');

  // 3. it must be strictly single-use, even with a valid setup token
  const again = await call(env, 'POST', '/sh/owner-claim', { setupToken: 'the-setup-token' });
  if (again.body.includes(code)) throw new Error('the code was revealed a second time — the claim is not single-use');
  need(/alreadyClaimed/.test(again.body), 'a second claim did not report alreadyClaimed: ' + again.body.slice(0, 90));

  // 4. a wrong setup token must never receive it
  const env2 = makeEnv();
  env2.SH_SETUP_TOKEN = 'the-real-token';
  const bad = await call(env2, 'POST', '/sh/owner-claim', { setupToken: 'wrong-token' });
  if (bad.status === 200 || bad.body.includes('code')) {
    throw new Error('the claim endpoint answered a wrong setup token');
  }

  // 5. and the response must not be cacheable
  const env3 = makeEnv();
  env3.SH_SETUP_TOKEN = 'tok';
  const r3 = await call(env3, 'POST', '/sh/owner-claim', { setupToken: 'tok' });
  need(/no-store/.test(r3.type || '') || true, 'cache header check');
  const r3raw = await (async () => {
    const req = new Request('https://audit.workers.dev/sh/owner-claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.60' },
      body: JSON.stringify({ setupToken: 'tok' })
    });
    const r = await worker.fetch(req, env3, { waitUntil() {} });
    return r.headers.get('Cache-Control') || '';
  })();
  if (!/no-store/.test(r3raw)) throw new Error('the claim response is cacheable: Cache-Control=' + JSON.stringify(r3raw));

  // 6. the code it returned must actually work
  const env4 = makeEnv();
  env4.SH_SETUP_TOKEN = 'tok4';
  const c4 = JSON.parse((await call(env4, 'POST', '/sh/owner-claim', { setupToken: 'tok4' })).body).code;
  const login = await call(env4, 'POST', '/sh/login', { code: c4 });
  if (!/"ok"\s*:\s*true/.test(login.body)) {
    throw new Error('the claimed code does not authenticate — gate would pass on an unusable credential');
  }
});

// ===========================================================================
// RATE LIMITING
// ===========================================================================

gate('G14', 'Brute-forceable auth routes are rate limited', 'pass', async () => {
  // The audit measured 40/40 unauthenticated license-key guesses served, and
  // no limit at all on the access-code, password or key routes.
  //
  // A correct implementation must 429 the flood AND still serve a legitimate
  // caller, so each route is checked in both directions.
  const probe = async (label, path, headers, expectAfter) => {
    const env = makeEnv();
    seedScript(env, ID);
    env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({}));
    let served = 0, limited = 0;
    for (let i = 0; i < expectAfter + 20; i++) {
      const r = await get(env, path(i), SPOOFED_UA, headers);
      if (r.status === 429) limited++; else served++;
    }
    if (limited === 0) throw new Error(`${label}: no request was rate limited (${served} served)`);
    if (served > expectAfter + 2) throw new Error(`${label}: ${served} served, expected at most ${expectAfter + 2}`);
    return env;
  };

  const IP = { 'CF-Connecting-IP': '198.51.100.4' };

  // /sh/auth : license key guesses
  await probe('/sh/auth', (i) => `/sh/auth/${ID}?k=guess${i}&h=HW&t=1`, IP, 30);

  // /sh/k : split-key requests
  await probe('/sh/k', (i) => `/sh/k/${ID}?t=1700000000&a=tok${i}`, IP, 30);

  // /sh/login : owner access code guesses
  {
    const env = makeEnv();
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const r = await call(env, 'POST', '/sh/login', { code: 'guess' + i }, BROWSER_UA, IP);
      if (r.status === 429) limited++;
    }
    if (limited === 0) throw new Error('/sh/login: the access-code route is not rate limited');
  }

  // /sh/user-login : password guesses, including a per-account spray
  {
    const env = makeEnv();
    await call(env, 'POST', '/sh/user-signup', { email: 'victim@t.com', username: 'Vic', password: 'victimpass1' }, BROWSER_UA, IP);
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const r = await call(env, 'POST', '/sh/user-login', { emailOrUsername: 'victim@t.com', password: 'guess' + i }, BROWSER_UA, IP);
      if (r.status === 429) limited++;
    }
    if (limited === 0) throw new Error('/sh/user-login: password guessing is not rate limited');
  }

  // A legitimate caller must still work: the limit must not be so tight that
  // normal use is broken, and a DIFFERENT identity must have its own budget.
  {
    const env = makeEnv();
    await call(env, 'POST', '/sh/user-signup', { email: 'good@t.com', username: 'Good', password: 'goodpass123' }, BROWSER_UA,
      { 'CF-Connecting-IP': '203.0.113.50' });
    // exhaust the flood IP's budget
    for (let i = 0; i < 40; i++) {
      await call(env, 'POST', '/sh/user-login', { emailOrUsername: 'x@t.com', password: 'p' + i }, BROWSER_UA, IP);
    }
    // a different IP must be unaffected
    const ok = await call(env, 'POST', '/sh/user-login', { emailOrUsername: 'good@t.com', password: 'goodpass123' }, BROWSER_UA,
      { 'CF-Connecting-IP': '203.0.113.51' });
    if (!/\"ok\":true/.test(ok.body)) {
      throw new Error('an unrelated caller was blocked by another IP\'s exhausted budget: ' + ok.body.slice(0, 90));
    }
  }
});

// ===========================================================================
// TELEMETRY
// ===========================================================================

gate('G15', 'Webhook carries metadata only (no source, no license keys)', 'pass', async () => {
  const env = makeEnv();
  env.SH_DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/audit/hook';
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('discord.com/api/webhooks')) {
      let body = '';
      if (opts && opts.body) {
        body = typeof opts.body === 'string' ? opts.body
          : (typeof opts.body.text === 'function' ? await opts.body.text() : String(opts.body));
      }
      sent.push(body);
      // 204 with a body is not a legal HTTP response and the runtime rejects
      // it, which the new telemetry logging then reports as an unreachable
      // webhook. A bare 204 is what Discord actually replies with.
      return new Response(null, { status: 204 });
    }
    return realFetch(url, opts);
  };
  try {
    const tok = await loginUserToken(env, 'leaker@t.com', 'leakpass123');
    const source = 'local SECRET_MARKER = "TOP_SECRET_SOURCE_LINE"';
    const up = await call(env, 'POST', '/sh/upload', {
      userToken: tok, name: 'leaky', user: 'leaker', plainCode: source, keyless: true
    }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.5' });
    need(up.status === 200, `upload rejected (${up.status}) — the source-leak half of this gate never ran`);
    // and an auth event, which is where license keys used to be logged
    seedScript(env, ID);
    env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({ REALKEY123: { key: 'REALKEY123', hwid: 'HW' } }));
    await get(env, `/sh/auth/${ID}?k=REALKEY123&h=HW&t=1`, SPOOFED_UA, { 'CF-Connecting-IP': '198.51.100.5' });
  } finally {
    globalThis.fetch = realFetch;
  }
  const blob = sent.join('\n');
  need(blob.length > 0, 'no webhook payload was captured — the gate observed nothing');
  if (blob.includes('TOP_SECRET_SOURCE_LINE')) throw new Error('plaintext source was sent to the webhook');
  if (blob.includes('REALKEY123')) throw new Error('a live license key was sent to the webhook');
});

// ===========================================================================
// PHASE 3 — the atomic state layer
//
// These three were `deferred` because they needed D1. They are no longer
// deferred, and the harness supplies a REAL SQLite database (see makeD1) so
// they exercise the same SQL that runs in production rather than a mock.
// ===========================================================================

gate('G17', 'A nonce is consumed exactly once', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  const first = await spend(env, s);
  need(first.status === 200 && first.body.includes('SHK'),
    'gate setup failed: the legitimate delivery was refused (' + first.body.slice(0, 80) + ')');

  // Read the database directly rather than inferring from HTTP responses:
  // this gate is about the row, and asserting only on responses would let a
  // route that refuses for the wrong reason look like a correct one.
  const row = env.SH_DB.prepare('SELECT consumed_at FROM nonces WHERE nonce = ?').get(s.nonce);
  if (!row) throw new Error('the nonce row was deleted instead of marked - the audit trail is gone');
  if (row.consumed_at === null) {
    throw new Error('a spent nonce is still unspent in the database');
  }

  // and every replay is refused
  for (let i = 0; i < 3; i++) {
    const again = await spend(env, s);
    if (again.status === 200 && again.body.includes('SHK')) throw new Error('a consumed nonce was accepted again');
  }
});

gate('G18', 'Concurrent delivery with one valid nonce yields exactly one artifact', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);

  // Fire N deliveries at once with the SAME (valid, unspent) session. The
  // property under test is that the database serialises them and exactly one
  // sees changes()===1.
  //
  // node:sqlite is synchronous, so the calls cannot interleave at the JS
  // level — which is precisely the point. A read-then-write implementation
  // would let every one of these read "unspent" first and then all of them
  // would succeed. Here the guard lives in the WHERE clause, so the second
  // caller simply matches zero rows regardless of scheduling.
  const N = 25;
  const results = await Promise.all(
    Array.from({ length: N }, () => spend(env, s))
  );
  const delivered = results.filter(r => r.status === 200 && r.body.includes('SHK'));
  if (delivered.length !== 1) {
    throw new Error(`${N} concurrent deliveries with ONE nonce produced ${delivered.length} artifacts (expected exactly 1)`);
  }
  // exactly one row marked, no more
  const spent = env.SH_DB.prepare('SELECT consumed_at FROM sessions WHERE sid = ?').get(s.sid);
  if (!spent || spent.consumed_at === null) throw new Error('the session row was not marked consumed');
});

gate('G21', 'The gate refuses when the state layer is absent, rather than degrading', 'pass', async () => {
  // THE MOST IMPORTANT NEGATIVE TEST IN THIS FILE.
  //
  // The obvious implementation of "handle a deployment without D1" is to fall
  // back to the KV check. That fallback would restore every property Phase 3
  // exists to remove - replay, expiry, ban-at-delivery, single-use - and would
  // do it SILENTLY, with no error anywhere, while the operator believed the
  // system was gated.
  //
  // So the required behaviour is a refusal, and this gate pins it. It is also
  // the reason every other gate in this file supplies a database: without
  // `noD1`, they would be measuring the absence of a database rather than the
  // property they claim to test.
  const env = makeEnv({ noD1: true });
  seedScript(env, ID);

  const mint = await call(env, 'POST', '/sh/session', { id: ID, k: 'LIC', h: 'HW' }, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.30' });
  if (/^SHS /.test(mint.body)) {
    throw new Error('a session was minted with NO state layer - the gate is not fail-closed');
  }
  // and no delivery route may serve bytes in that state
  const del = await get(env, `/sh/a/${ID}?s=x&n=y`, SPOOFED_UA, { 'CF-Connecting-IP': '198.51.100.30' });
  if (del.status === 200 && del.body.includes('SHK')) {
    throw new Error('the delivery gate served the split key with NO state layer');
  }
  // /sh/health must make the outage visible rather than reporting healthy
  const health = await get(env, '/sh/health', BROWSER_UA);
  let h = null; try { h = JSON.parse(health.body); } catch (e) {}
  need(h, 'gate setup failed: /sh/health did not return JSON');
  if (h.delivery && !/REFUSING/.test(h.delivery)) {
    throw new Error('/sh/health reports a healthy delivery path with no state layer: ' + h.delivery);
  }
});

// The scenario the Phase 2 notes describe as "caught by F7 and fixed" — except
// the predicate was never actually in the shipped statement, so nothing was
// asserting it. A license is locked to hardware on first auth; re-locking it to
// DIFFERENT hardware must invalidate sessions minted against the old one, or
// the lock is advisory and a shared key stays shareable for as long as one old
// session survives.
gate('G22', 'Re-locking a license to other hardware kills the live session', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const s = await authorizedSession(env);          // minted against HW

  // the key is re-locked to different hardware while the session is still live
  const tok = await ownerToken(env);
  const reset = await call(env, 'POST', '/sh/license-reset', { token: tok, key: s.key },
    BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.28' });
  need(/"ok":true/.test(reset.body), 'gate setup failed: the reset was refused (' + reset.body.slice(0, 90) + ')');
  // now a different machine authenticates with the same key and re-locks it
  await call(env, 'POST', '/sh/licenses', {
    token: tok, licenses: { [s.key]: { hwid: 'OTHER-HW', expiresAt: 0, banned: false } }
  }, BROWSER_UA, { 'CF-Connecting-IP': '198.51.100.28' });
  const row = env.SH_DB.prepare('SELECT hwid FROM licenses WHERE key = ?').get(s.key);
  need(row && row.hwid === 'OTHER-HW',
    'gate setup failed: the re-lock never reached the table the gate reads (got ' + (row && row.hwid) + ')');

  // the session minted against HW must now be refused
  const r = await spend(env, s);
  if (r.status === 200 && r.body.includes('SHK')) {
    throw new Error('a session minted against the OLD hardware still delivered after the key was re-locked');
  }
});

// Rotation was deferred for two phases because nothing incremented
// `generation` on re-upload, so `t0` — baked into every published file and
// therefore identical forever — was not rotatable. Both halves exist now:
//
//   * the obfuscator generates a FRESH t0 per build
//   * the upload records the build and retires every older generation
//   * the gate refuses a t0 that is not the active build's
//
// So this asserts the property the audit was really asking about: after a
// rotation, a credential derived from the PREVIOUS build stops working.
gate('G16', 'Rotating a build invalidates the previous build\'s credential', 'pass', async () => {
  const env = makeEnv();
  seedScript(env, ID);

  // ---- build 1 ----
  // NOTE: this file's `call()` returns { status, body } with an UNPARSED body,
  // unlike the `j()` helper. Parsing here rather than assuming `.ok` exists,
  // because a gate that reports "upload rejected" while the response literally
  // says "ok": true is a gate that lies.
  const T0_1 = 1700000000;
  const raw1 = await call(env, 'POST', '/sh/upload', {
    token: await ownerToken(env), name: 'rot', user: 'owner@t.com',
    wantId: ID, authRequired: true, cipher: 'U0hPS0JBUlRFU1Q=', keyHash: 'k',
    buildId: 'build_one',
    splitKey: { paddedKey: [1, 2, 3], t0: T0_1, chk: 1111 }
  });
  let b1 = null;
  try { b1 = JSON.parse(raw1.body); } catch (e) {}
  need(b1 && b1.ok, 'gate setup failed: build 1 upload rejected (' + raw1.status + ' ' + raw1.body.slice(0, 90) + ')');
  seedLicense(env, 'LIC', { hwid: 'HW', expiresAt: 0 });

  const gen1 = env.SH_DB.prepare('SELECT generation FROM build_versions WHERE script_id = ? AND active = 1').get(ID);
  need(gen1 && gen1.generation === 1, 'gate setup failed: build 1 was not recorded as generation 1');

  // build 1 must WORK, or the gate proves nothing
  const s1 = await authorizedSession(env);
  const ok1 = await get(env, `/sh/k/${ID}?t=${T0_1}&s=${s1.sid}&n=${s1.nonce}`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.40' });
  need(ok1.status === 200, 'gate setup failed: the active build was refused (' + ok1.status + ' ' + ok1.body.slice(0, 60) + ')');

  // ---- rotate: build 2 with a FRESH t0, same script id ----
  const T0_2 = 1800000000;
  const raw2 = await call(env, 'POST', '/sh/upload', {
    token: await ownerToken(env), name: 'rot', user: 'owner@t.com',
    wantId: ID, authRequired: true, cipher: 'U0hPS1CT1RFRUQ=', keyHash: 'k',
    buildId: 'build_two',
    splitKey: { paddedKey: [4, 5, 6], t0: T0_2, chk: 2222 }
  });
  let b2 = null;
  try { b2 = JSON.parse(raw2.body); } catch (e) {}
  need(b2 && b2.ok, 'gate setup failed: build 2 upload rejected (' + raw2.status + ' ' + raw2.body.slice(0, 90) + ')');

  const rows = env.SH_DB.prepare('SELECT generation, active FROM build_versions WHERE script_id = ? ORDER BY generation').all(ID);
  need(rows.length === 2, 'gate setup failed: expected 2 build rows, got ' + rows.length);
  if (rows[0].active !== 0) throw new Error('build 1 is still active after a rotation');
  if (rows[1].active !== 1) throw new Error('build 2 is not active after a rotation');
  if (rows[1].generation !== 2) throw new Error('build 2 was not recorded as generation 2');

  // ---- the previous build's credential must now be dead ----
  const s2 = await authorizedSession(env);
  const stale = await get(env, `/sh/k/${ID}?t=${T0_1}&s=${s2.sid}&n=${s2.nonce}`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.40' });
  if (stale.status === 200) {
    throw new Error('the RETIRED build\'s t0 still released the split key - t0 is not rotatable');
  }

  // ---- and the NEW build must work, or the rotation is a self-DoS ----
  const s3 = await authorizedSession(env);
  const fresh = await get(env, `/sh/k/${ID}?t=${T0_2}&s=${s3.sid}&n=${s3.nonce}`, SPOOFED_UA,
    { 'CF-Connecting-IP': '198.51.100.40' });
  if (fresh.status !== 200) {
    throw new Error('the NEW build was refused after rotation (HTTP ' + fresh.status + ') - rotation must not break the live script');
  }
  if (!fresh.body.includes('2222')) throw new Error('the new build served the OLD check value: ' + fresh.body.slice(0, 60));
});

// The /sh/k COMPATIBILITY WINDOW is a deliberate, temporary security
// downgrade, and it is the only place in this codebase where an old,
// client-computable credential is still accepted.
//
// It is gated here so that the cost is PINNED rather than assumed. If someone
// later "simplifies" the flag check, or ships it on by default, these fail.
// The assertion is not "the window is secure" — it is not. It is "the window
// re-opens exactly the three documented gates, keeps the two that matter, and
// is OFF unless explicitly enabled."
gate('G23', 'The /sh/k compatibility window is opt-in and re-opens only what is documented', 'pass', async () => {
  // 1. DEFAULT OFF: a legacy-shaped request with no session is refused.
  {
    const env = makeEnv();
    seedScript(env, ID);
    seedLicense(env, 'LIC', { hwid: 'HW', expiresAt: 0 });
    const tok = await forgeToken('LIC', 'HW', 1700000000);
    const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
    if (r.status === 200) {
      throw new Error('the compatibility window is ON with no opt-in - a hard cutover must be the default');
    }
  }

  // 2. A MISSPELT value must not enable it. Failing open on a typo is how the
  //    owner access code shipped as a hard-coded default in the first place.
  for (const typo of ['yes', 'enabled', 'TRUE', 'on', ' 1', '1 ']) {
    const env = makeEnv();
    env.SH_LEGACY_SPLIT_KEY = typo;
    seedScript(env, ID);
    seedLicense(env, 'LIC', { hwid: 'HW', expiresAt: 0 });
    const tok = await forgeToken('LIC', 'HW', 1700000000);
    const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
    if (r.status === 200) {
      throw new Error(`the window was enabled by the typo ${JSON.stringify(typo)} - it must fail closed`);
    }
  }

  // 3. Explicitly ON: the old shape is served again. This is the outage the
  //    window exists to prevent, so it must actually work.
  {
    const env = makeEnv();
    env.SH_LEGACY_SPLIT_KEY = '1';
    seedScript(env, ID);
    seedLicense(env, 'LIC', { hwid: 'HW', expiresAt: 0 });
    const tok = await forgeToken('LIC', 'HW', 1700000000);
    const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
    if (r.status !== 200) {
      throw new Error('the window is enabled but the legacy shape is still refused - it does not do its job');
    }
  }

  // 4. EVEN WITH THE WINDOW ON, the live license re-check must still run.
  //    This is the whole reason the window is tolerable: bans and the kill
  //    switch keep working during the migration, so an owner can still stop a
  //    compromised key on a legacy client.
  {
    const env = makeEnv();
    env.SH_LEGACY_SPLIT_KEY = '1';
    seedScript(env, ID);
    seedLicense(env, 'BANNED1', { hwid: 'HW', banned: true, expiresAt: 0 });
    const tok = await forgeToken('BANNED1', 'HW', 1700000000);
    const banned = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=BANNED1&h=HW`, SPOOFED_UA);
    if (banned.status === 200) {
      throw new Error('a BANNED license was served with the compatibility window on - G06 must stay closed');
    }

    const env2 = makeEnv();
    env2.SH_LEGACY_SPLIT_KEY = '1';
    seedScript(env2, ID);
    seedLicense(env2, 'EXPIRED1', { hwid: 'HW', expiresAt: Date.now() - 60000 });
    const tok2 = await forgeToken('EXPIRED1', 'HW', 1700000000);
    const expired = await get(env2, `/sh/k/${ID}?t=1700000000&a=${tok2}&k=EXPIRED1&h=HW`, SPOOFED_UA);
    if (expired.status === 200) {
      throw new Error('an EXPIRED license was served with the compatibility window on - G05 must stay closed');
    }

    // and the kill switch overrides the window entirely
    const env3 = makeEnv();
    env3.SH_LEGACY_SPLIT_KEY = '1';
    seedScript(env3, ID);
    seedLicense(env3, 'LIC', { hwid: 'HW', expiresAt: 0 });
    const tok3 = await forgeToken('LIC', 'HW', 1700000000);
    const owner = await ownerToken(env3);
    await call(env3, 'POST', '/sh/killswitch', { token: owner, on: true });
    const ks = await get(env3, `/sh/k/${ID}?t=1700000000&a=${tok3}&k=LIC&h=HW`, SPOOFED_UA);
    if (ks.status === 200) {
      throw new Error('the kill switch did not stop a legacy-window delivery');
    }
  }
});

// G16 stays deferred. Rotating a build invalidates the previous build's
// credential, and the schema for it (build_versions) exists, but t0 is still
// baked into the shipped file at build time and nothing increments a
// generation on re-upload yet. That is Phase 4 work, and claiming it now
// would be a gate that passes because the feature is absent rather than
// working.
// ===========================================================================
// runner
// ===========================================================================
let pass = 0, xfailConfirmed = 0, xfailNowPassing = [], passBroken = [], deferred = 0;
const problems = [];

for (const g of GATES) {
  let err = null;
  try { await g.fn(); } catch (e) { err = e; }
  if (g.status === 'deferred') { deferred++; console.log(`  DEFER ${g.id}  ${g.name}`); continue; }
  if (g.status === 'pass') {
    if (err) { passBroken.push(g); problems.push(`${g.id} REGRESSION: ${err.message}`); console.log(`  FAIL  ${g.id}  ${g.name}\n          ${err.message}`); }
    else { pass++; console.log(`  PASS  ${g.id}  ${g.name}`); }
  } else { // xfail
    if (err) { xfailConfirmed++; console.log(`  HOLE  ${g.id}  ${g.name}\n          confirmed: ${err.message}`); }
    else { xfailNowPassing.push(g); console.log(`  >>>   ${g.id}  ${g.name}\n          UNEXPECTEDLY PASSING — promote to 'pass' or the gate is not testing what it claims`); }
  }
}

const score = pass + xfailConfirmed;
console.log('');
console.log('='.repeat(74));
console.log(`SECURITY GATES   closed ${pass}/${GATES.length - deferred}   holes confirmed ${xfailConfirmed}   deferred ${deferred}`);
console.log('='.repeat(74));
console.log('Read this as work remaining, not as a score. "holes confirmed" means');
console.log('the instrument is correctly detecting a property we do not yet have.');

if (xfailNowPassing.length) {
  console.log('');
  console.log('ACTION REQUIRED: ' + xfailNowPassing.length + ' xfail gate(s) now pass:');
  for (const g of xfailNowPassing) console.log('  ' + g.id + ' ' + g.name);
}
if (problems.length) {
  console.log('');
  console.log('REGRESSIONS in closed gates — these must never fail:');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
process.exit(0);
