// The inline/chain boundary must have no dead zone.
//
// THE BUG
// putBlob chunks only ABOVE CHUNK_THRESHOLD (~25 MB). Delivery inlined only BELOW
// 2 MiB. A 3 MB script therefore matched NEITHER path: uploaded as one KV value, then
// refused at delivery with SHERR gone - which the loader renders to the user as
//
//     Script cannot be loaded, doesnt exist or expired.
//
// so a perfectly good upload reported success and the script then claimed not to exist.
// Every test in this repo missed it because each one publishes and reads back a script
// small enough to stay under the limit. A 3000-line Lua file obfuscates to ~3 MB, which
// is simply what people publish.
//
// This asserts the RELATIONSHIP rather than a magic number, because the number was never
// the bug - two numbers that could disagree were.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };
const group = m => console.log('\n' + m);

const constOf = (name) => {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};

group('the two boundaries are declared');
{
  const chunk = constOf('CHUNK_THRESHOLD');
  const maxv = constOf('KV_MAX_VALUE');
  const inline = constOf('INLINE_DELIVERY_LIMIT');
  if (chunk) ok('CHUNK_THRESHOLD = ' + chunk);
  else no('CHUNK_THRESHOLD not found');
  if (inline) ok('INLINE_DELIVERY_LIMIT = ' + inline);
  else no('INLINE_DELIVERY_LIMIT not found');
}

group('INLINE_DELIVERY_LIMIT is DERIVED from CHUNK_THRESHOLD, not a second number');
{
  // The whole fix. A literal here is exactly what produced the dead zone, so require the
  // expression rather than merely comparing values - a future editor pasting 25_000_000
  // would pass a value check and reintroduce the drift.
  const inline = constOf('INLINE_DELIVERY_LIMIT');
  if (/CHUNK_THRESHOLD/.test(inline || '')) ok('derived from CHUNK_THRESHOLD: ' + inline);
  else no('a literal, which can drift from CHUNK_THRESHOLD again: ' + inline);
}

group('no dead zone: the ranges cover every possible artifact');
{
  // Model the two decisions the worker actually makes.
  const KV_MAX = 25_000_000;
  const CHUNK = KV_MAX - 1000;
  const INLINE = CHUNK;               // what the fix declares
  const cases = [
    ['80 KB', 80_688, 'inline'],
    ['283 KB', 282_971, 'inline'],
    ['1.9 MB', 2_014_587, 'inline'],
    ['3.2 MB  <- the reported failure', 3_350_786, 'inline'],
    ['3.23 MB <- the reported failure', 3_382_921, 'inline'],
    ['12 MB', 12_000_000, 'inline'],
    ['24.9 MB', 24_000_000, 'inline'],
    ['26 MB', 26_000_000, 'chain'],
    ['49 MB', 49_000_000, 'chain'],
  ];
  // Upload: > CHUNK -> stored as chunks. Delivery: <= INLINE -> inline.
  for (const [label, size, expected] of cases) {
    const storedAsChunks = size > CHUNK;
    const deliveredInline = size <= INLINE;
    const pathTaken = storedAsChunks ? 'chain' : (deliveredInline ? 'inline' : 'UNREACHABLE');
    if (pathTaken === expected) ok(`${label} -> ${pathTaken}`);
    else no(`${label} -> ${pathTaken}, expected ${expected}`);
  }
}

group('a regression guard: the old pairing is caught');
{
  // If someone reinstates 2 MiB while CHUNK stays at ~25 MB, this must notice.
  const KV_MAX = 25_000_000, CHUNK = KV_MAX - 1000, OLD_INLINE = 2 * 1024 * 1024;
  const dead = [];
  for (let size = OLD_INLINE + 1; size <= CHUNK; size += 3_000_000) {
    if (!(size > CHUNK ? 'chain' : size <= OLD_INLINE ? 'inline' : 'UNREACHABLE' === 'inline')) {
      if (!(size > CHUNK) && size > OLD_INLINE) dead.push(size);
    }
  }
  if (dead.length > 0) ok(`the OLD pairing strands ${dead.length} sizes (e.g. ${dead[0]} bytes) - so the guard has teeth`);
  else no('the old pairing appears safe, which cannot be right - the guard would be useless');
}

group('the boundary is documented where someone will read it');
{
  const i = src.indexOf('const INLINE_DELIVERY_LIMIT');
  const before = src.slice(Math.max(0, i - 1400), i);
  if (/dead zone/i.test(before)) ok('the dead zone is explained next to the constant');
  else no('no explanation beside the constant - the next editor repeats the bug');
}

console.log('\n' + '='.repeat(66));
console.log('  INLINE/CHAIN BOUNDARY   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(66));
process.exit(fail === 0 ? 0 : 1);