# FINAL_COMPLETION_TRACKER.md

Authoritative continuation checklist — 2026-09-22.

Legend:

- `[ ]` not started / not verified
- `[~]` partial
- `[x]` verified

## PHASE 6.8.1 — Runtime / Coroutine

- [x] Recover Fengari 0.1.5 + luaparse 0.3.1 locally
- [x] Reproduce mutable-upvalue failure
- [x] Fix VM closure identity collision
- [x] Reproduce coroutine resume-argument failure
- [x] Fix persistent coroutine resume arguments
- [x] Fix coroutine.create(call-result) handling
- [x] Fix captured STACKALLOC USET lowering
- [x] Fix VM __call under PCALL/XPCALL/TAILCALL
- [x] Fix VM __index scheduler path
- [x] Basic coroutine runtime proof
- [x] Multiple yields
- [x] A→B→C→YIELD→C→B→A
- [x] Closure/upvalue across yield
- [x] Multiple coroutine isolation
- [x] Coroutine reentrancy
- [x] Coroutine error / yield→error
- [x] PCALL/XPCALL inside coroutine
- [x] TAILCALL inside coroutine
- [x] STACKALLOC inside coroutine
- [x] 35/35 differential
- [x] 100/100 fuzz
- [x] 500/500 fuzz
- [x] 324 scheduler/profile/seed matrix
- [x] 486/486 PCALL/XPCALL matrix
- [x] Static no-recursive-RUN audit 13/13
- [x] FAST/BALANCED/SECURE runtime coverage
- [x] Phase 6.8 classified IMPLEMENTED for lua51

Commands:

```text
node phase6_8_static_audit.mjs
node phase6_8_generated_audit.mjs
node phase6_8_1_runtime.mjs
node phase6_8_1_seed_matrix.mjs
node tools/differential_35.mjs
node tools/fuzz_100.mjs
node phase6_5_matrix.mjs
node phase6_75_pcall_matrix.mjs
node tools/final_matrix_test.mjs
```

## PHASE 7 — Compiler / IR / Transforms

- [~] AST transform framework — real, but architecture is still AST-first
- [~] INLINE — verified safe subset + clean fallback; full requested signature coverage not complete
- [~] UNROLL — verified numeric/break/nested/nonconstant cases; continue fallback remains
- [~] MBA — verified rewrite families; full target-aware precision matrix not complete
- [~] STACKALLOC — runtime-proven captured storage; full escape/lifetime analysis not complete
- [~] Register/storage optimizer — modules exist, but not authoritative production allocation pipeline
- [x] IR becomes authoritative production intermediate representation
- [x] CFG becomes authoritative production lowering graph
- [x] Optimizer runs on real production IR
- [~] Register/storage analysis runs on production IR; lexical/captured ids are intentionally preserved; full physical register reuse remains blocked by the current closure ABI
- [x] Real VM instruction fusion — NUMK+ADD / NUMK+MUL fused opcodes have generated VM handlers; OFF/ON structural/runtime proof added
- [x] Real VM instruction splitting — ADD is split into real SPLIT_ADD_PREP/SPLIT_ADD_EXEC VM instructions with generated handlers; OFF/ON proof added
- [x] Transform composition — 34/34 runtime PASS
- [~] Per-function controls — runtime propagation verified; complete inheritance matrix pending

Command:

```text
node tools/ir_pipeline_proof.mjs
node phase7_transform_composition.mjs
```

## PHASE 8 — Targets / Compatibility

- [x] Audit local PATH/Downloads/runtime/toolchain availability
- [x] Lua 5.1 runtime verified
- [ ] Lua 5.2 native reference runtime
- [ ] Lua 5.3.6 native reference runtime
- [ ] Lua 5.4.8/5.4.9 native reference runtime
- [x] LuaJIT 2.1 runtime — exact supplied 2.1.1788856981 source built and native runtime verified
- [ ] Luau 0.709 runtime
- [~] Target registry — honest statuses, only lua51 IMPLEMENTED
- [ ] Per-target differential suites
- [ ] Per-target fuzz suites
- [ ] Per-target coroutine/metamethod/closure suites

Current limitation: required native target runtimes/toolchains are absent locally. Do not claim unsupported targets.

