// Duplicate top-level declarations across the browser files.
//
// Anchored text replacements are the tool used to keep these files in step with
// the worker, and the failure mode is silent: the new body is inserted, the old
// body survives past it, and the file still parses. In this session that
// happened four times and each time the symptom was somewhere else entirely
// ("illegal return statement" three functions later, a duplicated
// renderRewardsTab, an orphaned confirmAddUserUI body).
//
// Two of those orphans were caught only by `node --check` on an .mjs copy,
// because `new Function(src)` wraps the source in a function body and therefore
// treats a top-level `return` as legal. This checks both ways.
//
// Run: node tools/no_duplicate_defs_test.mjs

import { readFileSync } from 'node:fs';

const FILES = ['main.js', 'rewards.js', 'sh-keys.js', 'custom-obfuscator.js'];
let fails = 0;

for (const f of FILES) {
    let src;
    try { src = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); }
    catch (e) { console.log('  skip ' + f + ' (not present)'); continue; }
    const lines = src.replace(/\r\n/g, '\n').split('\n');

    const seen = new Map();
    const dupes = [];
    lines.forEach((l, i) => {
        const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
        if (!m) return;
        const name = m[1];
        if (seen.has(name)) dupes.push(name + ' (lines ' + (seen.get(name) + 1) + ' and ' + (i + 1) + ')');
        else seen.set(name, i);
    });

    if (dupes.length) {
        fails++;
        console.log('  FAIL ' + f + ' declares the same function twice:');
        dupes.forEach(d => console.log('         ' + d));
    } else {
        console.log('  ok   ' + f + ' has no duplicate function declarations (' + seen.size + ')');
    }
}

console.log();
console.log('NO DUPLICATE DEFS   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);