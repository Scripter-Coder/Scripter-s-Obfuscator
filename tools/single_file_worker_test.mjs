// =============================================================================
// worker.js MUST STAY A SINGLE SELF-CONTAINED FILE
// =============================================================================
// THE CONSTRAINT
//
// This worker is deployed by being pasted into the Cloudflare dashboard, which
// has no filesystem. A relative import cannot resolve there. That is not a
// setting, not a config, and not something a bundler fixes at runtime - the
// dashboard evaluates one string.
//
// The file was previously split into four (worker.js plus server/d1_state.js,
// server/delivery.js, server/artifact_crypto.js) on the reasoning that wrangler
// bundles them and node resolves them off disk, "so there is no build step and
// no second copy to keep in sync." That reasoning was sound and the conclusion
// was wrong, because it never asked how the worker actually ships. The split
// has been reverted and this test exists to stop it being reintroduced.
//
// WHY A TEST, WHEN THE FAILURE IS A PASTE ERROR
//
// Because the failure is invisible until a deploy. Everything passes: node
// resolves the imports, wrangler bundles them, all 23 security gates and 18
// attacker rows go green. The only symptom is a dashboard that refuses to
// evaluate the file, discovered at the worst possible moment - mid-deploy, by
// hand, with no diff to look at.
//
// A test that fails at `npm test` is worth more than a paragraph in a README,
// and this file is going to be edited by hand for a long time.
//
// WHAT IS CHECKED
//
//   S1  zero static imports of any kind
//   S2  no relative module specifier survives anywhere, even in a string
//   S3  the default export is present and has fetch AND scheduled
//   S4  the file parses, and importing it actually yields a Worker
//   S5  every name the file declares is unique at the top level, because four
//       modules in one scope can silently shadow each other
//   S6  the named test exports are still there, because two suites import them
//
// S5 deserves a note. The merge reported "collision check: clean (168
// top-level names in one scope)" and that check was real. But it ran once, at
// merge time, in a script that is now deleted. Nothing re-runs it, so a future
// edit that adds `const DENY` at the top level would shadow the one from the
// delivery rules and break authorization in a way that looks like a logic bug
// rather than a name collision. The test below re-derives the declared names
// and reports duplicates.
//
// Run:  node tools/single_file_worker_test.mjs
// =============================================================================

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = 'For Cloudflare/worker.js';
const p = (rel) => path.join(ROOT, rel);

let pass = 0, fail = 0;
const problems = [];
const ok = (label) => { pass++; console.log('  OK   ' + label); };
const no = (label) => { fail++; problems.push(label); console.log('  FAIL ' + label); };

if (!fs.existsSync(p(WORKER))) {
  console.error('FATAL: ' + WORKER + ' does not exist');
  process.exit(2);
}
const src = fs.readFileSync(p(WORKER), 'utf8');

// -----------------------------------------------------------------------------
console.log('[S1] no static imports...');
// -----------------------------------------------------------------------------
{
  const imports = src.match(/^\s*import\s[^\n]*$/gm) || [];
  if (imports.length === 0) {
    ok('the file imports nothing - the dashboard can evaluate it as one string');
  } else {
    no(imports.length + ' static import(s) will not resolve in the dashboard:');
    for (const i of imports.slice(0, 6)) console.log('         ' + i.trim());
  }
}

// -----------------------------------------------------------------------------
console.log('[S2] no relative module specifier anywhere, even inside a string...');
// -----------------------------------------------------------------------------
{
  // S1 only catches statements at the start of a line. A dynamic
  // import('./x.js') buried in a route handler, or a specifier in a comment
  // someone later copies out, is the same trap with a different disguise.
  const rel = src.match(/(?:^|[^\w$])(?:import|export)[^\n]{0,120}?from\s+['"]\.\.?\/[^'"]+['"]/g) || [];
  const dyn = src.match(/\bimport\s*\(\s*['"]\.\.?\/[^'"]+['"]\s*\)/g) || [];
  if (rel.length === 0 && dyn.length === 0) {
    ok('no relative specifier in any import, export-from, or dynamic import');
  } else {
    no(rel.length + ' relative import/export-from and ' + dyn.length + ' dynamic import(s) found:');
    for (const r of [...rel, ...dyn].slice(0, 6)) console.log('         ' + r.trim().slice(0, 110));
  }
}

