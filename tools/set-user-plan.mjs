#!/usr/bin/env node
// SET A USER'S PLAN, DIRECTLY IN KV.
//
// WHY THIS EXISTS
// ---------------
// `plan` lives ONLY in Cloudflare KV, at sh_user_<lowercased email>. The D1
// `users` table has no plan column at all (see migrations/0001_init.sql and
// restore-users-from-d1.cjs, which says so out loud), so editing D1 changes
// nothing. The admin panel can do this through POST /sh/users, but that needs a
// live owner session token. This script does the same write with wrangler.
//
// THE PART THAT BITES
// -------------------
// putUserRecord() is a WHOLE-RECORD write - it replaces the value, it does not
// merge. A record carries a multi-hundred-KB base64 profileImage. Hand-writing
// a partial record, or piping JSON through a shell that re-quotes it, silently
// destroys that avatar. So this script:
//   1. reads the record as bytes and parses it,
//   2. asserts the email and username are the ones you asked for,
//   3. writes a timestamped backup to disk BEFORE touching anything,
//   4. changes exactly one field and nothing else,
//   5. reads it back and confirms.
//
// A plan name that is not in VALID_PLANS (worker.js) is coerced to 'Basic' by
// sanitizeUserRecord on the next signup/sync, so it is rejected up front here
// rather than discovered weeks later as a mystery downgrade.
//
// USAGE
//   node tools/set-user-plan.mjs <email> <plan> [--expect <username>] [--dry-run]
//
//   node tools/set-user-plan.mjs adampaylee@gmail.com God --expect TotalScripts
//
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const NS = '6473e0a2dcfc4dc5ab477512ce713a74'; // scripterhub_loaders; pinned in wrangler.toml

// MUST stay in sync with VALID_PLANS in For Cloudflare/worker.js
const VALID_PLANS = ['Basic', 'Premium', 'Advanced', 'Pro', 'God', 'Ultimate', 'Enterprise', 'Custom'];

function wr(args) {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024, // records with avatars run large
    });
}

function die(msg) {
    console.error('\x1b[31m' + msg + '\x1b[0m');
    process.exit(1);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const positional = argv.filter((a) => !a.startsWith('--'));
const expectIdx = argv.indexOf('--expect');
const expectedUsername = expectIdx !== -1 ? argv[expectIdx + 1] : null;

if (positional.length < 2) {
    console.error('usage: node tools/set-user-plan.mjs <email> <plan> [--expect <username>] [--dry-run]');
    process.exit(1);
}

const email = String(positional[0]).trim().toLowerCase();
const plan = String(positional[1]).trim();

if (!VALID_PLANS.includes(plan)) {
    die(`'${plan}' is not a valid plan. Valid: ${VALID_PLANS.join(', ')}`);
}

const key = 'sh_user_' + email;

// 1. READ
let raw;
try {
    raw = wr(['kv', 'key', 'get', key, '--namespace-id', NS, '--remote', '--text']);
} catch (e) {
    die(`no KV record at "${key}" - this account does not exist in the live namespace.`);
}

let rec;
try {
    rec = JSON.parse(raw);
} catch (e) {
    die(`the record at "${key}" is not valid JSON: ${e.message}`);
}

// 2. ASSERT IDENTITY - this is the guard against upgrading the wrong person
if (String(rec.email || '').toLowerCase() !== email) {
    die(`identity mismatch: key says ${email} but the record's email is ${rec.email}. Refusing to write.`);
}
if (expectedUsername !== null && String(rec.username || '') !== expectedUsername) {
    die(`identity mismatch: expected username "${expectedUsername}" but the record's username is "${rec.username}". Refusing to write.`);
}

// 3. BACK UP - before anything is changed
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, 'user-backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `${key.replace('sh_user_', '')}-${stamp}.json`);
fs.writeFileSync(backupFile, JSON.stringify(rec, null, 2));

const before = String(rec.plan || '(unset)');
console.log(`found   ${rec.username} <${rec.email}>`);
console.log(`key     ${key}`);
console.log(`plan    ${before}  ->  ${plan}`);
console.log(`backup  ${path.relative(ROOT, backupFile)}`);

if (before === plan) {
    console.log('\nalready ' + plan + ' - nothing to do.');
    process.exit(0);
}

if (dryRun) {
    console.log('\n--dry-run: no write performed.');
    process.exit(0);
}

// 4. WRITE - change exactly one field
rec.plan = plan;
const payload = path.join(backupDir, `.write-${key}.json`);
fs.writeFileSync(payload, JSON.stringify(rec));
wr(['kv', 'key', 'put', key, '--namespace-id', NS, '--remote', '--path', payload]);
fs.unlinkSync(payload);

// 5. CONFIRM - read back and prove nothing else changed
const check = JSON.parse(wr(['kv', 'key', 'get', key, '--namespace-id', NS, '--remote', '--text']));
if (String(check.plan || '') !== plan) {
    die(`verification failed: plan reads back as "${check.plan}", not "${plan}".`);
}
// The fields most easily lost are the ones that were never part of this
// conversation, so they get their own explicit check.
for (const field of ['id', 'email', 'username', 'password', 'createdAt', 'profileImage']) {
    const a = JSON.stringify(rec[field] ?? null);
    const b = JSON.stringify(check[field] ?? null);
    if (a !== b) die(`verification failed: "${field}" changed during the write. Restore from ${path.relative(ROOT, backupFile)}.`);
}

console.log(`\n\x1b[32mOK\x1b[0m ${rec.username} <${rec.email}> is now on ${plan}. Avatar, password and id verified intact.`);