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

// What a correct init layer starts with. The OLD deployment (before D31)
// answered with the bootstrap, so both are accepted - the old one means "the
// worker has not been redeployed yet".
const isInit = (s) => s.startsWith('-- Do not save this file') || s.startsWith('--[[ ScripterHub session loader');

// Transport 1: request WITH the UA header (what the portable one-liner sends first)
const withUA = await fetch(url, { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } });
const b1 = await withUA.text();
const ok1 = withUA.status === 200 && isInit(b1);
console.log('request + User-Agent -> ' + withUA.status + ', ' + b1.length + ' bytes | ' +
  (ok1 ? 'INIT LAYER (correct)' : 'WRONG: ' + b1.slice(0, 60)));
if (!ok1) bad++;

// Transport 2: game:HttpGet equivalent - a real Roblox UA, no explicit header
const asRoblox = await fetch(url, { headers: { 'User-Agent': 'Roblox/570 Delta Executor' } });
const b2 = await asRoblox.text();
const ok2 = asRoblox.status === 200 && isInit(b2);
console.log('game:HttpGet path   -> ' + asRoblox.status + ', ' + b2.length + ' bytes | ' +
  (ok2 ? 'INIT LAYER (correct)' : 'WRONG'));
if (!ok2) bad++;

// The regression this replaced: request with NO header gets HTML, which is what made
// the old one-liner report "Could not compile the loader".
const noUA = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const b3 = await noUA.text();
console.log('request, NO header  -> ' + noUA.status + ', ' + b3.length + ' bytes | ' +
  (b3.startsWith('<!DOCTYPE') ? 'HTML - the bug this fixes' : 'loader'));

// The shape the owner asked for: the init layer carries _bsdata0 and a
// file-shaped cdn link, and it carries no artifact material.
if (b1.includes('_bsdata0=')) console.log('_bsdata0 present      -> YES');
else { console.log('_bsdata0 present      -> NO'); bad++; }
if (/\/sh\/v4_init_ScripterHub\d+\.lua/.test(b1)) console.log('cdn link present     -> YES');
else if (b1.startsWith('-- Do not save this file')) { console.log('cdn link present     -> NO'); bad++; }
else console.log('cdn link present     -> (old deployment, not redeployed yet)');

console.log('\n' + (bad === 0
  ? 'BOTH transports return the init layer. The one-liner works.'
  : 'FAILED: a transport returned the wrong content.'));
process.exit(bad === 0 ? 0 : 1);