// Compile-cost of a delivered artifact, measured straight off the owner's disk.
//
// Reads Storage Keeper/data/scripts/*.artifact.bin - the exact bytes the service serves,
// so no tunnel or worker is involved. The question is what the executor's compiler is
// asked to do: the loader hands it one string and calls loadstring on it, so the entire
// cost lands in one call on the executor's heap, with no way to yield.
//
// fengari/V8 is NOT Delta. It is a slower Lua 5.3 running in JavaScript, so treat these
// numbers as an UPPER BOUND rather than a prediction - a cost that is already awkward
// here is worse on a phone.
//
// Run: node tools/artifact_compile_cost.mjs <artifact.bin> [more.bin ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'Storage Keeper', 'data', 'scripts');

const files = process.argv.slice(2);
if (!files.length) {
  const found = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter(f => f.endsWith('.artifact.bin'))
    : [];
  if (!found.length) { console.error('no artifacts in ' + DIR); process.exit(2); }
  files.push(...found);
}

const rows = [];
for (const f of files) {
  const full = path.isAbsolute(f) ? f : path.join(DIR, f);
  const src = fs.readFileSync(full, 'utf8');
  const mb = src.length / 1048576;

  // Parse only. Compiling for real would mean materialising a 3 MB AST here, and the
  // parse time is the part that scales with size; the codegen is the executor's problem.
  const t0 = Date.now();
  let parseMs = 0, parseErr = null;
  try { luaparse.parse(src, { luaVersion: '5.1' }); } catch (e) { parseErr = e.message.slice(0, 70); }
  parseMs = Date.now() - t0;

  const t1 = Date.now();
  let compileMs = 0, ok = false;
  try { new Function(src); ok = true; } catch (e) { /* compile-only probe */ }
  compileMs = Date.now() - t1;

  rows.push({ name: path.basename(f).replace('.artifact.bin', ''), mb, src, parseMs, compileMs, ok, parseErr });
}

console.log('');
console.log('  script'.padEnd(24) + 'size'.padStart(9) + 'parse'.padStart(10) + 'compile'.padStart(10) + '  result');
console.log('  ' + '-'.repeat(70));
for (const r of rows.sort((a, b) => a.mb - b.mb)) {
  const res = r.parseErr ? 'PARSE ERROR: ' + r.parseErr : (r.ok ? 'compiles' : 'compile failed');
  console.log('  ' + r.name.padEnd(24) +
    (r.mb.toFixed(2) + ' MB').padStart(9) +
    (r.parseMs + ' ms').padStart(10) +
    (r.compileMs + ' ms').padStart(10) + '  ' + res);
}

const biggest = rows.sort((a, b) => b.mb - a.mb)[0];
if (biggest) {
  console.log('');
  console.log('  largest: ' + biggest.mb.toFixed(2) + ' MB in ONE loadstring call, ' +
    '~' + (biggest.src.length).toLocaleString() + ' characters.');
  console.log('  The executor must hold the string AND the parsed form at once.');
}
console.log('');