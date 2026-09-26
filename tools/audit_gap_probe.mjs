// READ-ONLY AUDIT PROBE. Imports the worker exactly as the existing tests do
// (mocked KV) and asks one question: can an UNAUTHENTICATED client that is
// not a browser retrieve a protected artifact by spoofing User-Agent?
// Nothing in the repository or in production is modified.
import { loadWorker } from './worker_target.mjs';
const worker = await loadWorker();

function makeKV() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); },
    _store: store
  };
}
const KV = makeKV();
const env = { LOADERS_KV: KV, SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://audit.workers.dev' };

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
const SPOOFED = 'Roblox/570 Delta Executor';   // attacker-chosen, costs nothing
const ID = 'ScripterHub1234567890';

async function get(path, ua) {
  const r = await worker.fetch(new Request('https://audit.workers.dev' + path, {
    headers: { 'User-Agent': ua }
  }), env, { waitUntil: () => {} });
  return { status: r.status, type: r.headers.get('Content-Type'), body: (await r.text()) };
}

function line(t) { console.log('\n=== ' + t + ' ==='); }

// Seed artifacts directly into the mock KV, exactly as a real upload would
// leave them. We are testing DELIVERY authorisation, not upload.
// NOTE: artifacts are base64 on the wire, so the seeds must be valid base64
// or the worker fails while decoding and the probe measures nothing.
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const PLAIN_KEYED = 'REAL KEYED SCRIPT SOURCE';
const PLAIN_KEYLESS = 'REAL KEYLESS SCRIPT SOURCE';
const SECRET_KEYLESS = '-- OBFUSCATED FREE SCRIPT PAYLOAD (keyless)';
const SECRET_KEYED = b64(PLAIN_KEYED);
KV._store.set('sh_loader_' + ID, SECRET_KEYED);
KV._store.set('sh_meta_' + ID, JSON.stringify({ name: 'p', user: 'u', keyless: false, authRequired: true }));
KV._store.set('sh_skey_' + ID, JSON.stringify({ paddedKey: [1, 2, 3], t0: 1700000000, chk: 424242 }));
KV._store.set('sh_licenses', JSON.stringify({
  LIC123: { key: 'LIC123', hwid: 'HW-AAA', expiresAt: 0, executions: 0 }
}));

line('Q1  KEYED script, plain browser (curl default / real Chrome)');
let r = await get('/sh/' + ID, BROWSER);
console.log('  status      :', r.status);
console.log('  content-type:', r.type);
console.log('  embeds artifact cipher?:', r.body.includes(SECRET_KEYED) ? 'YES - cipher is in the HTML' : 'no');
console.log('  body head   :', r.body.replace(/\s+/g, ' ').slice(0, 90));

line('Q2  KEYED script, SPOOFED executor User-Agent, NO credentials at all');
r = await get('/sh/' + ID, SPOOFED);
console.log('  status      :', r.status);
console.log('  content-type:', r.type);
console.log('  >>> UNAUTHENTICATED SCRAPER RECEIVED:', r.status === 200 ? 'ARTIFACT (HTTP 200)' : 'nothing');
console.log('  embeds artifact cipher?:', r.body.includes(SECRET_KEYED) ? 'YES - cipher is in the body' : 'no');
console.log('  body head   :', r.body.replace(/\s+/g, ' ').slice(0, 200));

line('Q2b  KEYED script, spoofed UA but /sh/k NOT requested - is the split key needed to READ it?');
console.log('  (the split key lives in the obfuscated file and is fetched from /sh/k at runtime)');

line('Q3  KEYLESS script, spoofed executor UA (the "free" tier)');
const ID2 = 'ScripterHub0987654321';
KV._store.set('sh_loader_' + ID2, SECRET_KEYLESS);
KV._store.set('sh_meta_' + ID2, JSON.stringify({ name: 'f', user: 'u', keyless: true }));
r = await get('/sh/' + ID2, SPOOFED);
console.log('  status:', r.status, '| leaks payload?:', r.body === SECRET_KEYLESS ? 'YES - EXACT ARTIFACT' : 'no');
console.log('  body  :', r.body.slice(0, 110));

line('Q4  AUTH-REQUIRED: is /sh/k gated by a VALID, UNC_EXPIRED, UNREVOKED token?');
// no token at all
r = await get('/sh/k/' + ID + '?t=1700000000', SPOOFED);
console.log('  no token        -> status', r.status, r.status === 405 ? '(blocked)' : '(SERVED!)');
// attacker forges the token themselves: it is HMAC(key=their own known key),
// so anyone holding a valid key can compute it offline, forever.
const enc = new TextEncoder();
const digest = await crypto.subtle.digest('SHA-256', enc.encode('SHAUTH::LIC123'));
const sk = await crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sig = await crypto.subtle.sign('HMAC', sk, enc.encode('LIC123|HW-AAA|1700000000'));
const forged = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
r = await get('/sh/k/' + ID + '?t=1700000000&a=' + forged + '&k=LIC123&h=HW-AAA', SPOOFED);
console.log('  self-forged tok -> status', r.status, r.status === 200 ? '(SERVED - key delivered)' : '(blocked)');
console.log('  body:', r.body.slice(0, 80));
console.log('  NOTE: no timestamp inside the token -> it cannot expire.');

line('Q5  Is the token ONE-TIME / replay-protected? (same forged token again)');
const r2 = await get('/sh/k/' + ID + '?t=1700000000&a=' + forged + '&k=LIC123&h=HW-AAA', SPOOFED);
console.log('  2nd use        -> status', r2.status, r2.status === 200 ? '(ACCEPTED AGAIN - replayable)' : '(single-use)');

line('Q6  Is REVOCATION enforced at delivery? ban the key, then reuse the token');
KV._store.set('sh_licenses', JSON.stringify({
  LIC123: { key: 'LIC123', hwid: 'HW-AAA', banned: true, banReason: 'banned by owner', expiresAt: 0 }
}));
const r3 = await get('/sh/k/' + ID + '?t=1700000000&a=' + forged + '&k=LIC123&h=HW-AAA', SPOOFED);
console.log('  after ban      -> status', r3.status, r3.status === 200 ? '(STILL SERVED - revocation NOT enforced here)' : '(blocked)');
const r4 = await get('/sh/auth/' + ID + '?k=LIC123&h=HW-AAA&t=1700000000', SPOOFED);
console.log('  /sh/auth says  :', r4.body.trim());
