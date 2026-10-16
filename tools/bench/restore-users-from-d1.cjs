// tools/bench/restore-users-from-d1.mjs
//
// ONE-OFF RECOVERY. Rebuilds the ScripterHub user map in KV from the D1 `users`
// table, after the user table was lost.
//
// WHY: loadUsersMap was changed to KV.get(key, {cacheTtl: 0}). Cloudflare KV
// enforces a 60s MINIMUM cacheTtl, so that call throws, the surrounding catch
// returns an EMPTY map, and every signup wrote the whole table back containing
// only itself. The last signup won and the KV user map was reduced to a single
// account.
//
// WHAT SURVIVES: D1 still holds every user row. syncUsersToD1 writes the real
// PBKDF2 hash on INSERT and its ON CONFLICT clause deliberately does NOT update
// password_hash, so the hashes were never overwritten by the damage.
//
// WHAT DOES NOT SURVIVE: plan, description, avatar, banner and customBackground
// were only ever in KV and are gone. Restored records default to plan "Basic".
const { execFileSync } = require('child_process');
const fs = require('fs');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const USERS_KEY = 'sh_users_db';
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const os = require('os'), path = require('path');
function wr(args) {
  // shell:true - npx is a .cmd shim on Windows and spawnSync will not resolve one
  // from a bare argv list (EINVAL). The price is that shell strips quoting, so the
  // SQL is passed with --file rather than --command.
  return execFileSync(wrangler, ['wrangler', ...args], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: true,
  });
}
const sqlFile = path.join(os.tmpdir(), 'dump_users.sql');
fs.writeFileSync(sqlFile, 'SELECT email, username, password_hash, role, disabled, created_at FROM users;\n', 'utf8');
const blobPath = path.join(os.tmpdir(), 'restored_users.json');

console.log('[1] reading the D1 users table');
// Use the dump already captured at d1users.json when it exists: wrangler's
// --file path prefixes progress lines and its JSON shape differs from --command,
// and re-running the query adds nothing.
const saved = path.join(os.tmpdir(), 'opencode', 'd1users.json');
const strip = (s) => s.replace(/^﻿/, '').trim();
const dump = fs.existsSync(saved)
  ? JSON.parse(strip(fs.readFileSync(saved, 'utf8')))
  : JSON.parse(wr(['d1', 'execute', 'scripterhub', '--remote', '--json', '--file=' + sqlFile]));
const rows = dump[0].results;
console.log('    rows: ' + rows.length);

const legacy = r => /unmigrated/.test(r.password_hash || '');
const real = rows.filter(r => !legacy(r) && /^pbkdf2\$\d+\$/.test(r.password_hash || ''));
console.log('    with a usable password hash: ' + real.length);

console.log('[2] reading whatever is left in KV');
let current = {};
try {
  const raw = wr(['kv','key','get',USERS_KEY,'--namespace-id='+NS,'--text']).trim();
  if (raw) current = JSON.parse(raw);
} catch (e) { console.log('    KV read failed (treating as empty): ' + e.message); }
console.log('    accounts currently in KV: ' + Object.keys(current).length);

console.log('[3] rebuilding');
const map = {};
for (const r of real) {
  const email = String(r.email || '').trim();
  if (!email) continue;
  const prev = current[email] || {};
  // Keep anything the surviving KV record still has (a fresh signup would).
  map[email] = Object.assign({
    id: email,
    email: email,
    username: String(r.username || email).slice(0, 40),
    password: r.password_hash,
    plan: 'Basic',
    description: '',
    createdAt: new Date(Number(r.created_at || Date.now())).toISOString(),
    profileImage: '', bannerImage: '', theme: 'default',
    stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } },
  }, prev, {
    // ...but never let the survivor's empty password overwrite a real hash.
    password: r.password_hash,
    email: email,
    isAdmin: r.role === 'owner',
    isScripter: r.role === 'owner',
    disabled: !!Number(r.disabled),
  });
}
console.log('    rebuilt: ' + Object.keys(map).length + ' accounts');

const json = JSON.stringify(map);
console.log('    size: ' + json.length + ' bytes');
fs.writeFileSync(blobPath, json, 'utf8');

console.log('[4] writing back to KV');
wr(['kv','key','put',USERS_KEY,'--namespace-id='+NS,'path='+blobPath]);
console.log('    written');

console.log('\nDONE. Verify by signing in as a pre-existing account.');
console.log('NOTE: plan/description/avatar/banner were not in D1 and are reset to defaults.');