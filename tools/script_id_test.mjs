// The script id is the secret the whole hiding model rests on.
//
// It used to be String(Date.now()).slice(-10) - a clock reading. That is
// strictly increasing, computable by anyone for any moment, and identical for
// every script published in the same millisecond. It is now ten random digits
// from crypto.getRandomValues, same shape, so every existing id still works and
// every /^\/ScripterHub\d{10}$/ in the worker still matches.
//
// This exists because the property is invisible in review. Nothing about
// shNewScriptId() looks wrong. A future edit that "simplifies" it back to a
// timestamp would pass every functional test in the suite, because the id is
// still a valid id - it would just be guessable again, and silently.
//
// The order check is the load-bearing one, and getting it right took two tries:
//
//   * comparing the SORTED array is a tautology - a sorted sequence is always
//     non-decreasing, so that check reports 0 inversions for ANY input, including
//     the broken timestamp scheme. It would have passed while measuring nothing.
//   * the original order is the thing that differs: a timestamp scheme ascends,
//     so a random sample is non-monotonic roughly half the time.
//
// The id length is read from the WORKER's regex rather than hardcoded here, so
// this cannot drift away from what the worker actually accepts.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[ID] script ids are random, not a clock reading');
console.log('-'.repeat(72));

const worker = read('For Cloudflare/worker.js');
const m = worker.match(/\/\^ScripterHub\\d\{(\d+)\}\$\//);
if (!m) { console.error('could not read the worker id regex'); process.exit(1); }
const DIGITS = Number(m[1]);
const RE = new RegExp('^ScripterHub\\d{' + DIGITS + '}$');
console.log('  worker accepts ScripterHub + ' + DIGITS + ' digits (read from worker.js)');

const src = read('main.js');

// 1. no timestamp generation survives anywhere
const tsSites = [];
src.split('\n').forEach((l, i) => {
  if (/ScripterHub['"]\s*\+\s*String\(Date\.now\(\)\)/.test(l)) tsSites.push(i + 1);
});
if (tsSites.length === 0) ok('no Date.now()-derived id remains in main.js');
else no('a timestamp id is still generated at main.js:' + tsSites.join(','));

// 2. the generator exists and is a CSPRNG, not Math.random
const fn = src.match(/function shNewScriptId\(\) \{[\s\S]*?\n\}/);
if (!fn) {
  no('shNewScriptId() is missing from main.js');
  console.log('\nID SCHEME   ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}
ok('shNewScriptId() exists');
if (/getRandomValues/.test(fn[0])) ok('it uses crypto.getRandomValues');
else no('it does not use a CSPRNG - Math.random is not predictable-resistant');
if (!/Math\.random/.test(fn[0])) ok('it does not use Math.random');
else no('it uses Math.random, which is seeded per-context and guessable');

// 3. behaviour
const gen = new Function(fn[0] + '; return shNewScriptId;')();
const N = 20000;
const ids = [];
for (let i = 0; i < N; i++) ids.push(gen());

const bad = ids.filter(i => !RE.test(i));
if (bad.length === 0) ok('all ' + N + ' ids match the worker regex');
else no(bad.length + ' ids do not match, e.g. ' + bad[0]);

const uniq = new Set(ids).size;
if (uniq === N) ok('all ' + N + ' ids are unique');
else no((N - uniq) + ' collisions in ' + N + ' draws');

// 4. THE ORDERING CHECK - the one that would catch a regression to a timestamp
let inversions = 0;
for (let i = 1; i < ids.length; i++) if (ids[i] < ids[i - 1]) inversions++;
const ratio = inversions / (N - 1);
if (ratio > 0.4 && ratio < 0.6) {
  ok('ids are non-monotonic (' + (ratio * 100).toFixed(1) + '% inversions; a timestamp scheme gives ~0%)');
} else {
  no('ids look ORDERED (' + (ratio * 100).toFixed(1) + '% inversions) - this is what a timestamp scheme looks like');
}

// 5. the entropy figure, stated rather than asserted
const space = Math.pow(10, DIGITS);
const years = space / 30 / 60 / 24 / 365;
console.log('  ' + (DIGITS * Math.log2(10)).toFixed(1) + ' bits of id space; ~' + years.toFixed(0) +
  ' years to exhaust at 30 guesses/min for ONE script.');

console.log('-'.repeat(72));
console.log('ID SCHEME   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
