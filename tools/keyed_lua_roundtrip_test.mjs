// A keyed script must actually RUN, which means the Lua has to open the body.
//
// WHY THIS TEST EXISTS, AND WHAT IT WAS WRITTEN AGAINST
//
// The owner saw, every single time:
//
//     ScripterHub - Wrong Special Key, or the delivery was tampered with.
//
// Behind that one message were SIX separate defects, in two places:
//
//   ON THE SERVER
//   1. The upload stored the SPECIAL-KEY ciphertext as the delivery artifact.
//      The executor has the LICENCE and the loader decrypts with the licence, so
//      the delivered body could never open - it was ciphertext under a key the
//      visitor does not hold.
//   2. There was no base64 decode in the loader at all, so even the right body
//      was XORed in its encoded form.
//
//   IN THE LUA DECODER (all five in the same sixteen lines)
//   3. It read s:sub(1+j,1+j) instead of s:sub(i+j,i+j), so every group after
//      the first read from position 1 of the whole string.
//   4. The full-group divisors were 262144, 4096, 64 - the base64 SHIFT
//      constants 64^3, 64^2, 64^1 - used as if they were byte divisors. For
//      "YWJj" they give 24, 22, 137 where "abc" is 97, 98, 99.
//   5. It emitted the leftover bits as an extra byte per group, so every body
//      came out one byte too long per four characters.
//   6. The tail divisors were 4 and 16 instead of 16 and 4096, producing 388
//      and 6232 - and string.char rejects anything above 255, raising an error
//      that Lua renders as the uninformative "' (".
//
//   plus rem==1, which is not valid base64 and was silently truncating the
//   artifact by one byte instead of refusing.
//
// WHY NONE OF IT WAS CAUGHT
//
// Every test that existed compared the worker's JavaScript encryptor against the
// JavaScript decryptor, or compared the Lua SEED against the JavaScript seed.
// Both of those were correct - the seed matched exactly - so all of it was green
// while no keyed script could run at all. DEC reads its input from a closure
// global rather than an argument, so it was awkward to call and easy to skip.
//
// This runs the SHIPPED DEC, extracted from worker.js, over bodies produced by
// the SHIPPED encryptor, at several lengths. Length is not a detail: defect 6
// only appears for short bodies, and rem==1 only for a one-byte artifact, so a
// suite of realistic sizes alone would still be green.
//
// Run: node tools/keyed_lua_roundtrip_test.mjs

import fs from 'node:fs';
import fengari from 'fengari';

