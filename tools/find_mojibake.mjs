// =============================================================================
// FIND AND REPAIR DOUBLE-ENCODED UTF-8
// =============================================================================
// WHAT IS WRONG
//
// Text decoded as Windows-1252 and re-saved as UTF-8 comes back as valid
// UTF-8 full of mojibake. An em-dash is U+2014, bytes E2 80 94; read through
// cp1252 that is U+00E2 U+20AC U+201C, which renders as three garbage
// characters and re-saves as stable, valid, permanently wrong text.
//
// WHY NO EXISTING CHECK CATCHES IT
//
// - "valid UTF-8?"      -> yes. The damage is lossless and legal.
// - "contains U+FFFD?"  -> no. A good decoder never gave up.
// - "do the tests pass?" -> yes. It is a comment, or a string compared only
//   against itself.
//
// Same failure class as the raw NUL byte in worker.js: behaviourally
// invisible, visible only to whoever reads the file.
//
// ONE HIT IS A REAL SHIPPING BUG
//
// custom-obfuscator.js line 266 is not a comment:
//
//     var antiCrackMsg = String(options.antiCrackMessage ||
//                             'Goodluck Sonion <mojibake>');
//
// That string is emitted into every obfuscated script the tool produces. The
// anti-crack message has been shipping corrupted this entire time.
//
// TWO BUGS IN THE FIRST VERSION OF THIS DETECTOR, BOTH WORTH RECORDING
//
// 1. The lead-character class was built with
//        '\\u' + codePoint.toString(16)
//    which yields "ue2" for U+00E2, not "u00e2". A regex \\u escape requires
//    exactly four hex digits, so "\\ue2" parses as a LITERAL "u" followed by
//    "e" and "2". The class silently became {u, e, 2, c, 3, f, 0} - matching a
//    correct en-dash range like "2-5ms" while missing every piece of real
//    mojibake. Zero true positives, several false ones. The class is now built
//    from padded escapes AND self-checked at startup, because a silent
//    mis-parse here produces a tool that confidently reports nothing wrong.
//
// 2. The inverse transform used Buffer.from(s, 'latin1'). Latin-1 CANNOT
//    represent U+20AC, so Node truncated it to 0xAC. That turned a pilcrow-
//    shaped run into the wrong glyph instead of an ellipsis, and made every
//    em-dash undecodable. cp1252 is the encoding that actually produced the
//    damage, so cp1252 is what has to be undone. Node's Buffer has no cp1252
//    codec, so the reverse table is built from TextDecoder below.
//
// 3. The obfuscator's own string was encoded MORE THAN ONCE, so a single
//    reverse pass lands on text that is still mojibake. Repair now iterates
//    until it converges, and every pass must strictly reduce the run count.
//
// A tool that inspects bytes must not be edited by hand in the range it
// inspects, and its constants must be escapes rather than literals.
//
// REPAIR IS PROVEN, NOT ASSUMED
//
// Every candidate repair must (a) decode without U+FFFD, (b) not itself
// contain mojibake, and (c) strictly reduce the number of runs. A repair that
// cannot tell a fix from fresh corruption is a second bug.
//
// Run:  node tools/find_mojibake.mjs          report only
//       node tools/find_mojibake.mjs --fix    repair what is provably repairable
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

const FIX = process.argv.includes('--fix');

const SKIP = new Set(['node_modules', '.git', '.wrangler', 'public', 'dist',
  'new-obfuscator-copy', 'new-obfuscator-current-copy', 'assets', 'images', 'vendor']);
const EXT = /\.(js|mjs|cjs|json|html|css|md|sql|toml)$/;

// Lead characters, as escapes, and the full Latin-1 letter range U+00C0..FF.
//
// The first version listed only five leads (â Ã Â ð ï) on the theory that a
// mojibake run always starts with one of them. That is true of the FIRST
// encoding and false of every subsequent one: unwinding
// "a-circumflex, degree, A-ring, cedilla" once yields "eth, A-ring, cedilla",
// whose lead is A-ring - not in the list. The run then went undetected while
// still being wrong, and the tool reported the line as clean.
//
// So the class is the whole Latin-1 letter block, which is exactly the range
// that survives one cp1252 decode of a UTF-8 continuation. Written as escapes
// on purpose - see bug 1 in the header.
const LEAD_CP = [];
for (let c = 0x00c0; c <= 0x00ff; c++) LEAD_CP.push(c);

