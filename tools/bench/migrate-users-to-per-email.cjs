// tools/bench/migrate-users-to-per-email.cjs
//
// ONE-TIME migration: sh_users_db (one blob) -> sh_user_<email> (one key each).
//
// Run this ONCE, after deploying the new worker.js and BEFORE telling anyone
// to sign up. It is idempotent - re-running it rewrites the same keys with the
// same values - so a second run cannot lose anything.
//
// WHY IT IS NEEDED
//
// The new worker reads sh_user_* keys and falls back to the legacy blob only
// for accounts it cannot find per-email. That fallback is what makes the
// rollout safe, and it is also what keeps a login costing a full-table read
// while the migration is unfinished. Migrating closes that gap.
//
// It is a WRITE to production. It only ADDS keys; it never deletes the blob,
// and it never touches the password fields - those are copied byte for byte,
// so nobody is locked out by a re-hash.
//
// Usage:
//   node tools/bench/migrate-users-to-per-email.cjs            (dry run, prints only)
//   node tools/bench/migrate-users-to-per-email.cjs --apply    (writes)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os'), path = require('path');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const LEGACY_KEY = 'sh_users_db';
const USER_PREFIX = 'sh_user_';
const UNAME_PREFIX = 'sh_uname_';
const WR = path.join(__dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const APPLY = process.argv.includes('--apply');

function wr(args) {
    return execFileSync(process.execPath, [WR, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
const strip = s => s.replace(/^\uFEFF/, '');

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' - per-email user key migration\n');

console.log('[1] reading ' + LEGACY_KEY);
const raw = strip(wr(['kv', 'key', 'get', LEGACY_KEY, '--namespace-id', NS, '--text']));
if (!raw || raw.indexOf('not found') >= 0) { console.error('    legacy blob is absent - nothing to migrate'); process.exit(1); }
const map = JSON.parse(raw);
const emails = Object.keys(map);
console.log('    accounts in the legacy blob: ' + emails.length);

console.log('\n[2] per-account integrity check (nothing is rewritten, only copied)');
const problems = [];
for (const email of emails) {
    const rec = map[email];
    const pw = String((rec && rec.password) || '');
    if (!rec || typeof rec !== 'object') { problems.push(email + ': not an object'); continue; }
    if (!pw) problems.push(email + ': EMPTY password field');
}
console.log('    ' + (problems.length ? problems.length + ' PROBLEM(S):' : 'every account has a usable password field'));
problems.slice(0, 10).forEach(p => console.log('      ! ' + p));

console.log('\n[3] per-email keys to write');
let bytes = 0;
const plan = [];
for (const email of emails) {
    const rec = map[email];
    const key = USER_PREFIX + String(email).trim().toLowerCase().slice(0, 100);
    const body = JSON.stringify(rec);
    bytes += body.length;
    plan.push({ key, body });
    const un = String((rec && rec.username) || '').trim();
    if (un) plan.push({ key: UNAME_PREFIX + un.toLowerCase().slice(0, 24), body: email });
}
console.log('    ' + plan.filter(p => p.key.startsWith(USER_PREFIX)).length + ' user keys');
console.log('    ' + plan.filter(p => p.key.startsWith(UNAME_PREFIX)).length + ' username index keys');
console.log('    largest single key: ' + Math.max(...plan.map(p => p.body.length)) + ' bytes (was ' + raw.length + ' for everything at once)');

if (!APPLY) {
    console.log('\nDRY RUN - nothing was written. Re-run with --apply to migrate.');
    process.exit(0);
}

console.log('\n[4] writing');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
let n = 0;
for (const item of plan) {
    const f = path.join(dir, 'k.json');
    fs.writeFileSync(f, item.body, 'utf8');
    wr(['kv', 'key', 'put', item.key, '--namespace-id', NS, '--path', f]);
    n++;
    if (n % 10 === 0) console.log('    ' + n + '/' + plan.length);
}
console.log('    wrote ' + n + ' keys');

console.log('\n[5] verifying every account is readable at its new key');
let missing = 0;
for (const email of emails) {
    const key = USER_PREFIX + String(email).trim().toLowerCase().slice(0, 100);
    const got = strip(wr(['kv', 'key', 'get', key, '--namespace-id', NS, '--text']));
    if (!got || got.indexOf('not found') >= 0) { console.log('    MISSING: ' + email); missing++; continue; }
    const back = JSON.parse(got);
    if (String(back.password || '') !== String(map[email].password || '')) {
        console.log('    PASSWORD DIFFERS: ' + email); missing++;
    }
}
console.log('    ' + (missing ? missing + ' FAILED' : 'all ' + emails.length + ' accounts verified, passwords byte-identical'));

console.log('\n' + (missing ? 'MIGRATION INCOMPLETE' : 'MIGRATION COMPLETE'));
console.log('The legacy blob is left in place on purpose: the new worker still reads it as a');
console.log('fallback, and keeping it means a rollback is instant. Delete it once you are happy.');
process.exit(missing ? 1 : 0);