// -----------------------------------------------------------------------------
console.log('[S3] the default export is a complete Worker...');
// -----------------------------------------------------------------------------
{
  const mod = await import(pathToFileURL(p(WORKER)).href);
  if (!mod.default) { no('no default export'); }
  else if (typeof mod.default.fetch !== 'function') { no('default export has no .fetch'); }
  else if (typeof mod.default.scheduled !== 'function') {
    no('default export has no .scheduled - the cron sweeper (D19) would be silently lost');
  } else {
    const handlers = Object.keys(mod.default).filter(k => typeof mod.default[k] === 'function');
    ok('default export exposes ' + handlers.length + ' handler(s): ' + handlers.join(', '));
  }
}

// -----------------------------------------------------------------------------
console.log('[S4] the file parses standalone...');
// -----------------------------------------------------------------------------
{
  const r = spawnSync(process.execPath, ['--check', p(WORKER)], { encoding: 'utf8' });
  if (r.status === 0) ok('node --check passes');
  else no('node --check failed:\n' + (r.stderr || '').trim().split('\n').slice(0, 5).map(l => '         ' + l).join('\n'));
}

// -----------------------------------------------------------------------------
console.log('[S5] every top-level name is declared exactly once...');
// -----------------------------------------------------------------------------
{
  // Four modules share one scope now. A duplicate top-level declaration is
  // legal JavaScript - the later one silently wins - and it is invisible in
  // review because each half reads correctly on its own. When the shadowed
  // name is DENY or deliver or run, the symptom is an authorization bug that
  // looks like a logic error.
  const seen = new Map();
  const dupes = [];
  const re = /^(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (seen.has(name)) dupes.push(name + ' (line ' + seen.get(name) + ' and line ' + line + ')');
    else seen.set(name, line);
  }
  if (dupes.length === 0) {
    ok(seen.size + ' top-level names, no duplicates');
  } else {
    no(dupes.length + ' duplicate top-level name(s) - the later one silently wins:');
    for (const d of dupes) console.log('         ' + d);
  }
}

// -----------------------------------------------------------------------------
console.log('[S6] the named test exports are still exported...');
// -----------------------------------------------------------------------------
{
  // tools/atomic_state_test.mjs and tools/artifact_crypto_test.mjs import
  // these from the worker, because server/*.js no longer exists as a separate
  // module. Cloudflare ignores named exports; they exist only so 56 unit checks
  // can reach the SQL and the crypto directly instead of through HTTP.
  const NEEDED = [
    'createState', 'changesOf', 'SESSION_TTL_CEILING_MS', 'DEFAULT_SESSION_TTL_MS', 'windowStart',
    'encryptAtRest', 'decryptAtRest', 'tryDecryptAtRest', 'isEncrypted', 'kekConfigured', '_resetKekCache'
  ];
  const mod = await import(pathToFileURL(p(WORKER)).href);
  const missing = NEEDED.filter(n => mod[n] === undefined);
  if (missing.length === 0) ok('all ' + NEEDED.length + ' test-facing exports present');
  else no('missing named export(s) needed by the unit suites: ' + missing.join(', '));
}

// -----------------------------------------------------------------------------
console.log('[S7] the gate and benchmark suites pass against this exact file...');
// -----------------------------------------------------------------------------
{
  const SUITES = [
    ['tools/security_gates_test.mjs', /closed\s+23\/23/, 'gates'],
    ['tools/attacker_benchmark.mjs', /18\/18 attacks blocked/, 'benchmark'],
    ['tools/atomic_state_test.mjs', /ATOMIC STATE TEST:\s+PASS/, 'atomic'],
    ['tools/artifact_crypto_test.mjs', /AT-REST ARTIFACT CRYPTO\s+21 passed, 0 failed/, 'at-rest'],
    ['tools/legacy_password_migration_test.mjs', /LEGACY MIGRATION TEST:\s+PASS/, 'legacy']
  ];
  for (const [suite, expect, label] of SUITES) {
    const r = spawnSync(process.execPath, [p(suite)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) {
      no(label + ' exited ' + r.status + '\n' +
        out.trim().split('\n').filter(l => /FAIL|Error|not defined|REGRESSION/i.test(l)).slice(0, 6)
          .map(l => '         ' + l.trim().slice(0, 120)).join('\n'));
    } else if (!expect.test(out)) {
      no(label + ' ran but did not report the expected result');
    } else {
      ok(label + ' passes against the single file');
    }
  }
}

console.log('');
console.log('='.repeat(72));
console.log('SINGLE-FILE WORKER   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
if (fail) {
  console.log('');
  console.log('  If S1 or S2 fail, the file has picked up an import. The Cloudflare');
  console.log('  dashboard has no filesystem, so a relative import can never resolve');
  console.log('  there - and nothing else in the project will complain. Move the code');
  console.log('  into this file instead of importing it.');
  console.log('');
  for (const pr of problems) console.log('  ' + pr);
  process.exit(1);
}
