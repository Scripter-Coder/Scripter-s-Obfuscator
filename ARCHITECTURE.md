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
