// The check whose absence caused the bug.
//
// tools/keyless_decision_test.mjs called shServerKeyOpts(true, id) and
// shServerKeyOpts(false, id) in isolation and passed. It never verified that
// `keyless` ARRIVES - that the caller populates the field the decision reads.
// It did not, on three of four call sites, so options.keyless was undefined,
// undefined is falsy, and every free publish took the PAID branch: a free
// script shipped with the /sh/k fetch baked in and died at runtime with
// "Key response too short" while silently doing nothing.
//
// Testing a pure function proves the function is pure. It says nothing about its
// input, and the input was the broken part.
//
// TWO BRACE-MATCHING TRAPS THIS FILE WALKS INTO, AND HOW IT AVOIDS THEM
//
// Both were live bugs in earlier versions of this check:
//
//   * SCANNING FORWARD FOR THE FIRST `{` IS WRONG. The call line usually ends
//     `.then(function(result) {`, so the first brace on it belongs to a
//     different statement. The options literal is found by walking the call's
//     own parentheses and accepting a `{` only at paren depth 1.
//
//   * COUNTING `{` AND `}` TO FIND A FUNCTION'S END IS WRONG when the body
//     contains braces inside strings and regular expressions. The previous
//     attempt counted a `\\{` in a regex as an opening brace and never
//     terminated.
//
// The third call style passes a VARIABLE (obfOptions) rather than a literal, so
// there is no brace on the call line at all; the absence of a depth-1 brace
// before the closing paren is the signal to resolve the identifier to its
// declaration.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const lines = src.split(/\r?\n/);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[KW] every obfuscateScriptCode call site passes `keyless` through');
console.log('-'.repeat(72));

// ---- shared scanning helpers -------------------------------------------

// index of the n-th line offset where an open brace begins a literal, skipping
// string contents and // comments
function braceMatch(fromLine, fromCol) {
  let d = 0;
  for (let k = fromLine; k < Math.min(lines.length, fromLine + 50); k++) {
    const code = lines[k].replace(/\/\/.*$/, '');
    for (let j = (k === fromLine ? fromCol : 0); j < code.length; j++) {
      const ch = code[j];
      if (ch === "'" || ch === '"') {
        const q = ch; j++;
        while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++; }
        continue;
      }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) return { start: fromLine, end: k }; }
    }
  }
  return null;
}

// find the options object of an obfuscateScriptCode(...) call
function optionsOf(callAt) {
  const line = lines[callAt];
  const marker = 'obfuscateScriptCode(';
  let i = line.indexOf(marker);
  if (i < 0) return null;
  i += marker.length;

  let paren = 1, braceCol = -1, ident = '';
  for (; i < line.length && paren > 0; i++) {
    const ch = line[i];
    if (ch === "'" || ch === '"') { const q = ch; i++; while (i < line.length && line[i] !== q) { if (line[i] === '\\') i++; i++; } continue; }
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '{' && paren === 1) { braceCol = i; break; }
    else if (ch === ',' && paren === 1) { ident = ''; }   // argument boundary
    else if (paren === 1 && /[A-Za-z_$0-9]/.test(ch)) ident += ch;
  }

  if (braceCol >= 0) {
    const m = braceMatch(callAt, braceCol);
    if (!m) return null;
    return { start: m.start, end: m.end, text: lines.slice(m.start, m.end + 1).join('\n') };
  }

  const name = ident.replace(/[^A-Za-z_$0-9]/g, '');
  if (!name) return null;
  const decl = lines.findIndex(l => new RegExp('\\b(?:var|let|const)\\s+' + name + '\\s*=\\s*\\{').test(l));
  if (decl < 0) return null;
  const m = braceMatch(decl, lines[decl].indexOf('{'));
  if (!m) return null;
  return { start: m.start, end: m.end, text: lines.slice(m.start, m.end + 1).join('\n'), via: name };
}

// ---- the check ---------------------------------------------------------

const calls = [];
lines.forEach((l, i) => {
  if (l.includes('obfuscateScriptCode(') && !/function\s+obfuscateScriptCode/.test(l)) calls.push(i);
});

if (calls.length === 0) {
  no('no obfuscateScriptCode call sites found');
  console.log('\nKEYLESS WIRING   0 passed, 1 failed');
  process.exit(1);
}
ok('found ' + calls.length + ' obfuscateScriptCode call site(s)');

let missing = 0;
for (const c of calls) {
  const blk = optionsOf(c);
  if (!blk) {
    no('line ' + (c + 1) + ': could not resolve the options object');
    missing++;
    continue;
  }
  if (/(^|[\s,{])keyless\s*:/.test(blk.text)) {
    ok('line ' + (c + 1) + ' passes keyless through' + (blk.via ? ' (via ' + blk.via + ')' : ''));
  } else {
    no('line ' + (c + 1) + ' does NOT pass keyless - options.keyless is undefined there' +
      (blk.via ? ' (via ' + blk.via + ')' : ''));
    missing++;
  }
}

// the consumer must read the field
if (/shServerKeyOpts\(\s*options\.keyless\s*,/.test(src)) {
  ok('obfuscateScriptCode reads options.keyless when deciding');
} else {
  no('the split-key decision no longer reads options.keyless');
}

// and record the sharp edge, so a reader knows why every site matters
if (/function shServerKeyOpts\(keyless, wantId\) \{\s*if \(keyless\) return \{\};/.test(src)) {
  console.log('  note: shServerKeyOpts treats a MISSING keyless as PAID, so an absent');
  console.log('        property silently ships a paid artifact for a free script.');
} else {
  no('shServerKeyOpts no longer has the expected shape');
}

console.log('-'.repeat(72));
console.log('KEYLESS WIRING   ' + pass + ' passed, ' + fail + ' failed');
if (fail || missing) process.exit(1);
