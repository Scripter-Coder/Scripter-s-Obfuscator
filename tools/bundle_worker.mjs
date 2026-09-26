// =============================================================================
// BUNDLE THE WORKER INTO ONE SELF-CONTAINED FILE
// =============================================================================
// WHY THIS EXISTS
//
// Two problems, one cause: worker.js imports from ../server/*.js.
//
//   1. The editor's language server reports "Cannot find module
//      '../server/d1_state.js'" three times. That is a TYPE-RESOLUTION
//      diagnostic, not a runtime error — Node and wrangler both resolve it
//      fine — but it is three red squiggles on the first lines of the file.
//
//   2. The Cloudflare dashboard editor has NO FILESYSTEM. It evaluates one
//      pasted string, so a relative import can never resolve there, ever.
//      The error is "Invalid module specifier '../server/d1_state.js'" and
//      it is not fixable from inside the dashboard.
//
// So: `dist/worker.single.js` is the whole worker in one file, no imports, with
// the three server modules inlined in dependency order. It is what you paste.
//
// WHAT THIS IS NOT
//
// Not a build step you must remember. `For Cloudflare/worker.js` stays the
// source of truth and is what wrangler deploys (it bundles correctly). This
// exists only to produce a pasteable artifact, and it is REGENERATED AND
// VERIFIED BY tools/single_file_bundle_test.mjs, which fails if the checked-in
// copy has drifted from the source. A stale bundle is worse than none, because
// it looks authoritative.
//
// HOW IT WORKS
//
// Concatenation, not a real bundler, because the module graph is three files
// deep and flat. For each module in dependency order:
//
//   * drop `import ... from '...'`            (names already in scope)
//   * drop the `export` keyword               (declarations stay)
//   * turn `export { a as b }` into `const b = a`  (aliases must exist)
//   * turn `import { a as b }` into `const b = a`  (same, for the importer)
//
// COLLISIONS ARE A HARD ERROR, never silently resolved. Three modules
// concatenated into one scope can absolutely declare the same name, and a
// silent last-one-wins would be a bug that only appears in production.
//
// Run:  node tools/bundle_worker.mjs
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

// Dependency order. d1_state has no imports; delivery imports from it;
// artifact_crypto has none; worker imports all three.
const MODULES = [
  'server/d1_state.js',
  'server/artifact_crypto.js',
  'server/delivery.js',
  'For Cloudflare/worker.js'
];

// Output directory is overridable so the staleness test can build into a temp
// folder and COMPARE without touching the checked-in artifacts. The first
// version of that test built in place, which meant it overwrote the very files
// it was supposed to be inspecting - so a corrupted or hand-edited artifact
// was silently repaired before any check looked at it, and the control-byte
// check was structurally incapable of failing.
const OUT_DIR = process.argv[2] || 'dist';
const OUT = OUT_DIR + '/worker.single.js';
const MIN_OUT = OUT_DIR + '/worker.single.min.js';

const read = (p) => fs.readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------
// 1. pull apart one module
// ---------------------------------------------------------------------------
function parseModule(src, file) {
  const out = {
    file,
    body: [],
    // alias name -> the name it points at, in the SAME module's scope
    localAliases: [],
    exportsDefault: false
  };

  const lines = src.split('\n');
  let i = 0;

  // `import { a, b as c } from './x.js';` may span several lines.
  const importRe = /^\s*import\s/;
  while (i < lines.length) {
    if (importRe.test(lines[i])) {
      // consume until the statement terminates (a line ending in `';` or `';`)
      let stmt = lines[i];
      while (!/;\s*$/.test(stmt) && !/from\s+['"][^'"]+['"];?\s*$/.test(stmt) && i + 1 < lines.length) {
        i++;
        stmt += '\n' + lines[i];
      }
      const named = stmt.match(/import\s*\{([^}]*)\}\s*from/);
      if (named) {
        for (const part of named[1].split(',')) {
          const t = part.trim();
          if (!t) continue;
          const m = t.match(/^(\S+)\s+as\s+(\S+)$/);
          if (m) out.localAliases.push({ local: m[2], from: m[1] });
          // `a` imported under its own name needs no declaration: the module
          // it came from already declared it at top level.
        }
      }
      i++;
      continue;
    }
    i++;
  }

  // second pass over the import-stripped text for exports
  let text = lines.join('\n');
  text = text.replace(/^[ \t]*import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');

  // `export { q as run, qAll as all, qOne as one };`
  text = text.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (m, names) => {
    const decls = [];
    for (const part of names.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const a = t.match(/^(\S+)\s+as\s+(\S+)$/);
      if (a) decls.push('const ' + a[2] + ' = ' + a[1] + ';');
      else decls.push('// exported: ' + t);
    }
    return decls.join('\n');
  });

  // `export default` — only worker.js has it, and it must SURVIVE, because
  // the dashboard editor and wrangler both expect a default export.
  if (/^\s*export\s+default\s/m.test(text)) {
    out.exportsDefault = true;
    text = text.replace(/^([ \t]*)export\s+default\s/m, '$1const __SINGLE_DEFAULT__ = ');
  }

  // strip the `export` keyword from declarations
  text = text.replace(/^([ \t]*)export\s+(const|let|var|function|async\s+function|class)\s/gm, '$1$2 ');

  out.body = text;
  return out;
}

