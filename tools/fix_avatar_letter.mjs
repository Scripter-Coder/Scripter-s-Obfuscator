// One-time repair: replace every unguarded avatar-letter expression with the
// shAvatarLetter() helper.
//
// Why a script instead of six edits: the fault was reported twice, from two
// different functions, because the previous fix was applied to the function
// named in the report rather than to the PATTERN. There were six occurrences of
// the same line and every one of them could blank a whole panel. A pattern fix
// is the only thing that cannot be incomplete.
import fs from 'node:fs';

let s = fs.readFileSync('main.js', 'utf8');
const before = s;

const reps = [
    ['avatar.textContent = user.username.charAt(0).toUpperCase();',
        'avatar.textContent = shAvatarLetter(user);'],
    ['dashAvatar.textContent = user.username.charAt(0).toUpperCase();',
        'dashAvatar.textContent = shAvatarLetter(user);'],
    ['tabAvatar.textContent = user.username.charAt(0).toUpperCase();',
        'tabAvatar.textContent = shAvatarLetter(user);'],
    ["' : user.username.charAt(0).toUpperCase()}",
        "' : shAvatarLetter(user)}"],
    ["' : currentUser.username.charAt(0).toUpperCase()}",
        "' : shAvatarLetter(currentUser)}"],
];

for (const [a, b] of reps) {
    const n = s.split(a).length - 1;
    s = s.split(a).join(b);
    console.log((n > 0 ? 'replaced ' : 'NOT FOUND ') + n + 'x  ' + a.slice(0, 60));
}

fs.writeFileSync('main.js', s);
console.log('file changed: ' + (s !== before));

// Prove it: nothing may dereference .username.charAt outside a comment.
const lines = s.split('\n');
let bad = 0;
lines.forEach((l, i) => {
    if (/\.username\.charAt\(/.test(l) && !/^\s*\/\//.test(l)) {
        console.log('  STILL UNGUARDED ' + (i + 1) + ': ' + l.trim().slice(0, 100));
        bad++;
    }
});
console.log(bad === 0 ? 'OK: no unguarded .username.charAt remains' : 'FAILED: ' + bad + ' left');