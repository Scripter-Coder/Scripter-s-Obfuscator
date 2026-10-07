// Does SECURE-ultra on a TINY source produce invalid Lua, and is that pre-existing?
//
// tools/size_budget_test.mjs flagged it, and the output SIZE varied run to run
// (669 KB then 1074 KB) with validity flipping - the obfuscator picks random keys and
// decoy layouts, so this is either a genuine intermittent defect or noise. Both
// possibilities need answering, because "intermittent invalid output" is a shipping
// bug regardless of which setting produced it.
//
// Trials a tiny source at SECURE-ultra many times and reports how many are unparseable.
//
// Run: node tools/tiny_ultra_flaw.mjs [trials]

import luaparse from 'luaparse';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

const TRIALS = Number(process.argv[2] || 10);

function makeLua(lines) {
  const out = ['local Players = game:GetService("Players")', 'local CF = {}', 'local cache = {}'];
  for (let i = 0; i < lines; i++) {
    out.push(
      'function CF.step' + i + '(a, b, c)' +
      ' local t = (a or 0) + (b or 1) * ' + (i % 97 + 1) + ' + (c or 2)' +
      ' local s = string.format("%s-%s", tostring(t), "n' + i + '")' +
      ' cache[' + i + '] = s return t, s');
  }
  out.push('return CF');
  return out.join('\n');
}

const src = makeLua(13);
console.log('');
console.log('  source: ' + src.length + ' bytes, ' + src.split('\n').length + ' lines');
console.log('  SECURE ultra, ' + TRIALS + ' trials');
console.log('');

let bad = 0;
const sizes = [];
for (let t = 0; t < TRIALS; t++) {
  let code = '';
  try {
    const r = applyCustomObfuscator(src, {
      profile: 'SECURE', ultra: true, antiTamper: true, antiSkid: false, antiLogger: false,
    });
    code = typeof r === 'string' ? r : (r && r.code) || '';
  } catch (e) {
    console.log('  trial ' + (t + 1) + ': THREW ' + String(e.message).slice(0, 50));
    bad++;
    continue;
  }
  const kb = code.length / 1024;
  sizes.push(kb);
  let ok = false, msg = '';
  try { luaparse.parse(code, { luaVersion: '5.1' }); ok = true; }
  catch (e) { msg = e.message.slice(0, 50); }
  if (!ok) bad++;
  console.log('  trial ' + String(t + 1).padStart(2) + ': ' + kb.toFixed(0).padStart(6) + ' KB  ' +
    (ok ? 'valid' : 'INVALID - ' + msg));
}

console.log('');
if (sizes.length) {
  console.log('  output size: min ' + Math.min(...sizes).toFixed(0) + ' KB, max ' +
    Math.max(...sizes).toFixed(0) + ' KB  (random keys/decoys, so this spread is expected)');
}
console.log('  invalid Lua: ' + bad + '/' + TRIALS + ' trials');
console.log('');
console.log(bad === 0
  ? '  VERDICT: every trial parsed.'
  : '  VERDICT: INTERMITTENT invalid output at SECURE-ultra on a tiny source. This is a' + '\n' +
    '  real defect and it is independent of the size budget - the budget only reduces');
console.log(bad === 0 ? '' :
  '  intensity, it does not generate the bad output. Re-run with the budget reverted to');
console.log(bad === 0 ? '' : '  confirm.');
console.log('');