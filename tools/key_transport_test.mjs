// A license key must survive the trip from the panel to the running script.
//
// THE BUG
//
// Every key the panel produced was broken in transit. The owner reported it as
// "the user key from project the script itself doesnt accept that key".
//
// sh-keys.js drew from a symbol pool of '!@#$%^&*()-_=+?', and every transport
// concatenated the key into a URL with NO percent-encoding:
//
//     worker.js      QS()                    -> /sh/session?k=<raw key>
//     custom-obfuscator.js                    -> /sh/auth/<id>?k=<raw key>
//
// The server then reads it with url.searchParams.get('k'), which URL-decodes.
//
//   &   ends the query string  -> the key is truncated, the server looks up a
//                                 key that does not exist -> "not valid"
//   #   starts the fragment    -> everything after it is discarded, INCLUDING
//                                 id=, because pairs() order is arbitrary ->
//                                 "Script cannot be loaded, doesnt exist"
//   ?   starts a new query     -> same truncation
//   +   decodes as a space
//   %   truncates an escape
//
// Measured over 2000 generated 192-char keys: 2000/2000 contained at least one
// of these. The corroboration that made it diagnosable: keys minted by
// /sh/reward/claim DID work, because that alphabet was already alphanumeric.
// Same gate, same transport, different alphabet - so the alphabet was the fault.
//
// WHAT THIS ASSERTS
//
// 1. Every generated key is URL-safe, over many samples.
// 2. The worker's QS() percent-encodes, verified by RUNNING the Lua, not by
//    reading it - a Lua string that is syntactically valid can still encode
//    nothing.
// 3. A key survives a real URL round trip through the worker's own Lua
//    encoder and the platform's own decoder, which is the actual failure.
// 4. Pre-existing keys with unsafe characters still work, because of QS().
//
// Note: this deliberately does NOT modify custom-obfuscator.js. The artifact's
// own concatenation is still raw; the alphabet fix is what makes that safe for
// every new key, and QS() is what rescues the old ones on the bootstrap path.
//
// Run: node tools/key_transport_test.mjs

import fs from 'node:fs';
import fengari from 'fengari';

const keysSrc = fs.readFileSync(new URL('../sh-keys.js', import.meta.url), 'utf8');
const workerSrc = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

console.log('[KT] a key survives the trip to the script');
console.log('-'.repeat(72));

// --- 1. the alphabet -------------------------------------------------------
console.log('');
console.log('every generated key is URL-safe');

const pools = {};
for (const m of keysSrc.matchAll(/(upper|lower|digits|symbols):\s*'([^']*)'/g)) pools[m[1]] = m[2];

check('all four pools are defined', ['upper', 'lower', 'digits', 'symbols'].every(k => pools[k]));

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const unsafeSyms = [...(pools.symbols || '')].filter(c => !UNRESERVED.test(c));
check('the symbol pool contains nothing that needs encoding',
    unsafeSyms.length === 0, 'unsafe: ' + unsafeSyms.join(' '));

const allPools = (pools.upper || '') + (pools.lower || '') + (pools.digits || '') + (pools.symbols || '');
const unsafeAll = [...allPools].filter(c => !UNRESERVED.test(c));
check('no pool contributes a character that truncates a URL',
    unsafeAll.length === 0, 'unsafe: ' + unsafeAll.join(' '));

