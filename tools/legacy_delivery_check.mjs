// Does a LEGACY KV script still deliver now that the keeper is configured?
//
// This is the question the "will old scripts still work" report turns on. The delivery
// path prefers the PC whenever SH_STORE_URL is bound, so the question is whether it
// FALLS BACK to KV for a script the PC has never heard of - or refuses, which would mean
// switching storage silently broke every script published before the move.
//
// Run: node tools/legacy_delivery_check.mjs <worker-url> <id> [<id> ...]

const W = String(process.argv[2] || 'https://scripterhub-stats.dubovikstanislav51.workers.dev').replace(/\/+$/, '');
const IDS = process.argv.slice(3);
const UA = 'Roblox/570 Delta Executor';

if (!IDS.length) { console.error('usage: node tools/legacy_delivery_check.mjs <worker> <id> [...]'); process.exit(2); }

for (const id of IDS) {
  process.stdout.write('\n=== ' + id + ' ===\n');
  try {
    // 1. the bootstrap a user would receive
    const boot = await fetch(`${W}/sh/${id}`, { headers: { 'User-Agent': UA } });
    const bootBody = await boot.text();
    const bootOk = boot.status === 200 && bootBody.startsWith('--[[ ScripterHub session loader');
    console.log(`  bootstrap   HTTP ${boot.status} ${bootBody.length}b ${bootOk ? 'LOADER' : '<' + bootBody.slice(0, 40).replace(/\n/g, ' ') + '>'}`);

    // 2. a session
    const sres = await fetch(`${W}/sh/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ id, k: '', h: 'HW' }),
    });
    const stext = (await sres.text()).trim();
    const parts = stext.split(/\s+/);
    if (parts[0] !== 'SHS') {
      console.log(`  session     REFUSED: ${stext.slice(0, 80)}`);
      continue;
    }
    console.log('  session     granted');

    // 3. delivery
    const dres = await fetch(`${W}/sh/a/${id}?s=${parts[1]}&n=${parts[2]}`, { headers: { 'User-Agent': UA } });
    const dbody = await dres.text();
    if (dbody.startsWith('SHERR ')) {
      console.log(`  delivery    REFUSED ${dbody.trim()}  (HTTP ${dres.status})`);
    } else if (dbody.startsWith('SHL\n')) {
      console.log(`  delivery    OK, keyless, ${dbody.length - 4} artifact bytes`);
    } else if (dbody.startsWith('SHK\n')) {
      console.log(`  delivery    OK, keyed, ${dbody.length} bytes`);
    } else if (dbody.startsWith('SHG ')) {
      console.log(`  delivery    OK, chain: ${dbody.split('\n')[0]}`);
    } else {
      console.log(`  delivery    HTTP ${dres.status}, ${dbody.length}b, starts: ${JSON.stringify(dbody.slice(0, 60))}`);
    }
  } catch (e) {
    console.log('  ERROR ' + e.message);
  }
}
process.exit(0);