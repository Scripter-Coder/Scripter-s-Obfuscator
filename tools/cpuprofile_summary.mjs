// Summarise a V8 .cpuprofile: which functions actually cost the time.
//
// A total is useless here. "55 seconds" does not tell you whether to change an
// obfuscation profile or fix a hot loop, and guessing at that is how a performance
// problem stays a performance problem. This aggregates self-time per function so the
// answer is a name.
//
// Run: node tools/cpuprofile_summary.mjs <file.cpuprofile>

import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/cpuprofile_summary.mjs <file.cpuprofile>'); process.exit(2); }

const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map();
for (const n of prof.nodes) byId.set(n.id, n);

// self time per node from the sample stream
const self = new Map();
let total = 0;
const dt = prof.timeDeltas || [];
const samples = prof.samples || [];
for (let i = 0; i < samples.length; i++) {
  const d = dt[i] || 0;
  total += d;
  self.set(samples[i], (self.get(samples[i]) || 0) + d);
}

// aggregate by function identity
const agg = new Map();
for (const [id, us] of self) {
  const n = byId.get(id);
  if (!n) continue;
  const f = n.callFrame;
  const url = (f.url || '').split(/[\\/]/).pop() || '(native)';
  const key = (f.functionName || '(anonymous)') + '  @' + url + ':' + (f.lineNumber + 1);
  agg.set(key, (agg.get(key) || 0) + us);
}

const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
console.log('');
console.log('  total sampled: ' + (total / 1e6).toFixed(2) + ' s');
console.log('');
console.log('  self time    function');
console.log('  ' + '-'.repeat(72));
for (const [k, us] of rows) {
  const pct = (us / total) * 100;
  console.log('  ' + (us / 1e6).toFixed(2).padStart(7) + ' s  ' + pct.toFixed(1).padStart(5) + '%  ' + k);
}
console.log('');

// Roll the Lua interpreter up as one line - it is almost always the answer, and
// listing its hundreds of internal frames tells you nothing actionable.
let luaUs = 0;
for (const [id, us] of self) {
  const n = byId.get(id);
  const url = (n && n.callFrame.url) || '';
  if (/fengari|lua/.test(url)) luaUs += us;
}
if (luaUs) {
  console.log('  ---');
  console.log('  ' + (luaUs / 1e6).toFixed(2) + ' s (' + ((luaUs / total) * 100).toFixed(1) +
    '%) is inside fengari, i.e. executing the artifact\'s own Lua.');
  console.log('  That is the obfuscated script unpacking itself. It is not a');
  console.log('  delivery cost and not a storage cost - it is the script itself.');
  console.log('');
}