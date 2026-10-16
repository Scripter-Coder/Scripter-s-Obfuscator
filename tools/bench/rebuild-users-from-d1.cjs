// tools/bench/rebuild-users-from-d1.cjs
//
// RESTORES the user table into a freshly-created KV namespace, from D1.
//
// WHY D1 AND NOT THE "BACKUP"
//
// The earlier backup is real, but it was taken with `wrangler kv` WITHOUT
// --remote. Those reads and writes go to a LOCAL state directory, not to
// Cloudflare - which is the entire reason this deployment looked like it had
// two different user tables all day. The wrangler CLI happily reported 70
// accounts while the live worker saw 31, because the CLI was reading a local
// cache and the worker was reading production.
//
// So the authoritative source is D1, which was never touched by any of it:
//
//   rows                109
//   usable PBKDF2 hash   90   <- real credentials, login works with these
//   legacy placeholder   19   <- `pbkdf2$0$legacy$unmigrated`, NOT a credential
//
// syncUsersToD1() wrote the genuine hash on INSERT and its ON CONFLICT clause
// does not overwrite password_hash, so these 90 are intact and current.
//
// The 19 placeholders are recovered from the browser's localStorage copy, which
// holds `btoa(password)` per account. verifyPassword() accepts a legacy btoa
// record and re-hashes it to PBKDF2 on first successful login, so those
// accounts work too - and upgrade themselves.
//
// NOT RECOVERABLE: an account whose D1 row is a placeholder AND which is not in
// the browser copy. Those are counted and named, never guessed.
//
// PLAN FIELDS ARE NOT IN D1, so they default to Basic. The user's original tier
// is not in any surviving store; set those back by hand afterwards.
//
// EVERY KV CALL PASSES --remote. That is not a style choice, it is the bug this
// whole file exists to correct.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os'), path = require('path');

const NS = process.argv[3] || '6473e0a2dcfc4dc5ab477512ce713a74';
const OWNER_EMAIL = 'dubovikstanislav51@gmail.com';
const WR = path.join(__dirname, '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// --remote is mandatory on every call below.
function kvGet(key) {
    try {
        return execFileSync(process.execPath,
            [WR, 'kv', 'key', 'get', key, '--namespace-id', NS, '--remote', '--text'],
            { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    } catch (e) { return null; }
}
function kvPut(key, value) {
    const f = path.join(os.tmpdir(), 'put-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, value, 'utf8');
    execFileSync(process.execPath,
        [WR, 'kv', 'key', 'put', key, '--namespace-id', NS, '--remote', '--path', f],
        { encoding: 'utf8' });
}

console.log('TARGET NAMESPACE: ' + NS + '\n');

console.log('[1] reading D1 (remote)');
const out = execFileSync(process.execPath, [WR, 'd1', 'execute', 'scripterhub', '--remote', '--json',
    '--command=SELECT email, username, password_hash, role, disabled, created_at FROM users'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const parsed = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
const rows = parsed[0].results;
console.log('    rows: ' + rows.length);

console.log('\n[2] browser localStorage for the legacy accounts');
let browser = {};
const bFile = process.argv[2];
if (bFile && fs.existsSync(bFile)) {
    browser = JSON.parse(fs.readFileSync(bFile, 'utf8').replace(/^\uFEFF/, ''));
    console.log('    accounts: ' + Object.keys(browser).length);
} else {
    console.log('    NOT SUPPLIED - the 19 placeholder accounts will be skipped');
}

console.log('\n[3] building records');
const isReal = h => /^pbkdf2\$\d+\$/.test(String(h || '')) && !/unmigrated/.test(h);
const map = {};
const unrecoverable = [];
let fromHash = 0, fromBrowser = 0;

for (const r of rows) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) continue;
    const uname = String(r.username || '').slice(0, 20);
    let password = isReal(r.password_hash) ? r.password_hash : null;

    if (password) { fromHash++; }
    else {
        // placeholder: the only remaining copy is the browser's btoa(password)
        const b = browser[email] || browser[String(r.email)];
        if (b && b.password) { password = b.password; fromBrowser++; }
        else { unrecoverable.push(email); continue; }
    }

    map[email] = {
        id: email,
        email: email,
        username: uname,
        password: password,
        // NOT IN D1. Every restored account starts on Basic and the owner has
        // to set tiers back by hand.
        plan: 'Basic',
        description: '',
        createdAt: new Date(Number(r.created_at) || Date.now()).toISOString(),
        profileImage: '', bannerImage: '', customBackground: '', theme: 'default',
        isAdmin: r.role === 'owner',
        isScripter: r.role === 'owner',
        disabled: Number(r.disabled) ? true : false,
        stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
    };
}

console.log('    restored      : ' + Object.keys(map).length);
console.log('    real PBKDF2   : ' + fromHash);
console.log('    from browser  : ' + fromBrowser);
console.log('    UNRECOVERABLE : ' + unrecoverable.length);
if (unrecoverable.length) {
    console.log('      (no hash in D1 and not in the browser copy - these must re-register)');
    unrecoverable.forEach(e => console.log('        ' + e));
}
const owner = map[OWNER_EMAIL];
console.log('    owner present : ' + !!owner + (owner ? '  (' + owner.username + ' / ' + owner.password.slice(0, 14) + '...)' : ''));

console.log('\n[4] writing to the namespace (REMOTE)');
kvPut('sh_users_db', JSON.stringify(map));
let n = 0;
for (const email of Object.keys(map)) {
    kvPut('sh_user_' + email, JSON.stringify(map[email]));
    const un = String(map[email].username || '').trim();
    if (un) kvPut('sh_uname_' + un.toLowerCase(), email);
    n++;
}
console.log('    wrote ' + n + ' user records + ' + Object.keys(map).length + ' username indexes + the blob');

console.log('\n[5] verifying by reading back REMOTE');
const back = kvGet('sh_user_' + OWNER_EMAIL);
if (!back) {
    console.log('    OWNER KEY NOT READABLE - something is still wrong');
    process.exit(1);
}
const rec = JSON.parse(back);
console.log('    owner key readable : yes');
console.log('    owner username     : ' + rec.username);
console.log('    owner plan         : ' + rec.plan);
console.log('    owner password     : ' + rec.password.slice(0, 14) + '...');
console.log('\nDONE. Now deploy and test the login.');