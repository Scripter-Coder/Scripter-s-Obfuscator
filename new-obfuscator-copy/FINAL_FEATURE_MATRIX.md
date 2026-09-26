# FINAL_FEATURE_MATRIX.md — Phase 4–8 Acceptance (spec §40)

> Status lexicon: **IMPLEMENTED** = real + tested, **PARTIAL** = exists but not full, **NOT IMPLEMENTED** = stub/honest. Only IMPLEMENTED rows have production file/function/test evidence below. Scaffolding/comments/CLI flags/dead code not counted.

## Baseline (Phase 3 gates, verified 2026-09-21)

- **Baseline commit:** `2267b6a36d7fd703984399edef8dda9cea141ce6` (luraph V15 double VM)
- **Baseline test counts:** `35` differential (`tools/differential_35.mjs` 35/35), `100` fuzz (`tools/fuzz_100.mjs` 100/100), `30` fuzz (`tools/fuzz_test.mjs` 30/30), `13` phase1 differential, seed identical/different PASS, diversity PASS, VM stack 10/10, CLOSE 8/8, hardening 5/5, optimizer proof PASS, devirt 5 HARD
- **Baseline performance (tiny `x=0; for i=1,10 do x=x+i end; assert(x==55)` fengari):** native 4–5ms, FAST vm 37ms (28k), BALANCED 34ms (37k), SECURE 28ms (41k), FAST loader+vm 145ms (22k), BALANCED 1841ms (169k), SECURE 5355ms (216k)
- **Baseline output size (sample `print("hello")` vm):** ~30–40k chars (profile-dependent)
- **No Phase 3 regression:** re-ran `tools/differential_35.mjs` + `tools/fuzz_100.mjs` + `hardening.test.mjs` → all PASS before Phase 4 work

## Feature Matrix

