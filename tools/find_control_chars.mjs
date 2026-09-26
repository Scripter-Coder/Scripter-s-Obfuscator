import fs from 'node:fs';
import path from 'node:path';

// Scan for raw control characters that are invisible in an editor and break
// clipboard round-trips. Tab (09), LF (0A) and CR (0D) are fine.
const BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const targets = [];
function walk(dir, depth = 0) {
  if (depth > 2) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.wrangler') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, depth + 1); continue; }
    if (!/\.(js|mjs|cjs|json|html|css|md|sql|toml|lua)$/.test(e.name)) continue;
    targets.push(p);
  }
}
walk('.');

let total = 0;
for (const f of targets) {
  let buf;
  try { buf = fs.readFileSync(f); } catch (e) { continue; }
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    BAD.lastIndex = 0;
    if (BAD.test(lines[i])) {
      BAD.lastIndex = 0;
      const m = lines[i].match(BAD);
      hits.push({ line: i + 1, codes: [...new Set(m.map(c => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')))].join(',') });
    }
  }
  if (hits.length) {
    total += hits.length;
    console.log('');
    console.log(f + '   (' + hits.length + ' line(s))');
    for (const h of hits) console.log('   line ' + h.line + '  ' + h.codes);
    // show the offending line with the control char made visible
    const L = lines[hits[0].line - 1];
    console.log('   > ' + L.replace(BAD, c => '<NUL:' + c.charCodeAt(0).toString(16) + '>').trim().slice(0, 150));
  }
}
console.log('');
console.log(total === 0 ? 'CLEAN - no raw control characters in any source file'
                        : 'FOUND ' + total + ' line(s) with raw control characters');
