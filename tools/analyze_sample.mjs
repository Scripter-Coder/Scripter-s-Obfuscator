import fs from 'node:fs';
const p = 'C:/Users/Ryzen 9 5900x/Downloads/test.txt';
const s = fs.readFileSync(p, 'utf8');

console.log('bytes            :', s.length);
console.log('newlines         :', (s.match(/\n/g) || []).length);
console.log('semicolons       :', (s.match(/;/g) || []).length);
console.log('"local "         :', (s.match(/local /g) || []).length);
console.log('"function"       :', (s.match(/function/g) || []).length);
console.log('"while"          :', (s.match(/while/g) || []).length);
console.log('"repeat"         :', (s.match(/repeat/g) || []).length);
console.log('"then"           :', (s.match(/then/g) || []).length);
console.log('"goto"/"::"      :', (s.match(/goto/g) || []).length, (s.match(/::/g) || []).length);
console.log('"error("         :', (s.match(/error\(/g) || []).length);
console.log('"pcall"          :', (s.match(/pcall/g) || []).length);
console.log('"setmetatable"   :', (s.match(/setmetatable/g) || []).length);
console.log('"string.char"    :', (s.match(/string\.char/g) || []).length);
console.log('"loadstring"     :', (s.match(/loadstring/g) || []).length);
console.log('"\\x.." hex esc   :', (s.match(/\\x[0-9a-fA-F]{2}/g) || []).length);
console.log('"\\ddd" dec esc   :', (s.match(/\\\d{1,3}/g) || []).length);
console.log('bracket [ count  :', (s.match(/\[/g) || []).length);
console.log('');

// All quoted string literals, sorted by length (the interesting signal).
const lits = [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
const uniq = [...new Set(lits)].sort((a, b) => b.length - a.length);
console.log('distinct string literals:', uniq.length);
console.log('longest 25 literals:');
for (const l of uniq.slice(0, 25)) console.log('  ' + l.length + '  ' + JSON.stringify(l.slice(0, 90)));

// Identifier-shape analysis: how "random" are the top-level names?
const ids = [...s.matchAll(/local\s+([A-Za-z_][A-Za-z0-9_]{1,3})\s*=/g)].map((m) => m[1]);
console.log('');
console.log('short locals declared:', ids.length);
console.log('sample:', ids.slice(0, 20).join(' '));
const byLen = {};
for (const i of ids) byLen[i.length] = (byLen[i.length] || 0) + 1;
console.log('by length:', JSON.stringify(byLen));
