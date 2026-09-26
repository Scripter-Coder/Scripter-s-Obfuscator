# Final Remaining-Feature Pass — 2026-09-23

## Scope

This pass followed the supplied final-pass instruction set: work directly on the repository, preserve the scheduler/VM ABI, implement real remaining features, test after substantial changes, and classify features honestly.

## Repository note

The checkout available to this pass does **not** contain `src/ir/production-pipeline.js` or `tools/pipeline_production_test.mjs`, and `vm-bytecode.js` does not import the IR optimizer/fusion/splitting/mutation modules. The existing `src/ir/*` files are still used by their unit test only. Therefore the earlier claimed AST→IR→CFG→optimizer→allocation→transforms→lowering production pipeline cannot be re-verified from this checkout and was not silently re-created during this pass because the supplied instructions explicitly locked that pipeline.

## Files changed

- `vm-bytecode.js`
- `custom-obfuscator.js`
- `src/targets/lua52.js`
- `src/targets/lua53.js`
- `src/targets/lua54.js`
- `src/targets/luajit.js`
- `src/targets/luau.js`
- `tools/stackalloc_test.mjs`
- `tools/cfg_rewrite_test.mjs`
- `tools/hard_globals_test.mjs`
- `tools/perfunc_test.mjs`
- `tools/target_backend_test.mjs`
- `tools/target_test.mjs`
- `tools/antitamper_state_test.mjs`
- `FINAL_REMAINING_FEATURE_PASS_REPORT.md`

## Newly implemented

### STACKALLOC

Implemented a real VM stack-allocation path:

- `STACKNEW`, `STACKGET`, `STACKSET`, `STACKLEN` VM opcodes.
- Values live in reserved physical `REG[]` slots above the normal frame stack window.
- Allocation state is frame-owned and survives scheduler suspension/resume.
- Closure capture is conservatively detected; captured/unsafe cases fall back to a normal Lua table rather than exposing a numeric handle to a closure.
- Lua-style 1-based indexing is the supported specialized form; zero-based requests fall back safely.
- Per-function `VMATTR(STACKALLOC=false)` disables specialization.

Focused runtime suite: **8/8 PASS**.

### Hard-coded globals

Implemented explicit static-environment hard-global specialization:

- New `HGLOB` VM opcode with per-build runtime cache.
- Only enabled when `staticEnv=true` and `hardCodeGlobals=true`.
- Builtins/global names are excluded if assigned in source.
- `_ENV`/`_G` writes disable the specialization.
- Local shadowing and nested-function global access continue through normal lexical resolution.

Focused suite: **5/5 PASS**.

### CFG rewriting

Implemented a safe production CFG transformation compatible with the absolute-PC scheduler ABI:

- Every production `JMP` can be routed through an appended trampoline basic block.
- Existing absolute PCs remain valid.
- No arbitrary unsafe flattening/reordering was introduced.
- The transformed bytecode is measurably different.

Focused suite: rewritten **35**, baseline **35**, output differs, **PASS**.

### Per-function attributes

Wired the existing per-function metadata parser into compilation and made `STACKALLOC=false` affect real production lowering.

Focused suite: runtime **4/4**, output structure differs as expected.

### Target adapters

Implemented target-specific selection/gating for:

- Lua 5.2.4: 5.2 parser + goto lowering path.
- Lua 5.3.6: 5.3 parser + goto lowering path.
- Lua 5.4.8: common 5.4-compatible subset through 5.3 grammar; `<close>`/`<const>` explicitly rejected because the available parser has no 5.4 grammar.
- LuaJIT 2.1: Lua 5.1 grammar with LuaJIT FFI pass-through gate.
- Luau 0.709: conservative type-annotation stripping for common declarations; unsupported `continue`, compound assignment, and type-parameterized functions are rejected rather than miscompiled.

Target backend compilation tests pass for all requested targets.

### FFI

Implemented a genuine, target-specific **source/lowering pass-through subset** rather than a fake flag:

- `ffi.*` / `require("ffi")` is permitted only for the LuaJIT target.
- Non-LuaJIT targets reject FFI explicitly.
- The compiler does not emulate FFI; LuaJIT remains responsible for native FFI semantics.

LuaJIT FFI compile/lowering path: PASS.
Native LuaJIT runtime verification: environment-blocked.