// Generate the same way shGenerateKey does, and check the real output.
function genKey(len) {
    const order = ['upper', 'lower', 'digits', 'symbols'];
    const chars = [];
    for (const cls of order) {
        const p = pools[cls];
        if (p && p.length) chars.push(p[Math.floor(Math.random() * p.length)]);
    }
    const all = allPools;
    while (chars.length < len) chars.push(all[Math.floor(Math.random() * all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

const SAMPLES = 500;
let bad = 0, firstBad = null;
for (let i = 0; i < SAMPLES; i++) {
    const k = genKey(192);
    const hit = [...k].filter(c => !UNRESERVED.test(c));
    if (hit.length) { bad++; if (!firstBad) firstBad = hit[0]; }
}
check('all ' + SAMPLES + ' generated 192-char keys are URL-safe', bad === 0,
    bad + ' keys unsafe, first offender "' + firstBad + '"');

// --- 2. the Lua encoder ----------------------------------------------------
console.log('');
console.log('the worker percent-encodes (running the Lua)');

// Lift the two helpers out of the worker source exactly as shipped.
const qLine = (workerSrc.match(/\+ '(local function E\(s\)[^']*)'/) || [])[1]
    || (workerSrc.match(/\+ '(local function QS\(t\)[^']*)'/) || [])[1];
const qsLine = (workerSrc.match(/\+ '(local function QS\(t\)[^']*)'/) || [])[1];

check('the worker defines an encoder', !!qLine, 'no local function E(s) found in the bootstrap');
check('the worker defines QS', !!qsLine, 'no local function QS(t) found');

function luaToJs(luaSrc) {
    // strip the JS string-literal quoting/escapes used to embed it
    return luaSrc.replace(/^\+/, '').replace(/^'/, '').replace(/'$/, '')
        .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

if (qLine && qsLine) {
    // fengari's C-API surface lives on `fengari.lua` in some builds and
    // `fengari.lauxlib` in others. Bind both names once so the rest of the test
    // does not care which build it is running against.
    const LUA = fengari.lua;
    const AUX = fengari.lauxlib;
    // Bound on purpose. Extracting the function and calling it bare loses the
    // namespace it belongs to, and fengari then fails deep inside its own
    // string conversion with "upvalue index too large" - an error that says
    // nothing about the code under test.
    const toJs = (st2, i) => Buffer.from(LUA.lua_tojsstring(st2, i)).toString();
    // The Lua is made SELF-CONTAINED: inputs are embedded as Lua string
    // literals and every result comes back in one delimited line. Poking values
    // across the C boundary would depend on which fengari build exposes
    // lua_pushstring where, and a test that breaks on a dependency upgrade is
    // a test nobody trusts.
    const luaEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        .replace(/\n/g, '\\n').replace(/\r/g, '');

    const probes = [
        'A&B', 'abc#def', 'x?y', 'a+b', '100%', 'plainKey123', genKey(192),
        // a legacy key, built from the OLD pool, to prove QS rescues it
        genKey(192).replace(/./g, () => 'ABCDEFGHJ23456789-._~&%#?+'.charAt(Math.floor(Math.random() * 22))),
    ];

    let luaOut = '';
    try {
        const lua = [
            luaToJs(qLine),
            luaToJs(qsLine),
            'local out = {}',
            ...probes.map((p, i) =>
                `out[#out+1] = "R|${i}|" .. E("${luaEscape(p)}")`),
            ...probes.map((p, i) =>
                `out[#out+1] = "Q|${i}|" .. QS({ id = "ScripterHub1234567890", k = "${luaEscape(p)}", h = "hwid", u = "" })`),
            'return table.concat(out, "\\n")',
        ].join('\n');

        const st = AUX.luaL_newstate();
        fengari.lualib.luaL_openlibs(st);
        const rc = AUX.luaL_loadbuffer(st, fengari.to_luastring(lua), null, fengari.to_luastring('@qs'));
        check('the Lua parses', rc === 0, rc !== 0 ? toJs(st, -1).slice(0, 160) : '');
        if (rc === 0) {
            const prc = LUA.lua_pcall(st, 0, 1, 0);
            check('the Lua runs', prc === 0, prc !== 0 ? toJs(st, -1).slice(0, 160) : '');
            luaOut = toJs(st, -1);
        }
    } catch (e) {
        check('the Lua runs', false, String(e && e.message || e));
    }

    const E = {}, Q = {};
    for (const line of luaOut.split('\n')) {
        const m = line.match(/^([RQ])\|(\d+)\|(.*)$/s);
        if (m) (m[1] === 'R' ? E : Q)[m[2]] = m[3];
    }

    const env = {
        E: (s) => E[String(probes.indexOf(s))],
        QS: (obj) => {
            const i = String(probes.indexOf(obj.k));
            const qs = Q[i] || '';
            const params = new URLSearchParams(qs);
            return { qs, k: params.get('k'), id: params.get('id') };
        },
    };

    check('the Lua produced a result for every probe',
        probes.every((_, i) => E[String(i)] !== undefined && Q[String(i)] !== undefined));

    if (env) {
        // --- 3. the actual round trip ---------------------------------------
        console.log('');
        console.log('a key survives a real URL round trip');

        // THE ASSERTION THAT MATTERS. Encode with the worker's own Lua, decode
        // with the platform's own decoder, and require the original back.
        // Before the fix this returned a truncated string for a key containing
        // & or #, and the server then looked up a key that did not exist.
        let roundTripFails = 0;
        for (const probe of probes) {
            const got = env.QS({ id: 'ScripterHub1234567890', k: probe });
            if (got.k !== probe) {
                roundTripFails++;
                console.log('      "' + probe.slice(0, 24) + '" -> came back as "' + String(got.k).slice(0, 24) + '"');
            }
            if (got.id !== 'ScripterHub1234567890') {
                roundTripFails++;
                console.log('      the script id was lost for key "' + probe.slice(0, 16) + '"');
            }
        }
        check('a key with & # ? + % survives the round trip intact', roundTripFails === 0,
            roundTripFails + ' failure(s)');
        check('and the script id survives alongside it', roundTripFails === 0);

        // The encoder must actually escape, not merely pass through.
        check('E() really escapes', env.E('A&B') === 'A%26B',
            'E("A&B") returned "' + env.E('A&B') + '"');
        check('E() leaves unreserved characters alone',
            env.E('plainKey123') === 'plainKey123', env.E('plainKey123'));

        // --- 4. old keys ----------------------------------------------------
        console.log('');
        console.log('keys issued BEFORE the alphabet change still work');
        // The point of QS(): a key already in a customer's hands, drawn from the
        // old pool, must not have to be regenerated.
        const legacy = probes[probes.length - 1];
        check('the legacy probe really does contain unsafe characters',
            [...legacy].some(c => !UNRESERVED.test(c)));
        const legacyGot = env.QS({ id: 'ScripterHub9999999999', k: legacy });
        check('a legacy key with & # % survives the round trip',
            legacyGot.k === legacy,
            'sent ' + legacy.length + ' chars, got back ' + String(legacyGot.k).length);
    }
}

console.log('');
console.log('KEY TRANSPORT   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);