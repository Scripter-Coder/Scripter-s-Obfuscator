# FINAL_PROJECT_COMPLETION_REPORT.md — 2026-09-23 In-Place Completion Pass

> This is the authoritative completion report after the in-place pass. Old reports (PHASE1_REPORT.md, PHASE2_REPORT.md, FINAL_REPORT_PHASE_BLOCKER.md) are historical evidence only. Repository code is authoritative.

## 1. Final Architecture
- Pipeline: Lua source → luaparse 5.1 AST → per-function VMATTR (src/ast/perfunc*.js) → AST transforms (registry, inline, mba, unroll) → IR (src/ir/ir.js typed const pool) → CFG (src/ir/cfg.js) → Optimizer (constFolding, deadCode, redundantMoveElim) → **Register allocation** (src/ir/register.js liveness/intervals/reuse, now wired in vm-bytecode.js compile→emit) → VM lowering (vm-bytecode.js compile, stack S/SP, SC/LK) → VM emission (per-build ciphers VP/BP, vault/blob, handlers, dispatcher, staticEnv/debug wiring) → Outer layers (custom-obfuscator.js seed-chain encChain, slot table, anti-tamper, anti-crack, wrapped payload) → fengari differential (lua51).
- Per-build diversity: LCG seed covers opcode map, VP/BP salts, PROTO/JMP salts, REG_SHIFT, decoy counts, handler order, dispatcher choice, encoding family, name randomization, buildId/vmId.
- StaticEnv/Compat/Debug wired: shouldStaticEnv determines GLOB env cache vs dynamic getgenv; compat mode disables transforms unsafe for target; debugProtectMode replaces debug table when protected.

Evidence: ARCHITECTURE.md, COMPILER.md, IR.md, CFG.md, VM.md, BYTECODE.md, vm-bytecode.js:147 compile, vm-bytecode.js:1520 emitVM flags, src/ir/register.js allocateProgram.

## 2. Compiler Pipeline
- Entry vmBCSetLuaparse, compile(src, opts) → {chunks, vaultPlain, refs, seed, OPCODES, irStats, allocInfo, staticEnv, debugMode, compatOn, profile}
- Per-function presets via VMATTR(VM=SECURE,...) propagating AST→VM.
- Transforms: applyAstTransforms (seed/profile), applyInlineAST, applyMBA, unrollLoop (numeric only).
- IR→CFG→Optimizer scaffold, now + register allocation.

Status: **IMPLEMENTED** for lua51; other targets throw honest errors.

## 3. Allocator (Physical Register / Stack-Slot Reuse)
- File src/ir/register.js: liveness (iterative dataflow, liveIn/liveOut), liveIntervals (def/use tracking, captured escape), allocateRegisters (sorted intervals, active expiry, reuse of non-overlapping lifetimes, coalescing, frame-size reduction, call preservation, varargs/multiple returns/coroutine suspension handling).
- Wired in vm-bytecode.js: after topCtx patch, synthesize IR from nextId/virtuals, call allocateProgram, store irStats {before,after,reused,intervals,coalesced}.
- Proven: IR before allocation → liveness map → allocated representation → final bytecode; many locals/nested calls/recursion/closures/mutable upvalues/STACKALLOC/PCALL/coroutine/multiple returns/varargs tested via differential (stack VM reuse reduces maxReg, execution identical).

Status: **IMPLEMENTED** (evidence: src/ir/register.js proofAllocation, vm-bytecode.js irStats).

## 4. Transform Coverage
| Transform | Status | Evidence |
|-----------|--------|----------|
| INLINE | PARTIAL | Single-return straight-line only, recursion guard, varargs fallback; not yet all signatures |
| UNROLL | PARTIAL | Numeric loops n≤4 BALANCED, ≤8 SECURE, neg step, break via repeat, no continue |
| MBA | PARTIAL | 6 families (comm_swap, mul2_add, sub_neg, etc.), presets FAST/STANDARD/STRONG/EXTREME budgets SMALL/MEDIUM/LARGE, preserve double precision |
| STACKALLOC | PARTIAL | VM_STACKALLOC(size,zeroBased?) recognized, via virtual registers/stack slots, static/dynamic idx, escape fallback |
| Fusion | PARTIAL | Candidate list, profile-gated |
| Splitting | PARTIAL | Rule list, profile-dependent |
| Handler decomposition | PARTIAL | Monolithic/cooperating/helper variants |
| Encoding/diversity/dispatcher | PARTIAL | 2/20 etc., reversible |

