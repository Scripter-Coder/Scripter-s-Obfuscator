// =============================================================================
// THE SINGLE-FILE BUNDLE MUST BE CORRECT AND MUST NOT DRIFT
// =============================================================================
// WHY A GENERATED ARTIFACT NEEDS A TEST AGAINST IT
//
// dist/worker.single.js is what gets pasted into the Cloudflare dashboard. It
// is generated, which normally means "don't test generated code". That is the
// wrong call here, for a reason that was demonstrated rather than argued:
//
// The first version of tools/bundle_worker.mjs dropped import aliases on the
// floor. worker.js does `import { createState, run as d1run }`, and the bundler
// recorded `d1run <- run` in a COMMENT. The output was 264 KiB of clean,
// plausible, syntactically valid JavaScript that referenced a name nothing
// declared. `node --check` passed, because the checker validates syntax and
// not unresolved references. Every source-level test passed, because none of
// them read dist/.
//
// It was only found by importing the bundle and running the suites against it.
// So the rule this file encodes is: a build artifact is tested like anything
// else, and a generated file that nobody executes is an unverified claim.
//
// THE OTHER HALF: STALENESS
//
// A bundle that works but is out of date is worse than no bundle, because it
// looks authoritative. Someone pastes it believing it matches the worker they
// just reviewed. So B1 regenerates and byte-compares, and a mismatch is a
// failure, not a warning.
//
// Run:  node tools/single_file_bundle_test.mjs
// =============================================================================

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => path.join(ROOT, rel);

const FULL = 'dist/worker.single.js';
const MIN = 'dist/worker.single.min.js';

let pass = 0, fail = 0;
const problems = [];
const ok = (label) => { pass++; console.log('  OK   ' + label); };
const no = (label) => { fail++; problems.push(label); console.log('  FAIL ' + label); };

// -----------------------------------------------------------------------------
console.log('[B1] the checked-in bundle matches what the bundler produces today...');
// -----------------------------------------------------------------------------
{
  // Build into a TEMP directory and compare. The first version of this check
  // built in place, which meant B1 overwrote dist/ before B2..B7 read it - so
  // every later check was inspecting a freshly generated file rather than the
  // artifact on disk, and the control-byte check could not fail no matter what
  // was committed. That was demonstrated, not theorised: injecting a NUL byte
  // into the minified artifact and re-running the suite reported B2 as OK,
  // because B1 had already repaired the file.
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-bundle-'));
  const gen = spawnSync(process.execPath, [p('tools/bundle_worker.mjs'), tmp], { encoding: 'utf8' });
  if (gen.status !== 0) {
    no('the bundler itself failed:\n' + (gen.stderr || '').trim().split('\n').slice(0, 6).join('\n         '));
  } else {
    const names = ['worker.single.js', 'worker.single.min.js'];
    const onDisk = [FULL, MIN];
    let stale = [];
    for (let i = 0; i < 2; i++) {
      const genPath = path.join(tmp, names[i]);
      if (!fs.existsSync(genPath)) { stale.push('the bundler did not produce ' + names[i]); continue; }
      if (!fs.existsSync(p(onDisk[i]))) { stale.push(onDisk[i] + ' does not exist - run npm run build:worker'); continue; }
      const have = fs.readFileSync(p(onDisk[i]), 'utf8');
      const want = fs.readFileSync(genPath, 'utf8');
      if (have === want) continue;

      // Report a readable window, not a single line. A one-line report is
      // useless when the differing lines are both "}", which is exactly what
      // the first version printed for a trailing-comment change.
      const a = have.split('\n'), b = want.split('\n');
      let at = 0;
      while (at < a.length && at < b.length && a[at] === b[at]) at++;
      const win = (arr) => arr.slice(at, at + 3).map(l => (l === undefined ? '<end of file>' : l.trim().slice(0, 88)));
      const w = (arr) => Math.max(arr.length, at + 1) + ' lines';
      stale.push(
        onDisk[i] + ' is STALE\n' +
        '           on disk (' + w(a) + '): ' + win(a).join('  |  ') + '\n' +
        '           rebuilt  (' + w(b) + '): ' + win(b).join('  |  ')
      );
    }
    if (stale.length === 0) ok('both artifacts are byte-identical to a fresh build');
    else for (const s of stale) no(s);
  }
}

