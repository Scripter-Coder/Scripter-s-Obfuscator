// Set the OWNER account's password, writing to the REAL remote KV.
//
// WHY THIS IS A SCRIPT AND NOT A PASTE-INTO-POWERSHELL ONE-LINER
//
// 1. `wrangler kv key put` WITHOUT --remote writes to LOCAL state. wrangler
//    prints "Use --remote if you want to access the remote instance" and
//    succeeds anyway, so the write appears to work, reads back correctly from
//    the same local store, and the live worker never sees it. That is exactly
//    what happened: the hash was written, verified locally, and login still
//    returned 401 because the worker reads a different store.
// 2. The owner record is ~122 KB and contains a base64 WebP banner. Round-
//    tripping that through PowerShell's ConvertTo-Json risks corrupting it.
//
// So: node drives wrangler with explicit --remote, and JSON.parse/stringify
// does the round trip. Nothing is reformatted.
//
// Usage: node tools/set_owner_password.mjs <newPassword>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const NS = '6473e0a2dcfc4dc5ab477512ce713a74';
const KEY = 'sh_user_dubovikstanislav51@gmail.com';
const password = process.argv[2];
if (!password) { console.error('usage: node tools/set_owner_password.mjs <newPassword>'); process.exit(1); }

// Must match worker.js exactly.
const ITERATIONS = 100000, SALT_BYTES = 16, KEY_BYTES = 32;
const salt = crypto.randomBytes(SALT_BYTES);
const dk = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, KEY_BYTES, 'sha256');
const hash = 'pbkdf2$' + ITERATIONS + '$' + salt.toString('base64') + '$' + dk.toString('base64');

// Drive wrangler through node directly.
//
// Going through npx.cmd fails two ways on Windows: spawning a .cmd with
// shell:false is EINVAL, and routing through cmd.exe collapses the quoted
// argument list into a single argument that wrangler rejects as "Unknown
// arguments". Running the CLI's own JS entry sidesteps both, and it also
// guarantees the local node_modules copy is the one used - not a global one
// that might be a different version.
// fileURLToPath, not URL.pathname: the repo path contains spaces, and pathname
// hands back a percent-encoded string that node cannot resolve as a module.
const WRANGLER_BIN = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const wrangler = (...args) => execFileSync(process.execPath, [WRANGLER_BIN.pathname, ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false,
}).toString();

// 1. read the REAL remote record
const raw = wrangler('kv', 'key', 'get', '--remote', '--namespace-id', NS, KEY);
const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
const rec = JSON.parse(json);
console.log('read from REMOTE: username=' + rec.username + ' theme=' + rec.theme +
            ' isAdmin=' + rec.isAdmin + ' banner=' + (rec.bannerImage || '').length + 'B');
console.log('old password field: ' + rec.password);

// 2. change ONLY the credential, and drop the plaintext 2FA code
rec.password = hash;
delete rec.twoStepCode;
delete rec.twoStepExpires;

// 3. prove the new hash verifies before it goes anywhere
const parts = hash.split('$');
const v = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(parts[2], 'base64'), ITERATIONS, KEY_BYTES, 'sha256');
if (!crypto.timingSafeEqual(v, Buffer.from(parts[3], 'base64'))) throw new Error('hash does not verify');

// 4. write back to the REAL remote
const tmp = process.env.TEMP + '/owner_rec_remote.json';
fs.writeFileSync(tmp, JSON.stringify(rec), 'utf8');
wrangler('kv', 'key', 'put', '--remote', '--namespace-id', NS, KEY, '--path', tmp);
fs.unlinkSync(tmp);

console.log('wrote to REMOTE. new hash: ' + hash);

// 5. read it back from the remote and compare, so a silent no-op cannot pass
const check = JSON.parse((() => { const s = wrangler('kv', 'key', 'get', '--remote', '--namespace-id', NS, KEY); return s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1); })());
console.log('readback matches: ' + (check.password === hash));
console.log('twoStepCode gone: ' + (check.twoStepCode === undefined));
console.log('theme preserved: ' + check.theme + '  banner preserved: ' + ((check.bannerImage || '').length === (rec.bannerImage || '').length));
console.log('');
console.log('PASSWORD=' + password);
if (check.password !== hash) { console.error('MISMATCH - do not trust this'); process.exit(1); }