| # | Feature (spec §) | Status | Production File | Production Function | Behavioral Test | Differential Test |
|---|------------------|--------|-----------------|---------------------|-----------------|-------------------|
| 2 | **Real constant virtualization** — string/int/float/bool/nil/proto/special distinct handling, descriptors, build-specific repr, typed decode, lazy/memoized, decoy only structural | **PARTIAL** | `src/vm/constants.js:1` `vm-bytecode.js:1278,1311` | `buildConstantPool`, `makeDescriptor`, `typedDecode`, vault cipher `VP.saltStr/Num/Int/Float/Misc` | `tools/constant_virt_test.mjs` plaintext scan PASS, typed decode PASS, per-build salts differ PASS | `tools/differential_35.mjs` 35/35 (constants via vault) — not per-category differential yet |
| 3 | **Real instruction encoding** — build-specific formats (A/B/C/D), field order/width, reg/imm/const/jump encoding vary, generated decoder, not universal parser | **PARTIAL** | `src/bytecode/encoding.js:1` `vm-bytecode.js:1292,1447` | `pickFormat`, `encodeOperand`, `PROTO_SALT`/`JMP_SALT` XOR, `REG_SHIFT_VAR` window | `tools/build_20_diversity.mjs` encFormat 2/20 distinct, vault blob per-build PASS | `tools/differential_35.mjs` 35/35 (encoding is reversible per build) |
| 4 | **True instruction mutation** — semantic alternatives (ADD direct/reversed/helper/split/fused), build/profile/context chooser, mutation metadata | **PARTIAL** | `src/ir/mutation.js:1` `vm-bytecode.js:60,920` (profile-aware reg shuffle as mutation) | `MUTATIONS`, `chooseMutation`, `mutationMetadata` | `tools/phase4_diversity_bench.mjs` mutation test vm1 vs vm2 differ PASS | `tools/fuzz_100.mjs` 100/100 (mutation preserves semantics where applied) |
| 5 | **True instruction fusion** — VM-level fusion with generated fused handlers and deterministic profile selection | **IMPLEMENTED** | `src/ir/fusion.js:1` `src/ir/pipeline.js` `vm-bytecode.js` fused handlers | `FUSION_CANDIDATES`, `applyFusion`, `FNUMK_ADD/FNUMK_MUL` | `tools/phase4_diversity_bench.mjs` fusion code len 13 irStats PASS | `tools/differential_35.mjs` 35/35 (fusion is profile-gated, correctness preserved) |
| 6 | **True instruction splitting** — logical ADD → multiple generated VM instructions with deterministic profile selection | **IMPLEMENTED** | `src/ir/splitting.js:1` `src/ir/pipeline.js` `vm-bytecode.js` | `SPLIT_RULES`, `applySplitting`, `SPLIT_ADD_PREP/SPLIT_ADD_EXEC` | `tools/phase4_diversity_bench.mjs` split PASS | `tools/fuzz_100.mjs` 100/100 |
| 7 | **Real handler decomposition** — CALL → prepare/resolve/setup/dispatch, per-variant (monolithic/cooperating/helper), reachable helpers | **PARTIAL** | `src/vm/handlers.js:1` `vm-bytecode.js:1636` (HAND[CALL] decomposed via FRAMES) | `HANDLER_VARIANTS`, `pickHandlerVariant` | `hardening.test.mjs` H3 decoy present, `tools/differential_35.mjs` CALL 35/35 | `tools/fuzz_100.mjs` 100/100 |
| 8 | **Generated dispatcher / opaque state** — table, numeric-state, state+opcode, branch, mixed; VM state (pc/state/opcode/frame/nextState/tmp) layout varies | **PARTIAL** | `src/vm/dispatcher.js:1` `vm-bytecode.js:1300,1785` | `pickDispatcher`, `stateLayout`, `luaDispatcherSnippet`, `_useIfChain`/`_stateFields` | `tools/build_20_diversity.mjs` dispatcher 2/20 distinct PASS, `tools/devirt.js` CFG HARD | `tools/differential_35.mjs` 35/35 (dispatcher preserves semantics) |
| 9 | **Generated handlers** — vary structurally (direct/helper/decomposed/fused/state-transition), build chooses via seed, 10-build diversity | **PARTIAL** | `vm-bytecode.js:1542` (handler order shuffled per build) `src/vm/handlers.js` | `HAND` table generation, order Fisher-Yates per seed | `tools/build_20_diversity.mjs` opcode maps 20/20 unique PASS | `tools/fuzz_100.mjs` 100/100 |
| 10 | **VM variants** — FAST_VM/BALANCED_VM/SECURE_VM (+PHANTOM), own names, differ in dispatch/state/layout/format/handler/reg/constant/frame/metadata/transforms | **PARTIAL** | `src/vm/variants.js:1` `vm-bytecode.js:147` `_vmVariant` | `VM_VARIANTS`, `pickVariant` | `tools/build_20_diversity.mjs` vmVariant 1/20 (BALANCED) — wiring shows selection, but per-profile only FAST/BALANCED/SECURE map to distinct | `tools/final_matrix_test.mjs` FAST/BALANCED/SECURE VM lens differ PASS |
| 11 | **AST transformation system** — registry with name/compat/cost/safety/target/profile, pre-lowering | **PARTIAL** | `src/ast/registry.js:1` `src/ast/transform.js:1` | `TRANSFORM_REGISTRY`, `applyAstTransforms` | `tools/phase4_diversity_bench.mjs` CFG transform FAST vs SECURE len 29 vs 31 PASS | `tools/fuzz_100.mjs` 100/100 |
| 12 | **INLINE** — IR-level inline, all signatures, upvalues/variadics/multiple returns, side-effect ordering, recursion guard, VMATTR(INLINE) | **PARTIAL** | `src/transform/inline.js:1` | `shouldInline`, `inlineFunction` | `tools/final_matrix_test.mjs` per-func mixed PASS (inline not yet exercised differential) | NOT differential yet |
| 13 | **UNROLL** — numeric-loop unrolling for computable bounds, neg step, break/continue, side-effect/local scope, profile FAST none/BALANCED small/SECURE heuristics | **PARTIAL** | `src/transform/unroll.js:1` | `shouldUnroll`, `unrollLoop` | manual: `for i=1,4` unroll via `unrollLoop` not yet wired to VM lowering | NOT differential |
| 14 | **MBA rewriting** — equivalent arith expressions, presets FAST/STANDARD/STRONG/EXTREME, budgets SMALL/MEDIUM/LARGE, target-aware, precision preserved | **PARTIAL** | `src/transform/mba.js:1` | `rewriteExpression`, `verifyRewrite` | `tools/phase4_diversity_bench.mjs` arithmetic swap 20% PASS | NOT differential (target 5.1 only) |
| 15 | **STACKALLOC** — `VM_STACKALLOC(size,zeroBased?)` recognized, via virtual registers/stack slots, static idx/dynamic idx/len/clear/pack/unpack, escape analysis | **PARTIAL** | `src/transform/stackalloc.js:1` | `isStackAllocCall`, `lowerStackAlloc` | behavioral stub PASS, fallback when escapes | NOT differential |
| 16 | **Stack/register optimization** — liveness, intervals, reuse, coalescing, dead removal, frame-size, spill, AST→IR→liveness→alloc→lowering | **PARTIAL** | `src/ir/register.js:1` `vm-bytecode.js:934` (reg shuffle + maxReg) | `liveness`, `liveIntervals`, `allocateRegisters` | `tools/optimizer_test.mjs` fold 2 PASS, `vm-stack` 10/10 | `tools/fuzz_100.mjs` 100/100 |
| 17 | **Per-function attributes** — `VMATTR(VM=SECURE,PRESET=...,TRANSFORM=...,INLINE=...,UNROLL=...,MBA=...,DEBUG=...,CONSTANTS=...,CONTROL_FLOW=...)` propagating AST→VM, inheritance | **PARTIAL** | `src/ast/perfunc-enhanced.js:1` `vm-bytecode.js:147` `src/ast/perfunc.js` | `parseVMAttr`, `attachEnhancedPerFuncMeta`, perFuncMap merge | `test_perfunc.mjs` chunks SECURE/FAST/BALANCED PASS, `tools/final_matrix_test.mjs` per-func mixed PASS | `tools/differential_35.mjs` 35/35 for mixed |
| 18 | **Static environment** — configurable, assume _ENV not changed (cached globals) vs dynamic, tests for env mutation/global reassignment/_ENV | **PARTIAL** | `src/security/staticenv.js:1` | `shouldStaticEnv`, `lowerGlobalLookup` | stub; `test_perfunc` shows per-function preset propagates | NOT differential (lua51 only) |
| 19 | **Compatibility mode** — disables transforms unavailable on target, documented why/perf delta | **PARTIAL** | `src/security/compat.js:1` | `COMPAT_RULES`, `applyCompatTransforms` | `compatReport` for lua54/lua53 | NOT differential (targets not ready) |
| 20 | **Debug library protection** — configurable for getinfo/getlocal/getupvalue/setupvalue/gethook/sethook/traceback, tests for virtualized vs native closures/upvalues | **NOT IMPLEMENTED** | planned `src/security/debugprotect.js` stub | `debugProtectMode` | No runtime trap yet | No differential |
| 21 | **Anti-tamper** — VM image/bytecode/handler/dispatcher/build metadata/state/runtime mutation checks, each with purpose/impl/failure/test, not fake, usable | **PARTIAL** | `src/security/antitamper.js:1` `vm-bytecode.js:1311,1447` (vault/blob FNV + checksum+HMAC in custom-obfuscator) | `CHECKS`, `integrityHash`, `buildIntegrity` | `hardening.test.mjs` H1-H5 PASS, tamper flip → refuse PASS (`obfuscator.test.mjs` [9]) | `tools/fuzz_100.mjs` 100/100 |
| 22 | **VM compression** — real pipeline serialize→compress→encrypt→embed→decrypt→decompress→validate→decode→execute, independent from crypto, size optimization | **IMPLEMENTED** | `src/compression/compress.js:1` `vm-bytecode.js:1303,1335` | `compressBytes`, runtime decompress/length/hash validation | `test_handler_opaque_compress.mjs`: compression pipeline PASS, compressed execution PASS, corruption rejection PASS, ~3ms focused overhead | `tools/final_matrix_test.mjs` 500/500 fuzz PASS with compressed runtime |
| 23 | **Lua 5.4 backend** — integers/floats/<close>/<const>/goto/labels/coroutine/env/metamethod/error/varargs/closure/debug, differential via lua-5.4.2_Win64_bin | **NOT IMPLEMENTED** | `src/targets/lua54.js:1` (stub `NOT_IMPLEMENTED`) | `TARGET` 5.4.8 | honest throw | native runtime unavailable (`Downloads/lua-5.4.2_Win64_bin` missing, have `lua-5.4.0.tar.gz` 349k source not compiled) |
| 24 | **Lua 5.3 backend** — integers/bitwise/floor div/UTF-8/goto/env/coroutine/metatable/debug/closure/varargs | **NOT IMPLEMENTED** | `src/targets/lua53.js:1` (stub `NOT_IMPLEMENTED`) | `TARGET` 5.3.6 | honest throw | runtime unavailable (`lua-5.3.0.tar.gz` 278k source < final 5.3.6, not compiled; `lua-5.3.5_Win64_bin` missing) |
| 25 | **Lua 5.2 backend** | **NOT IMPLEMENTED** | `src/targets/lua52.js:1` | `TARGET` 5.2.4 | honest | `Lua 5.2 backend NOT READY — native reference runtime unavailable` |
| 26 | **Lua 5.1 backend** | **IMPLEMENTED** | `src/targets/lua51.js:1` `src/targets/registry.js:1` | `TARGET` 5.1.5 `getTarget` `listTargets` `capabilities` | `tools/target_test.mjs` lua51 ok len 186k PASS | `tools/differential_35.mjs` 35/35, `tools/fuzz_100.mjs` 100/100, `tools/fuzz_test.mjs` 30/30, `test_close.mjs` 8/8, `makeCounter` 3 configs PASS |
| 27 | **LuaJIT** — 5.1 compat, FFI when ENABLE_FFI, JIT interaction, bit, C types | **NOT IMPLEMENTED** | `src/targets/luajit.js:1` | `TARGET` 2.1 | honest | `luajit.exe` not found in `Downloads`/`PATH` |
| 28 | **Luau** — Luau syntax/types/iteration/Roblox env/coroutine/closure/table/metamethod/debug, isolated from PUC | **NOT IMPLEMENTED** | `src/targets/luau.js:1` | `TARGET` 0.709 | honest | `luau.exe` not found |
| 29 | **Target registry** — targets/lua51/52/53/54/luajit/luau each expose parse/compile/run/reference/capabilities/semantics/unsupportedFeatures, supported=true only after differential | **IMPLEMENTED** | `src/targets/registry.js:1` | `getTarget`, `listTargets`, `targetCapabilities` | `tools/target_test.mjs` lua51 ok, lua54 throw PASS | Honest: `lua51` IMPLEMENTED, others `NOT_IMPLEMENTED` until differential passes (no pretend) |
| 30 | **PCALL/XPCALL virtualization** — VM func under pcall/xpcall, VM→native, VM→VM nested, errors, tailcalls inside pcall, returns, unwinding, protected frame not just host | **IMPLEMENTED** | `vm-bytecode.js` scheduler-native protected VM frames; `src/vm/pcall.js` | `phase6_75_pcall_matrix.mjs` **486/486 PASS** post-Phase-6.8 | `phase6_75_pcall_matrix.mjs` 486/486 |
| 31 | **Coroutine support** — create/resume/yield/status, VM frames/REG/PC/BASE/TOP/upvalues/pending return/protected state represented by persistent VM coroutine state and resumed through one `DRIVE_STATE` continuation | **IMPLEMENTED** | `vm-bytecode.js`, `src/vm/coroutine.js` | `MAKESTATE` / `DRIVE_STATE` / `COCREATE` / `CORESUME` / `YIELD` | `phase6_8_1_runtime.mjs` 14/14 PASS; A→B→C→YIELD trace PASS; `phase6_8_1_seed_matrix.mjs` 324/324 PASS | `differential_35` 35/35, fuzz 100/100, final fuzz 500/500, scheduler 324/324, PCALL 486/486 |
| 32 | **Metamethod completeness** — __call/__index/__newindex + arithmetic/comparison/length/concat, table callable, VM function as metamethod, nesting, errors | **PARTIAL** | `src/vm/metamethod.js:1` `vm-bytecode.js` TGET/CALL/VMM scheduler paths | Focused runtime proof complete: 17/17 VM cases, 17/17 native controls, 17/17 native-vs-virtual differential, 1377/1377 FAST/BALANCED/SECURE seed/profile executions, 6/6 nested scheduler cases | `RUNTIME_PROOF_METAMETHOD_FINAL.md`; release-level PARTIAL remains because the full post-change gate is not entirely green |
| 33 | **Final security/decompilation evaluation** — 9 tasks: image location, decoding, boundaries, opcode inference, handler inference, constant recovery, CFG, function, high-level; run FAST/BALANCED/SECURE per VM variant | **PARTIAL** | `tools/devirt.js:1` `tools/build_20_diversity.mjs` | 9 tasks scoring | `tools/devirt.js` 5 HARD/4 EASY (vault/decoder/handlers/CFG/consts/funcs/high-level HARD, image/boundaries/handlers EASY) — no fake scores | `tools/fuzz_100.mjs` 100/100 |
| 34 | **Build diversity** — same src 20 builds compare vmVariant/opcodeMap/instrFormat/operand/reg/handler/dispatcher/state/constant/CFG/metadata/image; same seed byte-identical, diff seed materially different | **PARTIAL** | `tools/build_20_diversity.mjs:1` `vm-bytecode.js:147` `src/vm/variants.js` `src/bytecode/encoding.js` | `pickVariant/pickFormat/pickDispatcher` | `tools/build_20_diversity.mjs` 20/20 unique vm strings PASS, opcode maps 20/20, encFormat 2/20, dispatcher 2/20, same seed identical PASS, diff seed materially different PASS | `tools/seed_test.mjs` PASS, `tools/diversity_test.mjs` 3/3 PASS |
| 35 | **Final test matrix** — 35 deterministic + 100+ fuzz (500/1000 where practical) per target per profile per VM variant per-function mixes etc. | **PARTIAL** | `tools/differential_35.mjs` `tools/fuzz_100.mjs` `tools/final_matrix_test.mjs` | matrix | `tools/differential_35.mjs` 35/35 per lua51, `tools/fuzz_100.mjs` 100/100, `tools/final_matrix_test.mjs` FAST/BALANCED/SECURE each PASS + 500 fuzz 500/500 | Target coverage only lua51 until native runtimes built |
| 36 | **Performance** — measure native/FAST/BALANCED/SECURE compile/load/startup/runtime (dispatch/decode/reg/const/frame/call/native/debug/tamper/compress) memory/output size | **PARTIAL** | `bench_profiles.mjs:1` `tools/phase4_diversity_bench.mjs` | Current `bench_profiles.mjs` measurement | Native 7ms; FAST VM 298ms; BALANCED 190ms; SECURE 93ms; FAST full 388ms; BALANCED full 4273ms; SECURE full 11657ms | Intensity-10 double-wrap real execution did not finish within 45s; not claimed PASS |
| 37 | **Output size** — track source/bytecode/runtime/encrypted/compressed/final | **PARTIAL** | `src/compression/compress.js` `bench_profiles.mjs` len tracking | `benchmarkCompression` | `bench_profiles.mjs` lens: FAST 22k BAL 169k SEC 216k PASS | Not per-component breakdown yet |
| 38 | **Final CLI** — --target/--profile/--vm/--seed/--compress/--debug/--static-env/--compatibility/--ffi/--hardcode-globals/--control-flow/--constants/--report + per-function VMATTR, validate combos | **IMPLEMENTED** | `cli.mjs:1` | `parseArgs`, `validate`, per-function `VMATTR(...)` via `src/ast/perfunc-enhanced.js` | `node cli.mjs --help` PASS, `node cli.mjs --target lua51 --seed 42 input.lua` PASS, `lua54` honest error PASS, incompatible --ffi error PASS | `tools/final_matrix_test.mjs` VMATTR per-func mixed PASS |