const hex4 = (cp) => cp.toString(16).toUpperCase().padStart(4, '0');

const LEAD_CLASS = '[' + LEAD_CP.map(c => '\\u' + hex4(c)).join('') + ']';

// Continuation characters: Latin-1 supplement (bytes 0x80-0xBF) plus the
// cp1252 punctuation block that bytes 0x80-0x9F decode to.
const CONT_CLASS = '[\\u0080-\\u00BF' +
  '\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039' +
  '\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC' +
  '\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]';

const RUN = new RegExp(LEAD_CLASS + CONT_CLASS + '{1,3}', 'g');

// Sanity: the class must contain every code point it claims and reject ASCII.
// Without this, a formatting slip in hex4() again produces a class that
// silently matches the wrong characters - which is precisely how the first
// version of this file shipped, reporting nothing wrong with confidence.
{
  const probe = new RegExp('^' + LEAD_CLASS + '$');
  const missing = LEAD_CP.filter(c => !probe.test(String.fromCodePoint(c)));
  const acceptsAscii = 'ACNOacno'.split('').filter(ch => probe.test(ch));
  if (missing.length || acceptsAscii.length) {
    console.error('FATAL: the lead class is malformed. ' +
      (missing.length ? 'It does not match ' + missing.map(c => 'U+' + hex4(c)).join(' ') + '. ' : '') +
      (acceptsAscii.length ? 'It wrongly matches ASCII ' + acceptsAscii.join('') + '. ' : ''));
    process.exit(2);
  }
}

const hasMojibake = (s) => { RUN.lastIndex = 0; return RUN.test(s); };
const countRuns = (s) => { RUN.lastIndex = 0; return (s.match(RUN) || []).length; };

// -----------------------------------------------------------------------------
// The cp1252 reverse table
// -----------------------------------------------------------------------------
// Built from TextDecoder rather than hand-listed, because a hand-listed table
// is 128 rows of exactly the kind of detail that is wrong in one place and
// nobody notices. For each byte value 0x00..0xFF, ask the platform what
// character Windows-1252 means by it, then invert that into char -> byte.
//
// The five undefined byte slots (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to nothing
// and are left out; a run containing one of those cannot be repaired and will
// correctly fail its U+FFFD check.
const CP1252_TO_BYTE = new Map();
{
  const dec = new TextDecoder('windows-1252', { fatal: false });
  for (let b = 0; b <= 0xff; b++) {
    const ch = dec.decode(Uint8Array.of(b));
    if (ch.length !== 1) continue;          // undefined slot
    if (ch === '\uFFFD') continue;
    if (!CP1252_TO_BYTE.has(ch)) CP1252_TO_BYTE.set(ch, b);
  }
}

// Bytes for a run, or null if any character is outside cp1252.
function toCp1252Bytes(s) {
  const out = [];
  for (const ch of s) {
    const b = CP1252_TO_BYTE.get(ch);
    if (b === undefined) return null;
    out.push(b);
  }
  return Buffer.from(out);
}

// One reverse pass over a single run.
function repairOnce(s) {
  const bytes = toCp1252Bytes(s);
  if (!bytes) return null;
  const out = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (out.includes('\uFFFD')) return null;  // decoder had to invent a char
  if (hasMojibake(out)) return null;        // problem just moved
  return out;
}

