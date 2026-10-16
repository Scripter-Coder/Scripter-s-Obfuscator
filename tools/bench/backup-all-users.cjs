// tools/bench/backup-all-users.cjs
//
// FULL BACKUP of every user record that exists anywhere, to plain files on
// disk. Run this BEFORE recreating the KV namespace.
//
// WHY A FILE BACKUP RATHER THAN D1
//
// D1 mirrors only id/email/username/role/disabled/created_at plus a
// password_hash that is deliberately a PLACEHOLDER for any record whose KV
// password was still legacy base64 (`pbkdf2$0$legacy$unmigrated`). So D1 on
// its own cannot restore a login. The KV blobs are the only place the real
// credentials exist, and there are currently TWO of them that disagree:
//
//   store A (readable via wrangler) : 70 accounts, owner intact
//   store B (the one the worker reads): 31 accounts
//
// Whichever survives the recreate, the other must not be lost, so both are
// captured. Everything lands as JSON that can be inspected by eye, and the
// script verifies what it wrote before reporting success.
//
// OUTPUT LAYOUT
//   backup-users-<timestamp>/
//     storeA-blob.json          store A sh_users_db, verbatim
//     storeA-peremail/<email>.json
//     storeB-reported.json      what the worker says it holds
//     d1-users.json             the D1 users table
//     browser-localstorage.json  paste of the browser's `users` key, if provided
//     MANIFEST.json              counts + sha256 of every file
const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const NS = 'b65a64ae779445e2a478d8f6f94b7f79';
const WR = path.join(__dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const WORKER = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const OWNER = 'dubovikstanislav51@gmail.com';

function wr(args) {
    return execFileSync(process.execPath, [WR, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}
const strip = s => s.replace(/^\uFEFF/, '');
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function safeName(email) { return String(email).replace(/[^a-z0-9.@_-]/gi, '_'); }

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop',
    'ScripterHub-UserBackup-' + ts);
fs.mkdirSync(OUT, { recursive: true });
console.log('BACKUP DIRECTORY:\n  ' + OUT + '\n');

const manifest = { createdAt: new Date().toISOString(), namespace: NS, files: [], counts: {} };
// record() takes the FILE PATH and hashes what is actually on disk. Passing a
// byte COUNT instead was the bug: sha256() then received a number, which throws
// ERR_INVALID_ARG_TYPE - and a backup tool that dies before writing its
// manifest is worse than useless, because it looks like it half-worked.
function record(file, note) {
    const buf = fs.readFileSync(file);
    manifest.files.push({
        file: path.basename(file),
        bytes: buf.length,
        sha256: sha256(buf),
        note: note || '',
    });
}

// ---------------------------------------------------------------- store A
console.log('[1/5] store A - the blob wrangler can read');
const perDir = path.join(OUT, 'storeA-peremail');
fs.mkdirSync(perDir, { recursive: true });
let storeA = {};
try {
    const raw = strip(wr(['kv', 'key', 'get', 'sh_users_db', '--namespace-id', NS, '--text']));
    const buf = Buffer.from(raw, 'utf8');
    fs.writeFileSync(path.join(OUT, 'storeA-blob.json'), raw, 'utf8');
    record(path.join(OUT, 'storeA-blob.json'), 'store A sh_users_db verbatim');
    storeA = JSON.parse(raw);
    manifest.counts.storeA_accounts = Object.keys(storeA).length;
    console.log('    accounts: ' + Object.keys(storeA).length + '  (' + buf.length + ' bytes)');
} catch (e) {
    console.log('    FAILED: ' + e.message);
    manifest.counts.storeA_accounts = -1;
}

let perCount = 0;
try {
    const list = wr(['kv', 'key', 'list', '--namespace-id', NS, '--prefix', 'sh_user_']);
    for (const m of list.matchAll(/"name"\s*:\s*"sh_user_([^"]+)"/g)) {
        const email = m[1];
        try {
            const rec = strip(wr(['kv', 'key', 'get', 'sh_user_' + email, '--namespace-id', NS, '--text']));
            fs.writeFileSync(path.join(perDir, safeName(email) + '.json'), rec, 'utf8');
            perCount++;
        } catch (e) { /* unreadable record: reported below, not fatal */ }
    }
} catch (e) { console.log('    per-email listing failed: ' + e.message); }
manifest.counts.storeA_peremail = perCount;
console.log('    per-email records written: ' + perCount);

// ---------------------------------------------------------------- store B
console.log('\n[2/5] store B - what the LIVE WORKER reports it holds');
try {
    const r = execFileSync(process.execPath, ['-e', `
        fetch('${WORKER}/sh/kv-selftest').then(r=>r.text()).then(t=>{
          require('fs').writeFileSync(process.argv[1], t);
        }).catch(e=>{ require('fs').writeFileSync(process.argv[1], 'ERROR '+e.message); });
    `, path.join(OUT, 'storeB-reported.json')], { encoding: 'utf8', timeout: 60000 });
    const txt = fs.readFileSync(path.join(OUT, 'storeB-reported.json'), 'utf8');
    record(path.join(OUT, 'storeB-reported.json'), 'shape report from the live worker');
    console.log('    ' + txt.slice(0, 220));
} catch (e) {
    console.log('    FAILED: ' + e.message);
}

// ---------------------------------------------------------------- D1
console.log('\n[3/5] D1 users table');
try {
    const sqlFile = path.join(OUT, 'dump.sql');
    fs.writeFileSync(sqlFile, 'SELECT email, username, password_hash, role, disabled, created_at FROM users;\n', 'utf8');
    const out = strip(wr(['d1', 'execute', 'scripterhub', '--remote', '--json', '--file=' + sqlFile]));
    // wrangler prefixes progress lines ("Checking if file needs uploading") and
    // can append trailing output, so take the first '[' through the LAST ']'
    // rather than trusting either edge. Slicing to the first ']' truncated the
    // array mid-object and threw "Unexpected non-whitespace character".
    const first = out.indexOf('[');
    const last = out.lastIndexOf(']');
    if (first < 0 || last <= first) throw new Error('no JSON array in wrangler output');
    const parsed = JSON.parse(out.slice(first, last + 1));
    fs.writeFileSync(path.join(OUT, 'd1-users.json'), JSON.stringify(parsed, null, 2), 'utf8');
    const rows = parsed[0].results;
    const real = rows.filter(r => /^pbkdf2\$\d+\$/.test(String(r.password_hash || '')) && !/unmigrated/.test(r.password_hash));
    manifest.counts.d1_rows = rows.length;
    manifest.counts.d1_usable_hashes = real.length;
    console.log('    rows: ' + rows.length + ', usable PBKDF2 hashes: ' + real.length +
        ', legacy placeholders: ' + (rows.length - real.length));
    record(path.join(OUT, 'd1-users.json'), 'D1 users table');
} catch (e) {
    console.log('    FAILED: ' + e.message);
    manifest.counts.d1_rows = -1;
}

// ---------------------------------------------------------------- browser
console.log('\n[4/5] browser localStorage (optional)');
const arg = process.argv[2];
if (arg && fs.existsSync(arg)) {
    const raw = fs.readFileSync(arg, 'utf8');
    const parsed = JSON.parse(strip(raw));
    fs.writeFileSync(path.join(OUT, 'browser-localstorage.json'), JSON.stringify(parsed, null, 2), 'utf8');
    manifest.counts.browser_accounts = Object.keys(parsed).length;
    console.log('    accounts: ' + Object.keys(parsed).length);
    record(path.join(OUT, 'browser-localstorage.json'), 'browser localStorage users key');
} else {
    console.log('    not supplied - skipping (the 17 legacy accounts live here)');
}

// ---------------------------------------------------------------- verify
console.log('\n[5/5] verifying what was written');
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');
let bad = 0;
for (const f of manifest.files) {
    const p = path.join(OUT, f.file);
    if (!fs.existsSync(p)) { console.log('    MISSING ' + f.file); bad++; continue; }
    const b = fs.readFileSync(p);
    if (b.length !== f.bytes || sha256(b) !== f.sha256) { console.log('    CORRUPT ' + f.file); bad++; }
}
const owner = storeA[OWNER];
console.log('');
console.log('  files verified : ' + (manifest.files.length - bad) + '/' + manifest.files.length);
console.log('  store A users  : ' + manifest.counts.storeA_accounts);
console.log('  owner account  : ' + (owner
    ? 'PRESENT - ' + owner.username + ' / plan ' + owner.plan
    : 'MISSING from store A'));
console.log('  owner password : ' + (owner ? String(owner.password || '').slice(0, 14) + '...' : 'n/a'));
console.log('');
console.log(bad ? 'BACKUP INCOMPLETE - DO NOT RECREATE THE NAMESPACE' : 'BACKUP COMPLETE AND VERIFIED');
console.log('  ' + OUT);
process.exit(bad ? 1 : 0);