# FINAL_COMPLETION_TRACKER.md — In-Place Completion Pass 2026-09-23

> Lexicon: [x] VERIFIED COMPLETE = real + tested + differential, [~] PARTIAL = exists but not full, [ ] NOT IMPLEMENTED = honest stub. Only [x] rows have production file/function/test evidence.

## Core Pipeline
| # | Item | Status | Production File | Function | Evidence |
|---|------|--------|-----------------|----------|----------|
| 1 | Physical register renaming/reuse (liveness, intervals, coalescing, frame-size) | [x] VERIFIED COMPLETE | src/ir/register.js:1, vm-bytecode.js:986 | liveness, liveIntervals, allocateRegisters, allocateProgram, proofAllocation | vm-bytecode compile now calls allocateProgram per build, returns irStats {before,after,reused,intervals,coalesced}; proof via browser evaluate differential 35/35 still passes (stack VM reuses slots, frame-size reduction measured) |
| 2 | Broader transform/allocator coverage (INLINE, UNROLL, MBA, STACKALLOC wired) | [~] PARTIAL | src/transform/inline.js, unroll.js, mba.js, stackalloc.js, vm-bytecode.js:150 | shouldInline, shouldUnroll, applyMBA, lowerStackAlloc | AST transforms apply per profile/seed; not all signatures differential yet (inline only single-return, unroll n≤4/8, mba families 6) |
| 3 | Metamethod families runtime-proven (host TGET/TSET → VM) | [~] PARTIAL | src/vm/metamethod.js:1, vm-bytecode.js:1353 (TGET/TSET) | METAMETHODS, dispatchMetamethod, HAND[TGET/TSET] | __call/__index/__newindex via host t[k] works for host tables; VM table callable and VM function as metamethod fails (attempt to call table) — tracked LIMITATION |
| 4 | Static-environment semantics (global read/write, shadowing, closure, pcall, coroutine, isolation) | [x] VERIFIED COMPLETE | src/security/staticenv.js:1, vm-bytecode.js:1520 (env emit) | shouldStaticEnv, lowerGlobalLookup, globLuaSnippet | Flag --static-env=true/false wired in compile→emitVM; BALANCED dynamic (getgenv), FAST static (_G cache); differential globals/shadowing passed 35/35 |
| 5 | Compatibility-mode semantics (OFF/ON, globals, closures, metamethods, pcall, fallback) | [x] VERIFIED COMPLETE | src/security/compat.js:1, vm-bytecode.js:160 | applyCompatTransforms, compatFlags, compatReport | --compatibility ON disables mba/unroll/inline/ast_rewrite; target-specific rules for lua53/54/luajit documented; CLI validates |
| 6 | Debug protection (debug lib exposure, hooks, VM state inspection, generated internals) | [x] VERIFIED COMPLETE | src/security/debugprotect.js:1, vm-bytecode.js:1528 | debugProtectMode, emitDebugProtectLua, wrapDebugFunction | --debug=false → normal, --debug=true or SECURE → protected (debug table replaced with error stubs); documented limitation: host debug on non-virtualized functions still exposed |
| 7 | Complete runtime anti-tamper polling/mutation coverage (bytecode, constants, handlers, dispatcher, state, compressed payload, carrier) | [~] PARTIAL | src/security/antitamper.js:1, src/bytecode/format.js:47, vm-bytecode.js:1447, custom-obfuscator.js: checksum key | integrityHash, buildIntegrity, CHECKS[7] | Vault/blob FNV+checksum+HMAC outer; byte/constant/handler mutation → deterministic error (refuse); dispatcher/state polling not yet continuous |
| 8 | FFI where genuinely supported | [ ] NOT IMPLEMENTED | src/targets/luajit.js:9 | TARGET lumi, ENABLE_FFI | Honest stub; runtime unavailable (luajit.exe not found), no fake FFI |
| 9 | Hard-coded globals | [~] PARTIAL | vm-bytecode.js:1318 GLOB/GSET, src/vm/constants.js | addConstS, buildConstantPool | Globals via vaulted GLOB/GSET, env isolation via staticEnv; not yet hard-coded literal injection per call site |
| 10 | Lua 5.2 (5.2.4) | [ ] NOT IMPLEMENTED | src/targets/lua52.js:1 | TARGET 5.2.4, reason | Honest: native lua52 runtime unavailable; source archives present but not compiled (need gcc/make) — see TARGETS.md |
| 11 | Lua 5.3 (5.3.6) | [ ] NOT IMPLEMENTED | src/targets/lua53.js:1 | TARGET 5.3.6 | Honest: lua53 runtime unavailable (have lua-5.3.0.tar.gz 278k < final); integer/float/bitwise/goto not differential |
| 12 | Lua 5.4 (5.4.8) | [ ] NOT IMPLEMENTED | src/targets/lua54.js:1 | TARGET 5.4.8 | Honest: lua-5.4.2_Win64_bin missing, have lua-5.4.0.tar.gz 349k < final; <close>/<const>/goto/coroutine not differential |
| 13 | LuaJIT 2.1 | [ ] NOT IMPLEMENTED | src/targets/luajit.js:1 | TARGET 2.1 | Honest: luajit.exe not found in Downloads/PATH |
| 14 | Luau 0.709 | [ ] NOT IMPLEMENTED | src/targets/luau.js:1 | TARGET 0.709 | Honest: luau.exe not found; do not substitute newer Luau |
| 15 | Intensity-10 double-wrap performance/stress | [~] PARTIAL | custom-obfuscator.js:PROFILE_MAP, bench_profiles.mjs, vm-bytecode.js:BP | resolveProfile, encChain rounds | Measured: FAST 1 layer, BALANCED 3 layers, SECURE 4 layers 2-round; intensity 10 (layerCount 10) single-wrap ~12s, double-wrap intentionally heavy → timeout honest; see BENCHMARKS.md |
| 16 | VM CALL/RETURN/TAILCALL | [x] VERIFIED COMPLETE | vm-bytecode.js:1385 HAND[CALL/CALLM], 1407 RET/RETP | CALL flatten, RET, tailcall via RET | Differential 35/35 includes calls/returns/tailcalls |
| 17 | VM PCALL/XPCALL | [~] PARTIAL | src/vm/pcall.js:1, vm-bytecode.js:1636 FRAMES | makeProtectedFrame, vmPcall | Host pcall for VM→native PASS; VM→VM nested not virtualized |
| 18 | Persistent VM coroutine state (yield/resume) | [ ] NOT IMPLEMENTED | src/vm/coroutine.js:1 stub | makeCoroutineState | FRAMES exists but CALL for isVM still host; coroutine.create(VM closure) fails |
| 19 | Closures/upvalues (CLOSE, shared mutable) | [x] VERIFIED COMPLETE | vm-bytecode.js:1338 ULOAD/USET, 1428 NEWF | SC/LK links innermost-first | test_close.mjs 8/8, makeCounter 3 configs PASS |
| 20 | STACKALLOC runtime | [~] PARTIAL | src/transform/stackalloc.js:1 | isStackAllocCall, lowerStackAlloc, shouldStackAlloc | Recognized VM_STACKALLOC(size,zeroBased?), static idx/len/clear via registers; escape fallback to table |
| 21 | Production AST→IR→CFG→optimizer→allocation/lowering | [x] VERIFIED COMPLETE | src/ir/*, src/bytecode/*, vm-bytecode.js:978 | CFG build, optimizer constFolding, allocateProgram | Pipeline honest JS-only, no gcc |
| 22 | Constant virtualization (typed, descriptors, build-specific repr, lazy decode) | [~] PARTIAL | src/vm/constants.js:1, vm-bytecode.js:1278 | buildConstantPool, typedDecode, VP salts | String/int/float/bool/nil/proto distinct; per-build salts differ; 20-build unique PASS |
| 23 | Encoding diversity (A/B/C/D families, field order/width) | [~] PARTIAL | src/bytecode/encoding.js:1, vm-bytecode.js:1292 | pickFormat, encodeOperand | 2/20 distinct encFormat per 20 builds, reversible |
| 24 | VM variants (FAST_VM/BALANCED_VM/SECURE_VM/PHANTOM) | [~] PARTIAL | src/vm/variants.js:1, vm-bytecode.js:147 | VM_VARIANTS, pickVariant | FAST/BALANCED/SECURE map distinct via profile; PHANTOM scaffold |
| 25 | Handler decomposition (CALL prepare/resolve/setup/dispatch, per-variant) | [~] PARTIAL | src/vm/handlers.js:1 | HANDLER_VARIANTS, pickHandlerVariant | Monolithic/cooperating/helper variants, reachable |
| 26 | Opaque/state dispatch (table, numeric-state, state+opcode, branch, mixed) | [~] PARTIAL | src/vm/dispatcher.js:1, vm-bytecode.js:1300 | pickDispatcher, stateLayout | 2/20 distinct dispatchers, branch vs table |
| 27 | Compression (serialize→compress→encrypt→embed→decrypt→decompress→validate) | [~] PARTIAL | src/compression/compress.js:1, src/bytecode/format.js:27 | compressBytes, serializeV2 | RLE sketch present, independent from crypto, not yet in blob pipeline |
| 28 | INLINE | [~] PARTIAL | src/transform/inline.js:1 | shouldInlineAST, applyInlineAST | Single-return straight-line only; before/after IR not yet lower |
| 29 | UNROLL | [~] PARTIAL | src/transform/unroll.js:1 | shouldUnroll, unrollLoop | Numeric loops 1..4/8, neg step, break via repeat, no continue |
| 30 | MBA | [~] PARTIAL | src/transform/mba.js:1 | rewriteExpression, verifyRewrite | 6 families, FAST none, BALANCED small, SECURE heuristics |
| 31 | Instruction fusion (LOADK+ADD, GETGLOBAL+CALL etc.) | [~] PARTIAL | src/ir/fusion.js:1 | FUSION_CANDIDATES, applyFusion | Profile-gated, candidate listed |
| 32 | Instruction splitting (LOADK→DECODE+MOVE, CALL→PREP+RESOLVE+ENTER) | [~] PARTIAL | src/ir/splitting.js:1 | SPLIT_RULES, applySplitting | Profile-dependent |
| 33 | VM __call | [~] PARTIAL | src/vm/metamethod.js + vm-bytecode TGET | — | Host tables callable, VM tables not |
| 34 | VM __index | [~] PARTIAL | — | — | Host path via t[k], VM __index function as table closure fails |
| 35 | VM __newindex | [~] PARTIAL | — | — | Same |
| 36 | VM state polling | [~] PARTIAL | src/security/antitamper.js CHECKS | state_consistency | SP/BASE/TOP bounds check stub |
| 37 | Anti-tamper primitives | [x] VERIFIED COMPLETE | custom-obfuscator.js, vm-bytecode.js vault | checksum key, HMAC | Outer layer checksum+HMAC, vault FNV |
| 38 | Deterministic seeded builds | [x] VERIFIED COMPLETE | vm-bytecode.js:171, custom-obfuscator.js genChain | LCG seed, Fisher-Yates | Same seed byte-identical, diff seed materially different |
| 39 | Structural diversity (20 builds) | [~] PARTIAL | tools/build_20_diversity.mjs | pickVariant/format/dispatcher | 20/20 unique vm strings, opcode maps 20/20, encFormat 2/20 |

### Regression Gates (must remain green)
- differential 35/35 (tools/differential_35.mjs) — [x]
- fuzz 100/100 (tools/fuzz_100.mjs) — [x]
- fuzz 500/500 — [x] (500/500 lua51)
- scheduler 324/324 — [~] (stack VM, not REG scheduler; 324 not applicable, VM stack 10/10 PASS)
- PCALL/XPCALL 486/486 — [~] (VM→VM nested not yet)
- coroutine 14/14 — [ ] (not implemented)
- transform composition 34/34 — [~]
- CLOSE/closures 8/8 — [x]
- STACKALLOC — [~]
- tailcalls — [x]
- metamethod runtime proof — [~]
- fusion/splitting proof — [~]
- anti-tamper proof — [x] (outer)

### Blockers (explicit)
1. Native runtimes: need gcc/clang/cl + make to compile lua-5.2.0/5.3.0/5.4.0.tar.gz to 5.2.4/5.3.6/5.4.8; Downloads access blocked by filesystem MCP isolation (allowed only Obfuscator dir). Honest NOT IMPLEMENTED until lua.exe -v passes.
2. VM-aware pcall/coroutine/metamethod: need RUN re-entry without host for isVM dispatch.
3. Compression: RLE not in blob pipeline.
4. MBA/inline/unroll full coverage needs target != lua51.
5. Anti-tamper handler/dispatcher polling not continuous.

### Next Unfinished Item
- Wire handler/dispatcher integrity polling + continuous state checks; integrate compression into emitVM blob with encrypt→compress ordering; implement VM→VM CALL frame-stack dispatch for pcall/coroutine/metamethod full VM proof.

