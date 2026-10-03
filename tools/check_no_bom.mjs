// Fail on a UTF-8 BOM in any JSON the build parses.
//
// WHY THIS EXISTS
// package.json shipped with a BOM. `vite build` died with:
//
//     Unexpected token '﻿', "﻿{" is not valid JSON
//
// at PostCSS config load - a JSON parse error naming a character nobody can see, three
// frames away from the file that caused it, in a file nobody remembered editing. The
// build had been broken for anyone who ran it. GitHub Actions is what finally reported
// it, and by then the fix had been sitting in an unpushed commit for four commits' worth
// of work: green locally, red on the remote, and nothing in between to explain why.
//
// A BOM is invisible in every editor that hides it, survives copy-paste, and is written
// by plenty of Windows tooling. It is not a hypothetical.
//
// WHAT IT CHECKS
// Every .json in the repo that is not under node_modules, dist, or Storage Keeper/data.
// Those three are excluded on purpose: dist/ is build output, and Storage Keeper/data
// is the owner's actual storage, not source.
//
// Run: node tools/check_no_bom.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data', '.wrangler', '__pycache__']);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const offenders = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(full);
        } else if (entry.name.endsWith('.json')) {
            const fd = fs.openSync(full, 'r');
            const head = Buffer.alloc(3);
            const n = fs.readSync(fd, head, 0, 3, 0);
            fs.closeSync(fd);
            if (n === 3 && head.equals(BOM)) {
                offenders.push(path.relative(ROOT, full));
            }
        }
    }
}

walk(ROOT);

if (offenders.length) {
    console.error('UTF-8 BOM found in ' + offenders.length + ' file(s):\n');
    for (const f of offenders) console.error('  ' + f);
    console.error('\nA BOM makes JSON.parse throw. Remove it:');
    console.error('  node -e "const f=process.argv[1],fs=require(\'fs\');' +
        'const b=fs.readFileSync(f);if(b.slice(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))' +
        'fs.writeFileSync(f,b.slice(3))" <file>');
    process.exit(1);
}

console.log('NO BOM  every .json in the repo parses as plain JSON.');