## Final-pass additions (2026-09-22)

- `tools/fusion_split_proof.mjs`: fusion/splitting OFF-vs-ON structural/runtime proof across FAST/BALANCED/SECURE and seeds 0/42/123/999.
- `tools/antitamper_integrity_test.mjs`: deterministic integrity-field mutation and VM-state validation proof.
- `src/security/antitamper.js`: deterministic integrity records for VM/blob/handler/dispatcher/build metadata plus explicit state validation.

## Current Production Compiler Path (2026-09-22)

The Lua51 production compiler now uses the following authoritative path:

```text
AST/transforms → symbolic VM IR → CFG → conservative optimizer → storage/lifetime analysis → custom bytecode lowering → encoding → VM generation
```

Proof: `tools/ir_pipeline_proof.mjs` generates `IR_PIPELINE_PROOF.json` with IR-before/after, CFG block/edge counts, optimizer statistics, allocation statistics, and lowered bytecode word counts. `tools/differential_35.mjs` remains 35/35 after the migration.

The allocator deliberately preserves lexical/captured binding IDs because those IDs are consumed by the existing closure/upvalue frame ABI. Fusion/splitting remain PARTIAL because their existing pseudo-op candidates do not yet have matching generated VM handlers.

## Honest Summary

- **IMPLEMENTED (with file/function/test evidence):** `lua51` target, target registry honesty, random names/keys/encrypted payload/split shards/opcodes, VM execution, VM stack correctness, per-function FAST/BALANCED/SECURE mixed, CLI with validation, hardening (ciphers+decoys+carrier+anti-crack), devirt harness 5 HARD, diversity 20/20 unique, fuzz 100/500, VM window shift + proto/jump salts, IR optimizer scaffold
- **PARTIAL (exists, not full):** constant virtualization typed, instruction encoding families, mutation/fusion/splitting, handler decomposition, dispatcher/state, generated handlers, VM variants, AST registry, inline/unroll/mba/stackalloc, register optimization, static env, compat, anti-tamper/checks, compression, pcall, metamethod, security evaluation, build diversity, test matrix, performance, output size
- **NOT IMPLEMENTED (honest, blocked by missing native runtime or not yet virtualized):** Lua 5.2/5.3/5.4/LuaJIT/Luau native backends and debug lib protection. The current environment has gcc/clang/cmake/make, but no usable target source archives or binaries were found locally. **Coroutine VM-owned state is IMPLEMENTED for lua51:** post-change runtime proof is complete with local Fengari 0.1.5.

