// main.js is not what the browser runs. dist/assets/main-<hash>.js is.
//
// The user reported a fix "not working" when the fix was correct and committed.
// The cause: dist/ had been built at 17:47 and every client-side change since
// then - the keyless split-key guard, the random script id - existed only in
// main.js. Nothing in the suite noticed, because every test reads the SOURCE.
// The site was serving code from hours earlier.
//
// This is the check that would have caught it, and it is the one piece of
// "did my fix actually reach the user" that can be automated.
//
// It is deliberately NOT a pattern match on the minified output. An earlier
// version of this looked for `delete x.serverKey` and for the identifier
// `shServerKeyOpts`, and reported FAIL on a bundle that was demonstrably
// correct - the minifier had inlined the function to `ud` and turned the delete
// into a ternary:
//
//     function ud(e,t){return e?{}:{serverKey:{keyUrl:kt+"sh/k",scriptRef:t}}}
//
// That is the fix, working. Grepping for a source-level identifier in minified
// output tests the minifier, not the code.
//
// The authoritative check here is FRESHNESS: the bundle must be at least as new
// as the source it was built from. Everything else is corroboration, and a
// failure in the corroboration prints what it saw rather than asserting a shape
// it cannot rely on.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[BF] the built bundle is not older than the source it came from');
console.log('-'.repeat(72));

const assets = path.join(root, 'dist', 'assets');
if (!fs.existsSync(assets)) {
  console.log('  FAIL dist/assets does not exist - run `npm run build`');
  console.log('\nBUNDLE FRESHNESS   0 passed, 1 failed');
  process.exit(1);
}

const bundles = fs.readdirSync(assets).filter(f => /^main-.*\.js$/.test(f));
if (bundles.length !== 1) {
  no('expected exactly one main bundle, found ' + JSON.stringify(bundles));
  console.log('\nBUNDLE FRESHNESS   ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

const B = path.join(assets, bundles[0]);
const t = fs.readFileSync(B, 'utf8');
console.log('  bundle: ' + B + '  (' + Math.round(t.length / 1024) + ' KB)');

// --- the authoritative check -------------------------------------------
const sources = ['main.js', 'custom-obfuscator.js'];
for (const s of sources) {
  const sp = path.join(root, s);
  if (!fs.existsSync(sp)) { no(s + ' is missing'); continue; }
  const sTime = fs.statSync(sp).mtimeMs;
  const bTime = fs.statSync(B).mtimeMs;
  if (bTime >= sTime) ok(s + ' is not newer than the bundle');
  else {
    no(s + ' was edited AFTER the last build - run `npm run build`');
    console.log('         source: ' + new Date(sTime).toISOString());
    console.log('         bundle: ' + new Date(bTime).toISOString());
    console.log('         the site is serving older code than the source contains');
  }
}

// --- corroboration: things that must not survive a stale build ----------
if (!/ScripterHub['"`]\s*\+\s*String\(Date\.now\(\)\)\.slice\(-10\)/.test(t)) {
  ok('the bundle does not generate timestamp script ids');
} else {
  no('the bundle still generates a timestamp script id - it predates that fix');
}

if (/getRandomValues/.test(t)) ok('the bundle uses a CSPRNG for ids');
else no('no getRandomValues in the bundle - it predates the random-id fix');

// Reported, not asserted: the minified shape of the split-key decision.
const ternary = t.match(/function\s+\w+\(\s*\w+\s*,\s*\w+\s*\)\s*\{\s*return\s+\w+\s*\?\s*\{\s*\}\s*:\s*\{\s*serverKey/);
if (ternary) {
  ok('the split-key decision is present and gated on the keyless flag');
} else {
  // Reported, never asserted. Minified shape is not a contract, and failing on
  // it would mean failing on a correct build - which is precisely the mistake
  // this file was written to stop making.
  console.log('  note: could not recognise the minified split-key decision; the');
  console.log('        freshness check above is what guarantees the code shipped.');
}

console.log('-'.repeat(72));
console.log('BUNDLE FRESHNESS   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
