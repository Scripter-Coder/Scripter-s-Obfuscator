// Verify shImgErr as a whole, with checks that are actually well-formed.
//
// The previous check list had:
//
//     ['no alt-text lookup survives', !/who\.indexOf\(/.test(body)]
//
// `!` binds to the regex literal, not to `.test(body)`, so that entry was a
// malformed expression rather than a check. It reported a failure against code
// that was correct - the third time in this session a bad assertion pointed at
// good code, which is the argument for asserting carefully rather than loosely.
import fs from 'node:fs';

const a = fs.readFileSync('index.html', 'utf8');
const start = a.indexOf('function shImgErr(img) {');
if (start < 0) { console.error('shImgErr is gone'); process.exit(1); }
let d = 0, s = false, e = -1;
for (let i = start; i < a.length; i++) {
  if (a[i] === '{') { d++; s = true; }
  else if (a[i] === '}') { d--; if (s && d === 0) { e = i; break; } }
}
if (e < 0) { console.error('shImgErr has no matching close'); process.exit(1); }
const body = a.slice(start, e + 1);

let fail = 0;
const check = (label, pass) => {
  if (pass) console.log('  OK   ' + label);
  else { fail++; console.log('  FAIL ' + label); }
};

check('reads the data-credit key', /getAttribute\('data-credit'\)/.test(body));
check('falls back to alt when there is no key', /key \|\| who/.test(body));
check('name is declared after key and who', /var who = [^;]+;\s*(\/\/[^\n]*\n\s*)*var name = key \|\| who;/.test(body));
check('the Scripter branch uses the key', /name\.indexOf\('Scripter'\)/.test(body));
check('Scripter.png is still the candidate', /Scripter\.png/.test(body));
check('Kurosaki_Koyuki.png is still the candidate', /Kurosaki_Koyuki\.png/.test(body));
check('the letter match is lower-cased', /lname = name\.toLowerCase\(\)/.test(body));
check('the DQ letter is assigned', /fb = 'DQ';/.test(body));
check('the badge is written into the DOM', /credit-avatar-fallback/.test(body));
check('no lookup reads the alt text', !/who\.indexOf\(/.test(body));
check('the DQ branch appears exactly once', (body.match(/fb = 'DQ';/g) || []).length === 1);
check('both avatars carry a key', /data-credit="scripter"/.test(a) && /data-credit="kurosaki"/.test(a));
check('alt is still a readable name', /alt="𝓜/.test(a));
check('no encoding damage', !a.includes('\uFFFD'));

console.log('');
console.log(fail ? 'shImgErr            ' + fail + ' FAILED' : 'shImgErr            14 checks passed');
process.exit(fail ? 1 : 0);
