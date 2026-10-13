// Cryptographically strong key generation for script keys and compile tickets.
//
// WHY THIS EXISTS RATHER THAN A LOOP AROUND Math.random()
//
// generateKey() built keys with Math.random(). That is not a random source, it
// is a PRNG (xorshift128+ in V8), and its output is reconstructible from a
// handful of observed values. For a string whose only job is to be
// unguessable, that is the one property it must actually have.
//
// A key is only secret while it is UNGUESSABLE, so everything below is about
// bits, not about how impressive the key looks.
//
// ON "MIX IN EMOJIS AND MORSE CODE"
//
// Character-class mixing buys nothing once the key is long. A 192-character key
// over a 62-symbol alphabet is about 1140 bits; over a 94-symbol one it is
// about 1250. Neither is guessable, and the extra entropy is not the point.
//
// What mixing DOES cost is real: non-ASCII keys break copy/paste between
// executors, break URL and shell quoting, and turn every support question into
// "did the emoji survive the paste?". Morse code in a key is a re-encoding of
// the same bits and adds no entropy at all.
//
// So unicode is available, opt-in, and OFF by default - the classes still
// guarantee coverage, and the entropy comes from the length either way.

// ---- CSPRNG ---------------------------------------------------------------

// Throws rather than silently degrading to Math.random(). A key generator that
// quietly falls back to a weak source is worse than one that refuses to run:
// it looks identical and is not.
export function shRandomBytes(n) {
    const out = new Uint8Array(n);
    const c = globalThis.crypto;
    if (!c || typeof c.getRandomValues !== 'function') {
        throw new Error('no CSPRNG available (crypto.getRandomValues) - refusing to generate a key');
    }
    c.getRandomValues(out);
    return out;
}

// Uniform integer in [0, max), by rejection sampling.
//
// The obvious `(randomByte % max)` is NOT uniform: it biases toward the low end
// whenever max does not divide 256. At 65 symbols the bias is small; at the
// small per-class draws used below it is not, and a biased key is a key whose
// entropy is lower than its length suggests.
export function shRandomInt(max) {
    if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
        throw new Error('shRandomInt: max must be a positive integer <= 2^32');
    }
    if (max === 1) return 0;
    // Largest multiple of `max` that fits in 32 bits. Anything at or above this
    // is discarded so the remaining range divides evenly.
    const limit = Math.floor(0x100000000 / max) * max;
    for (;;) {
        const v = new DataView(shRandomBytes(4).buffer).getUint32(0, false);
        if (v < limit) return v % max;
    }
}

export function shRandomPick(str) {
    return str.charAt(shRandomInt(str.length));
}

// ---- pools ----------------------------------------------------------------

// Ambiguous glyphs deliberately excluded from the ASCII pools: 0/O, 1/l/I.
// A user reading a key off one screen and typing it into another should not
// lose a round trip to a font.
export const SH_KEY_POOLS = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnpqrstuvwxyz',
    digits: '23456789',
    symbols: '!@#$%^&*()-_=+?',
};

// Opt-in only. See the header on why.
export const SH_KEY_UNICODE_POOL =
    'ΩΔΞΣΦΨΛΞ♠♣♥♦♪☠⚡⚙⛨◆◇⬡⌬⧫⟐⟟∴∵⊕⊗⋈✦✧❖';

const ALL_ASCII = SH_KEY_POOLS.upper + SH_KEY_POOLS.lower + SH_KEY_POOLS.digits + SH_KEY_POOLS.symbols;

// ---- generation -----------------------------------------------------------

/**
 * Generate a key.
 *
 * @param {number} length  1..4096. Default 192.
 * @param {object} [opts]
 * @param {boolean} [opts.unicode]      mix in the opt-in unicode pool
 * @param {string}  [opts.pool]         override the combined ASCII pool
 * @param {string[]} [opts.require]     subset of upper/lower/digits/symbols
 *                                      that must each appear at least once
 * @returns {string}
 */
export function shGenerateKey(length, opts) {
    const o = opts || {};
    const len = (length === undefined || length === null) ? 192 : Number(length);
    if (!Number.isInteger(len) || len < 1 || len > 4096) {
        throw new Error('shGenerateKey: length must be an integer 1..4096');
    }

    const pool = o.pool || (o.unicode ? ALL_ASCII + SH_KEY_UNICODE_POOL : ALL_ASCII);
    if (!pool || pool.length < 2) throw new Error('shGenerateKey: pool needs at least 2 symbols');

    // Coverage guarantee. "At least one of each class" makes a generated key
    // recognisably a ScripterHub key, which is worth something for support -
    // but it is a FORMAT property, not a security one. If a caller asked for
    // fewer characters than there are classes, coverage wins and the key is
    // simply shorter.
    const require = o.require || ['upper', 'lower', 'digits', 'symbols'];
    const chars = [];
    for (const cls of require) {
        const p = SH_KEY_POOLS[cls];
        if (!p) throw new Error('shGenerateKey: unknown class ' + cls);
        if (p.length && chars.length < len) chars.push(shRandomPick(p));
    }
    while (chars.length < len) chars.push(shRandomPick(pool));

    // Fisher-Yates, so the guaranteed class characters are not always at the
    // front - that alone would leak which positions are special.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = shRandomInt(i + 1);
        const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
    }
    return chars.join('');
}

/**
 * Entropy in bits, for display. Uses the ACTUAL pool, because the pool is what
 * determines it - this is why mixing in unicode barely moves the number, and
 * why length is what matters.
 */
export function shKeyEntropyBits(length, opts) {
    const o = opts || {};
    const pool = o.pool || (o.unicode ? ALL_ASCII + SH_KEY_UNICODE_POOL : ALL_ASCII);
    const len = (length === undefined || length === null) ? 192 : Number(length);
    return len * Math.log2(pool.length);
}

/**
 * Constant-time-ish comparison for key material.
 *
 * Length is compared first because JS cannot hide it, but the CONTENT is
 * compared without an early exit so a caller cannot learn a shared prefix one
 * character at a time from response timing.
 */
export function shKeyEquals(a, b) {
    // Exactly one missing is a mismatch, not two empties that happen to match.
    // Coercing both to '' made `shKeyEquals(null, '')` true, which is the kind
    // of thing that quietly authorises a keyless request.
    if (a == null || b == null) return a == null && b == null;
    const x = String(a);
    const y = String(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
}
