// tools/bench/restore-owner-record.cjs
//
// ONE-OFF REPAIR. Restores the owner account record.
//
// WHAT HAPPENED
//
// While diagnosing a login failure, a duplicate-signup probe was sent with the
// owner's email. It returned 200 - meaning the worker could not see the
// existing record - and the signup handler then wrote a NEW record over the
// old one. The owner account was replaced by a probe account: username
// "Scripter"/plan "Custom"/isAdmin/isScripter all gone, replaced by
// username "dupecheck97"/plan "Basic".
//
// THE INTACT ORIGINAL SURVIVED in the legacy sh_users_db blob, which is exactly
// why that blob was kept as a read fallback rather than deleted: it was the
// only surviving copy of this record.
//
// The restore is driven from that blob, not from anything typed by hand, and it
// refuses to run if the blob no longer holds the owner. Nothing is invented -
// password, plan and flags are copied verbatim.
//
// Idempotent: running it twice writes the same record twice.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os'), path = require('path');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const OWNER = 'dubovikstanislav51@gmail.com';
const WR = path.join(__dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function wr(a) {
    return execFileSync(process.execPath, [WR, ...a], { encoding: 'utf8', maxBuffer: 1e9 });
}

console.log('[1] reading the legacy blob for the intact owner record');
const blob = JSON.parse(wr(['kv', 'key', 'get', 'sh_users_db', '--namespace-id', NS, '--text']));
const good = blob[OWNER];
if (!good) {
    console.error('    the blob no longer holds the owner record - ABORTING.');
    console.error('    Nothing has been written. Do not hand-edit a replacement.');
    process.exit(1);
}
console.log('    found: username=' + good.username + ' plan=' + good.plan +
    ' isAdmin=' + good.isAdmin + ' isScripter=' + good.isScripter);

console.log('\n[2] current state of the per-email key');
let cur = null;
try { cur = JSON.parse(wr(['kv', 'key', 'get', 'sh_user_' + OWNER, '--namespace-id', NS, '--text'])); } catch (e) { cur = null; }
if (cur) console.log('    username=' + cur.username + ' plan=' + cur.plan + '   <-- the overwritten probe record');
else console.log('    absent');

console.log('\n[3] restoring (password, plan and flags copied verbatim from the blob)');
const fixed = Object.assign({}, good, { email: OWNER });
const recFile = path.join(os.tmpdir(), 'owner-record.json');
fs.writeFileSync(recFile, JSON.stringify(fixed), 'utf8');
wr(['kv', 'key', 'put', 'sh_user_' + OWNER, '--namespace-id', NS, '--path', recFile]);

// The username index points at the email; if a probe stole the username the
// index entry has to be corrected too, or username login resolves elsewhere.
const unFile = path.join(os.tmpdir(), 'owner-uname.json');
fs.writeFileSync(unFile, OWNER, 'utf8');
wr(['kv', 'key', 'put', 'sh_uname_' + String(good.username || '').toLowerCase(), '--namespace-id', NS, '--path', unFile]);
console.log('    wrote sh_user_' + OWNER);
console.log('    wrote sh_uname_' + String(good.username || '').toLowerCase());

console.log('\n[4] verifying');
const back = JSON.parse(wr(['kv', 'key', 'get', 'sh_user_' + OWNER, '--namespace-id', NS, '--text']));
const same = back.username === good.username &&
    back.plan === good.plan &&
    String(back.password) === String(good.password);
console.log('    username : ' + back.username);
console.log('    plan     : ' + back.plan);
console.log('    password : ' + String(back.password).slice(0, 12) + '... (unchanged: ' +
    (String(back.password) === String(good.password)) + ')');
console.log('    isAdmin  : ' + back.isAdmin + '  isScripter: ' + back.isScripter);
console.log('\n' + (same ? 'OWNER RECORD RESTORED' : 'MISMATCH - investigate before deploying'));
process.exit(same ? 0 : 1);