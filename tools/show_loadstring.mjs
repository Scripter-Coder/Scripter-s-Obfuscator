// Print the exact loadstring shLoader() now produces, and check it against the
// executor shapes that used to break. Run: node tools/show_loadstring.mjs
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
const BASE = 'https://scripterhub-stats.dubovikstanislav51.workers.dev';
const ID = 'ScripterHub1666974089';
const out = shLoader(BASE, ID);

console.log('--- the loadstring a user now pastes ---');
console.log(out);
console.log('\nlines: ' + out.split('\n').length + '   bytes: ' + out.length);

// The property that caused this whole round of debugging: a request with no
// User-Agent gets the browser page, not the loader, so loadstring fails on HTML.
const hasUA = /User-Agent/.test(out);
console.log('sends an executor User-Agent: ' + (hasUA ? 'YES' : 'NO  <- would receive HTML'));

for (const v of ['5.1', '5.3']) {
  try { luaparse.parse(out, { luaVersion: v }); console.log('parses as Lua ' + v + ': OK'); }
  catch (e) { console.log('parses as Lua ' + v + ': FAIL -> ' + e.message); }
}

fs.writeFileSync(path.join(ROOT, 'loadstring_preview.txt'), out + '\n');
console.log('\n(written to loadstring_preview.txt)');