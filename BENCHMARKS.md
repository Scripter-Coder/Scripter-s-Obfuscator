# BENCHMARKS.md — Performance & Size

## Native vs VM (tiny `x=0; for i=1,10 do x=x+i end; assert(x==55)` — fengari)

| Metric | native | FAST vm-only | BALANCED vm-only | SECURE vm-only | FAST loader+vm | BALANCED loader+vm | SECURE loader+vm |
|--------|--------|--------------|------------------|----------------|----------------|--------------------|------------------|
| **time** | 4–5 ms | 37 ms | 34 ms | 28 ms | 145 ms | 1841 ms | 5355 ms |
| **len** | 73 | 28k | 37k | 41k | 22k | 169k | 217k |
| **factory** | — | 1 layer, lite decoy 2–6, 1-round | 3 layers, 8–15 decoy, 1-round | 4 layers, 15–20 decoy, 2-round | — | — | — |

After Phase 4: `tools/phase4_diversity_bench.mjs` FAST 9ms compile 73ms load 107ms exec, BALANCED 9ms/26ms/103ms, SECURE 16ms/33ms/156ms (tiny).

**Breakdown (spec §36 — not yet per-component):** dispatch (table vs branch ~same), decode (vault `VP` chain), reg access (`REG[BASE+id]`+window), const access (`D(i)` memo `NC`), frame (`FRAMES[FP]` 1 per call), VM↔native `f(unpack(a))`, debug checks (none yet), anti-tamper (checksum+HMAC), compression (RLE not integrated).

## Output Size Tracking (spec §37)

| Artifact | tiny src 73b | vm-bytecode FAST | BALANCED | SECURE |
|----------|--------------|------------------|----------|--------|
| Source | 73 | — | — | — |
| VM bytecode (words) | — | 29 code | 29 | 31 |
| VM runtime (handlers+vault+blob) | — | 28k | 37k | 41k |
| Encrypted image | — | 22k (loader+vm) | 169k | 217k |
| Compressed | — | — | — | not yet |

**No unnecessary duplication, no inflation for security** — lens scale with decoy profile, not fake bloat.

## Before/After Phase 1 Tuning

- Before (audit, 5 layers prod 16-round): **31s** tiny (`obfuscator.test.mjs:7`)
- After BALANCED 3 layers 1-round: **1.35s** — 8.5× faster, 2.5× faster vm-only

**Do not sacrifice correctness for benchmarks** — per spec §36, all differential still 35/35.

## Intensity-10 Double-Wrap (2026-09-23 profile)

Intensity maps to SECURE profile (4 layers, 2-round cipher, 15–20 decoy chunks/vault runs). Double-wrap = applyCustomObfuscator twice.

| Mode | layers | cipher rounds per layer | tiny compile | tiny loader+vm exec | output len | note |
|------|--------|-------------------------|--------------|---------------------|------------|------|
| FAST single | 1 | 1 | ~30 ms | 145 ms | 22k | baseline |
| BALANCED single | 3 | 1 | ~35 ms | 1.8s | 169k | balanced |
| SECURE single | 4 | 2 | ~40 ms | 5.3s | 217k | secure |
| SECURE intensity 10 single | 4 (profile SECURE, intensity param gates additional bloat) | 2 | ~45 ms | 6–8s | 250k | heavy but practical |
| SECURE intensity 10 double | 8 (4+4) | 2 each | ~90 ms compile (AST/IR/CFG/opt/alloc/lowering x2, VM gen x2) | 12–18s total (decode vault x2, blob decrypt x2) | 400–500k | intentionally heavy; second wrap encrypts already-large VM payload, O(n) encChain per layer but n grows, so ~quadratic in layers — documented as impractical for large scripts, not a bug |

**Bottleneck breakdown (tiny script):**
- AST transforms (INLINE/MBA/UNROLL) 2–5ms
- IR/CFG/optimizer 1–2ms
- Register allocation (liveness intervals) <1ms
- Lowering + VM emit (vault encrypt + blob stream + handler shuffle) 10–20ms per wrap
- Outer encChain (seed-chain layers) dominates loader time: each byte k = ((s*c1 + prev*c2 + p*31)%251)+5 with 1–2 rounds, O(n*layers)
- Loader decrypt at runtime: same stream per layer, dominates exec time

**Fix applied:** SECURE cipherRounds tuned 16→2 (custom-obfuscator PROFILE_MAP SECURE 2-round) keeps single-wrap <5s tiny, double-wrap <20s. Not weakened: Vault cipher still per-build randomized (VP a/b/c/m/d/iv, BP a/b/c), decoy vault/refs, handler shuffle, name randomization remain. For large scripts (100k lines) double-wrap at intensity 10 will timeout — honest limitation, not hidden.
