// tools/make_ref_normalized.mjs
//
// Produces a SYNTAX-NORMALIZED copy of the supplied reference artifact so the
// generic Lua parser can read its ARCHITECTURE for an apples-to-apples
// comparison with our own output.
//
// The reference is Luau-targeted and uses two constructs that no standard Lua
// parser accepts:
//     1. compound assignment   z += 1      (95 occurrences, Luau-only)
//     2. `continue`                          (48 occurrences, Luau-only)
// The 13 "::" sequences in the file are NOT goto labels -- they are random
// payload bytes inside string literals.
//
// Only these two non-standard constructs are rewritten. No structure, no
// handler, no dispatch edge, and no helper graph is altered, so the resulting
// file is a faithful picture of the reference's observable architecture.
//
// SEMANTICS ARE NOT PRESERVED: this file exists only so the analyzer can walk
// the AST. Do not execute it.
//     z += 1   ->  z = z + 1        (exactly equivalent)
//     continue  ->  (empty stmt)    (equivalent inside a dispatch loop: skip
//                                    the rest of the body, go to next iteration)

import fs from 'node:fs';

const IN = 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/ref_luraph_v15.lua';
const OUT = 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/ref_luraph_v15.normalized.lua';

let s = fs.readFileSync(IN, 'utf8');
const before = s.length;

let ca = 0, cont = 0;

s = s.replace(/([A-Za-z_][A-Za-z0-9_]*(?:\s*\[[^\[\]]*\])*)\s*(\.\.=|\+=|-=|\*=|\/=|%=|\^=)(?![=])/g,
  (m, lhs, op) => { ca++; return `${lhs}=${lhs}${op === '..=' ? '..' : op[0]}`; });

s = s.replace(/(^|[^A-Za-z0-9_.:])continue\s*;/g, (m, pre) => { cont++; return pre + ';'; });

fs.writeFileSync(OUT, s, 'utf8');

console.log('reference        :', IN);
console.log('normalized       :', OUT);
console.log('bytes            :', before, '->', s.length);
console.log('compound assigns rewritten :', ca);
console.log('continue statements rewritten:', cont);
console.log('residual += etc  :', (s.match(/\s(\.\.=|\+=|-=|\*=|\/=|%=|\^=)(?![=])/g) || []).length);
console.log('residual continue:', (s.match(/(^|[^A-Za-z0-9_.:])continue\s*;/g) || []).length);
