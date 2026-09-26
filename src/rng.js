// src/rng.js — the single deterministic per-build RNG.
//
// WHY THIS FILE EXISTS
// --------------------
// The codebase previously had ~11 independent copies of this LCG:
//
//     const rnd = n => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; }
//
// and every one of them reduced the LOW bits of the state. For this particular
// generator the low bits are degenerate. With multiplier 1664525 and increment
// 1013904223:
//
//     state(n+1) mod 10 == (5 * state(n) + 3) mod 10
//
// so `state % 10` can only ever be 3 or 8, and `state % 5` is effectively a
// constant. Any per-build choice drawn with those moduli was therefore locked:
// measured over 60 consecutive seeds, `frameStride` had 1 distinct value of 3,
// and the IR pipeline's fusion / split / mutation passes were ALWAYS zero.
// Consecutive builds were far less polymorphic than the design intended, and
// the "several strategies" in the dispatcher were partly unreachable for the
// same reason.
//
// The fix is to mix the state into the high bits before reducing. That keeps the
// sequence deterministic per seed (so a given seed still reproduces a build
// exactly) while giving consecutive seeds independent draws.
//
// Every module now uses this instead of an inline copy.

const MUL = 1664525;
const INC = 1013904223;

/** Create a deterministic RNG bound to a seed. */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (Math.imul(s, MUL) + INC) >>> 0;
    // xorshift-style finalizer over the high bits (low bits are degenerate).
    let x = s;
    x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  };
  /** Uniform-enough integer in [0, n). */
  const rnd = (n) => (n <= 0 ? 0 : next() % n);
  /** Integer in [min, max] inclusive. */
  const rndInt = (min, max) => min + rnd(max - min + 1);
  /** Float in [0, 1). */
  const rndFloat = () => next() / 4294967296;
  return { next, rnd, rndInt, rndFloat };
}

/** Deterministic lowercase hex string of the requested length. */
export function makeHex(rndSource, len) {
  const c = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) out += c[rndSource(16)];
  return out;
}
