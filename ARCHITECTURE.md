# ARCHITECTURE.md — Hybrid Compilation Architecture (Phase 8)

> Independent implementation, not a Luraph clone. Uses Luraph v15 concepts as high-level reference only.

## Pipeline

```
Lua source
  → luaparse (AST, luaVersion 5.1)
  → per-function attrs (VMATTR/--@VM) → src/ast/perfunc*.js
  → AST transforms (src/ast/transform.js + registry) — seed + profile deterministic
  → IR (src/ir/ir.js) — typed const pool, blocks
  → CFG (src/ir/cfg.js) — build, foldJumps, sweepUnreachable, reorderBlocks
  → Optimizer (src/ir/optimizer.js) — constFolding, deadCode, redundantMoveElim (stats)
  → Register allocation (src/ir/register.js) — liveness/intervals/coalescing
  → VM lowering (vm-bytecode.js compile) — emits custom bytecode chunks, vault, refs
  → Register allocation (src/ir/register.js allocateProgram) — liveness/intervals/coalescing → frame-size reduction
  → Layout hardening (src/vm/code-layout.js) — block relocation, hole filling, identifier scrambling
  → VM emission (vm-bytecode.js emitVM) — per-build ciphers, vault/blob, handlers, dispatcher
  → Outer layers (custom-obfuscator.js) — seed-chain encChain, slot table, anti-tamper, anti-crack, wrapped payload
  → fengari (Lua 5.3 VM in JS) for differential testing; native lua* when available via src/targets/*
```

## The opaque payload

The artifact is not the script. The payload - the constant table, the
encrypted constants, the encrypted bytecode - is one encrypted stream, cut
into pieces, and the file's copy of it is ciphertext:

```
local sf48cbd3={12,"DwAAAAwAAAAIAAAACQAAAAMgAAAA...", "..."}
```

The `12` at the head is the **key slot**: twelve bytes of key material that
the worker holds and the file does not. The runtime fills the slot and then
decrypts the rest of the list under it. This is Luarmor's shape - its V4
bootstrapper reads `superflow_bytecode={"\80\124\56\156...", _bsdata0[11], ...}`,
one piece list with the key material spliced into it, where `_bsdata0` is
fetched from the server and is not in the file at all.

The key material is two 32-bit words - word A is the vault seed, word B is
the second half of the payload key - and both are mixed into every byte of
the key stream. Sixty-four bits, because the chunk records have a known
shape and a 32-bit key is found on a GPU. The seed is a full 32 bits and
the vault cipher mixes all of them, and the last four bytes of the key
material are a checksum of the payload, so another script's key cannot open
this script's payload.

The init layer fetches the key material from
`GET /sh/vault/<id>?s=<sid>&n=<nonce>` with the session it has just
proved, and hands it over in `__SH_VAULT_B64` before the artifact runs.
The worker does not interpret it - it stores and serves an opaque blob,
which is why a script published before this change keeps working: its
artifact and its key material were generated together.

See `docs/DECISIONS.md` D43 and D44, and
`tools/opaque_payload_test.mjs`.


## Key Decisions

- **JS-only**: No `gcc` needed for `lua51`; `fengari` is differential reference for 5.1. Native targets (`lua52/53/54/luajit/luau`) are honest `NOT_IMPLEMENTED` until `lua.exe -v` passes (see `TOOLS_TARGETS.md`).
- **StaticEnv/Compat/Debug**: `shouldStaticEnv`/`applyCompatTransforms`/`debugProtectMode` wired compile→emitVM (static _G cache vs dynamic getgenv, compatibility disables MBA/UNROLL/INLINE, debug protected replaces debug table)

**Per-build diversity**: `seed` LCG covers opcode map, VP/BP salts, PROTO/JMP salts, REG window, decoy counts, handler order, dispatcher choice, encoding family.
- **Honest profiles**: `FAST/BALANCED/SECURE` are measurable (cipherRounds, decoy counts, controlFlow, VM variant) — see `src/profiles.js` and `FINAL_FEATURE_MATRIX.md`.

## Module Map

| Layer | Files | Role |
|-------|-------|------|
| Parse | `vm-bytecode.js:141`, `src/ast/*` | AST + per-function VMATTR |
| IR/CFG | `src/ir/*`, `src/bytecode/format.js` | IR defs, CFG builder |
| VM build | `vm-bytecode.js:147,1210` | compile + emitVM |
| Variability | `src/generator/variability.js`, `src/vm/variants.js`, `src/vm/dispatcher.js` | 8-category variability |
| Targets | `src/targets/registry.js`, `src/targets/*.js` | 6-target registry, honest status |
| Security | `src/security/*`, `src/compression/*` | staticEnv, compat, anti-tamper, compression |
| Layout | `src/vm/code-layout.js` | block relocation, hole filling, identifier scrambling (see `LAYOUT_HARDENING.md`) |
| Bench | `tools/bench/*.mjs` | correctness differential, deob A/B, size/perf |
| CLI | `cli.mjs` | --target/--profile/--vm/--seed etc., validation |
| Devirt | `tools/devirt.js` | 9-task hardness harness |

See also: `COMPILER.md`, `IR.md`, `CFG.md`, `VM.md`, `BYTECODE.md`, `VM_GENERATION.md`.
