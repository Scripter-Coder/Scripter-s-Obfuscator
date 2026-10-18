// Second pass on the same fault class, found by looking for the OTHER unguarded
// field reads in the same render paths rather than waiting for each one to be
// reported separately.
//
// renderAdminUserListFull did new Date(user.createdAt).toLocaleDateString() with
// no guard. A record with no createdAt throws RangeError (Invalid time value)
// and blanks the panel in exactly the same way the username did. Two reports in,
// two fixes that each covered one symptom - so this sweeps the pattern.
import fs from 'node:fs';

let s = fs.readFileSync('main.js', 'utf8');
const before = s;

// Guarded date rendering. An account with no createdAt shows '-' rather than
// throwing and taking every other row with it.
s = s.replace(
    /var createdDate = new Date\(user\.createdAt\)\.toLocaleDateString\(\);/g,
    "var createdRaw = String((user && user.createdAt) || '');\n" +
    "        var createdDate = createdRaw ? new Date(createdRaw).toLocaleDateString() : '-';"
);

// A nameless account must not print the literal word "undefined" into the panel.
s = s.replace(/\$\{user\.username\}/g, '${shDisplayName(user, key)}');
s = s.replace(/\$\{currentUser\.username\}/g, '${shDisplayName(currentUser)}');

fs.writeFileSync('main.js', s);
console.log('changed: ' + (s !== before));

const checks = [
    ['new Date(user.createdAt) unguarded', /new Date\(user\.createdAt\)/.test(s)],
    ['bare ${user.username}', s.includes('${user.username}')],
    ['bare ${currentUser.username}', s.includes('${currentUser.username}')],
];
for (const [name, bad] of checks) console.log((bad ? 'STILL PRESENT  ' : 'clear          ') + name);

console.log('shDisplayName call sites: ' + (s.match(/shDisplayName\(/g) || []).length);
console.log('shAvatarLetter call sites: ' + (s.match(/shAvatarLetter\(/g) || []).length);