// Repair a whole line, iterating because the obfuscator's string was encoded
// more than once. Every pass must strictly reduce the run count, so a text that
// is merely UNLIKELY to be mojibake is left alone rather than churned.
//
// Returns { text, passes } or null if no strict improvement is possible.
function repairText(s) {
  let cur = s;
  let passes = 0;
  for (let i = 0; i < 4; i++) {
    const runs = cur.match(RUN) || [];
    if (!runs.length) break;
    let improved = false;
    const next = runs.reduce((acc, m) => {
      const r = repairOnce(m);
      if (r === null || countRuns(r) >= countRuns(m)) return acc;
      improved = true;
      return acc.replace(m, r);
    }, cur);
    if (!improved) return null;
    if (countRuns(next) >= countRuns(cur)) return null;
    cur = next;
    passes++;
  }
  if (passes === 0) return null;
  return { text: cur, passes };
}

const files = [];
(function walk(dir, depth) {
  if (depth > 2) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1); continue; }
    if (e.isFile() && EXT.test(e.name)) files.push(path.join(dir, e.name));
  }
})('.', 0);

console.log(FIX
  ? 'REPAIRING double-encoded UTF-8. Anything that does not provably round-trip is left alone.\n'
  : 'SCANNING for double-encoded UTF-8 (report only - pass --fix to repair).\n');

let totalRuns = 0, totalFixed = 0, totalSkipped = 0, touched = 0;

for (const p of files) {
  const before = fs.readFileSync(p, 'utf8');
  if (!hasMojibake(before)) continue;

  const lines = before.split('\n');
  const report = [];
  const rebuilt = lines.slice();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!hasMojibake(line)) continue;

    const n = countRuns(line);
    const r = repairText(line);
    if (!r || countRuns(r.text) >= n) {
      totalSkipped++;
      report.push({ line: i + 1, before: line.trim().slice(0, 100), after: null });
      continue;
    }
    rebuilt[i] = r.text;
    totalFixed += n - countRuns(r.text);
    totalRuns += n;
    report.push({ line: i + 1, before: line.trim().slice(0, 100), after: r.text.trim().slice(0, 100), n, m: countRuns(r.text), passes: r.passes });
  }

  if (!report.length) continue;
  touched++;
  console.log(p);
  for (const rr of report) {
    if (rr.after === null) {
      console.log('   line ' + rr.line + '   SKIPPED - repair did not improve it');
      console.log('      ' + rr.before);
    } else {
      console.log('   line ' + rr.line + '   ' + rr.n + ' -> ' + rr.m + (rr.passes > 1 ? '  (' + rr.passes + ' passes)' : ''));
      console.log('      - ' + rr.before);
      console.log('      + ' + rr.after);
    }
  }
  console.log('');

  if (FIX) fs.writeFileSync(p, rebuilt.join('\n'));
}

console.log('='.repeat(72));
if (!touched) {
  console.log('CLEAN - no double-encoded UTF-8 in any source file');
  process.exit(0);
}

if (FIX) {
  console.log('REPAIRED ' + totalFixed + ' run(s) across ' + touched + ' file(s)' +
    (totalSkipped ? ', ' + totalSkipped + ' left alone' : ''));
  console.log('='.repeat(72));
  console.log('');
  console.log('Now run:  npm test');
  console.log('');
  console.log('Expect the obfuscator output to CHANGE. A string literal in');
  console.log('custom-obfuscator.js was emitting mojibake into every generated');
  console.log('script, so the fix alters real bytes. Any test asserting on the old');
  console.log('bytes is asserting on corrupted text and its expectation is what');
  console.log('needs correcting - not the repair.');
  // A rescan is the only proof the repair converged, and it is cheap. Leaving
  // this unverified would mean the tool could report success while runs remain.
  process.exit(countRemaining() === 0 ? 0 : 1);
}

// Report mode exits non-zero so this can be a test, not just a diagnostic.
// A tool that finds corruption and still exits 0 is a tool nobody runs.
console.log('FOUND ' + totalRuns + ' repairable run(s) in ' + touched + ' file(s)');
console.log('='.repeat(72));
console.log('');
console.log('Repair with:  node tools/find_mojibake.mjs --fix');
process.exit(1);

// Re-count from disk rather than trusting the counters above: after a fix the
// only authority is what is actually in the files.
function countRemaining() {
  let n = 0;
  for (const p of files) {
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
    if (hasMojibake(text)) n++;
  }
  return n;
}