const workerSrc = fs.readFileSync(new URL('../For Cloudflare/worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

console.log('[KL] the shipped Lua opens what the worker encrypts');
console.log('-'.repeat(72));

// ---------------------------------------------------------------- the encoder
console.log('');
console.log('the worker encryptor, lifted verbatim');

function lift(re) { const m = workerSrc.match(re); return m ? m[0] : null; }
const seedJs = lift(/function shSeed\(key, idx\) \{[\s\S]*?\n\}/);
const xsJs = lift(/function xs128Next\(s\) \{[\s\S]*?\n\}/);
const encJs = lift(/function shEncryptForLoader\(text, key\) \{[\s\S]*?\n\}/);
check('it can be lifted out of the worker', !!(seedJs && xsJs && encJs));

const shEncryptForLoader = seedJs && xsJs && encJs
    ? new Function('TextEncoder', 'btoa',
        seedJs + '\n' + xsJs + '\n' + encJs + '\nreturn shEncryptForLoader;'
    )(globalThis.TextEncoder, s => Buffer.from(s, 'binary').toString('base64'))
    : null;

// ------------------------------------------------------------------- the Lua
//
// DEC IS EXTRACTED AS A BLOCK, NOT LINE BY LINE.
//
// Its helpers are runs of wrapped source lines and each one ends mid-function:
// DEC's third line ends with `end` because it closes an inner `for`, while the
// function itself continues. Any "stop at the first end" heuristic truncates it,
// drops the return statement, and produces a DEC that silently returns nothing -
// which reads as a key mismatch rather than a broken extraction.
function luaDecryptBlock() {
    const from = workerSrc.indexOf("// 5. DECRYPT LOCALLY WITH THE LICENCE KEY");
    const to = workerSrc.indexOf('local LS=loadstring or load', from);
    if (from < 0 || to < 0) return '';
    const seg = workerSrc.slice(from, to);
    const pieces = [];
    const re = /^\s*\+ '(.*)'\s*,?\s*$/gm;
    let m;
    while ((m = re.exec(seg)) !== null) pieces.push(m[1]);
    return pieces
        .map(p => p.replace(/%%/g, '%').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
        .join('\n');
}

// ---------------------------------------------------------------- the round trip
console.log('');
console.log('Lua DEC(worker ciphertext) == artifact');
if (shEncryptForLoader) {
    const block = luaDecryptBlock();
    check('the shipped DEC is present', block.indexOf('local function DEC(') !== -1);

    const LUA = fengari.lua, AUX = fengari.lauxlib;

    // LENGTHS MATTER, NOT JUST CONTENT.
    //
    // 'SHOK' is prepended before encrypting, so the plaintext length is 4 plus
    // the artifact. That decides which base64 tail applies:
    //
    //   artifact 1 byte  -> plaintext 5  -> remainder 2 after one group
    //   artifact 2 bytes -> plaintext 6  -> exact groups, no tail
    //   artifact 3 bytes -> plaintext 7  -> remainder 3 after one group
    //
    // Defect 5 (extra byte per group) breaks ALL of them. Defect 6 (tail
    // divisors) breaks only the remainder cases. A suite using one size would
    // have caught some of this and passed on the rest.
    const ARTIFACTS = [
        '-- generated by ScripterHub\nlocal function boot()\n  print("hello")\nend\nboot()\nreturn {"a","b"}\n',
        'a',
        'ab',
        'abc',
        'abcd',
        'abcde',
        '-- a\n'.repeat(4000) + '\nlocal x = "€ ünïcode ✓"\nreturn x\n',
        Array.from({ length: 6000 }, (_, i) =>
            String.fromCharCode(33 + (i * 7) % 90)).join('\n'),
    ];
    const LICENCE = 'A7xK-9pQ2.mR~tZ1';

    const runDec = (ciphertext, key) => {
        const src = 'B=' + JSON.stringify(ciphertext) + '\nK=' + JSON.stringify(key) + '\n'
            + block + '\nreturn DEC(K)';
        const st = AUX.luaL_newstate();
        fengari.lualib.luaL_openlibs(st);
        if (AUX.luaL_loadbuffer(st, fengari.to_luastring(src), null, fengari.to_luastring('@dec')) !== 0) {
            return { err: String(LUA.lua_tojsstring(st, -1)).slice(0, 200) };
        }
        if (LUA.lua_pcall(st, 0, 1, 0) !== 0) {
            return { err: String(LUA.lua_tojsstring(st, -1)).slice(0, 200) };
        }
        const v = LUA.lua_tojsstring(st, -1);
        return { out: v === 'nil' ? null : v };
    };

    ARTIFACTS.forEach((art, i) => {
        const cipher = shEncryptForLoader(art, LICENCE);
        const got = runDec(cipher, LICENCE);
        let detail = '';
        if (got.err) detail = 'lua error: ' + got.err;
        else if (got.out === null) detail = 'the shipped Lua returned nil - that is exactly the Wrong Special Key failure';
        else if (got.out !== art) {
            let d = 0;
            while (d < got.out.length && d < art.length && got.out[d] === art[d]) d++;
            detail = 'diverges at ' + d + ' of ' + art.length +
                ' chars; got ' + got.out.length + ', want ' + art.length;
        }
        check('artifact ' + (i + 1) + ' (' + art.length + ' chars) round-trips through the real Lua',
            !got.err && got.out === art, detail);
    });

    // The wrong key must still fail - that is the whole point of the envelope.
    {
        const cipher = shEncryptForLoader(ARTIFACTS[0], LICENCE);
        const bad = runDec(cipher, 'a-completely-different-key');
        check('a wrong licence still returns nil', !bad.err && bad.out === null,
            bad.err ? bad.err : 'the wrong key opened the body');
    }

    // And the encoding order and arithmetic are asserted directly, because those
    // are the defects - a green round trip on one length would not localise them.
    // And the encoding order and the arithmetic are asserted directly, because
    // those are the defects - a green round trip at one length localises nothing.
    //
    // COMMENTS ARE STRIPPED FIRST. The decoder's own comment block QUOTES the
    // old bug - "it also read s:sub(1+j,1+j) instead of s:sub(i+j,i+j)" - so a
    // grep over the raw block matches the EXPLANATION rather than the code.
    const code = block.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

    check('the Lua base64-DECODES before it XORs',
        /_b64dec/.test(code) && /for i=1,#BD do/.test(code),
        'the Lua still XORs the base64 characters instead of the payload bytes behind them');
    check('and it no longer XORs the raw wire characters',
        !/for i=1,#B do/.test(code));
    check('the group offset uses i, not a literal 1',
        !/s:sub\(1\+j,1\+j\)/.test(code),
        'every group after the first reads from the start of the string');

    // THE THREE SETS OF SHIFTS. These are the whole decoder.
    //
    //   4 chars = 24 bits = 3 bytes : c>>16, (c>>8)&0xFF, c&0xFF  -> /65536 /256
    //   3 chars = 18 bits = 2 bytes : c>>10, (c>>2)&0xFF           -> /1024  /4
    //   2 chars = 12 bits = 1 byte  : c>>4                         -> /16
    //
    // Every one of these was wrong at some point, and the wrong versions did not
    // raise - 4096 and 16 for the 18-bit case are the 24-bit shifts, which read
    // the wrong bits silently. A decoder that returns wrong bytes is worse than
    // one that refuses, which is why each set is asserted separately.
    check('the 24-bit shifts are 65536 and 256',
        /math\.floor\(c\/65536\)/.test(code) && !/c\/262144/.test(code),
        '262144 is 64^3, not a byte divisor - it yields the top base64 GROUP');
    check('the 18-bit shifts are 1024 and 4',
        /math\.floor\(c\/1024\)%256/.test(code) && /math\.floor\(c\/4\)%256/.test(code),
        '4096 and 16 are the 24-bit shifts and read the wrong bits without raising');
    check('the 12-bit shift is 16',
        /string\.char\(math\.floor\(c\/16\)%256\)/.test(code),
        '12 bits give one byte at c>>4');
    check('a one-character remainder is refused, not silently truncated',
        /if rem==1 then return nil end/.test(code),
        'it cannot occur for the worker own output, and ignoring it dropped the last byte');
}

console.log('');
console.log('KEYED LUA ROUNDTRIP   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);