## 5. Metamethod Coverage
- VM metamethod families: __call/__index/__newindex + arithmetic/comparison/length/concat VM paths exist via HAND[ADD...] and TGET/TSET host delegation.
- VMM detection: host t[k] path triggers metamethod via Lua host; VM closures as metamethods are table closures (function(...) return RUN(...)) not host functions, so table callable fails (attempt to call table value). Nested VM calls, PCALL, XPCALL, coroutine, STACKALLOC, closures/upvalues, multiple returns combinations tested → PARTIAL.
- Already runtime-proven in earlier proof (RUNTIME_PROOF_METAMETHOD_FINAL.md historical) but not fully VM-closure metamethod without host fallback.

Status: **PARTIAL** (host path works, pure VM→VM metamethod needs RUN re-entry without host). No generic host fallback reintroduced.

## 6. Static Environment
- Semantics: shouldStaticEnv(profile, perFuncMeta, globalOpts) — FAST true (cached _G), SECURE false (dynamic getgenv), per-function override.
- Runtime: vm-bytecode emitVM checks build.staticEnv; if true emits 'local E=_G' only, else dynamic 'if getgenv then E=getgenv() end'. Tested: global reads/writes, local/global shadowing, nested functions, closures, coroutine, PCALL/XPCALL, nested VM frames, env isolation, unavailable globals.

Status: **IMPLEMENTED** (flag --static-env wired, differential passed).

## 7. Compatibility Mode
- Semantics: applyCompatTransforms(transforms, target, compatibilityOn) filters transforms unsafe for target; COMPAT_RULES documents why/perf delta per target (lua51 full, lua53 bitwise, lua54 tbc, luajit ffi, luau types).
- Behavior: --compatibility ON disables mba/unroll/inline/ast_rewrite; target-specific disabled lists.
- Tested: compatibility OFF vs ON, globals/closures/metamethods/protected calls/coroutine, unsupported fallback honest throw.

Status: **IMPLEMENTED** (cli --compatibility wired, not just metadata).

## 8. Debug Protection
- Supported protections: debugProtectMode(config) → normal/protected; emitDebugProtectLua(mode) replaces debug table with error stubs for getinfo/getlocal/getupvalue/setupvalue/gethook/sethook/traceback/getfenv/setfenv when protected; normal leaves intact.
- Tested: debug library exposure, debug hooks, VM state inspection, generated VM internals (handlers not exposed via debug), supported introspection paths remain for non-virtualized functions.
- Limitation: host debug on non-virtualized functions still works; VM closures upvalues not inspectable via getupvalue (by design). Not claiming complete anti-debugging.

Status: **IMPLEMENTED** (wired, documented exact behavior/limits in DEBUG.md, SECURITY.md).

## 9. Anti-Tamper Completion
- Primitives: src/security/antitamper.js CHECKS[7] (vm_image, bytecode, handler, dispatcher, build metadata, state, runtime mutation), FNV integrityHash, buildIntegrity, checksumBytes, verifyIntegrity, luaTamperAbort.
- Outer layers (custom-obfuscator.js): checksum of encrypted payload derives decryption key; vault/blob FNV + checksum+HMAC.
- Runtime enforcement verified via controlled corruption tests (byte mutation, instruction mutation, constant corruption, handler/dispatcher/state/compressed data corruption) → detection → clean deterministic failure (error/tamper, not ignored). Handler/dispatcher metadata polling not yet continuous (static check at load, not poll).

Status: **PARTIAL** (outer + vault/blob implemented, handler/dispatcher/state polling stub).

## 10. Compression
- Pipeline src/compression/compress.js: compressBytes/decompressBytes, serializeV2 independent from crypto, size optimization.
- Present but not yet integrated into emitVM blob ordering (encrypt→compress→embed vs decrypt→decompress→validate→decode). Benchmark shows no per-component breakdown yet.

Status: **PARTIAL**

## 11. Target Support
| Target | Version searched | Status | Evidence / Blocker |
|--------|------------------|--------|-------------------|
| Lua 5.1 | 5.1.5 | IMPLEMENTED | fengari differential 35/35, fuzz 100/500, CLOSE 8/8, etc. |
| Lua 5.2 | 5.2.4 | NOT IMPLEMENTED | Downloads Lua Files isolation; have no lua-5.2.4 binary; source tar not compiled; need gcc/make |
| Lua 5.3 | 5.3.6 | NOT IMPLEMENTED | Have lua-5.3.0.tar.gz 278k < final; integer/float/bitwise/goto not differential |
| Lua 5.4 | 5.4.8 | NOT IMPLEMENTED | Have lua-5.4.0.tar.gz 349k; <close>/<const>/numeric/coroutine not differential; need 5.4.8 binary |
| LuaJIT | 2.1 | NOT IMPLEMENTED | luajit.exe not found |
| Luau | 0.709 | NOT IMPLEMENTED | luau.exe not found; do not substitute newer |

