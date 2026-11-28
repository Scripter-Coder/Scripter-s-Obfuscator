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

// -----------------------------------------------------------------------------
console.log('[7] full key-system pass...');
// -----------------------------------------------------------------------------
check('the in-file /sh/auth HWID is stable (no place/job id)', () => {
    assert.ok(!/HW\s*=\s*HW\s*\.\.\|"\.\.tostring\(game\.PlaceId\)/.test(obfSrc),
        'the loader still folds game.JobId into the hardware id');
    assert.match(obfSrc, /g\.ScripterHubHwid/);
});
check('/sh/auth honours the second hardware id', () => {
    assert.match(workerSrc, /classifyLicense\(lic\[key\], hwid, Date\.now\(\), meta\.projectId, hwid2\)/);
});
check('free+key scripts publish their project too', () => {
    assert.match(mainSrc, /keyless: true,[\s\S]{0,400}silentMode: !!silentMode/);
    assert.match(mainSrc, /payload\.projectId = String\(freeProject\.id/);
});
check('ordinary key failures no longer inflate Threats Blocked', () => {
    assert.match(workerSrc, /function countThreat\(reason\)/);
    assert.match(workerSrc, /const deny = async \(reason, extra\) => \{\s*countThreat\(reason\)/);
    assert.ok(!/if \(!isExecutor\) \{\s*S\.threatsBlocked\+\+/.test(workerSrc),
        'a browser opening a loadstring link is still counted as a threat');
});
check('a cumulative execution total has an independent high-water mark', () => {
    assert.match(mainSrc, /function shExecMaxKey\(\)/);
    assert.match(mainSrc, /Math\.max\(s\[s\.length - 1\]\.total, shExecHighWater\(\)\)/);
});

// -----------------------------------------------------------------------------
console.log('[8] Silent Mode progress + error output...');
// -----------------------------------------------------------------------------
check('Silent Mode is published with the script', () => {
    assert.match(mainSrc, /silentMode: !!silentMode, etaSeconds: etaSeconds/);
    assert.match(workerSrc, /silentMode: body\.silentMode === true/);
});
check('non-silent scripts get the five status prints', () => {
    for (const line of [
        'Script Sucessfully Executed', 'Checking Security Checks',
        'Loading Script... (Will take approximately', 'Note: if script wont load or has error',
        'Script Loaded Enjoy'
    ]) assert.ok(workerSrc.includes(line), 'missing status line: ' + line);
});
check('runtime failures print the requested reason + support note', () => {
    assert.match(workerSrc, /Detected error in script\.\.\. Reason: /);
    assert.match(workerSrc, /if you believe that something wrong with script join discord server/);
});
check('Silent Mode suppresses ALL of it', () => {
    assert.match(workerSrc, /const statusOn = silentMode !== true/);
    assert.match(workerSrc, /\(statusOn \? 'SHSTATUS\("Script Loaded Enjoy/);
});

// -----------------------------------------------------------------------------
console.log('[9] deleted users leave the leaderboard (functional)...');
// -----------------------------------------------------------------------------
{
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(p('migrations/0001_init.sql'), 'utf8'));
    const store = new Map();
    const kv = {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); },
        async list(o) {
            const keys = [...store.keys()].filter(k => k.startsWith(o.prefix || ''))
                .map(name => ({ name }));
            return { keys, list_complete: true, cursor: undefined };
        }
    };
    const env = {
        LOADERS_KV: kv, SH_DB: db, SH_SETUP_TOKEN: 'T', SH_SESSION_SECRET: 'S',
        SH_BASE_URL: 'https://test.workers.dev'
    };
    const mod = await import(pathToFileURL(p('For Cloudflare/worker.js')).href);
    const call = async (url) => {
        const r = await mod.default.fetch(new Request('https://test.workers.dev' + url), env, { waitUntil() {} });
        return r.json();
    };
    const uid = 'u-fedfege';
    store.set('sh_user_' + uid, JSON.stringify({ username: 'fedfege' }));
    store.set('sh_xp_' + uid, JSON.stringify({ name: 'fedfege', xp: 9000, level: 42 }));
    store.set('sh_xp_u-alive', JSON.stringify({ name: 'alive', xp: 100, level: 5 }));
    store.set('sh_user_u-alive', JSON.stringify({ username: 'alive' }));
    let board = await call('/sh/leaderboard?metric=level');
    check('a live account is ranked by level', () => {
        assert.ok(board.users.some(u => u.name === 'fedfege'), JSON.stringify(board).slice(0, 200));
    });
    // Simulate the old stale state: the account is gone, its XP record isn't.
    store.delete('sh_user_' + uid);
    board = await call('/sh/leaderboard?metric=level');
    check('a deleted account is NOT ranked', () => {
        assert.ok(!board.users.some(u => u.name === 'fedfege'), JSON.stringify(board).slice(0, 200));
        assert.ok(board.users.some(u => u.name === 'alive'), 'live rival must survive');
    });
    check('the orphan XP record is purged on that read', () => {
        assert.strictEqual(store.has('sh_xp_' + uid), false);
    });
}

// -----------------------------------------------------------------------------
console.log('[10] honest load ETA + nosession recovery...');
// -----------------------------------------------------------------------------
check('the publisher keeps an honest size-based estimate', () => {
    assert.match(mainSrc, /const etaSeconds = Math\.max\(6,/);
    assert.match(workerSrc, /etaSeconds: Math\.max\(6,/);
});
check('the in-game ETA is computed from the bytes actually delivered', () => {
    assert.match(workerSrc, /SHFMT\(3\.5\+\(#body\/1024\)\*0\.016\)/);
});
check('the loader reports the measured elapsed time too', () => {
    assert.match(workerSrc, /SHSTATUS\("Finished in "..SHFMT\(SHNOW\(\)-SH_T0\)/);
});
check('a fresh session is minted for nosession / stale too', () => {
    assert.match(workerSrc, /rsn=="nonce" or rsn=="nosession" or rsn=="no-session" or rsn=="stale"/);
});
check('the retry refetches the vault under the new session', () => {
    assert.match(workerSrc, /VB2=GET\(BASE\.\."\/sh\/vault\/"/);
});

console.log('========================================================================');
console.log(`USER REQUESTS   ${pass} passed, ${fail} failed`);
console.log('========================================================================');
if (fail) process.exit(1);