## PHASE 9 — Final Feature / Hardening

- [~] VM variants — real profile differences verified, broader structural variant matrix pending
- [~] Dispatcher diversity — runtime/generation proof exists; broader architecture matrix pending
- [~] Handler decomposition — runtime proof exists; full variant family coverage pending
- [~] Constant virtualization — runtime/structural proof exists; full typed-category differential pending
- [~] Instruction encoding — build-specific encoding exists; broader format coverage pending
- [~] Anti-tamper — deterministic VM/blob/handler/dispatcher/build-metadata integrity primitives and state validation are now tested; full generated-runtime polling/mutation coverage remains
- [x] VM compression — integrated decrypt→decompress→validate→decode→execute, corruption rejection PASS
- [~] Metamethod completeness — VM __call, __index and __newindex runtime-proven; arithmetic/comparison/length/concat VM-closure paths remain
- [ ] Static environment complete semantics
- [ ] Compatibility mode complete semantics
- [ ] Debug protection runtime traps — still requires a clear production option/semantic contract; current --debug is debug-info retention, not anti-debug protection
- [ ] FFI / hard-coded globals where target semantics permit
- [~] Devirtualizer regression detector
- [~] Build diversity — 20-build structural diversity proven, broader component matrix pending

## RELEASE AUDIT

- [~] Core lua51 semantic suites broadly green; focused VM metamethod runtime proof is complete, but the overall release gate remains partial due intensity-10 timeout and unrelated environment/application regressions
- [~] Transform composition green
- [~] Hardening partially green; intensity-10 stress remains unresolved
- [~] Performance measured
- [~] Documentation updated to match current implementation
- [ ] All REQUIRED Phase 7/8/9 architectural items verified

Overall project status: **PARTIAL**. The final pass materially closed genuine VM fusion/splitting and __newindex scheduler work, but allocator ABI constraints, unsupported target runtimes, debug protection, static-env/compat semantics, and intensity-10 stress remain. Do not declare overall completion while unchecked REQUIRED architectural/target items remain.


## RUNTIME PROOF FINAL — 2026-09-22

- [x] Fengari 0.1.5 runtime verified — supplied archive executed; Lua smoke test returned 5.
- [x] Existing metamethod test — `test_metamethod_phase.mjs` PASS.
- [x] VM metamethod runtime matrix — 17/17 VM cases PASS; 17/17 native controls PASS.
- [x] Native-vs-virtual metamethod differential — 17/17 PASS.
- [x] Nested metamethod scheduler integrations — 6/6 PASS (nested VM call, PCALL/XPCALL, coroutine, STACKALLOC, CALLM, tailcall).
- [x] FAST/BALANCED/SECURE metamethod seed matrix — 459/459 per profile; 1377/1377 total across 27 seeds/profile.
- [x] VM state polling valid-state proof — PASS.
- [x] VM state polling corruption proof — invalid FP/frame/BASE/TOP/SP/frame-BASE all rejected cleanly.
- [x] Metamethod-sensitive MBA/fusion/splitting correctness fixes verified.
- [x] Inline multi-return correctness fix verified by big-script B4 and INLINE suite.
- [x] Differential 35/35, fuzz 100/100, fuzz 500/500, scheduler 324/324, PCALL/XPCALL 486/486, coroutine 14/14, transform 34/34 rerun post-change.
- [x] CLOSE/closures 8/8, STACKALLOC, makeCounter, handler/decomposition, opaque dispatcher, compression, constant virtualization, INLINE, UNROLL, MBA, fusion/splitting, anti-tamper, per-function, diversity, static/generated audits rerun and green.
- [~] Intensity-10 controlled real execution — TIMEOUT at the double-wrap execution stage; no PASS claimed.
- [~] Overall release gate — remains PARTIAL because intensity-10 is unresolved and unrelated environment/application regressions include worker-resilience HTTP 429 and an unavailable vm-stack fixture.

State polling is promoted to **IMPLEMENTED** under its explicit runtime gate. Metamethod completeness remains **PARTIAL at the project release level** because the final release gate requires the entire post-change regression to remain green, despite the focused metamethod proof itself being complete.

See `RUNTIME_PROOF_METAMETHOD_FINAL.md` for exact commands/results.