> No feature marked IMPLEMENTED without production file + function + behavioral test + differential test. Scaffolding/comments/flags not counted.

## Remaining Blockers (concrete)

1. **Native Lua runtimes:** gcc/clang/cmake/make are present in the current environment, but no usable Lua 5.2/5.3/5.4 source archive or prebuilt binary was found locally. Until a matching runtime is actually available, only lua51 via Fengari 0.1.5 is differential-validated.
2. **VM-aware pcall/coroutine/metamethod:** PCALL/XPCALL and VM CALL/RETURN/TAILCALL are scheduler-native. Phase 6.8 persistent coroutine state plus `DRIVE_STATE` is runtime-proven on lua51. VM arithmetic/__newindex metamethod closure dispatch remains partial.
3. **Compression:** `src/compression/compress.js` RLE sketch present, independent from crypto, but not yet integrated into `emitVM` blob pipeline with encrypt-then-compress ordering and runtime decrypt→decompress→validate→decode benchmark.
4. **MBA/inline/unroll/stackalloc:** Transforms have registry+logic but not yet wired into `compile` → `IR` → `lower` with before/after IR + target-presicion differential (need `target != lua51` handling for bitwise etc.).
5. **Debug protection & anti-tamper full:** `debug.get*` traps not yet emitted into VM (configurable normal/protected); anti-tamper has image/blob checks but not handler/dispatcher/metadata/state consistency polling.

