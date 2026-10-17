// No render path may dereference a user field without a guard.
//
// THE BUG, TWICE
//
//     TypeError: Cannot read properties of undefined (reading 'charAt')
//         at renderUsersList (main.js)
//     TypeError: Cannot read properties of undefined (reading 'charAt')
//         at renderAdminUserListFull (main.js)
//
// Reported as "i dont see users anymore", twice, from two different functions.
//
// WHY IT LOOKS LIKE DATA LOSS AND IS NOT
//
// renderUsersList and renderAdminUserListFull accumulate every row into ONE
// html string and inject it at the end. A throw anywhere in the loop therefore
// discards every row already built. ONE account with no username took all 124
// accounts off the screen, and an empty panel is indistinguishable from a
// deleted database.
//
// The first fix patched the function named in the report. The second report
// came from a different function carrying the identical line. There were six
// occurrences. Fixing per-report is how two fixes happened without covering the
// pattern.
//
// WHAT THIS ASSERTS
//
// 1. No unguarded `.username.charAt(` anywhere in main.js.
// 2. No unguarded `new Date(user.createdAt)` - the same crash, different field.
// 3. No bare `${user.username}` interpolation, which prints the literal word
//    "undefined" into the panel instead of throwing - quieter, and it is how a
//    nameless account looks like a rendering bug rather than a data problem.
// 4. The two helpers exist and are used at more than one site, so the guard
//    cannot be bypassed by writing the expression by hand.
//
// Run: node tools/nameless_account_test.mjs

import fs from 'node:fs';

const src = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

// Comments are allowed to quote the old code; only real statements are checked.
const code = src.split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .filter(line => !/^\s*\*/.test(line))
    .join('\n');

console.log('[NA] a nameless account must not blank the panel');
console.log('-'.repeat(72));

console.log('');
console.log('no unguarded field dereference');
check('no .username.charAt(', !/\.username\.charAt\(/.test(code),
    'found ' + (code.match(/\.username\.charAt\(/g) || []).length + ' unguarded call(s)');
check('no new Date(user.createdAt)', !/new Date\(user\.createdAt\)/.test(code));
check('no bare ${user.username}', !code.includes('${user.username}'));
check('no bare ${currentUser.username}', !code.includes('${currentUser.username}'));

console.log('');
console.log('the guard exists, and is shared');
check('shAvatarLetter is defined', /function shAvatarLetter\(/.test(code));
check('shDisplayName is defined', /function shDisplayName\(/.test(code));

const avatarUses = (code.match(/shAvatarLetter\(/g) || []).length;
const nameUses = (code.match(/shDisplayName\(/g) || []).length;
check('shAvatarLetter is used at every avatar, not just one',
    avatarUses >= 6, avatarUses + ' call sites - there were 6 unguarded ones');
check('shDisplayName is used wherever a name is shown',
    nameUses >= 3, nameUses + ' call sites');

console.log('');
console.log('the fallback is total');
// A record with nothing usable at all must still produce a letter.
const helper = (code.match(/function shAvatarLetter\([\s\S]*?\n\}/) || [])[0] || '';
check('it falls back to the email', /rec\.email/.test(helper));
check('and to a literal when even that is missing', /\?'/.test(helper));
check('it never dereferences without a String() coercion',
    /String\(rec\.username \|\| ''\)/.test(helper) && /String\(rec\.email \|\| ''\)/.test(helper),
    'a bare (rec.username || \'\') can still yield a non-string that has no charAt');

console.log('');
console.log('NAMELESS ACCOUNT   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);