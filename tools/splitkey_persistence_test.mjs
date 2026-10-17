// EVERY upload path must store the split key, or the artifact cannot run.
//
// THE BUG
//
// D29 made every build - keyless included - compile with a serverKey. The
// artifact's last layer is then encrypted with the padded key, and those bytes
// are not in the file: the only copy is the sh_skey_ record, served behind a
// session and handed over through __SH_SPLITKEY.
//
// Two upload paths did not write that record:
//
//   /sh/upload        keyless branch - stored the artifact and the meta row
//   /sh/kb-finalize   stored the loader meta for keeper-hosted scripts
//
// Both therefore published a script whose own artifact required a key that did
// not exist. Delivery found no key, fell back to SHL, and the artifact died at
// runtime with:
//
//     [ScripterHub] Key response too short
//
// which names neither size, nor storage, nor the missing key. It was reported as
// "large scripts don't work", because the keeper path is the one large scripts
// take.
//
// These checks read the real sources, so they fail if either path loses the key
// again rather than passing against a copy that drifted.

import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

// Slice a route body out of the worker by its opening comment marker.
function route(src, marker, len) {
    const i = src.indexOf(marker);
    return i < 0 ? '' : src.slice(i, i + (len || 2200));
}

console.log('the split key survives every upload path');

// --- /sh/upload, keyless branch -------------------------------------------
{
    const body = route(worker, "// ---- KEYLESS (free) scripts ----", 3000);
    check('found the keyless branch', body.length > 0);
    check('it writes KV_SKEY_PREFIX',
        /KV_SKEY_PREFIX \+ id/.test(body),
        'a keyless upload stores the artifact but not the key it needs');
    check('it stores paddedKey, t0 and chk',
        /paddedKey/.test(body) && /t0:/.test(body) && /chk:/.test(body));
    check('it refuses rather than publishing an unrunnable script',
        /would be published in a form that cannot execute/.test(body),
        'no guard, so the failure still ships to every user');
}

// --- /sh/kb-finalize: the path LARGE scripts take -------------------------
{
    // The guard sits ~60 lines past the route marker, behind the long comment
    // block explaining WHY. A short slice silently reported it missing, which is
    // the failure mode this file exists to prevent.
    const body = route(worker, "url.pathname === '/sh/kb-finalize'", 9000);
    check('found kb-finalize', body.length > 0);
    check('it writes KV_SKEY_PREFIX',
        /KV_SKEY_PREFIX \+ id/.test(body),
        'kb-finalize never stored the key, so every large script shipped without it');
    check('it stores paddedKey, t0 and chk',
        /paddedKey/.test(body) && /t0:/.test(body) && /chk:/.test(body));
    check('it refuses a keyless build with no key',
        /would be published in a form that cannot execute/.test(body));
}

// --- the client actually sends it -------------------------------------------
{
    // kb-finalize's body
    const fin = main.slice(main.indexOf("'sh/kb-finalize'"), main.indexOf("'sh/kb-finalize'") + 1200);
    // The client used to call kb-finalize, and the check was that the call
    // carried splitKey. The call is gone - it was the PC's upload path, and the
    // PC is not part of this product any more - so the check is now the
    // inverse. The worker's route still stores the key for a deployment that
    // has the PC backend switched on; what matters is that the ONLY upload
    // the client makes is /sh/upload, and that one sends the key (asserted
    // below).
    check('the client no longer calls kb-finalize', fin.length === 0 || !/shApi\('sh\/kb-finalize'/.test(fin),
        'the client is still uploading to the owner\'s machine');
    check('and it does not call kb-put either', !/shApi\('sh\/kb-put'/.test(main),
        'the client is still streaming parts to the owner\'s machine');

// NO keeper call sites, which is the point.
//
// This used to assert "at least 2 call sites and every one passes splitKey".
// Both call sites were the GH_SWITCH branches that routed >45MB artifacts
// to the owner's PC, and both were removed when large artifacts moved to R2.
// The assertion then failed on the COUNT - reporting a regression when the
// behaviour had in fact become stricter.
//
// The contract is now the inverse, and stronger: script uploads must not reach
// the Keeper at all, so the split key can never be stranded on a machine that
// is asleep.
const calls = [...main.matchAll(/shUploadKeeper\(\{[^}]*\}/g)].map(m => m[0]);
check('no script upload routes to the Storage Keeper', calls.length === 0,
    calls.length + ' call site(s) remain');
check('and the size-based keeper switch is gone', !/GH_SWITCH/.test(main),
    'a keeper switch with no call sites is a confusing constant');
check('the single upload path still sends splitKey', /payload\.splitKey = splitKey/.test(main));
}

// --- the delivery side agrees ----------------------------------------------
{
    // SHX must only be emitted when a key actually exists, and the keyless
    // decision must never silently drop it.
    check('SHX is emitted only when a key line exists',
        /keyLine \? \('SHX\\n'/.test(worker),
        'SHX could be emitted with no key, which is the same failure');
    check('SHL is still emitted when no key is stored',
        /: 'SHL\\n'/.test(worker),
        'scripts already published without a key would break');

    // And the client must never build a keyless artifact that needs no key.
    const fn = (main.match(/function shServerKeyOpts\([^]*?\n\}/) || [''])[0];
    check('shServerKeyOpts still returns a serverKey for every build',
        /return \{ serverKey:/.test(fn) && !/if \(keyless\) return \{\}/.test(fn),
        'keyless builds would go back to being self-contained');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
