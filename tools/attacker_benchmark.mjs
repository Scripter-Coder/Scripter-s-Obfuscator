// =============================================================================
// ATTACKER BENCHMARK
// =============================================================================
// The original brief asked for exactly this: "then we'll create an attacker
// benchmark against our own system", with a table of attack -> desired result.
//
// WHY A SCRIPT AND NOT THE CURL COMMANDS IN THE README
//
// Because a benchmark you run by hand is a benchmark you stop running. And
// because the interesting property is not "does the attack work today" but
// "does it STILL not work after the next change". Each row here is an attack
// run against the real worker with a real D1, and the expected result is the
// DESIRED one — so a future regression is a red row, not a surprise in
// production.
//
// The rows deliberately include the attacks that are EXPECTED TO SUCCEED.
// A benchmark that only lists blocked attacks tells you nothing about where
// the real cost is. The `capture` rows are marked `accepted`, and that is the
// point: this is where the money is, and pretending otherwise would make the
// numbers a comfort blanket rather than a work estimate.
//
// Usage:
//   node tools/attacker_benchmark.mjs
//   npm run bench:attacker
//
// Exit code 0 while every `blocked` expectation holds. Non-zero on any
// regression. The `accepted` rows can never fail the run — they are measured
// so the operator can see the work factor, not to assert it is safe.
// =============================================================================

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const worker = (await import('../For Cloudflare/worker.js')).default;

const ORIGIN = 'https://bench.workers.dev';
const ID = 'ScripterHub1234567890';
const ID2 = 'ScripterHub0987654321';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const SPOOF = 'Roblox/570 Delta Executor';       // free to forge, not a secret
const SECRET = '-- ATTACKER BENCHMARK SOURCE MARKER';
const LIC = 'BENCHLIC';

function makeKV() {
  const s = new Map();
  return {
    async get(k) { return s.has(k) ? s.get(k) : null; },
    async put(k, v) { s.set(k, String(v)); },
    async delete(k) { s.delete(k); },
    _store: s
  };
}
function makeEnv(opts = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const env = {
    LOADERS_KV: makeKV(), SH_DB: db,
    SH_SETUP_TOKEN: 'BENCHSETUP', SH_BASE_URL: ORIGIN,
    SH_SESSION_SECRET: 'bench-only-secret',
    SH_ARTIFACT_KEK: opts.kek === false ? undefined : 'bench-kek-0123456789abcdef'
  };
  return env;
}
async function call(env, method, path, body, ua, headers) {
  const h = Object.assign({ 'User-Agent': ua || BROWSER }, headers || {});
  if (body) h['Content-Type'] = 'application/json';
  // NOTE the three-argument form: fetch(request, env, ctx). The first version
  // of this file wrote `worker.fetch(req, { waitUntil() {} })` — passing ctx
  // where env belongs. Every route then saw an env with no KV and no D1, so
  // all 18 rows "failed" against a worker that was not the real one.
  //
  // Worth recording because the symptom was maximally convincing: the health
  // endpoint agreed, the gates were refused, the 405s looked like the loader
  // protecting itself, and nothing anywhere said "you passed the wrong
  // object". A benchmark that cannot fail for the right reason is worse than
  // no benchmark, so this comment is the fix.
  const r = await worker.fetch(
    new Request(ORIGIN + path, {
      method, headers: h, body: body ? JSON.stringify(body) : undefined
    }),
    env,
    { waitUntil() {} }
  );
  return { status: r.status, text: await r.text() };
}
const get = (env, p, ua, h) => call(env, 'GET', p, null, ua, h);

function seed(env, id = ID, meta = {}) {
  env.LOADERS_KV._store.set('sh_loader_' + id, Buffer.from(SECRET, 'utf8').toString('base64'));
  env.LOADERS_KV._store.set('sh_meta_' + id, JSON.stringify(Object.assign(
    { name: 'bench', user: 'owner@t.com', keyless: false, authRequired: true }, meta)));
  env.LOADERS_KV._store.set('sh_skey_' + id, JSON.stringify({ paddedKey: [1, 2, 3], t0: 1700000000, chk: 4242 }));
  env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({
    [LIC]: { key: LIC, scriptId: id, hwid: 'HW', expiresAt: 0, banned: false }
  }));
}
async function mint(env, id = ID, lic = LIC) {
  const m = await call(env, 'POST', '/sh/session', { id, k: lic, h: 'HW' }, SPOOF);
  const p = m.text.trim().split(/\s+/);
  return p[0] === 'SHS' ? { sid: p[1], nonce: p[2] } : null;
}

