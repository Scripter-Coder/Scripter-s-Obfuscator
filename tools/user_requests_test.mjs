// =============================================================================
// USER-REQUESTED FIXES — regression checks
// =============================================================================
// Run: node tools/user_requests_test.mjs
//
// The seven changes asked for in this round are spread across the site, the
// obfuscator and the worker. The other suites already execute the generated
// bootstrap and the obfuscator end-to-end; this one pins the NEW decisions so a
// later "cleanup" cannot quietly put them back:
//
//   1/2  SECURE + fastLoad defaults, no ultra wrap, no layers-only downgrade
//   3    rate-limit becomes SHERR busy, bounded retry in the in-game loader
//   4    executor name travels on BOTH session mints (including nonce retry)
//   5    execution counters are monotonic in the browser and awaited in worker
//   6    `level` is an accepted leaderboard metric
//   7    chart: 60s clock, decade axis to 1m, real executor names
// =============================================================================

import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(p(rel), 'utf8');

let pass = 0, fail = 0;
const ok = (l) => { pass++; console.log('  OK   ' + l); };
const no = (l) => { fail++; console.log('  FAIL ' + l); };
const check = (label, fn) => {
    try { fn(); ok(label); } catch (e) { no(label + '  -> ' + (e && e.message)); }
};

const workerSrc = read('For Cloudflare/worker.js');
const mainSrc = read('main.js');
const htmlSrc = read('index.html');
const obfSrc = read('custom-obfuscator.js');

// -----------------------------------------------------------------------------
console.log('[1] obfuscator is harder WITHOUT costing load time...');
// -----------------------------------------------------------------------------
check('the website builds with the SECURE profile', () => {
    assert.strictEqual((mainSrc.match(/profile: 'SECURE'/g) || []).length, 2,
        'both the create and edit paths must request SECURE');
});
check('fastLoad is on for both create and edit', () => {
    assert.strictEqual((mainSrc.match(/fastLoad: true/g) || []).length, 2);
});
check('ultra wrapping is off - otherwise the VM is dropped for layers-only', () => {
    assert.strictEqual((mainSrc.match(/ultra: false/g) || []).length, 2);
});
check('fastLoad caps cipher rounds and layer work', () => {
    assert.match(obfSrc, /options\.cipherRounds = Math\.min\(2, options\.cipherRounds\)/);
    assert.match(obfSrc, /options\.fastLoad === true && intensity > 8\)\s*intensity = 8/);
});

// -----------------------------------------------------------------------------
console.log('[2] the generated loader survives execute-spam...');
// -----------------------------------------------------------------------------
check('a rate-limit body becomes an actionable SHERR busy', () => {
    assert.match(workerSrc, /return "SHERR busy\\\\n"/);
    assert.match(workerSrc, /if r=="busy" then return "Too many requests/);
});
check('HTTP helpers retry a bounded number of times', () => {
    assert.match(workerSrc, /local function GET\(url,tries\)[\s\S]*?for _=1,\(tries or 3\) do/);
    assert.match(workerSrc, /local function CALL\(path,q\)[\s\S]*?for _=1,3 do/);
});
check('the network error message tells the user what to do', () => {
    assert.match(workerSrc, /Check your connection\/executor, then re-execute/);
});

// -----------------------------------------------------------------------------
console.log('[3] keys stay valid on the nonce-recovery path...');
// -----------------------------------------------------------------------------
check('the second session mint carries h2 (executor name) too', () => {
    const m = workerSrc.match(/local r2=CALL\("\/sh\/session"[^\n]*/);
    assert.ok(m, 'nonce-recovery mint not found');
    assert.match(m[0], /h2=tostring\(HW2\)/);
});

// -----------------------------------------------------------------------------
console.log('[4] Total Executions no longer resets to 0...');
// -----------------------------------------------------------------------------
check('the worker awaits persisted counters before serving stats', () => {
    assert.match(workerSrc, /await loadStatsOnce\(env\);/);
});
check('the browser never records a LOWER cumulative total', () => {
    assert.match(mainSrc, /if \(last && total < last\.total\) total = last\.total;/);
});

// -----------------------------------------------------------------------------
console.log('[5] Leaderboard has a Level metric...');
// -----------------------------------------------------------------------------
check('the pill exists', () => {
    assert.match(htmlSrc, /shSetLeaderMetric\('level', this\)/);
});
check('the worker accepts and sorts by level', () => {
    assert.match(workerSrc, /'obfuscations', 'level'\]/);
    assert.match(workerSrc, /level: Number\(r\.level\) \|\| 1/);
});

// -----------------------------------------------------------------------------
console.log('[6] the live chart reads bottom-to-top to 1m and names executors...');
// -----------------------------------------------------------------------------
check('chart refresh is 60 seconds, on its own timer', () => {
    assert.match(mainSrc, /shChartTimer = setInterval\([\s\S]*?\}, 60000\);/);
});
check('axis labels run 0, 10, 100, 1k, 10k, 100k, 1m', () => {
    assert.match(mainSrc, /var AXIS = \[1000000, 100000, 10000, 1000, 100, 10, 0\]/);
    assert.match(mainSrc, /var AXIS_LABEL = \['1m', '100k', '10k', '1k', '100', '10', '0'\]/);
});
{
    const mod = await import(pathToFileURL(p('For Cloudflare/worker.js')).href);
    for (const name of ['Real', 'Solara', 'Wave', 'Delta', 'Xeno', 'Synapse Z', 'MacSploit']) {
        check('sniffExecutor finds ' + name, () => {
            assert.strictEqual(mod.sniffExecutor('Roblox/570 ' + name), name);
        });
    }
    check('X-SH-Executor beats the hard-coded User-Agent', () => {
        const req = { headers: { get: (k) => k === 'X-SH-Executor' ? 'Real' : 'Roblox/570 Delta Executor' } };
        assert.strictEqual(mod.executorFrom(req, 'Roblox/570 Delta Executor'), 'Real');
    });
    check('loader sends the real executor name as a header', () => {
        assert.strictEqual((workerSrc.match(/\["X-SH-Executor"\]=EXNAME/g) || []).length, 2);
        assert.match(workerSrc, /EXNAME=tostring\(HW2\):gsub/);
    });
}

console.log('========================================================================');
console.log(`USER REQUESTS   ${pass} passed, ${fail} failed`);
console.log('========================================================================');
if (fail) process.exit(1);
