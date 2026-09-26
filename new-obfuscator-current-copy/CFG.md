# CFG.md — Control-Flow Graph

**File:** `src/ir/cfg.js:1`

`CFG` class: `build()` edges from `JMP/JIF/JIT/JNIL/ANDK/ORK/TFOR_LOOP/FOR_LOOP`, `foldJumps()` collapse `JMP→JMP`, `sweepUnreachable()` BFS from entry, `splitBlock(id, atIdx)` insert `JMP` + new block, `toLegacyCode(opcodeMap)` → flat code with `labelPos` patching.

**Transforms (spec §9):**

- `reorderBlocks(cfg, seed)` — Fisher-Yates with LCG seed, entry pinned, sequential re-id.
- Branch inversion + block split in `vm-bytecode.js:978` — profile-aware (SECURE 30% branch inv + split, BALANCED 15% inv, FAST none), affects bytecode.

**Honest:** `src/ir/cfg.js` not yet wiring full `AST→IR→CFG→lower` pipeline for every build; optimizer scaffold not yet controlling all branches (Phase 2 report). CFG is built but final lowering still direct `code[]` emission replaced only where optimizer changes `newCode`.

## Production use
CFG is now built from every production Lua51 chunk before final bytecode lowering. Entry reachability, branch targets, jump folding, and unreachable-block elimination are applied conservatively. Proof is emitted by `tools/ir_pipeline_proof.mjs`.

## Final-pass integration

CFG remains the authoritative graph used before optimization and final lowering. Fusion/splitting are applied to the validated production blocks after optimization and before bytecode lowering.