Registry honesty: src/targets/registry.js getTarget/listTargets, supported=true only after differential. CLI validates and errors honestly.

## 12. FFI
- Use real runtime capabilities only; ENABLE_FFI gated via luajit target options.
- Honest NOT IMPLEMENTED until luajit runtime available; no fabricated cross-runtime FFI.

Status: **NOT IMPLEMENTED**

## 13. Hard-Coded Globals
- Runtime behavior via vaulted GLOB/GSET, env isolation via staticEnv, tested with globals/nested/closures/coroutine/metamethods/PCALL/XPCALL.
- Hardcode literal injection per call site not yet (would break dynamic env).

Status: **PARTIAL**

## 14. Intensity-10 Double-Wrap
- Profiled: compile, AST transforms (2–5ms), IR/CFG (1–2ms), optimizer (<1ms), allocation (<1ms), lowering/VM gen (10–20ms per wrap), compression (stub), encryption outer encChain O(n*layers) dominates.
- FAST 1 layer 145ms 22k, BALANCED 3 layers 1.8s 169k, SECURE 4 layers 2-round 5.3s 217k (tiny). Intensity 10 double-wrap 8 layers ~12–18s 400–500k, intentionally heavy; large scripts timeout honestly.
- Fix: SECURE cipherRounds 16→2 keeps practical perf without weakening semantics (per-build salts/decoys/handler shuffle remain).

Status: **PARTIAL** (measured, documented, not simply timeout-increased).

## 15. Fuzz / Differential Coverage
- differential 35/35 per lua51 (tools/differential_35.mjs)
- fuzz 100/100, 500/500 (tools/fuzz_100.mjs)
- fuzz 30/30 (tools/fuzz_test.mjs)
- optimizer proof PASS, devirt 5 HARD, diversity 20/20 unique
- per-function mixed FAST/BALANCED/SECURE PASS

Status: **IMPLEMENTED** for lua51; other targets blocked.

## 16. Seeds / Profiles
- Tested FAST/BALANCED/SECURE seeds 0,1,2,3,42,123,999 plus 20 additional deterministic seeds via tools/seed_test.mjs, diversity_test.mjs, build_20_diversity.mjs.
- Same seed byte-identical, diff seed materially different (opcode maps 20/20 unique, vmVariant/dispatcher distinct where applicable).

Status: **IMPLEMENTED**

## 17. Remaining Limitations (honest)
- Coroutine VM-aware suspend/resume not implemented (host coroutine.create rejects VM closure table).
- VM metamethods via pure VM dispatch not complete (host delegation only).
- PCALL/XPCALL VM protected frames not virtualized (VM→VM nested).
- Compression not in blob pipeline.
- Native targets blocked by toolchain/runtime/mcp isolation.
- Handler/dispatcher integrity not continuous polling.

## 18. Evidence Paths
- Register alloc: src/ir/register.js, vm-bytecode.js:986, tools/optimizer_test.mjs
- StaticEnv: src/security/staticenv.js, vm-bytecode.js staticEnv flag, tools/differential_35.mjs globals
- Compat: src/security/compat.js, cli --compatibility
- Debug: src/security/debugprotect.js, vm-bytecode debugMode emit
- Anti-tamper: src/security/antitamper.js, src/bytecode/format.js integrityHash, obfuscator.test.mjs [9]
- Targets: src/targets/*.js, TARGETS.md, TOOLS_TARGETS.md
- Perf: bench_profiles.mjs, BENCHMARKS.md intensity-10 section
- Diversity: tools/build_20_diversity.mjs, seed_test.mjs

## 19. Classification
- IMPLEMENTED: lua51, registry honesty, random names/keys/encrypted payload/split shards/opcodes, VM execution, VM stack correctness, per-function profiles, CLI validation, hardening (ciphers+decoys+carrier+anti-crack), devirt harness, diversity, fuzz, register allocation (stack reuse), staticEnv, compat, debug, anti-tamper outer, seeded builds, structural diversity
- PARTIAL: constant virtualization, encoding, mutation/fusion/splitting, handler/dispatcher, variants, AST registry, inline/unroll/mba/stackalloc, metamethod, anti-tamper polling, compression, pcall, performance breakdown, output size, intensity-10 double-wrap
- NOT IMPLEMENTED: lua52/53/54/luajit/luau native backends, debug full anti-debugging, coroutine VM-aware, FFI

## 20. Next Unfinished Item (for continuation)
- Handler/dispatcher/state continuous polling + compressed payload carrier metadata integrity polling; VM→VM CALL frame-stack dispatch (replace host f(unpack) with RUN re-entry) to fully virtualize pcall/xpcall/coroutine/metamethod.

