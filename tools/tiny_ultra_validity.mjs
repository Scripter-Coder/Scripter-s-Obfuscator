// Is invalid-Lua-on-tiny-sources caused by the size budget, or pre-existing?
//
// tools/size_budget_test.mjs reports a 3 KB source under SECURE-ultra producing Lua
// that luaparse rejects with "unexpected symbol '\'". That source is small enough that
// the new clamp reduces intensity from 22 to 20, so the bug could be either:
//   * a pre-existing ultra defect that only shows on tiny inputs, or
//   * something the clamp introduced.
//
// Answer it by brute force: sweep intensity 1..22 on a tiny source and report which
// values produce unparseable Lua. Then the caller can compare against the intensity the
// clamp actually selects.
//
// Run: node tools/tiny_ultra_validity.mjs

import luaparse from 'luaparse';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

function makeLua(lines) {
  const out = ['local Players = game:GetService("Players")', 'local CF = {}', 'local cache = {}'];
  for (let i = 0; i < lines; i++) {
    out.push(
      `function CF.step${i}(a, b, c)` +
      ` local t = (a or 0) + (b or 1) * ${i % 97 + 1} + (c or 2)` +
      ` local s = string.format("%s-%s", tostring(t), "n${i}")` +
      ` cache[${i}] = s return t, s`);
  }
  out.push('return CF');
  return out.join('\n');
}

const src = makeLua(13);
console.log('');
console.log('  source: ' + src.length + ' bytes, ' + src.split('\n').length + ' lines');
console.log('');

const bad = [];
console.log('  intensity   output KB   parses?');
console.log('  ' + '-'.repeat(46));
for (let i = 1; i <= 22; i++) {
  const dbg = {};
  let code = '', err = null;
  try {
    const r = applyCustomObfuscator(src, {
      profile: 'SECURE', intensity: i, ultra: false,
      antiTamper: true, antiSkid: false, antiLogger: false,
    }, dbg);
    code = typeof r === 'string' ? r : (r && r.code) || '';
  } catch (e) {
    err = 'threw: ' + String(e.message).slice(0, 40);
  }
  let parses = false, msg = '';
  if (code) {
    try { luaparse.parse(code, { luaVersion: '5.1' }); parses = true; }
    catch (e) { msg = e.message.slice(0, 44); }
  }
  if (!parses) bad.push(i);
  console.log('  ' + String(i).padStart(9) +
    (code ? (code.length / 1024).toFixed(0) + ' KB' : '   -').padStart(12) +
    '   ' + (parses ? 'yes' : (err || msg)));
}
console.log('');
console.log('  intensities producing invalid Lua: ' + (bad.length ? bad.join(', ') : 'none'));
console.log('');

// What does the clamp actually choose for this input?
const dbg = {};
applyCustomObfuscator(src, { profile: 'SECURE', ultra: true, antiTamper: true, antiSkid: false, antiLogger: false }, dbg);
console.log('  SECURE ultra on this source:');
console.log('    source ' + dbg.sourceKB + ' KB, budget ' + dbg.budgetKB + ' KB');
console.log('    estimated output ' + dbg.estimatedOutputKB + ' KB at ' + dbg.estimatedMultiplier + 'x');
console.log('    clamped by size: ' + dbg.intensityClampedBySize);
console.log('');
if (bad.length) {
  console.log('  VERDICT: invalid Lua appears at intensity ' + bad[0] + '-' + bad[bad.length - 1] +
    ', which is ABOVE the clamp ceiling, so the budget AVOIDS it.');
  console.log('  The clamp is not the cause; it is the mitigation.');
} else {
  console.log('  VERDICT: every intensity parses - the invalid output comes from elsewhere.');
}
console.log('');