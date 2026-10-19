// Print the exact loadstring the platform now hands out, and the init layer
// behind it, and check both against the executor shapes that used to break.
//
// Run: node tools/show_loadstring.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'For Cloudflare', 'worker.js'), 'utf8');

function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && next === '/') { inLine = true; i++; continue; }
    if (c === '/' && next === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('brace match failed for ' + name);
}

const shLoader = new Function(extract('shLoader') + '\nreturn shLoader;')();
const shLoaderPortable = new Function(extract('shLoaderPortable') + '\nreturn shLoaderPortable;')();
const luaSessionBootstrap = new Function('SPLITKEY_GENV', extract('luaSessionBootstrap') + '\nreturn luaSessionBootstrap;')('__SH_SPLITKEY');

const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub1666974089';

const out = shLoader(BASE, ID);
const portable = shLoaderPortable(BASE, ID);
const init = luaSessionBootstrap(ID, BASE, false);

console.log('--- L1: the loadstring a user now pastes ---');
console.log(out);
console.log('\nlines: ' + out.split('\n').length + '   bytes: ' + out.length);

console.log('\n--- L1 (portable twin): for an executor whose game:HttpGet throws ---');
console.log(portable);
console.log('\nlines: ' + portable.split('\n').length + '   bytes: ' + portable.length);

// The property that caused a whole round of debugging: a request with NO
// User-Agent gets the browser page, not the init layer, so loadstring fails on
// HTML. The plain line does not send a header at all - it relies on
// game:HttpGet stamping a genuine Roblox UA, which the worker recognises as an
// executor. The portable line sends the header explicitly.
console.log('\nsends an explicit User-Agent: ' + (/User-Agent/.test(portable) ? 'YES (portable line)' : 'NO'));
console.log('plain line relies on game:HttpGet\'s Roblox UA: ' + (/game:HttpGet/.test(out) ? 'YES' : 'NO'));

for (const v of ['5.1', '5.3']) {
  try { luaparse.parse(out, { luaVersion: v }); console.log('L1 parses as Lua ' + v + ': OK'); }
  catch (e) { console.log('L1 parses as Lua ' + v + ': FAIL -> ' + e.message); }
  try { luaparse.parse(portable, { luaVersion: v }); console.log('L1 portable parses as Lua ' + v + ': OK'); }
  catch (e) { console.log('L1 portable parses as Lua ' + v + ': FAIL -> ' + e.message); }
}

console.log('\n--- L2: the init layer the URL returns (executor UA) ---');
console.log(init.split('\n').slice(0, 14).join('\n'));
console.log('   ... (' + init.split('\n').length + ' lines, ' + init.length + ' bytes total)');
console.log('\n_bsdata0 line:');
console.log((init.split('\n').find(l => l.startsWith('_bsdata0=')) || '(missing)'));
console.log('cdn link: ' + (init.match(/\/sh\/v4_init_[A-Za-z0-9_]+\.lua/) || ['(missing)'])[0]);

try { luaparse.parse(init, { luaVersion: '5.1' }); console.log('\nL2 parses as Lua 5.1: OK'); }
catch (e) { console.log('\nL2 parses as Lua 5.1: FAIL -> ' + e.message); }

fs.writeFileSync(path.join(ROOT, 'loadstring_preview.txt'), out + '\n');
fs.writeFileSync(path.join(ROOT, 'init_layer_preview.txt'), init + '\n');
console.log('\n(written to loadstring_preview.txt and init_layer_preview.txt)');
