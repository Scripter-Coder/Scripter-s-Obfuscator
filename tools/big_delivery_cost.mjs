// Why does a 3.4 MB delivered script make an executor lag, then die?
//
// Reported: Delta executor, lag spikes, crash about 10 seconds in. The loader
// hands the executor one giant string and calls loadstring on it, so the cost lands
// entirely in the executor's compiler and heap. This measures that cost instead of
// guessing at it, and compares the delivered artifact against a small one.
//
// fengari is not Delta - it is a slower, more memory-hungry Lua 5.3 in JS - so treat
// the numbers as an UPPER BOUND. If it is slow here, it is worse there.
//
// Run: node tools/big_delivery_cost.mjs <worker> <big-id> <small-id>

const W = (process.argv[2] || 'https://scripterhub-stats.dubovikstanislav51.workers.dev').replace(/\/+$/, '');
const UA = 'Roblox/570 Delta Executor';

async function fetchArtifact(id) {
  const s = await fetch(`${W}/sh/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ id, k: '', h: 'HW' }),
  });
  const p = (await s.text()).trim().split(/\s+/);
  if (p[0] !== 'SHS') throw new Error('no session for ' + id + ': ' + p.join(' '));
  const d = await fetch(`${W}/sh/a/${id}?s=${p[1]}&n=${p[2]}`, { headers: { 'User-Agent': UA } });
  const body = await d.text();
  if (body.startsWith('SHERR ')) throw new Error('refused: ' + body.trim());
  return body.slice(4); // strip the SHL\n header
}

function compileIn(src, label) {
  const t0 = Date.now();
  const before = process.memoryUsage().heapUsed;
  const fn = new Function(src);           // parse + compile, do NOT run
  const ms = Date.now() - t0;
  const grew = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
  console.log(`  ${label}`);
  console.log(`     source        ${(src.length / 1048576).toFixed(2)} MB`);
  console.log(`     compile       ${ms} ms`);
  console.log(`     heap growth   ~${grew.toFixed(1)} MB`);
  console.log(`     compiled fn   ${typeof fn === 'function' ? 'yes' : 'NO'}`);
  return { ms, mb: src.length / 1048576, heap: grew };
}

const results = [];
for (const [label, id] of [['SMALL script', process.argv[4]], ['BIG script', process.argv[3]]]) {
  if (!id) continue;
  console.log('\n' + label + '  (' + id + ')');
  try {
    const src = await fetchArtifact(id);
    results.push({ label, ...compileIn(src, '') });
  } catch (e) {
    console.log('  could not fetch: ' + e.message);
  }
}

if (results.length === 2) {
  const [small, big] = results;
  console.log('\n' + '='.repeat(62));
  console.log(`  the big script is ${(big.mb / small.mb).toFixed(1)}x larger and ` +
    `costs ${(big.ms / Math.max(1, small.ms)).toFixed(1)}x the compile time`);
  console.log('='.repeat(62));
}
process.exit(0);