# PROFILES.md — VM Profiles / Presets

**File:** `src/profiles.js`, `custom-obfuscator.js:60` `PROFILE_MAP`, `vm-bytecode.js:131`

| Profile | vmComplexity | handlerSplit | decoyVaultRuns | decoyChunks | controlFlow | constant | cipherRounds | mutation | antiTamper | layerCount | stride | Status |
|---------|--------------|--------------|----------------|-------------|-------------|----------|--------------|----------|------------|------------|--------|--------|
| **FAST** | 1 | false | [2,4] | [2,6] | none | basic | 1 | opcodeOnly | checksumOnly | 1 | 8 | Minimal, 0.14s tiny |
| **BALANCED** | 2 | false | [4,8] | [8,15] | light | typed | 1 | fieldShuffle | checksum+canary | 3 | 6 | Moderate, 1.28s |
| **SECURE** | 3 | true | [8,12] | [15,20] | heavy | strong | 2 | full | full | 4 | 4 | Max, 4.27s (16-round tuned to 2) |

Aliases: `OBSIDIAN/ONYX→SECURE`, `OPAL→FAST`, `CRYSTAL/ONYX2/OBSIDIAN→VM variants` (`src/vm/variants.js`).

**Real, measurable:** Not CLI stubs. Each controls VM complexity, control-flow strength, constant protection, handler split, decoy density, anti-tamper, debug, compression, perf. Bench `bench_profiles.mjs` FAST lite 0.15s 22k, BALANCED 1.35s 128k, SECURE 3.9s 160k (before retune; after SECURE 4.27s 217k). `tools/phase4_diversity_bench.mjs` FAST vs SECURE code len 29 vs 31 PASS.

**Intensity clamping:** `custom-obfuscator.js:1102` FAST max 3 layers, BALANCED allow 10, SECURE ultra ≥20 layers.