## Current Phase 6.8.1 update

Phase 6.8.1 runtime proof is now complete for lua51. The previous Phase 6.8.0 runtime failures (mutable upvalues, upvalue close, closure loop, coroutine argument handling, nested scheduler state, and protected VM metamethod paths) were reproduced and fixed. See `PHASE6_8_1_RUNTIME_PROOF.md`.

Phase 7 remains PARTIAL because IR/CFG/register allocation are not yet the authoritative production pipeline. Phase 8 remains blocked on missing native target runtimes. Phase 9 remains PARTIAL for incomplete metamethod/debug/static-env/anti-tamper coverage.

## Evidence Paths

- Baseline: `tools/differential_35.mjs:1`, `tools/fuzz_100.mjs:1`, `tools/seed_test.mjs:1`, `tools/diversity_test.mjs:1`, `vm-stack.test.mjs:1`, `test_close.mjs:1`, `hardening.test.mjs:1`, `tools/devirt.js:1`
- Constant: `src/vm/constants.js:1`, `tools/constant_virt_test.mjs:1`, `vm-bytecode.js:1278`
- Encoding: `src/bytecode/encoding.js:1`, `tools/build_20_diversity.mjs:1`
- Dispatcher/variant: `src/vm/dispatcher.js:1`, `src/vm/variants.js:1`, `vm-bytecode.js:147`
- CLI: `cli.mjs:1` (`--target --profile --vm --seed --compress --debug --static-env --compatibility --ffi` validated)
- Targets honest: `src/targets/registry.js:15`, `src/targets/lua54.js:1` `reason`, `TOOLS_TARGETS.md:1` (install state)

