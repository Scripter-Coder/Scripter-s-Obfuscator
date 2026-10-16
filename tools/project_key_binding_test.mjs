// Per-project license binding.
//
// Requested: "each time u make key it will be asking to choose specific
// project", so that a key works for one key-system project rather than "any".
//
// The binding has to be REAL. A selector that writes a field nothing reads is
// the same defect as the provider settings this project already had to remove
// twice: it looks like control, and there is none.
//
// These checks therefore assert that a bound key is REFUSED on a script in
// another project, and - just as important - that an unbound key keeps working
// everywhere, because every key already issued is unbound and refusing those
// would lock the entire installed base out.
//
// Run: node tools/project_key_binding_test.mjs

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function makeKV() {
    const store = new Map();
    return {
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, String(v)); },
        async delete(k) { store.delete(k); }
    };
}
function makeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
    return db;
}

const worker = (await import('../For Cloudflare/worker.js')).default;
const { OWNER_CODE_PLAIN, OWNER_CODE_HASH } = await import('./owner_code_test_helper.mjs');

const env = {
    LOADERS_KV: makeKV(),
    SH_SETUP_TOKEN: 'T', SH_BASE_URL: 'https://test.workers.dev',
    SH_OWNER_CODE_HASH: OWNER_CODE_HASH,
    SH_SESSION_SECRET: 'test-only-session-secret', SH_DB: makeD1()
};

let fails = 0;
function check(name, cond, detail = '') {
    if (cond) console.log('  ok   ' + name);
    else { fails++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const BASE = 'https://sh.test';
async function call(method, path, { body, ip = '1.1.1.1', ua = 'Roblox/570 Delta', token } = {}) {
    const headers = { 'User-Agent': ua };
    if (ip) headers['CF-Connecting-IP'] = ip;
    if (token) headers['X-SH-Token'] = token;
    const send = body && method !== 'GET' && method !== 'HEAD';
    if (send) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(BASE + path, {
        method, headers, body: send ? JSON.stringify(body) : undefined
    }), env, { waitUntil(p) { try { p && p.catch(() => {}); } catch (e) {} } });
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { __raw: t.slice(0, 200) }; } };

const login = await j(await call('POST', '/sh/login', { body: { code: OWNER_CODE_PLAIN }, ua: 'Mozilla/5.0 Chrome/120' }));
if (!login.token) { console.error('owner login failed'); process.exit(1); }
const ownerTok = login.token;

async function publish(name, projectId, projectName) {
    return await j(await call('POST', '/sh/upload', {
        ip: '1.1.1.1', token: ownerTok,
        body: {
            name, user: 'tester', cipher: 'U0hPS0Zha2VDaXBoZXI=', keyHash: 'h',
            normalCode: 'print(1)', authRequired: true, splitKey: 'SPLITKEYSPLITKEYSPLIT',
            projectId, projectName
        }
    }));
}
async function saveKey(key, projectId, projectName) {
    return await j(await call('POST', '/sh/licenses', {
        body: {
            token: ownerTok,
            licenses: {
                [key]: {
                    scriptId: 'all', projectId, projectName, hwid: '', expiresAt: 0,
                    banned: false, banReason: '', discordId: '', note: '', hwidResets: 0, executions: 0
                }
            }
        }
    }));
}
// One stable HWID PER KEY, not per IP.
//
// The first successful auth locks a key to its hardware - that is the product
// working - so reusing one key across calls with different HWIDs gets
// SHERR hwid, which is correct and made three of these checks fail for
// reasons that had nothing to do with the project binding.
async function trySession(scriptId, key, ip) {
    const r = await call('POST', '/sh/session', { ip, body: { id: scriptId, k: key, h: 'HWID-' + key } });
    const t = await r.text();
    return /^SHERR/.test(t) ? t.trim() : 'OK';
}

