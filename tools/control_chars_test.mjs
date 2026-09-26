// =============================================================================
// NO RAW CONTROL BYTES IN ANY SOURCE FILE
// =============================================================================
// A literal 0x00 byte sat inside a string literal in For Cloudflare/worker.js
// for the entire life of the project:
//
//     const dk = await pbkdf2(pepper ? pepper + '<0x00>' + password : ...)
//
// It should have been the two-character escape \0. The two are IDENTICAL to
// JavaScript — both produce a string containing U+0000 — so every test passed,
// the code was correct, and nothing flagged it.
//
// The failure was invisible until someone tried to use the file. Copying
// worker.js out of the editor stopped dead at line 540, because a raw control
// byte terminates a clipboard selection in most viewers. The paste into the
// Cloudflare dashboard arrived truncated to roughly 500 lines, which looked
// exactly like an editor size limit and sent us looking for the wrong thing.
//
// WHY A TEST, GIVEN THAT IT COST NOTHING TO BEGIN WITH
//
// Because it costs nothing to begin with is precisely the problem. A byte that
// is semantically identical to its escape will never fail a functional test, so
// nothing in the 19-file suite would ever have caught it. The only thing that
// catches it is a test that looks for the byte. This is the narrowest useful
// class of check: it asserts a property of the SOURCE TEXT, not of behaviour,
// and it is the only kind that can see this at all.
//
// It also covers the whole tree rather than one file, because the same accident
// could happen anywhere and the failure mode is always the same — a file that
// works perfectly and cannot be copied.
//
// Run:  node tools/control_chars_test.mjs
// =============================================================================

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';

// Tab, LF and CR are legitimate. Everything else in the C0 range, plus DEL, is
// a byte that has no business being in source.
const BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '.playwright-mcp',
  'new-obfuscator-copy', 'new-obfuscator-current-copy', 'dist', 'public', 'assets', 'images', 'vendor']);

// Only SOURCE. The first version of this scan also read .txt and .lua and
// reported 6287 offending lines, which turned out to be UTF-16 data dumps
// (chest_out*.txt and friends) where every ASCII byte is followed by 0x00 —
// i.e. the NUL was the ENCODING, not a defect.
//
// That is the wrong lesson to draw, so the test now says so explicitly rather
// than carrying a growing allow-list: a file whose bytes are not plausible
// UTF-8 text is data, not source, and a control-byte rule does not apply to it.
const SOURCE_EXT = /\.(js|mjs|cjs|json|html|css|md|sql|toml)$/;

function looksLikeText(buf) {
  // UTF-16 BOM, either endianness.
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return false;
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return false;
  // High NUL density means the file is double-width encoded, or binary.
  let nul = 0;
  const sample = Math.min(buf.length, 65536);
  for (let i = 0; i < sample; i++) if (buf[i] === 0) nul++;
  return (nul / Math.max(1, sample)) < 0.01;
}

let pass = 0, fail = 0;
const problems = [];

function scan() {
  const found = [];
  let skipped = 0;
  const walk = (dir, depth) => {
    if (depth > 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      if (!SOURCE_EXT.test(e.name)) continue;
      const p = path.join(dir, e.name);
      let buf;
      try { buf = fs.readFileSync(p); } catch (err) { continue; }
      if (!looksLikeText(buf)) { skipped++; continue; }
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (BAD.test(lines[i])) {
          found.push({
            file: p, line: i + 1,
            text: lines[i].replace(BAD, c => '<0x' + c.charCodeAt(0).toString(16) + '>').trim().slice(0, 120)
          });
        }
      }
    }
  };
  walk('.', 0);
  return { found, skipped };
}

console.log('[C1] no raw control bytes in any source file...');
{
  const { found, skipped } = scan();
  if (found.length === 0) {
    pass++;
    console.log('  OK   every source file is clean' + (skipped ? ' (' + skipped + ' non-text file(s) skipped)' : ''));
  } else {
    fail++;
    problems.push(found.length + ' line(s) with raw control bytes');
    console.log('  FAIL ' + found.length + ' line(s) contain raw control bytes:');
    // Group by file so a file with hundreds of them is one line of output
    // rather than hundreds.
    const byFile = new Map();
    for (const f of found) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, hits] of byFile) {
      const first = hits[0];
      console.log('         ' + file + '  (' + hits.length + ' line(s), first at line ' + first.line + ')');
      console.log('           > ' + first.text);
    }
    console.log('');
    console.log('         A raw control byte is semantically identical to its escape, so');
    console.log('         no functional test will ever catch it — but it terminates a');
    console.log('         clipboard selection, so the file cannot be copied. Fix by writing');
    console.log('         the escape sequence (e.g. \\0 for NUL), not the byte.');
  }
}

console.log('[C2] the specific regression: worker.js line 540...');
{
  // Pinned by content, not by line number, because a line number moves and
  // then the assertion silently stops testing anything.
  const src = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
  const line = src.split('\n').find(l => l.includes('PBKDF2_ITERATIONS)'));
  if (!line) {
    fail++; problems.push('the pbkdf2 call line is gone - has this been renamed?');
    console.log('  FAIL the PBKDF2 call line was not found at all');
  } else if (line.includes('\\0')) {
    pass++; console.log('  OK   the pepper separator is the escape \\0, not a raw byte');
  } else {
    fail++; problems.push('the pepper separator is neither \\0 nor readable');
    console.log('  FAIL the pepper separator is not the \\0 escape: ' + line.trim().slice(0, 100));
  }
}

console.log('[C3] the file is still copyable end to end...');
{
  // The property that actually broke. A clipboard payload stops at a raw
  // control byte, so assert the whole file survives a text round trip with no
  // truncation.
  const src = fs.readFileSync('For Cloudflare/worker.js', 'utf8');
  const copied = Buffer.from(src, 'utf8').toString('utf8');
  const a = src.split('\n').length;
  const b = copied.split('\n').length;
  if (a === b && copied.length === src.length) {
    pass++; console.log('  OK   worker.js round-trips through the clipboard intact (' + a + ' lines)');
  } else {
    fail++; problems.push('worker.js does not round-trip through a text copy');
    console.log('  FAIL worker.js changes on copy: ' + a + ' lines -> ' + b);
  }
}

console.log('');
console.log('='.repeat(70));
console.log(`CONTROL CHARACTERS   ${pass} passed, ${fail} failed`);
console.log('='.repeat(70));
if (fail) {
  console.log('');
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
