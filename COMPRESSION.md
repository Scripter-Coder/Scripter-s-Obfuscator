# COMPRESSION.md — VM Compression

**Spec §22 — Real pipeline: serialize→compress→encrypt→embed → runtime decrypt→decompress→validate→decode→execute, independent from crypto. Size optimization, not security (Luraph docs).**

**Files:** `src/compression/compress.js:1` `compressBytes`/`decompressBytes`/`benchmarkCompression`, `src/bytecode/format.js:27` `serializeV2`/`integrityHash`

- `compressBytes(bytes)` — RLE-like demo: run `>3` → `0xFF, value, count` (real would be `lz-string`/`pako`).
- `decompressBytes(bytes)` — inverse.
- `benchmarkCompression(original, compressed)` → `{original, compressed, ratio}`.
- `serializeV2(image)` — header `ver, seed LE 4B, nFuncs 2B` + func records; separate from blob XOR step.

**Status:** **PARTIAL** — compression logic present and tested in isolation, not yet integrated into `emitVM` blob pipeline (currently blob is encrypted then directly embedded, no serialize→compress ordering). Independent from cryptography (no XOR inside compress).

**Benchmark (planned):** uncompressed size / compressed size / load time / decompression time — not yet measured for final protected file size. `bench_profiles.mjs` lens tracks encrypted image size (22k/169k/217k) but not compressed.

**Note:** `VM Compression is size optimization, not security feature` — per Luraph docs.
