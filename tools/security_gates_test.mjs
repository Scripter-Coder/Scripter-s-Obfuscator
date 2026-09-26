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

const workerSrc = await import('../For Cloudflare/worker.js');
const worker = workerSrc.default;

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

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 0.0; Win64; x64) Chrome/120';
// An attacker picks this string. It costs nothing and is not a secret.
const SPOOFED_UA = 'Roblox/570 Delta Executor';
const ID = 'ScripterHub1234567890';
const ID2 = 'ScripterHub0987654321';

function makeEnv() {
  return { LOADERS_KV: makeKV(), SH_SETUP_TOKEN: 'SETUPTOK', SH_BASE_URL: 'https://audit.workers.dev' };
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

gate('G01', 'Spoofed executor UA with no credential gets no artifact', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const r = await get(env, '/sh/' + ID, SPOOFED_UA);
  // Desired: refused. Today: 200 + the artifact embedded in the bootstrap.
  if (r.status === 200) throw new Error(`delivered the artifact to an unauthenticated scraper (HTTP 200, ${r.body.length} bytes)`);
});

gate('G02', 'Keyless artifact is not served anonymously', 'xfail', async () => {
  const env = makeEnv();
  const secret = '-- OBFUSCATED FREE PAYLOAD';
  env.LOADERS_KV._store.set('sh_loader_' + ID2, secret);
  env.LOADERS_KV._store.set('sh_meta_' + ID2, JSON.stringify({ name: 'f', user: 'u', keyless: true }));
  const r = await get(env, '/sh/' + ID2, SPOOFED_UA);
  if (r.body === secret) throw new Error('exact artifact bytes returned to an unauthenticated client');
});

gate('G03', 'Browser key page embeds no artifact bytes', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  const cipher = env.LOADERS_KV._store.get('sh_loader_' + ID);
  const r = await get(env, '/sh/' + ID, BROWSER_UA);
  if (r.body.includes(cipher)) throw new Error('artifact cipher is embedded in the HTML page');
});

gate('G10', 'private script + unauthorized request returns 403', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID, { meta: { visibility: 'private' } });
  const r = await get(env, '/sh/' + ID, SPOOFED_UA);
  if (r.status !== 403) throw new Error(`expected 403 for a private script, got HTTP ${r.status}`);
});

// ===========================================================================
// EXPIRY / REVOCATION / REPLAY  (enforced at DELIVERY, not just at /auth)
// ===========================================================================

gate('G05', 'Expired license gets no split key at /sh/k', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({
    LIC: { key: 'LIC', hwid: 'HW', expiresAt: Date.now() - 60000 }
  }));
  const tok = await forgeToken('LIC', 'HW', 1700000000);
  const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
  if (r.status === 200) throw new Error('expired license still received the split key at delivery time');
});

gate('G06', 'Revoked (banned) license gets no split key at /sh/k', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({
    LIC: { key: 'LIC', hwid: 'HW', banned: true, banReason: 'banned', expiresAt: 0 }
  }));
  const tok = await forgeToken('LIC', 'HW', 1700000000);
  const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
  if (r.status === 200) throw new Error('banned license still received the split key at delivery time');
});

gate('G07', 'An auth token cannot be replayed', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({ LIC: { key: 'LIC', hwid: 'HW', expiresAt: 0 } }));
  const tok = await forgeToken('LIC', 'HW', 1700000000);
  const url = `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`;
  const first = await get(env, url, SPOOFED_UA);
  const second = await get(env, url, SPOOFED_UA);
  if (first.status === 200 && second.status === 200) throw new Error('the same token was accepted twice — it is not one-time');
});

gate('G08', 'Auth token expires server-side (not just an advisory timestamp)', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({ LIC: { key: 'LIC', hwid: 'HW', expiresAt: 0 } }));
  // The worker advertises AUTH_TOKEN_TTL_MS = 90s. Wait past it and present
  // the same token again: a server-enforced TTL must now refuse.
  const tok = await forgeToken('LIC', 'HW', 1700000000);
  const url = `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`;
  if ((await get(env, url, SPOOFED_UA)).status !== 200) return; // already closed
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 91 * 1000; // past the advertised 90s TTL
    const later = await get(env, url, SPOOFED_UA);
    if (later.status === 200) throw new Error('token still valid 91s after issue — TTL is advisory to the client, not enforced here');
  } finally { Date.now = realNow; }
});

gate('G09', 'A self-forged token (from a valid key) is rejected', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({ LIC: { key: 'LIC', hwid: 'HW', expiresAt: 0 } }));
  const tok = await forgeToken('LIC', 'HW', 1700000000);
  const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=LIC&h=HW`, SPOOFED_UA);
  if (r.status === 200) throw new Error('server accepted a token the client computed offline; the token is not proof of anything');
});

// ===========================================================================
// CREDENTIALS
// ===========================================================================

gate('G04', 'The hard-coded default access code is rejected', 'pass', async () => {
  // No owner code is configured, so a legacy deployment would bootstrap one.
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
// RATE LIMITING
// ===========================================================================

gate('G14', 'License auth is rate limited', 'xfail', async () => {
  const env = makeEnv();
  seedScript(env, ID);
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({}));
  let allowed = 0;
  for (let i = 0; i < 40; i++) {
    const r = await get(env, `/sh/auth/${ID}?k=guess${i}&h=HW&t=1`, SPOOFED_UA, { 'CF-Connecting-IP': '198.51.100.4' });
    if (r.status !== 429) allowed++;
  }
  if (allowed > 20) throw new Error(`${allowed}/40 unauthenticated key guesses were served — no effective rate limit`);
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
      return new Response('{}', { status: 204 });
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
// DEFERRED — need the D1 atomic layer (Phase 2/3) before these are testable
// ===========================================================================
gate('G16', 'Rotating a build invalidates the previous build\'s credential', 'deferred', async () => {
  throw new Error('deferred: requires build_versions in D1 (Phase 2) + rotation (Phase 4)');
});
gate('G17', 'A nonce is consumed exactly once', 'deferred', async () => {
  throw new Error('deferred: requires the nonces table (Phase 2)');
});
gate('G18', 'Concurrent delivery with one valid nonce yields exactly one artifact', 'deferred', async () => {
  throw new Error('deferred: requires the atomic validate-and-consume path (Phase 3)');
});

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