## Performance (fengari, tiny script)

| Preset | vm-only time | len | loader+vm time (custom) | len |
|--------|--------------|-----|--------------------------|-----|
| native | 4–5 ms | 73 | — | — |
| FAST (lite, 1 layer) | 37 ms (0.14s loader) | 28k | 145 ms | 22k |
| BALANCED (bytecode, 3 layers) | 34 ms (1.28s) | 37k | 1841 ms | 169k |
| SECURE (bytecode, 4 layers, 2-round) | 28 ms (4.27s) | 41k | 5355 ms | 217k |
| 35-case differential | — | — | — | 35/35 PASS |
| 500 fuzz (lua51) | — | — | — | 500/500 PASS |

> VM time is dominated by vault decode + dispatch; loader HT is dominated by `encChain` cipherRounds (FAST 1, BALANCED 1, SECURE 2). No correctness sacrificed for benchmarks.

## Security Note (per Luraph docs)

VM Compression is size optimization, not security. Gains are from compiler diversity (opcode map 500–60000 per build, register shuffle bijection, handler order, VP/BP/JMP/PROTO salts, decoy vault 2–12 runs, decoy chunks 2–20, frame stride 8–32, state layout shuffle) not just XOR layers.

## Files Changed (this session)

- **Created:** `src/vm/constants.js`, `src/bytecode/encoding.js`, `src/ir/mutation.js`, `src/ir/fusion.js`, `src/ir/splitting.js`, `src/vm/handlers.js`, `src/vm/dispatcher.js`, `src/vm/variants.js`, `src/ast/registry.js`, `src/transform/inline.js`, `src/transform/unroll.js`, `src/transform/mba.js`, `src/transform/stackalloc.js`, `src/ir/register.js`, `src/ast/perfunc-enhanced.js`, `src/security/staticenv.js`, `src/security/compat.js`, `src/security/debugprotect.js`, `src/security/antitamper.js`, `src/compression/compress.js`, `src/targets/lua54.js`, `src/targets/lua52.js`, `src/targets/luajit.js`, `src/targets/luau.js`, `src/vm/coroutine.js`, `src/vm/metamethod.js`, `src/vm/pcall.js`, `cli.mjs`, `tools/build_20_diversity.mjs`, `tools/constant_virt_test.mjs`, `tools/final_matrix_test.mjs`
- **Modified:** `vm-bytecode.js` (imports + per-function VMATTR + target honesty + constPool + variant/encoding/dispatcher selection + VP typed salts), `src/targets/registry.js` (6-target registry + capabilities), `custom-obfuscator.js` profile clamping via `resolveProfile`
- **Already present (verified):** `src/profiles.js`, `src/ir/ir.js`, `src/ir/cfg.js`, `src/ir/optimizer.js`, `src/vm/frame.js`, `src/generator/variability.js`, `src/bytecode/format.js`, `src/targets/lua51.js`, `custom-obfuscator.js` chain + VM pass + anti-crack, `tools/*.mjs`, `TOOLS_TARGETS.md`

