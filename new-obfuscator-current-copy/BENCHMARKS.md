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

## Final-pass benchmark

`node tools/bench.js` (Fengari): native tiny 10ms; VM bytecode tiny 259ms; VM bytecode medium 149ms; FAST custom artifact 3382ms; BALANCED 4375ms; SECURE 6248ms in the captured run. Artifact lengths were 222195, 213209, and 202648 respectively. These are environment-specific measurements, not security scores.
