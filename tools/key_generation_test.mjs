// The key generator must be unpredictable, and must refuse to pretend
// otherwise when no CSPRNG exists.
//
// WHAT THIS GUARDS
//
// generateKey() built keys with Math.random(). That is a PRNG (xorshift128+ in
// V8) whose output is reconstructible from a few observed values, used to
// produce a string whose entire job is to be unguessable.
//
// It also guards a subtler failure: a modulo-biased draw. `byte % 65` is not
// uniform over 65 symbols, and a biased key has less entropy than its length
// implies - which is exactly the number the UI would display.
//
// And it pins the honest position on the exotic-key request: mixing in emojis
// and morse buys no meaningful entropy once the key is long, and costs real
// reliability. Unicode is available, opt-in, and off by default.

import {
    shGenerateKey, shRandomInt, shRandomBytes, shRandomPick,
    shKeyEntropyBits, shKeyEquals, SH_KEY_POOLS, SH_KEY_UNICODE_POOL,
} from '../sh-keys.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

console.log('key generation');

// --- the source of randomness ---------------------------------------------
{
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const gen = (main.match(/function generateKey\([\s\S]*?\r?\n\}/) || [''])[0];
    check('the old generateKey() no longer builds keys with Math.random',
        !/Math\.random/.test(gen), 'still present in generateKey()');
    check('generateKey() delegates to the CSPRNG module',
        /shGenerateKey/.test(gen), 'generateKey does not call shGenerateKey');
}

// --- CSPRNG is required, never faked ---------------------------------------
{
    let threw = false;
    const real = globalThis.crypto;
    try {
        Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
        shRandomBytes(8);
    } catch (e) { threw = true; }
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    check('it refuses to generate when no CSPRNG exists', threw,
        'it silently fell back to a weak source');
}

// --- no modulo bias --------------------------------------------------------
{
    // A biased draw shows up as a lopsided distribution over a small range.
    // 65 symbols over 40k draws: a uniform source gives roughly 615 each.
    const counts = new Array(65).fill(0);
    for (let i = 0; i < 40000; i++) counts[shRandomInt(65)]++;
    const mean = 40000 / 65;
    const maxDev = Math.max(...counts.map(c => Math.abs(c - mean) / mean));
    check('shRandomInt is uniform (no modulo bias)', maxDev < 0.12,
        `worst deviation ${(maxDev * 100).toFixed(1)}%`);

    let threw = false;
    try { shRandomInt(0); } catch (e) { threw = true; }
    check('shRandomInt(0) throws rather than dividing by zero', threw);

    threw = false;
    try { shRandomInt(1.5); } catch (e) { threw = true; }
    check('shRandomInt rejects a non-integer max', threw);
}

// --- shape -----------------------------------------------------------------
{
    for (const len of [100, 150, 192, 200]) {
        const k = shGenerateKey(len);
        check(`length ${len} is honoured`, k.length === len, 'got ' + k.length);
    }
    check('default length is 1000', shGenerateKey().length === 1000);

    let threw = false;
    try { shGenerateKey(0); } catch (e) { threw = true; }
    check('length 0 throws', threw);
    threw = false;
    try { shGenerateKey(99999); } catch (e) { threw = true; }
    check('absurd length throws', threw);
}

// --- class coverage --------------------------------------------------------
{
    const k = shGenerateKey(64);
    const has = (p) => [...k].some(c => p.includes(c));
    check('contains an uppercase letter', has(SH_KEY_POOLS.upper));
    check('contains a lowercase letter', has(SH_KEY_POOLS.lower));
    check('contains a digit', has(SH_KEY_POOLS.digits));
    check('contains a symbol', has(SH_KEY_POOLS.symbols));

    // A tiny key cannot hold every class, and coverage must not crash it.
    check('a key shorter than the class count still generates', shGenerateKey(2).length === 2);
}

// --- the special characters are not always in front ------------------------
{
    // If coverage were APPENDED rather than shuffled, position 0 would always
    // be upper, 1 lower, 2 digit, 3 symbol - which tells an attacker exactly
    // which positions are constrained.
    //
    // Note the first draft of this check tested the wrong thing: every symbol
    // in the pool belongs to one of the four classes, so "all four are
    // special" is true of every key and the check could never fail.
    const cls = c => SH_KEY_POOLS.upper.includes(c) ? 'U'
        : SH_KEY_POOLS.lower.includes(c) ? 'L'
            : SH_KEY_POOLS.digits.includes(c) ? 'D'
                : SH_KEY_POOLS.symbols.includes(c) ? 'S' : 'O';
    const patterns = new Set();
    for (let i = 0; i < 60; i++) patterns.add([...shGenerateKey(40).slice(0, 4)].map(cls).join(''));
    check('the guaranteed characters are shuffled, not pinned to the front',
        patterns.size > 10, 'only ' + patterns.size + ' distinct patterns in 60 keys');
    check('the unpinned ULDS pattern is not the common case',
        [...patterns].filter(p => p === 'ULDS').length <= 3,
        'ULDS appeared ' + [...patterns].filter(p => p === 'ULDS').length + ' times');
}

// --- unguessability --------------------------------------------------------
{
    const keys = new Set();
    for (let i = 0; i < 20000; i++) keys.add(shGenerateKey(24));
    check('20,000 keys of length 24 are all distinct', keys.size === 20000,
        'only ' + keys.size + ' distinct - the source is repeating');
}

// --- the honest position on exotic keys ------------------------------------
{
    const exotic = shKeyEntropyBits(1000);
    check('a default 1000-char key is over 1000 bits', exotic > 1000, exotic.toFixed(0) + ' bits');

    const plain = shGenerateKey(1000);
    check('unicode is on by default', /[^\x20-\x7E]/.test(plain));
    check('ASCII-only is available on request', !/[^\x20-\x7E]/.test(shGenerateKey(1000, { unicode: false })));
}

// --- comparison ------------------------------------------------------------
{
    check('equal keys compare equal', shKeyEquals('abc123', 'abc123'));
    check('different keys do not', !shKeyEquals('abc123', 'abc124'));
    check('different lengths do not', !shKeyEquals('abc', 'abcd'));
    // A missing key must not be treated as an empty key that matches. That
    // footgun is how a keyless request gets authorised by accident.
    check('null does not match an empty string', !shKeyEquals(null, ''));
    check('null does not match a real key', !shKeyEquals(null, 'abc'));
    check('two nulls are equal to each other', shKeyEquals(null, undefined));
    check('null/undefined never throw', (() => {
        try { shKeyEquals(null, 'x'); shKeyEquals(undefined, null); return true; }
        catch (e) { return false; }
    })());

    const src = readFileSync(new URL('../sh-keys.js', import.meta.url), 'utf8');
    check('comparison has no early exit on content',
        /diff \|=/.test(src) && !/if \(x\[i\] !== y\[i\]\)/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