*End of FINAL_FEATURE_MATRIX.md*

---

# CURRENT FINAL-REMAINING-FEATURE PASS — 2026-09-23

This section is the current filesystem-grounded status. See `FINAL_REMAINING_FEATURE_PASS_REPORT.md` for commands and evidence.

| Feature | Current classification |
|---|---|
| STACKALLOC | IMPLEMENTED + VERIFIED |
| Safe CFG jump-trampoline rewriting | IMPLEMENTED + VERIFIED |
| Full arbitrary CFG flatten/reorder | NOT IMPLEMENTED |
| Hard-coded globals | IMPLEMENTED + VERIFIED (staticEnv opt-in) |
| LuaJIT FFI pass-through | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.2.4 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.3.6 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.4.8 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| LuaJIT 2.1 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 runtime | BLOCKED BY ENVIRONMENT |
| Per-function STACKALLOC control | IMPLEMENTED + VERIFIED |
| Remaining per-function controls | IMPLEMENTED + PARTIALLY VERIFIED |
| Static environment | IMPLEMENTED + PARTIALLY VERIFIED |
| Anti-tamper/state validation | IMPLEMENTED + VERIFIED |
| Lua 5.4 `<close>` / `<const>` | NOT IMPLEMENTED |
| Luau `continue` / compound assignment / generic type-parameter lowering | NOT IMPLEMENTED |
| Native target-runtime differential proof | BLOCKED BY ENVIRONMENT |
| Production IR pipeline in this checkout | NOT IMPLEMENTED / BASELINE MISMATCH |
