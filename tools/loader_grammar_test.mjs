import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(process.env.TEMP || '.', 'sh_loader.lua');
const src = fs.readFileSync(file, 'utf8');

console.log(`parsing ${src.length} bytes\n`);

// The three grammars an executor might actually be running. fengari is Lua 5.3 and it
// compiled this fine, which is exactly why the earlier check was misleading: proving the
// source is valid Lua 5.3 says nothing about an executor running Lua 5.1 or Luau.
const targets = [
    ['Lua 5.1', { luaVersion: '5.1' }],
    ['Lua 5.2', { luaVersion: '5.2' }],
    ['Lua 5.3', { luaVersion: '5.3' }],
    ['Luau', { luaVersion: '5.1', luau: true }],
];

let anyFail = false;
for (const [name, opts] of targets) {
    try {
        luaparse.parse(src, opts);
        console.log(`  OK    valid ${name}`);
    } catch (e) {
        anyFail = true;
        console.log(`  FAIL  ${name}: ${e.message}`);
        if (e.line) console.log(`        at line ${e.line}`);
    }
}

// Report constructs that are the usual suspects, because "it compiles as 5.3 but not on
// the executor" almost always means one of these.
const suspects = [
    ['// integer division', /\/\//],
    ['bitwise & | ~ << >>', /[^~]\s[&|]\s|\s~\s|<<|>>/],
    ['goto', /\bgoto\b/],
    ['__len/__close metamethod', /__close|__len/],
    ['integer subtype hints', /::\s*\w+\s*::/],
    ['+= compound assign', /[+-\/*%^]=/],
];
console.log('\nsuspect constructs:');
for (const [label, re] of suspects) {
    const m = src.match(re);
    console.log(`  ${m ? 'PRESENT' : 'absent '}  ${label}${m ? '  -> ' + JSON.stringify(m[0]) : ''}`);
}
process.exit(anyFail ? 1 : 0);