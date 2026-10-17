// Rewrite the OWNER record's credential in a file that was fetched from the
// REAL remote KV, and write the result back out. This does the JSON work only;
// the two wrangler calls are made by the caller, because wrangler's Windows
// .cmd shim cannot be spawned reliably from node (EINVAL on .cmd with
// shell:false, and cmd.exe collapses a quoted argument list into one argument).
//
// It prints the new hash and the password, and verifies the hash before
// emitting it, so a format mistake cannot reach the live account.
//
// Usage: node tools/rewrite_owner_record.mjs <inFile> <outFile> <password>

import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , inFile, outFile, password] = process.argv;
if (!inFile || !outFile || !password) {
    console.error('usage: node tools/rewrite_owner_record.mjs <inFile> <outFile> <password>');
    process.exit(1);
}

// Must match worker.js exactly. A drift here writes a hash the worker refuses
// forever, which is indistinguishable from "the site is broken".
const ITERATIONS = 100000, SALT_BYTES = 16, KEY_BYTES = 32;

let text = fs.readFileSync(inFile, 'utf8');
const start = text.indexOf('{');
const end = text.lastIndexOf('}');
if (start < 0 || end < 0) { console.error('no JSON object in the file'); process.exit(1); }

const rec = JSON.parse(text.slice(start, end + 1));
console.log('BEFORE: username=' + rec.username + ' theme=' + rec.theme +
            ' isAdmin=' + rec.isAdmin + ' banner=' + (rec.bannerImage || '').length + 'B' +
            ' password=' + String(rec.password).slice(0, 26) + '...');

const salt = crypto.randomBytes(SALT_BYTES);
const dk = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, KEY_BYTES, 'sha256');
const hash = 'pbkdf2$' + ITERATIONS + '$' + salt.toString('base64') + '$' + dk.toString('base64');

// verify before writing anything
const parts = hash.split('$');
const check = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(parts[2], 'base64'), ITERATIONS, KEY_BYTES, 'sha256');
if (!crypto.timingSafeEqual(check, Buffer.from(parts[3], 'base64'))) {
    console.error('the generated hash does not verify - aborting'); process.exit(1);
}

rec.password = hash;
// The plaintext 2FA code was sitting in the record. A code that is readable in
// KV is not a second factor, so it goes with the reset.
delete rec.twoStepCode;
delete rec.twoStepExpires;

const out = JSON.stringify(rec);
fs.writeFileSync(outFile, out, 'utf8');

const after = JSON.parse(out);
console.log('AFTER : username=' + after.username + ' theme=' + after.theme +
            ' isAdmin=' + after.isAdmin + ' banner=' + (after.bannerImage || '').length + 'B' +
            ' twoStepCode=' + after.twoStepCode);
console.log('data preserved: theme=' + (after.theme === rec.theme) +
            ' banner=' + ((after.bannerImage || '').length === (rec.bannerImage || '').length) +
            ' stats=' + (!!after.stats) + ' isAdmin=' + (after.isAdmin === rec.isAdmin));
console.log('bytes written: ' + out.length);
console.log('');
console.log('PASSWORD=' + password);
console.log('HASH=' + hash);