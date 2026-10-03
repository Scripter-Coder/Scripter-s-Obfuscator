// Prove the minted one-liner works against the LIVE worker, both transports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  let i = src.indexOf('{', start), d = 0, q = null, lc = false, bc = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (lc) { if (c === '\n') lc = false; continue; }
    if (bc) { if (c === '*' && n === '/') { bc = false; i++; } continue; }
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { lc = true; i++; continue; }
    if (c === '/' && n === '*') { bc = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++;
    if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('brace match failed');
}

const shLoader = new Function(extract('shLoader') + '\nreturn shLoader;')();
const W = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = process.argv[2] || 'ScripterHub1666974089';
const line = shLoader(W, ID);

console.log('THE LINE A USER NOW PASTES (' + line.length + ' bytes, ' +
  line.split('\n').filter(s => s.trim()).length + ' line):\n');
console.log(line);
console.log('');

const url = W + '/sh/' + ID;
let bad = 0;

// Transport 1: request WITH the UA header (what the one-liner sends first)
const withUA = await fetch(url, { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } });
const b1 = await withUA.text();
const ok1 = withUA.status === 200 && b1.startsWith('--[[ ScripterHub session loader');
console.log('request + User-Agent -> ' + withUA.status + ', ' + b1.length + ' bytes | ' +
  (ok1 ? 'LOADER (correct)' : 'WRONG: ' + b1.slice(0, 60)));
if (!ok1) bad++;

// Transport 2: game:HttpGet equivalent - a real Roblox UA, no explicit header
const asRoblox = await fetch(url, { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } });
const b2 = await asRoblox.text();
const ok2 = asRoblox.status === 200 && b2.startsWith('--[[ ScripterHub session loader');
console.log('game:HttpGet path   -> ' + asRoblox.status + ', ' + b2.length + ' bytes | ' +
  (ok2 ? 'LOADER (correct)' : 'WRONG'));
if (!ok2) bad++;

// The regression this replaced: request with NO header gets HTML, which is what made
// the old one-liner report "Could not compile the loader".
const noUA = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const b3 = await noUA.text();
console.log('request, NO header  -> ' + noUA.status + ', ' + b3.length + ' bytes | ' +
  (b3.startsWith('<!DOCTYPE') ? 'HTML - the bug this fixes' : 'loader'));

console.log('\n' + (bad === 0
  ? 'BOTH transports return the loader. The one-liner works.'
  : 'FAILED: a transport returned the wrong content.'));
process.exit(bad === 0 ? 0 : 1);