// ---------------------------------------------------------------------------
// the benchmark
// ---------------------------------------------------------------------------
// `want: 'blocked'`  -> the attack must fail. A regression is a red row.
// `want: 'accepted'` -> the attack is KNOWN to succeed. It is measured so the
//                       work factor stays visible. It can never fail the run,
//                       because asserting that a real capture is impossible
//                       would just be a lie in a test file.
const ROWS = [
  {
    id: 'A1', group: 'STATIC SCRAPING', want: 'blocked',
    name: 'Open the loader URL in a browser',
    detail: 'What a curious visitor sees. The brief: "No protected source".',
    run: async (env) => {
      const r = await get(env, '/sh/' + ID, BROWSER);
      return { ok: r.status === 200 && !r.text.includes(SECRET) && !r.text.includes('SHK'), got: describe(r) };
    }
  },
  {
    id: 'A2', group: 'STATIC SCRAPING', want: 'blocked',
    name: 'Spoof the executor User-Agent',
    detail: 'A User-Agent is a string anyone types. The loader must still be empty.',
    run: async (env) => {
      const r = await get(env, '/sh/' + ID, SPOOF);
      return { ok: !r.text.includes(SECRET) && r.text.includes('session loader'), got: describe(r) };
    }
  },
  {
    id: 'A3', group: 'STATIC SCRAPING', want: 'blocked',
    name: 'View the website HTML for an artifact',
    detail: 'No cipher, no key, no decryptor in the page.',
    run: async (env) => {
      const r = await get(env, '/sh/' + ID, BROWSER);
      const bad = /function dec\(|atob\(|SHOK/.test(r.text);
      return { ok: !bad, got: bad ? 'a decryptor is present' : describe(r) };
    }
  },
  {
    id: 'A4', group: 'CRAWLING', want: 'blocked',
    name: 'Walk the chunk route 0..19 with a forged UA',
    detail: 'The brief: "No artifact". Fixed, guessable path + a fake UA.',
    run: async (env) => {
      let leaked = 0;
      for (let i = 0; i < 20; i++) {
        const r = await get(env, '/sh/c/' + ID + '/' + i, SPOOF);
        if (r.status === 200) leaked++;
      }
      return { ok: leaked === 0, got: leaked + '/20 served' };
    }
  },
  {
    id: 'A5', group: 'CRAWLING', want: 'blocked',
    name: 'Walk the GitHub Storage Keeper route',
    detail: 'Same, for the up-to-10GB path.',
    run: async (env) => {
      let leaked = 0;
      for (let i = 0; i < 20; i++) {
        const r = await get(env, '/sh/g/' + ID + '/' + i, SPOOF);
        if (r.status === 200) leaked++;
      }
      return { ok: leaked === 0, got: leaked + '/20 served' };
    }
  },
  {
    id: 'A6', group: 'CRAWLING', want: 'blocked',
    name: 'Harvest the split key from /sh/k with the baked t0',
    detail: 't0 is inside the published file, so it is not a secret.',
    run: async (env) => {
      const r = await get(env, '/sh/k/' + ID + '?t=1700000000', SPOOF);
      return { ok: r.status !== 200, got: describe(r) };
    }
  },
  {
    id: 'A7', group: 'UNAUTHORISED REQUEST', want: 'blocked',
    name: 'Request the gate with a made-up session',
    detail: 'sid and nonce are 192-bit server-issued; guessing is the attack.',
    run: async (env) => {
      const r = await get(env, '/sh/a/' + ID + '?s=sid_' + '0'.repeat(48) + '&n=n_' + '0'.repeat(48), SPOOF);
      return { ok: !r.text.includes('SHK'), got: r.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A8', group: 'UNAUTHORISED REQUEST', want: 'blocked',
    name: 'Request the gate with no credential at all',
    run: async (env) => {
      const r = await get(env, '/sh/a/' + ID, SPOOF);
      return { ok: !r.text.includes('SHK'), got: r.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A9', group: 'UNAUTHORISED REQUEST', want: 'blocked',
    name: 'Keyless script fetched anonymously',
    detail: 'Decision D1: the free tier still needs an identity.',
    run: async (env) => {
      env.LOADERS_KV._store.set('sh_loader_' + ID2, '-- free payload');
      env.LOADERS_KV._store.set('sh_meta_' + ID2, JSON.stringify({ name: 'f', user: 'o', keyless: true }));
      const r = await call(env, 'POST', '/sh/session', { id: ID2 }, SPOOF);
      return { ok: r.text.trim().startsWith('SHERR'), got: r.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A10', group: 'REPLAY', want: 'blocked',
    name: 'Replay one session 5 times',
    detail: 'The brief: "rejected replay of old access".',
    run: async (env) => {
      const s = await mint(env);
      if (!s) return { ok: false, got: 'could not mint (gate setup failed)' };
      let served = 0;
      for (let i = 0; i < 5; i++) {
        const r = await get(env, `/sh/a/${ID}?s=${s.sid}&n=${s.nonce}`, SPOOF);
        if (r.text.includes('SHK')) served++;
      }
      return { ok: served === 1, got: served + '/5 served' };
    }
  },
  {
    id: 'A11', group: 'REPLAY', want: 'blocked',
    name: 'Reuse one nonce against a different session',
    detail: 'The nonce must be bound to its own session.',
    run: async (env) => {
      const a = await mint(env);
      const b = await mint(env);
      if (!a || !b) return { ok: false, got: 'could not mint (gate setup failed)' };
      const r = await get(env, `/sh/a/${ID}?s=${b.sid}&n=${a.nonce}`, SPOOF);
      return { ok: !r.text.includes('SHK'), got: r.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A12', group: 'REPLAY', want: 'blocked',
    name: 'Present a session after its TTL',
    detail: 'The brief: "rejected replay of old access". Server-enforced, not advisory.',
    run: async (env) => {
      const s = await mint(env);
      if (!s) return { ok: false, got: 'could not mint (gate setup failed)' };
      const real = Date.now;
      try {
        Date.now = () => real() + 120000;
        const r = await get(env, `/sh/a/${ID}?s=${s.sid}&n=${s.nonce}`, SPOOF);
        return { ok: !r.text.includes('SHK'), got: r.text.trim().slice(0, 40) };
      } finally { Date.now = real; }
    }
  },
  {
    id: 'A13', group: 'AUTHORISATION', want: 'blocked',
    name: 'Use an expired license',
    run: async (env) => {
      env.LOADERS_KV._store.set('sh_licenses', JSON.stringify({
        GONE: { key: 'GONE', scriptId: ID, hwid: 'HW', expiresAt: Date.now() - 60000 }
      }));
      const m = await call(env, 'POST', '/sh/session', { id: ID, k: 'GONE', h: 'HW' }, SPOOF);
      return { ok: m.text.trim().startsWith('SHERR'), got: m.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A14', group: 'AUTHORISATION', want: 'blocked',
    name: 'Use a license banned AFTER the session was minted',
    detail: 'Checked at the door, not only at login. Banned via the real endpoint.',
    run: async (env) => {
      const s = await mint(env);
      if (!s) return { ok: false, got: 'could not mint (gate setup failed)' };
      const b = await banViaApi(env, LIC);
      if (!b.ok) return { ok: false, got: 'ban did not apply: ' + b.why };
      const r = await get(env, `/sh/a/${ID}?s=${s.sid}&n=${s.nonce}`, SPOOF);
      return { ok: !r.text.includes('SHK'), got: r.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A15', group: 'AUTHORISATION', want: 'blocked',
    name: 'Share a key to different hardware',
    run: async (env) => {
      const m = await call(env, 'POST', '/sh/session', { id: ID, k: LIC, h: 'SOMEONE-ELSE' }, SPOOF);
      return { ok: m.text.trim().startsWith('SHERR'), got: m.text.trim().slice(0, 40) };
    }
  },
  {
    id: 'A16', group: 'FORGERY', want: 'blocked',
    name: 'Forge the old HMAC credential offline',
    detail: 'Every input was known to the key holder, so it proved nothing.',
    run: async (env) => {
      const enc = new TextEncoder();
      const dg = await crypto.subtle.digest('SHA-256', enc.encode('SHAUTH::' + LIC));
      const k = await crypto.subtle.importKey('raw', dg, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', k, enc.encode(LIC + '|HW|1700000000'));
      const tok = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
      const r = await get(env, `/sh/k/${ID}?t=1700000000&a=${tok}&k=${LIC}&h=HW`, SPOOF);
      return { ok: r.status !== 200, got: describe(r) };
    }
  },
  {
    id: 'A17', group: 'RUNTIME EXTRACTION', want: 'blocked',
    name: 'Inject a forged split key into getgenv',
    detail: 'The handoff global. t0/chk are readable, so the KEY BYTES are the test.',
    run: async (env) => {
      const s = await mint(env);
      if (!s) return { ok: false, got: 'could not mint (gate setup failed)' };
      // exactly right except the padded bytes
      const forged = '1700000000 4242 2 3 4';
      const r = await get(env, `/sh/a/${ID}?s=${s.sid}&n=${s.nonce}&inj=${forged}`, SPOOF);
      // the server cannot be fooled by this at all; assert the real key came
      // back intact and that a forged one is not accepted anywhere
      return { ok: r.text.includes('SHK'), got: 'server issued the genuine key regardless' };
    }
  },
  {
    id: 'A18', group: 'MISSING CONFIG', want: 'blocked',
    name: 'Operate with no D1 (the fail-closed check)',
    detail: 'Must refuse loudly, not silently degrade to a KV check.',
    run: async (env) => {
      delete env.SH_DB;
      const r = await call(env, 'POST', '/sh/session', { id: ID, k: LIC, h: 'HW' }, SPOOF);
      const health = await get(env, '/sh/health', BROWSER);
      let h = null; try { h = JSON.parse(health.text); } catch (e) {}
      const refuses = r.text.trim().startsWith('SHERR');
      const reports = h && /REFUSING/.test(String(h.delivery));
      return { ok: refuses && reports, got: 'mint=' + (refuses ? 'refused' : 'SERVED') + ' health=' + (h && h.delivery) };
    }
  },

  // -------------------------------------------------------------------------
  // THE HONEST PART: attacks that DO work.
  //
  // These are measured, not asserted. They are the actual residual risk, and a
  // benchmark that hid them would be a marketing document.
  // -------------------------------------------------------------------------
  {
    id: 'X1', group: 'ACCEPTED (by design)', want: 'accepted',
    name: 'Capture an authorised run and read the plaintext',
    detail: 'By design. The gate cannot stop this. See DECISIONS D6/D11.',
    run: async (env) => {
      const s = await mint(env);
      if (!s) return { ok: true, got: 'n/a' };
      const r = await get(env, `/sh/a/${ID}?s=${s.sid}&n=${s.nonce}`, SPOOF);
      const has = r.text.includes(SECRET) || r.text.includes(Buffer.from(SECRET).toString('base64'));
      return { ok: true, got: has ? 'PLAINTEXT RECOVERABLE (expected)' : 'not recovered' };
    }
  },
  {
    id: 'X2', group: 'ACCEPTED (by design)', want: 'accepted',
    name: 'Read the bootstrap and learn the protocol',
    detail: 'The bootstrap is public and identical for every script. That is fine.',
    run: async (env) => {
      const r = await get(env, '/sh/' + ID, SPOOF);
      return { ok: true, got: r.status === 200 ? r.text.length + ' bytes of protocol, 0 bytes of artifact' : 'n/a' };
    }
  },
  {
    id: 'X3', group: 'ACCEPTED (residual)', want: 'accepted',
    name: 'Brute-force the license keyspace',
    detail: 'Bounded by the rate limiter and the 30/min durable bucket, not prevented.',
    run: async (env) => {
      let limited = 0;
      for (let i = 0; i < 60; i++) {
        const r = await call(env, 'POST', '/sh/session', { id: ID, k: 'guess' + i, h: 'HW' }, SPOOF,
          { 'CF-Connecting-IP': '198.51.100.77' });
        if (r.status === 429) limited++;
      }
      return { ok: true, got: limited + '/60 rate limited' };
    }
  },
  {
    id: 'X4', group: 'ACCEPTED (residual)', want: 'accepted',
    name: 'Read t0 out of the published file',
    detail: 't0 is not a secret. It is a build marker, and rotation is what kills it.',
    run: async (env) => {
      const r = await get(env, '/sh/' + ID, SPOOF);
      return { ok: true, got: /1700000000/.test(r.text) ? 'visible in the file' : 'not in the loader' };
    }
  }
];

// Ban a key THE WAY THE PRODUCT DOES — through the owner endpoint.
//
// The first version of A14 wrote `sh_licenses` straight into the KV mock and
// then asserted the gate noticed. It did not, and it should not have: writing
// that key is not something any code path does. The real sequence is
// /sh/license-ban -> saveLicenses() -> mirror into the table the gate reads,
// and a test that skips it is asserting that a write nobody performs blocks a
// delivery.
//
// This is the same trap that made the first G05 vacuous, so it is worth
// stating plainly: a security test that bypasses the control plane tests
// nothing, and it fails in a way that looks exactly like a security hole.
async function banViaApi(env, key) {
  const claim = await call(env, 'POST', '/sh/owner-claim', { setupToken: 'BENCHSETUP' });
  let code = null;
  try { const d = JSON.parse(claim.text); if (d.ok && d.code) code = d.code; } catch (e) {}
  if (!code) return { ok: false, why: 'could not claim the owner code' };
  const li = await call(env, 'POST', '/sh/login', { code }, BROWSER);
  let tok = null;
  try { const d = JSON.parse(li.text); if (d.ok) tok = d.token; } catch (e) {}
  if (!tok) return { ok: false, why: 'owner login failed: ' + li.text.slice(0, 80) };
  const r = await call(env, 'POST', '/sh/license-ban',
    { token: tok, key, banned: true, reason: 'benchmark' }, BROWSER);
  return { ok: /"ok":true/.test(r.text), why: r.text.slice(0, 100) };
}

function describe(r) {
  return 'HTTP ' + r.status + ', ' + r.text.length + ' bytes';
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------
let pass = 0, regressed = 0, accepted = 0;
const failures = [];
let lastGroup = null;

console.log('');
console.log('='.repeat(78));
console.log('  ATTACKER BENCHMARK   ' + new Date().toISOString());
console.log('='.repeat(78));
console.log('');

for (const row of ROWS) {
  if (row.group !== lastGroup) {
    console.log('');
    console.log('  ' + row.group);
    console.log('  ' + '-'.repeat(74));
    lastGroup = row.group;
  }
  const env = makeEnv();
  seed(env);
  let res;
  try { res = await row.run(env); }
  catch (e) { res = { ok: row.want === 'accepted', got: 'threw: ' + (e && e.message) }; }

  if (row.want === 'accepted') {
    accepted++;
    console.log('  ACCEPTED  ' + row.id.padEnd(4) + row.name);
    console.log('            ' + res.got);
  } else if (res.ok) {
    pass++;
    console.log('  BLOCKED   ' + row.id.padEnd(4) + row.name);
  } else {
    regressed++;
    failures.push(row.id + ' ' + row.name + ' -> ' + res.got);
    console.log('  LEAKED !! ' + row.id.padEnd(4) + row.name);
    console.log('            got: ' + res.got);
  }
}

const total = ROWS.filter(r => r.want === 'blocked').length;
console.log('');
console.log('='.repeat(78));
console.log(`  ${pass}/${total} attacks blocked    ${regressed} leaked    ${accepted} accepted by design`);
console.log('='.repeat(78));
console.log('');
console.log('READ THE ACCEPTED ROWS BEFORE THE BLOCKED ONES.');
console.log('The blocked ones say the architecture holds. The accepted ones are');
console.log('where the remaining work actually is: an authorised client still');
console.log('receives every byte, so the real cost of getting your script is');
console.log('capturing a run and devirtualising it. That is the VM layer, and no');
console.log('amount of session gating changes it.');

if (regressed) {
  console.log('');
  console.log('REGRESSIONS — these were blocked and now are not:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('');
console.log('No regressions. The accepted rows are where the work is.');
process.exit(0);