// -----------------------------------------------------------------------------
console.log('[B2] no raw control bytes in either artifact...');
// -----------------------------------------------------------------------------
{
  // This is the same class of bug that made worker.js uncopyable. The bundle is
  // the file that gets pasted, so a control byte in it truncates a paste in
  // exactly the way the user hit. A generated artifact needs this check at
  // least as much as a source file does.
  const BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  let bad = [];
  for (const f of [FULL, MIN]) {
    if (!fs.existsSync(p(f))) { bad.push(f + ' is missing'); continue; }
    const lines = fs.readFileSync(p(f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (BAD.test(lines[i])) { bad.push(f + ' line ' + (i + 1) + ': ' + lines[i].replace(BAD, c => '<0x' + c.charCodeAt(0).toString(16) + '>').trim().slice(0, 80)); break; }
    }
  }
  if (bad.length === 0) ok('both artifacts are free of raw control bytes and will paste whole');
  else for (const b of bad) no(b);
}

// -----------------------------------------------------------------------------
console.log('[B3] both artifacts are genuinely single files...');
// -----------------------------------------------------------------------------
{
  let bad = [];
  for (const f of [FULL, MIN]) {
    if (!fs.existsSync(p(f))) { bad.push(f + ' is missing'); continue; }
    const src = fs.readFileSync(p(f), 'utf8');
    const imports = src.match(/^\s*import\s[^\n]*from\s+['"]/gm) || [];
    const dyn = src.match(/import\s*\(/g) || [];
    if (imports.length) bad.push(f + ' still has ' + imports.length + ' static import(s): ' + imports[0].trim().slice(0, 70));
    // A dynamic import is fine and is not a specifier, but flag it for review
    // rather than passing silently.
    if (dyn.length) console.log('         note: ' + f + ' contains ' + dyn.length + ' dynamic import(s) - not a bundling problem, but worth knowing');
  }
  if (bad.length === 0) ok('no static imports remain - nothing to resolve, so the dashboard can evaluate it');
  else for (const b of bad) no(b);
}

// -----------------------------------------------------------------------------
console.log('[B4] every name the modules import is DECLARED in the bundle...');
// -----------------------------------------------------------------------------
{
  // The check that `node --check` cannot do. Import aliases (`run as d1run`)
  // are the specific hazard: they are easy to record and easy to forget, and
  // losing one yields a file that is syntactically perfect and fails on the
  // first request that touches the code path using it.
  const SOURCES = ['server/d1_state.js', 'server/artifact_crypto.js', 'server/delivery.js', 'For Cloudflare/worker.js'];
  const needed = new Map();
  for (const s of SOURCES) {
    const src = fs.readFileSync(p(s), 'utf8');
    const re = /import\s*\{([\s\S]*?)\}\s*from/g;
    let m;
    while ((m = re.exec(src))) {
      for (const part of m[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const a = t.match(/^(\S+)\s+as\s+(\S+)$/);
        const local = a ? a[2] : t;
        if (!needed.has(local)) needed.set(local, []);
        needed.get(local).push(s);
      }
    }
  }
  const src = fs.readFileSync(p(FULL), 'utf8');
  const missing = [];
  for (const [local, origins] of needed) {
    const declared = new RegExp('^(?:const|let|var|function|async\\s+function|class)\\s+' + local + '\\b', 'm').test(src);
    if (!declared) missing.push(local + '  (imported by ' + [...new Set(origins)].join(', ') + ')');
  }
  if (missing.length === 0) ok('all ' + needed.size + ' imported names are declared, aliases included');
  else { no(missing.length + ' imported name(s) are referenced but never declared:'); for (const m of missing) console.log('         ' + m); }
}

// -----------------------------------------------------------------------------
console.log('[B5] both artifacts load and expose a usable Worker...');
// -----------------------------------------------------------------------------
{
  for (const f of [FULL, MIN]) {
    if (!fs.existsSync(p(f))) { no(f + ' is missing'); continue; }
    try {
      const mod = await import(pathToFileURL(p(f)).href);
      if (!mod.default) { no(f + ' has no default export'); continue; }
      if (typeof mod.default.fetch !== 'function') { no(f + ' default export has no .fetch'); continue; }
      if (typeof mod.default.scheduled !== 'function') { no(f + ' default export has no .scheduled - the cron sweeper (D19) would be lost'); continue; }
      const routes = Object.keys(mod.default).filter(k => typeof mod.default[k] === 'function');
      ok(f + ' loads, ' + routes.length + ' exported handler(s): ' + routes.join(', '));
    } catch (e) {
      no(f + ' threw on import: ' + e.message.split('\n')[0]);
    }
  }
}

// -----------------------------------------------------------------------------
console.log('[B6] the minified artifact is materially smaller...');
// -----------------------------------------------------------------------------
{
  if (!fs.existsSync(p(FULL)) || !fs.existsSync(p(MIN))) { no('an artifact is missing'); }
  else {
    const f = fs.statSync(p(FULL)).size, m = fs.statSync(p(MIN)).size;
    const cut = (1 - m / f) * 100;
    if (m < f && cut > 10) ok('min is ' + (f / 1024).toFixed(1) + ' KiB -> ' + (m / 1024).toFixed(1) + ' KiB, ' + cut.toFixed(0) + '% smaller');
    else no('minifying saved almost nothing (' + cut.toFixed(1) + '%) - not worth the extra file to maintain');
  }
}

// -----------------------------------------------------------------------------
console.log('[B7] the FULL gate and benchmark suites pass against both artifacts...');
// -----------------------------------------------------------------------------
{
  // This is the assertion that matters. Everything above is structure; this is
  // behaviour. The suites are the same ones that guard the source, pointed at
  // the build, so a bundling mistake that changes a single authorization
  // decision fails here.
  const SUITES = [
    ['tools/security_gates_test.mjs', /closed\s+23\/23/],
    ['tools/attacker_benchmark.mjs', /18\/18 attacks blocked/],
    ['tools/legacy_password_migration_test.mjs', /LEGACY MIGRATION TEST:\s+PASS/]
  ];
  for (const art of [FULL, MIN]) {
    if (!fs.existsSync(p(art))) { no(art + ' is missing, cannot run the suites against it'); continue; }
    for (const [suite, expect] of SUITES) {
      const r = spawnSync(process.execPath, [p(suite)], {
        encoding: 'utf8',
        env: { ...process.env, SH_WORKER_PATH: art },
        maxBuffer: 64 * 1024 * 1024
      });
      const out = (r.stdout || '') + (r.stderr || '');
      if (r.status !== 0) {
        no(art + ' -> ' + path.basename(suite) + ' exited ' + r.status + '\n' +
          out.trim().split('\n').slice(-8).map(l => '         ' + l).join('\n'));
      } else if (!expect.test(out)) {
        no(art + ' -> ' + path.basename(suite) + ' ran but did not report the expected result (' + expect + ')');
      } else {
        ok(art + ' -> ' + path.basename(suite) + '  ' + (expect.source.match(/\/(.*?)\//) || [, 'pass'])[1]);
      }
    }
  }
}

console.log('');
console.log('='.repeat(70));
console.log('SINGLE-FILE BUNDLE   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(70));
if (fail) {
  console.log('');
  console.log('  If B1 fails: you changed the worker and did not rebuild. Run');
  console.log('      npm run build:worker');
  console.log('  A stale bundle still works, which is the problem - it looks current');
  console.log('  and is not. Never paste one that failed this test.');
  console.log('');
  for (const pr of problems) console.log('  ' + pr);
  process.exit(1);
}
