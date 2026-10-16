// tools/bench/merge-legacy-users.cjs
//
// SECOND RECOVERY STEP. Merges legacy accounts back into the KV user map.
//
// THE GAP: the first recovery rebuilt the user table from D1. That restored the
// 68 accounts whose password was already PBKDF2. It could NOT restore the other
// 19, including the OWNER account, because their KV record still held a legacy
// btoa(password) and syncUsersToD1 deliberately refuses to mirror btoa into D1
// (it would copy a recoverable credential into a second store). Their D1 row
// therefore holds the placeholder `pbkdf2$0$legacy$unmigrated` and no password
// existed server-side to recover.
//
// WHERE THEY STILL EXIST: the browser that signed them in. main.js stores
// `btoa(password)` per account in localStorage under the key "users"
// (loadUsers/saveUsers, main.js:1258). That copy was never touched by the
// outage.
//
// Usage: open the site on a browser where you are signed in, open the console,
// run this, paste the output:
//
//     copy(localStorage.getItem('users'))
//
// then save it to legacy-users.json and run:
//
//     node tools/bench/merge-legacy-users.cjs legacy-users.json
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os'), path = require('path');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const USERS_KEY = 'sh_users_db';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const wr = (args) => execFileSync(npx, ['wrangler', ...args], {
  encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: true,
});

const input = process.argv[2];
if (!input) {
  console.error('usage: node merge-legacy-users.cjs <legacy-users.json>');
  process.exit(1);
}

const legacy = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''));
console.log('[1] browser copy has ' + Object.keys(legacy).length + ' accounts');

let map = {};
try {
  const raw = wr(['kv', 'key', 'get', USERS_KEY, '--namespace-id=' + NS, '--text']);
  if (raw && raw.indexOf('not found') < 0) map = JSON.parse(raw);
} catch (e) { /* no existing map is fine */ }
console.log('    restored map currently has ' + Object.keys(map).length + ' accounts');

let added = 0, kept = 0;
for (const email of Object.keys(legacy)) {
  const rec = legacy[email];
  if (!rec || !rec.password) continue;
  // A PBKDF2 record already in the map is strictly better. Never overwrite one.
  if (map[email] && /^pbkdf2\$\d+\$/.test(String(map[email].password || ''))) { kept++; continue; }
  map[email] = Object.assign({
    id: email, email: email, plan: 'Basic', description: '',
    createdAt: new Date().toISOString(),
    profileImage: '', bannerImage: '', theme: 'default',
    stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } },
  }, rec, { email: email });
  added++;
}
console.log('    recovered ' + added + ' legacy account(s); kept ' + kept + ' existing PBKDF2 record(s)');

const blob = path.join(os.tmpdir(), 'merged_users.json');
fs.writeFileSync(blob, JSON.stringify(map), 'utf8');
console.log('[2] writing ' + Object.keys(map).length + ' accounts back to KV');
wr(['kv', 'key', 'put', USERS_KEY, '--namespace-id=' + NS, 'path=' + blob]);
console.log('    done. Sign in on the device whose browser you read.');