// ---------------------------------------------------------------------------
console.log('two scripts in two different key-system projects');
// ---------------------------------------------------------------------------
const A = await publish('Alpha', 'proj_alpha', 'test');
const B = await publish('Beta', 'proj_beta', 'testt');
check('both published', A.ok && B.ok, JSON.stringify([A, B]).slice(0, 160));

console.log('an ALL-projects key opens both, as it always did');
{
    const K = 'k'.repeat(40) + '1';
    await saveKey(K, 'all', 'All projects');
    check('works on project A', await trySession(A.id, K, '10.0.0.1') === 'OK');
    check('works on project B', await trySession(B.id, K, '10.0.0.2') === 'OK',
        'got ' + await trySession(B.id, K, '10.0.0.3'));
}

console.log('a key bound to one project opens ONLY that project');
{
    const K = 'k'.repeat(40) + '2';
    await saveKey(K, 'proj_alpha', 'test');
    check('opens its own project', await trySession(A.id, K, '10.0.1.1') === 'OK');
    const other = await trySession(B.id, K, '10.0.1.2');
    check('is REFUSED on the other project', /^SHERR project/.test(other), 'got ' + other);
    check('and is told it is a project mismatch, not "invalid"',
        other.indexOf('invalid') === -1,
        'reporting "invalid" for a key that is perfectly fine sends the owner hunting for a typo');
}

console.log('a key issued before this change keeps working everywhere');
{
    // No projectId at all - exactly what the pre-change panel sent.
    const K = 'k'.repeat(40) + '3';
    await j(await call('POST', '/sh/licenses', {
        body: {
            token: ownerTok,
            licenses: {
                [K]: {
                    scriptId: 'all', hwid: '', expiresAt: 0, banned: false, banReason: '',
                    discordId: '', note: '', hwidResets: 0, executions: 0
                }
            }
        }
    }));
    check('opens project A', await trySession(A.id, K, '10.0.2.1') === 'OK');
    check('opens project B', await trySession(B.id, K, '10.0.2.2') === 'OK',
        'every already-issued key is unbound; refusing these would lock out the whole installed base');
}

console.log('a script published before this change still opens');
{
    // No projectId on the script. A bound key must not refuse it by accident:
    // the gate has no project to compare against, so it cannot know.
    const C = await j(await call('POST', '/sh/upload', {
        ip: '1.1.1.1', token: ownerTok,
        body: {
            name: 'Legacy', user: 'tester', cipher: 'U0hPS0Zha2VDaXBoZXI=', keyHash: 'h',
            normalCode: 'print(1)', authRequired: true, splitKey: 'SPLITKEYSPLITKEYSPLIT'
        }
    }));
    check('the script published', C.ok === true, JSON.stringify(C).slice(0, 140));
    const K = 'k'.repeat(40) + '4';
    await saveKey(K, 'proj_alpha', 'test');
    check('an already-published script is not refused by a bound key',
        await trySession(C.id, K, '10.0.3.1') === 'OK',
        'the script carries no project, so there is nothing to compare and refusing would break it');
}

console.log('the Add User dialog offers the choice, and only real targets');
{
    const src = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    check('Add User has a project selector', /id="addUserProject"/.test(src));
    check('with an All-projects option', /value="all">All projects/.test(src));
    check('and it stores the choice on the key', /projectId: projectId \|\| 'all'/.test(src));
    check('and sends it to the worker', /projectId: k\.projectId \|\| 'all'/.test(src));
    check('and the worker keeps it', /projectId: String\(r\.projectId/.test(
        fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8')));
    // A key bound to a project with no gated script opens nothing, so it must
    // not be offered.
    check('only projects WITH key-system scripts are offered',
        /requireKey && !s\.freeForEveryone/.test(src),
        'offering a project with no gated script produces a key that secures nothing');
}

console.log();
console.log('PROJECT KEY BINDING   ' + (fails ? fails + ' FAILED' : 'all checks passed'));
process.exit(fails ? 1 : 0);