### Anti-tamper / VM state validation

Strengthened live scheduler checks for:

- FP/frame ownership
- frame BASE/TOP bounds
- CODE/frame consistency
- PC validity
- SP bounds
- coroutine-restored frame ownership/bounds

Focused corruption test:

- legitimate execution: PASS
- corrupted frame owner: rejected with `VM_STATE_FRAME_OWNER`
- state-validation markers: present

## Verification

### Full npm regression

`npm test` completed successfully:

- differential: **35/35**
- phase-4 differential: **35/35**
- scheduler edge: **10/10**
- fuzz: **30/30**
- fuzz: **100/100**
- makeCounter: **PASS**
- constants: **PASS**
- seed reproducibility: **PASS**
- UNROLL: **all cases PASS**
- target backend tests: **PASS**

### Additional regression

- fuzz500/final matrix: **500/500 PASS**
- scheduler architecture: **8/8 PASS**
- runtime baseline: **10/10 PASS**
- coroutine + metamethod scheduler: **10/10 PASS**
- STACKALLOC: **8/8 PASS**
- CFG rewrite: **PASS**
- hard-coded globals: **5/5 PASS**
- anti-tamper: **PASS**
- intensity-10: **PASS**, generated ~1.03 MB, semantic result `362880`

One combined long command timed out during the intensity-10 step after earlier suites, but the intensity test was rerun alone in a fresh process and completed successfully.

## Exact important commands

```text
npm test
npm run test:fuzz500
node tools/scheduler_arch_test.mjs
node tools/runtime_baseline.mjs
node tools/meta_coroutine_scheduler_test.mjs
node tools/stackalloc_test.mjs
node tools/cfg_rewrite_test.mjs
node tools/hard_globals_test.mjs
node tools/perfunc_test.mjs
node tools/antitamper_state_test.mjs
node tools/target_backend_test.mjs
node tools/intensity10_smoke.mjs
```

## Target verification status

The current Linux environment does not contain native Lua 5.2.4, Lua 5.3.6, Lua 5.4.8, or LuaJIT 2.1 executables. The supplied `/tmp/luau.exe` is a Windows PE executable and there is no Wine/QEMU runtime available.

Therefore target runtime claims are **not** upgraded to native-target VERIFIED by this pass.

## Final feature classification

| Feature | Classification |
|---|---|
| STACKALLOC | IMPLEMENTED + VERIFIED |
| Safe/aggressive CFG rewriting | IMPLEMENTED + PARTIALLY VERIFIED |
| Hard-coded globals | IMPLEMENTED + VERIFIED (explicit staticEnv opt-in) |
| FFI | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.2.4 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.3.6 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.4.8 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| LuaJIT 2.1 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 runtime | BLOCKED BY ENVIRONMENT |
| Per-function attributes | IMPLEMENTED + PARTIALLY VERIFIED |
| Static environment | IMPLEMENTED + PARTIALLY VERIFIED |
| Anti-tamper/state validation | IMPLEMENTED + VERIFIED |
| IR production pipeline in this checkout | NOT IMPLEMENTED / baseline mismatch |
| Full target-native runtime verification | BLOCKED BY ENVIRONMENT |
| Lua 5.4 `<close>` / `<const>` | NOT IMPLEMENTED |
| Luau `continue` lowering | NOT IMPLEMENTED |
| Luau compound-assignment lowering | NOT IMPLEMENTED |
| Full arbitrary CFG flattening/reordering | NOT IMPLEMENTED |
| Full LuaJIT FFI runtime proof | BLOCKED BY ENVIRONMENT |

## Genuine remaining blockers

1. The actual checkout lacks the previously claimed production IR pipeline, so that claim cannot be verified here without reopening the locked pipeline work.
2. Native Lua 5.2.4 / 5.3.6 / 5.4.8 / LuaJIT 2.1 executables are unavailable.
3. The supplied Luau 0.709 executable is Windows-only and cannot be launched in the current environment.
4. Luau `continue`, compound assignments, and type-parameterized functions still require dedicated lowering.
5. Lua 5.4 `<close>` and `<const>` require a real 5.4 parser/lowering path.
6. Per-function controls other than the newly wired STACKALLOC behavior remain partially metadata-driven rather than fully independent compilation profiles.
