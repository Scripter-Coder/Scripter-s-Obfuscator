// deobfuscator.mjs - measures recovery against a VM-obfuscated Lua file.
// Reports: vault bytes, blob bytes, chunk count, handler count, string leakage.
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('usage: node deobfuscator.mjs <file.lua>'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');

const t0 = Date.now();

// --- Step 1: find _b64dec calls (vault + blob) ---
const b64re = /_b64dec\("([A-Za-z0-9+/=]+)"\)/g;
const b64Matches = [...src.matchAll(b64re)];
console.log(`[1] base64 blobs found: ${b64Matches.length}`);

function b64dec(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const D = {};
  for (let i = 0; i < 64; i++) D[A.charCodeAt(i)] = i;
  const out = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = D[s.charCodeAt(i)];
    if (v === undefined) continue;
    acc = acc * 64 + v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push(Math.floor(acc / (1 << bits)) % 256); acc = acc % (1 << bits); }
  }
  return out;
}

const blobs = b64Matches.map(m => b64dec(m[1]));
console.log(`    blob sizes: ${blobs.map(b => b.length).join(', ')}`);

// --- Step 2: find numeric tables (should be none now) ---
const numTables = [...src.matchAll(/local \w+=\{[\d,\s]+\}/g)];
console.log(`[2] parseable numeric tables: ${numTables.length}`);

// --- Step 3: find chunk map ---
const chunkMatch = src.match(/local \w+=\{\{[\d,]+\}(?:,\{[\d,]+\})*\}/);
console.log(`[3] chunk map found: ${!!chunkMatch}`);

// --- Step 4: find handler assignments ---
const handlers = [...src.matchAll(/HAND\[(\d+)\]\s*=\s*function/g)];
console.log(`[4] handler assignments visible: ${handlers.length}`);

// --- Step 5: string leakage in source ---
const strLits = [...src.matchAll(/"([^"\\]{4,})"/g)];
console.log(`[5] string literals (4+ chars) in source: ${strLits.length}`);

// --- Step 6: identify vault strings ---
const vaultStrings = strLits.filter(m => m[1].length > 20 && !m[1].includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
console.log(`    long strings not base64: ${vaultStrings.length}`);

// --- Step 7: opcode-ish patterns ---
const addPat = [...src.matchAll(/return a\s*\+\s*b/g)];
const subPat = [...src.matchAll(/return a\s*-\s*b/g)];
const mulPat = [...src.matchAll(/return a\s*\*\s*b/g)];
console.log(`[6] visible handler patterns: ADD=${addPat.length} SUB=${subPat.length} MUL=${mulPat.length}`);

const elapsed = Date.now() - t0;
console.log(`\n=== MEASUREMENT ===`);
console.log(`Elapsed: ${elapsed}ms`);
console.log(`Recoverable without running VM: ${blobs.length > 0 ? 'vault+blob bytes' : 'nothing'} (${blobs.reduce((a,b)=>a+b.length,0)} bytes)`);
console.log(`Handlers identifiable by static pattern: ${handlers.length}`);
console.log(`Deobfuscation estimate: ${handlers.length > 0 ? 'TRIVIAL (handlers visible)' : 'requires dynamic analysis'}`);