// ---------------------------------------------------------------------------
// 2. top-level declared names, for collision detection
// ---------------------------------------------------------------------------
function topLevelNames(src) {
  const names = new Set();
  const re = /^(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

// ---------------------------------------------------------------------------
// 3. build
// ---------------------------------------------------------------------------
const parsed = MODULES.map((m) => parseModule(read(m), m));

// collision check across the concatenated scope
const owner = new Map();
const collisions = [];
for (const p of parsed) {
  for (const n of topLevelNames(p.body)) {
    if (owner.has(n)) collisions.push(n + '  (' + owner.get(n) + ' vs ' + p.file + ')');
    else owner.set(n, p.file);
  }
  for (const a of p.localAliases) {
    if (owner.has(a.local)) collisions.push(a.local + '  (alias in ' + p.file + ' vs ' + owner.get(a.local) + ')');
    else owner.set(a.local, p.file);
  }
}
if (collisions.length) {
  console.error('COLLISION — refusing to emit a bundle where one declaration silently wins:\n');
  for (const c of collisions) console.error('  ' + c);
  process.exit(1);
}

// emit
const header = [
  '// ' + '='.repeat(74),
  '// ScripterHub Worker — SINGLE FILE BUILD',
  '// ' + '='.repeat(74),
  '//',
  '// GENERATED by tools/bundle_worker.mjs. DO NOT EDIT.',
  '// Source of truth: For Cloudflare/worker.js + server/*.js',
  '//',
  '// This exists for ONE reason: the Cloudflare dashboard editor has no',
  '// filesystem, so a relative import can never resolve there. Paste THIS file.',
  '//',
  '// If you change the worker, change the source and re-run:',
  '//     npm run build:worker',
  '//',
  '// `npm test` fails if this file is stale, so a stale paste is not possible',
  '// without the suite telling you first.',
  '// ' + '='.repeat(74),
  ''
].join('\n');

const parts = [header];
for (const p of parsed) {
  parts.push('');
  parts.push('// ' + '='.repeat(74));
  parts.push('// INLINED: ' + p.file);
  parts.push('// ' + '='.repeat(74));
  // Import aliases must become REAL declarations. The first version of this
  // bundler only wrote them as a comment, which produced a bundle that parsed
  // cleanly and referenced `d1run` — a name that no longer existed — at
  // runtime. `node --check` cannot see that; it validates syntax, not
  // unresolved references. The bundle has to be executed to be trusted.
  for (const a of p.localAliases) {
    parts.push('const ' + a.local + ' = ' + a.from + ';  // import alias');
  }
  if (p.localAliases.length) parts.push('');
  parts.push(p.body.trim());
  parts.push('');
}

// the one `export default` has to come back
const last = parsed[parsed.length - 1];
if (last.exportsDefault) {
  parts.push('export default __SINGLE_DEFAULT__;');
}

const bundle = parts.join('\n');

// ---------------------------------------------------------------------------
// 4. also emit a comment-stripped copy, because the dashboard editor is tight
//    on size and a 4000-line paste is a lot to get through
// ---------------------------------------------------------------------------
// Only WHOLE-LINE comments are removed. Trailing comments are left alone on
// purpose: stripping them safely needs real parsing, because `//` also appears
// inside strings, template literals and regexes, and a regex that eats a
// string's contents produces a file that still parses but behaves differently.
// That is a much worse outcome than a few hundred saved bytes.
const minified = bundle
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .filter((l) => l.trim() !== '')
  .join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bundle);
fs.writeFileSync(MIN_OUT, minified);

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KiB';
console.log('wrote ' + OUT + '        ' + kb(bundle) + '   ' + bundle.split('\n').length + ' lines');
console.log('wrote ' + MIN_OUT + '   ' + kb(minified) + '   ' + minified.split('\n').length + ' lines  (full-line comments removed)');
if (OUT_DIR === 'dist') {
  console.log('');
  console.log('paste MIN_OUT into the dashboard if size matters, OUT if you want the comments.');
}
