// How does obfuscated SIZE scale with SOURCE size and intensity?
//
// The clamp in custom-obfuscator.js bounds LAYER COUNT and nothing else. Every layer
// costs roughly a constant factor of the SOURCE, so the same intensity that is free on
// fifty lines is ruinous on ten thousand - and the executor pays for the output, not for
// the layer count.
//
// Measured on the owner's machine: a 0.26 MB artifact runs in ~4.5 s, a 3.2 MB artifact
// takes ~52 s and freezes the Roblox client at 0 fps. So the budget that matters is
// OUTPUT BYTES.
//
// This generates representative Lua of several sizes, obfuscates each under every
// profile, and prints the multiplier. The point is to choose the clamp from data rather
// than from a plausible-looking constant.
//
// Run: node tools/profile_size_budget.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { applyCustomObfuscator } from '../custom-obfuscator.js';

// Representative source: plain business-ish Lua, no syntax the validator rejects, so the
// only variable is SIZE.
function makeLua(lines) {
  const out = ['local Players = game:GetService("Players")', 'local RunService = game:GetService("RunService")',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")', 'local CF = {}', 'local cache = {}'];
  for (let i = 0; i < lines; i++) {
    out.push(
      `function CF.step${i}(a, b, c)` +
      ` local t = (a or 0) + (b or 1) * ${i % 97 + 1} + (c or 2)` +
      ` local s = string.format("%s-%s-%s", tostring(t), tostring(${i}), "n${i}")` +
      ` cache[${i}] = s` +
      ` if t % ${(i % 7) + 2} == 0 then t = t + math.floor(t / 3) end` +
      ` return t, s, cache[${i}]`);
  }
  out.push('return CF');
  return out.join('\n');
}

const SIZES = [200, 1000, 3000, 6000, 10000];
const CONFIGS = [
  ['FAST', { profile: 'FAST' }],
  ['BALANCED', { profile: 'BALANCED' }],
  ['BALANCED int10', { profile: 'BALANCED', intensity: 10 }],
  ['SECURE', { profile: 'SECURE' }],
  ['SECURE ultra', { profile: 'SECURE', ultra: true }],
];

console.log('');
console.log('  output size in KB, by source lines x profile');
console.log('');
const hdr = '  lines'.padEnd(8) + CONFIGS.map(c => c[0].padStart(15)).join('');
console.log(hdr);
console.log('  ' + '-'.repeat(hdr.length - 2));

const table = [];
for (const lines of SIZES) {
  const src = makeLua(lines);
  const row = { lines, srcKB: src.length / 1024 };
  for (const [label, cfg] of CONFIGS) {
    try {
      const t0 = Date.now();
      const res = applyCustomObfuscator(src, Object.assign({
        antiTamper: true, antiSkid: false, antiLogger: false,
      }, cfg));
      const code = typeof res === 'string' ? res : (res && res.code) || '';
      row[label] = { kb: code.length / 1024, ms: Date.now() - t0 };
    } catch (e) {
      row[label] = { kb: NaN, ms: 0, err: String(e.message || e).slice(0, 40) };
    }
  }
  table.push(row);
  console.log('  ' + String(lines).padEnd(8) +
    CONFIGS.map(c => {
      const v = row[c[0]];
      return (isNaN(v.kb) ? 'ERR' : v.kb.toFixed(0) + ' KB').padStart(15);
    }).join(''));
}

console.log('');
console.log('  multiplier vs source (output KB / source KB):');
console.log('  ' + 'lines'.padEnd(8) + CONFIGS.map(c => c[0].padStart(15)).join(''));
for (const row of table) {
  console.log('  ' + String(row.lines).padEnd(8) +
    CONFIGS.map(c => {
      const v = row[c[0]];
      return (isNaN(v.kb) ? '-' : (v.kb / row.srcKB).toFixed(1) + 'x').padStart(15);
    }).join(''));
}

console.log('');
console.log('  obfuscate time (ms):');
console.log('  ' + 'lines'.padEnd(8) + CONFIGS.map(c => c[0].padStart(15)).join(''));
for (const row of table) {
  console.log('  ' + String(row.lines).padEnd(8) +
    CONFIGS.map(c => String(row[c[0]].ms).padStart(15)).join(''));
}
console.log('');

// What actually matters: will the executor survive it? Empirically 0.26 MB runs in
// ~4.5 s and 3.2 MB takes ~52 s and freezes the client.
const BUDGET_KB = 700;
console.log('  a delivered artifact over ~' + BUDGET_KB + ' KB is where executors start dying.');
console.log('');
for (const row of table) {
  for (const [label] of CONFIGS) {
    const v = row[label];
    if (!isNaN(v.kb) && v.kb > BUDGET_KB) {
      console.log('    ' + String(row.lines).padStart(6) + ' lines, ' + label.padEnd(15) +
        ' -> ' + v.kb.toFixed(0) + ' KB   OVER BUDGET');
    }
  }
}
console.log('');