// tools/bench/restore-users.cjs  --  rebuild the KV user table.
//
// Wrangler is invoked through node_modules/wrangler/bin/wrangler.js with a
// plain argv. It is NOT invoked through npx with shell:true: that combination
// re-quotes the arguments, and `kv key put ... --path=C:\...file.json` was
// written to KV as the literal STRING "path=C:\...file.json", replacing the
// whole user table with 61 characters of junk.
//
// Usage: node tools/bench/restore-users.cjs <d1-dump.json> [legacy-users.json]
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os'), path = require('path');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const KEY = 'sh_users_db';
const WR = path.join(__dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function wr(args) {
  return execFileSync(process.execPath, [WR, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

const dumpFile = process.argv[2];
if (!dumpFile) { console.error('usage: node restore-users.cjs <d1-dump.json> [legacy-users.json]'); process.exit(1); }

// NOT `^pbkdf2\$\d+\$` alone: syncUsersToD1 writes the PLACEHOLDER
// `pbkdf2$0$legacy$unmigrated` for a record whose KV password was still legacy
// btoa, and that matches the pattern while being a credential that can never
// verify. Accepting those silently gave 19 accounts a dead password and, worse,
// made the "already PBKDF2, keep it" check below skip the real passwords that
// the browser copy was carrying.
const isReal = (h) => /^pbkdf2\$\d+\$/.test(String(h || '')) && !/unmigrated/.test(String(h || ''));
const rows = readJson(dumpFile)[0].results;
const usable = rows.filter(r => isReal(r.password_hash));
console.log('D1 rows ' + rows.length + ', usable PBKDF2 hashes ' + usable.length);

const DEFAULTS = {
  plan: 'Basic', description: '', profileImage: '', bannerImage: '', customBackground: '', theme: 'default',
  stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } },
};
const map = {};
for (const r of usable) {
  const email = String(r.email || '').trim();
  if (!email) continue;
  map[email] = Object.assign({ id: email, email }, DEFAULTS, {
    username: String(r.username || email).slice(0, 40),
    password: r.password_hash,
    createdAt: new Date(Number(r.created_at || Date.now())).toISOString(),
    isAdmin: r.role === 'owner', isScripter: r.role === 'owner', disabled: !!Number(r.disabled),
  });
}
console.log('rebuilt from D1: ' + Object.keys(map).length);

const legacyFile = process.argv[3];
if (legacyFile && fs.existsSync(legacyFile)) {
  const legacy = readJson(legacyFile);
  let added = 0, kept = 0;
  for (const email of Object.keys(legacy)) {
    const rec = legacy[email];
    if (!rec || !rec.password) continue;
    // A PBKDF2 record is strictly better than a legacy btoa one. Never regress.
    if (map[email] && /^pbkdf2\$\d+\$/.test(String(map[email].password || ''))) { kept++; continue; }
    map[email] = Object.assign({ id: email, email }, DEFAULTS, rec, { email });
    added++;
  }
  console.log('legacy accounts recovered: ' + added + ' (kept ' + kept + ' existing PBKDF2 records)');
}
console.log('TOTAL: ' + Object.keys(map).length);

const blob = path.join(os.tmpdir(), 'users_restore.json');
fs.writeFileSync(blob, JSON.stringify(map), 'utf8');
console.log('writing to KV (' + fs.statSync(blob).size + ' bytes)...');
wr(['kv', 'key', 'put', KEY, '--namespace-id', NS, '--path', blob]);

// Read it back and prove the value is the map, not an argument string.
const back = wr(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--text']);
let ok = false, n = 0;
try { const parsed = JSON.parse(back.trim()); n = Object.keys(parsed).length; ok = n === Object.keys(map).length; } catch (e) {}
console.log('verified after write: ' + n + ' accounts  ' + (ok ? 'OK' : 'MISMATCH'));
if (!ok) { console.log('first 120 chars read back: ' + back.trim().slice(0, 120)); process.exit(1); }
console.log('owner present: ' + (map['dubovikstanislav51@gmail.com'] ? 'yes' : 'NO'));
