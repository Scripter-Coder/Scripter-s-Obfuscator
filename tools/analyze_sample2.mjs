import fs from 'node:fs';
const s = fs.readFileSync('C:/Users/Ryzen 9 5900x/Downloads/test.txt', 'utf8');

console.log('=== HEAD (first 900 chars) ===');
console.log(s.slice(0, 900));
console.log('');
console.log('=== TAIL (last 400 chars) ===');
console.log(s.slice(-400));
console.log('');

// Where do the loadstring calls sit?
for (const m of s.matchAll(/loadstring|load\s*\(/g)) {
  console.log('load-family at offset', m.index, 'context:');
  console.log('  ...' + s.slice(Math.max(0, m.index - 120), m.index + 160).replace(/\n/g, '\\n') + '...');
  console.log('');
}

// The giant literal: is it one contiguous string?
const big = s.match(/"[^"]{50000,}"/);
if (big) {
  console.log('=== giant literal: offset', big.index, 'len', big[0].length, '===');
  console.log('  starts:', big[0].slice(0, 120));
  console.log('  ends  :', big[0].slice(-120));
  // Does its content contain escaped newlines (i.e. real newlines when unescaped)?
  const inner = big[0].slice(1, -1);
  console.log('  escaped \\13\\10 count:', (inner.match(/\\13\\10/g) || []).length);
  console.log('  has "local ":', inner.includes('local '));
  console.log('  has "function":', inner.includes('function'));
  console.log('  has "while":', inner.includes('while'));
}
