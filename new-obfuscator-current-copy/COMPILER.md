# COMPILER.md — Lua → Custom Bytecode Compiler

**Entry:** `vm-bytecode.js:147` `compile(src, opts)` → `{chunks, vaultPlain, refs, seed, OPCODES, profile, irStats, constPool, vmVariant, encFormat, dispatcher, perFuncMeta}`

- **Input opts:** `profile` FAST/BALANCED/SECURE, `target` lua51 (others throw honest), `seedOverride` for reproducibility, `seedFromGenv` for server-bound vault.
- **Per-function presets:** `VMATTR(VM=SECURE, …)` via `src/ast/perfunc-enhanced.js` merges onto `perFuncMap`; inheritance parent→nested documented.
- **Seeding:** LCG `s=(s*1664525+1013904223)>>>0` covers entire build (opcode map, VP/BP, vault, blob, handlers, names, buildId/vmId) — see `vm-bytecode.js:171,1855`.
- **Constant handling:** `addConstS` → `vaultPlain` + `refs[]`; typed descriptors via `src/vm/constants.js:buildConstantPool` (string/int/float categories, per-type salts).
- **Bytecode emission:** `chunks[].code` flat word stream `op, arg, op, arg…` with `patchLabels` for jumps; register shuffle via `regMap` bijection.
- **IR→CFG→Optimizer pass:** `vm-bytecode.js:978` constant folding, branch inversion, block split (profile-aware SECURE heavy, FAST none).

**Public API:** `applyBytecodeVm(src, opts)` → Lua VM string; `applyCustomObfuscator` wraps it with outer layers + security wrapper.

## Production pipeline update (2026-09-22)
The Lua51 compiler now emits symbolic VM instructions into the production IR bridge in `src/ir/pipeline.js`. CFG construction, conservative optimization, storage/lifetime analysis, validation, and bytecode lowering occur before VM encoding. See `tools/ir_pipeline_proof.mjs` and `IR_PIPELINE_PROOF.json`.

## Current authoritative pipeline

For Lua 5.1 the production path is now AST transforms → symbolic VM IR → CFG → conservative optimizer → storage/lifetime analysis → seeded VM-level fusion/splitting → custom bytecode lowering → encoding → generated VM. `tools/ir_pipeline_proof.mjs` and `tools/fusion_split_proof.mjs` exercise this path.
