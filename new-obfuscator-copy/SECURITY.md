# SECURITY.md — Decompilation & Hardening

## Threat Model

Not scientific security scores — engineering regression tool. Goal (spec §33): make ≥5/9 devirt tasks HARD while preserving correctness/perf. Improve representation, not just encryption.

## Devirtualizer Harness

`tools/devirt.js:1` 9 tasks:

1. VM image location `local v...={...}` — **EASY** (vault present 300–400 bytes)
2. Image decoding — **HARD** (per-build VP decoder hidden)
3. Instruction boundaries `blob {…}` — **EASY** (blob 2–4k len)
4. Opcode inference `HAND[OP]` — **HARD** (handlers 0 lexical matches: table dispatch not `if OP==`)
5. Handler inference `a+b` — **EASY** (ADD pattern `a + b` still visible in handler source)
6. CFG reconstruction `JMP/JIF` — **HARD** (jumps lexical 0: encoded via XOR, not `JMP` literal)
7. Constant recovery — **HARD** (vaulted, per-constant chain, decoys)
8. Function recovery `{c=cd,p=ps,v=va}` — **HARD** (0 chunks pattern: blob encrypted, not plaintext table)
9. High-level Lua — **HARD** (needs decompiler)

**Result:** 5 HARD /4 EASY — meets ≥5 HARD (`tools/devirt.js` output).

## Hardening

`custom-obfuscator.js` + `vm-bytecode.js` + `hardening.test.mjs:1` H1–H5 all PASS:

- **H1** per-build ciphers 12/12 distinct shapes (VP/BP random).
- **H2** loader header constant noise (no `layers=N` leak).
- **H3** decoy vault + decoy refs + decoy chunks 6/6 builds, exact math preserved.
- **H4** VM seed never embedded literal in split build (carrier 5–8 numbers after key).
- **H5** split+carrier end-to-end run executes real code.

**Anti-crack:** `custom-obfuscator.js:245` canary + decoy payloads (Goodluck Sonion) — `anticrack.test.mjs` checks.

**Anti-tamper (Phase 6):** `src/security/antitamper.js:CHECKS` 7 checks (VM image, bytecode, handler, dispatcher, build metadata, state, runtime mutation) with FNV `integrityHash` (`src/bytecode/format.js:47`) — `obfuscator.test.mjs [9]` tamper flip refuses.

**No fake checks, usable under legitimate env** — per spec §21.

## Final-pass integrity validation

`src/security/antitamper.js` now provides deterministic integrity records for VM image bytes, encoded bytecode, canonical handler metadata, dispatcher metadata, and build metadata, plus explicit VM state-window validation. `tools/antitamper_integrity_test.mjs` verifies each integrity field rejects deliberate mutation and validates state-boundary failures.

These checks are engineering integrity validation, not a claim of cryptographic anti-debugging or tamper-proofing.
