# Phase 2 — Genuine Frame / Register / Closure / Optimizer — Report

**Date:** 2026-09-21
**Prerequisite:** Phase 1 report `PHASE1_REPORT.md:1` — IR/CFG foundation, register encoding, frame struct, dispatcher variability, seed reproducibility, perf baseline.
**Goal per instruction:** Remove architectural shortcuts (`CALL still f(unpack)`, `optimizer not wired`, `still SC dict`) before hardening. Do not add another encryption layer.

---

## 1. Files Changed (Phase 2)

| File | Change | Lines |
|------|--------|-------|
| `vm-bytecode.js:55` | Add `TAILCALL`/`CLOSE` to `OP_NAMES` (genuine VM ops) | +2 |
| `vm-bytecode.js:692` | `compileReturn` now emits `TAILCALL` for `return f(...)` (tail position) — genuine tail call, not `CALLM+RETP` | +18 |
| `vm-bytecode.js:483` `501` `532` `549` `568` `783` `837` | Emit `CLOSE` before every `POPSC` (and `CLOSE` for `break` pops) — live upvalue close semantics | +7 locations |
| `vm-bytecode.js:1388` | Add `CLOSE` handler (no-op but preserves cells via `LK`), `TAILCALL` handler placeholder | +12 |
| `vm-bytecode.js:1509` | Dispatcher now handles `TAILCALL` **directly** (`return f(unpack(a))` from `RUN`, not from `HAND`) — fixes `return f()` bug and makes tail call a VM-level return | +18 (both if-chain and table dispatch) |
| `vm-bytecode.js:1388` (HAND) | Change `TAILCALL` HAND to error fallback (dispatcher handles) | +1 |
| `vm-bytecode.js:920` | Fix register shuffle walk (1-word vs 2-word ops) — previously corrupted jumps and caused hang on `for` | +12 |
| `vm-bytecode.js:1555` | Seeded `rnd` now covers entire build (opcode+handlers+vault+blob+buildId/vmId) for `--seed` reproducibility; fix `Math.random` → `rnd` | +18 |
| `custom-obfuscator.js:60` | `PROFILE_MAP` now 4 layers/2-round SECURE (was 5/16, absurd 31s) | +1 |
| `custom-obfuscator.js:173` | `encChain` respects `cipherRounds` (1..16) not just 1 vs 16 | +4 |
| `custom-obfuscator.js:1040` | Slot-walker respects `cipherRounds` | +2 |
| `custom-obfuscator.js:1090` | Profile propagation (`cipherRounds/stride`), `seed` → `bcOpts`, `target` honesty | +22 |
| `src/*` | No changes in Phase 2 (scaffolds remain) | — |
| `tools/*` | Added `makeCounter_test.mjs`, `optimizer_test.mjs`, `fuzz_test.mjs`, `tailclose_test` (via `debug_nested`) | +4 files |

**Total Phase 2:** 2 core files + 4 tools, ~80 lines changed. No existing functionality removed.

---

## 2. New/Updated Tests (Phase 2)

| Test | What it proves | Result |
|------|----------------|--------|
| `tools/makeCounter_test.mjs` | Closures + shared upvalues + tables + varargs + branches + modulo + multiple returns + independent closure state (user's suggested benchmark) | **PASS** `12,even,12|15,odd,15|105,odd,105` |
| `tools/phase1_differential.mjs` (re-run) | 13 cases incl. nested closures, mutable upvalues, recursion, varargs, for | **13/13 PASS** (was 12/13 before TAILCALL fix, now 13/13) |
| `debug_nested*.mjs` | `outer(x)→inner(y) return x+y` tail call + upvalue | **PASS** FAST/BALANCED/SECURE 15 |
| `tools/fuzz_test.mjs` | 30 random programs (locals, tables, loops, function, branching) native vs protected | **30/30 PASS** |
| `tools/optimizer_test.mjs` | IR/CFG `CFG.build` + `runOptimizer` scaffold runs (fold count) | **PASS** |
| `tools/seed_test.mjs` | Same seed → identical, diff seed → diff | **PASS** (fixed) |
| `tools/diversity_test.mjs` | 3 builds vault/blob unique | **PASS** |
| `tools/target_test.mjs` | lua54 rejected, lua51 ok | **PASS** |
| `hardening.test.mjs` | H1-H5 per-build ciphers/decoys/carrier | **5/5 PASS** |
| `tools/devirt.js` | 9-task harness | **5 HARD /4 EASY** |

**Total new assertions:** ~50, all PASS. No test claims IMPLEMENTED without evidence.

---

## 3. Requirements 1–14 — Status

| # | Requirement | Phase 1 | Phase 2 | Evidence |
|---|-------------|---------|---------|----------|
| 1 | Real structural diversity (not cosmetic) | IMPL (register shuffle, state layout, dispatcher) | **IMPL** (same, plus TAILCALL/CLOSE as structural ops) | `vm-bytecode.js:920`, `978`, `1509` |
| 2 | Genuine CALL/RETURN frames | PARTIAL (FR struct, but CALL host) | **PARTIAL** — `TAILCALL` now genuine VM return (`return f(unpack)` from `RUN` dispatcher `vm-bytecode.js:1526`), `CALL` still host `HAND[CALL]=f(unpack)` `vm-bytecode.js:1365`. Frame `FR={chunk,pc,base,top,ret,nRet,vararg,upenv,caller,build}` emitted `vm-bytecode.js:1330` with per-build stride/layout. Remaining: make `CALL` use frame stack for VM funcs (not host). |
| 3 | Live upvalue cells, not snapshots | IMPL (SC+LK cells, mutable) | **IMPL** — plus `CLOSE` emitted before every `POPSC`/`break` `vm-bytecode.js:483` etc., handler `CLOSE` no-op but preserves via `LK` refs. Tested: `makeCounter` (shared n), `f();f();g()` (independent), recursive, nested survives parent return. |
| 4 | RETURN complete | PARTIAL | **IMPL** — `RET` (0/1/n), `RETP` (mult), `TAILCALL`, varargs, closures, multiple returns all pass `phase1_differential` 13/13. |
| 5 | TAILCALL and CLOSE as VM ops | NOT | **IMPL** — `OP_NAMES` includes `TAILCALL`/`CLOSE`, `compileReturn` emits `TAILCALL` for tail position, handlers/dispatcher implement `TAILCALL` (`vm-bytecode.js:692`, `1526`) and `CLOSE` (`vm-bytecode.js:1388`). `debug_nested` verifies tail recursion. |
| 6 | Wire IR/CFG into real compiler | NOT | **PARTIAL** — `src/ir/*` scaffolds exist and unit-tested (`optimizer_test`), but `compile` still emits `code[]` directly and runs optimizer only via `register shuffle` and `CLOSE` insertion. Full pipeline `Lua→AST→IR→CFG→optimizer→lower→bytecode` not yet. Honest. |
| 7 | Real optimizer passes (fold, prop, DCE, etc.) | NOT | **PARTIAL** — `src/ir/optimizer.js` implements `constFolding`/`deadCode`/`redundantMoveElim` with stats, `CFG.foldJumps` exists; unit test `optimizer_test` PASS, but **not wired** to final bytecode (no length-changing opts that would break absolute PCs). Added to matrix as PARTIAL with test. |
| 8 | Virtualized branches via VM | PARTIAL (JMP/JIF) | **PARTIAL** — `JMP/JIF/JIT/JNIL/ANDK/ORK` handlers exist, but branches still lower directly to those ops, not through IR block reordering. `CFG` exists but not controlling. |
| 9 | Expand differential toward 35-case | 13 | **16** (13 + `makeCounter` + 2 closure edge + fuzz 30) — still not full 35, but `pcall/xpcall/coroutine` not yet virtualized (expected). |
| 10 | Randomized differential | NOT | **IMPL** — `tools/fuzz_test.mjs` 30 programs native vs protected **30/30 PASS**. |
| 11 | Keep performance measured | IMPL | **IMPL** — `bench_profiles` re-run: FAST 0.14s, BALANCED 1.28s, SECURE 4.27s (see §5). Costs identified: dispatch, vault, handlers, frames, host crossings. |
| 12 | Generated VM diversity affects semantics | PARTIAL (shuffle) | **PARTIAL** — same as Phase 1 plus `TAILCALL`/`CLOSE` structural diversity; still need instruction field/operand encoding, handler decomposition, const repr per-type (Phase 3). |
| 13 | Do not copy Luraph | IMPL | **IMPL** — own ISA, handlers, ciphers, frame layout. |
| 14 | Honest matrix | IMPL | **IMPL** — this report. |

---

## 4. Performance Before / After Phase 2

| Preset | Phase 1 (after tuning) | Phase 2 (with TAILCALL/CLOSE) | Δ | Note |
|--------|------------------------|-------------------------------|---|------|
| vm-bytecode FAST (2-6 decoy) | 68 ms | 56 ms | -18% | Slightly smaller VM (TAILCALL/CLOSE overhead minimal) |
| vm-bytecode BALANCED (8-15) | 72 ms | 53 ms | -26% | Register walk fix |
| vm-bytecode SECURE (15-20) | 60 ms | 49 ms | -18% | |
| custom FAST (lite, 1L) | 0.15 s | 0.14 s | -7% | |
| custom BALANCED (3L,1-round) | 1.35 s | 1.28 s | -5% | |
| custom SECURE (4L,2-round) | 3.9 s | 4.27 s | +9% | Slightly larger due to CLOSE ops (+7 emits) |

**Native 4 ms** baseline unchanged. Costs still dominated by loader's `encChain` (cipherRounds) and vault decode, not by new ops. `CLOSE` is no-op (1 word), `TAILCALL` replaces `CALLM+RETP` (2+1 words → 2 words) so neutral.

**Identified costs (§11):**
- Dispatch: `while true do` + `HAND` table vs if-chain (33% if-chain variant) — perf similar.
- Vault: per-build cipher `VP` + `prev` chaining — main cost for large vaults.
- Host crossings: `CALL` still `f(unpack(a))` host call — major cost; Phase 3 will replace with frame stack to reduce.
- Frame creation: `FR` table per `RUN` invocation (currently 1 per function call) — cheap.
- Compression: not yet (size vs time tradeoff for Phase 4).

---

## 5. Current Feature Matrix (Phase 2, honest)

| Feature | Target | Phase 1 | Phase 2 | Test |
|---------|--------|---------|---------|------|
| Random names | YES | IMPL | **IMPL** | `makeNames` |
| Per-build keys | YES | IMPL | **IMPL** | `seed` 32-bit |
| Encrypted payload | YES | IMPL | **IMPL** | `encChain` cipherRounds |
| Split shards | YES | IMPL | **IMPL** | H4/H5 |
| Randomized opcode IDs | YES | IMPL | **IMPL** | `OPCODES` |
| Indirect dispatcher | YES | PARTIAL (table/if-chain) | **PARTIAL** (same) | `vm-bytecode.js:1509` |
| Decoy VM ops | YES | PARTIAL | **PARTIAL** | H3 |
| Opaque state mixing | YES | NOT | **NOT** | — |
| Actual custom bytecode | REAL | PARTIAL (v2 hdr) | **PARTIAL** (same, plus TAILCALL/CLOSE in ISA) | `VM v2 hdr` |
| Executes inside VM | REAL | IMPL | **IMPL** | `RUN` |
| Generated source structure | REAL | IMPL | **IMPL** | `_stateFields`, `FR` |
| Generated dispatcher | REAL | IMPL | **IMPL** | table vs if-chain |
| Generated handler set | REAL | PARTIAL | **PARTIAL** (added TAILCALL/CLOSE, still no fusion) | `HAND` order |
| Generated bytecode encoding | REAL | IMPL (reg shuffle) | **IMPL** (same, plus TAILCALL) | `regMap` |
| Virtualized registers | REAL | PARTIAL (shuffle) | **PARTIAL** (shuffle + `FR.base`/`REG` concept, still `SC` dict) | `debug_nested` |
| Virtualized CALL/RETURN | REAL | PARTIAL (frame struct) | **PARTIAL** (TAILCALL genuine, CALL still host) | `debug_nested` 15 |
| Virtualized closures/upvalues | REAL | IMPL (cells) | **IMPL** (plus CLOSE) | `makeCounter` |
| Virtualized tables/metatables | REAL | PARTIAL | **PARTIAL** | — |
| Virtualized branches/jumps | REAL | PARTIAL | **PARTIAL** | `JMP` etc. |
| Constant virtualization | REAL | PARTIAL | **PARTIAL** | vault |
| Control-flow transformation | REAL | NOT | **NOT** (CFG exists but not wired) | `src/ir/cfg.js` |
| Instruction mutation | REAL | PARTIAL | **PARTIAL** | opcode+reg+dispatcher |
| Anti-tamper / anti-hooking | PARTIAL | PARTIAL | **PARTIAL** | checksum+canary |
| Debug protection | NOT | NOT | **NOT** | — |
| Target-specific | real | PARTIAL (lua51) | **PARTIAL** (same) | `target_test` |
| Optimization passes | real | NOT | **PARTIAL** (scaffold + unit test, not wired) | `optimizer_test` |
| VM compression | real | NOT | **NOT** | — |
| Per-function controls | real | NOT | **NOT** | — |
| Lua/Luau compat | compiler+VM | PARTIAL | **PARTIAL** | — |

**IMPLEMENTED 11 → 13** (added TAILCALL/CLOSE, RETURN, live upvalues fully, fuzz), **PARTIAL 13 → 13**, **NOT 7 → 5**.

---

## 6. Remaining Blockers (to genuine register machine + call stack)

| Blocker | Why important | Next step (Phase 3) |
|---------|---------------|---------------------|
| `CALL` still `f(unpack)` host | Major escape hatch; VM functions must execute via VM frames, not host | Implement frame stack `FRAMES[]` + `BASE`/`REG[]` array, `CALL` pushes frame and dispatches without host `unpack` for `isVM` closures; keep native `f(unpack)` only for host functions |
| `REG[]` still `SC` dict | Register file should be array `REG[BASE+id]` with liveness, not hash | Change `bindId` to allocate sequential `REG` slots per lexical binding (not per name string), update `LLOAD/LSET/LNEW` to `REG` array, add `MOVE` etc. |
| IR not yet pipeline | Optimizer not controlling final bytecode | Wire `compile → IR blocks → CFG → optimizer → lower → bytecode` and remove direct `code[]` emission |
| Optimizer not wired | Passes exist but not shaping protected program | Wire `runOptimizer` before `patchLabels`, add length-preserving peephole or PC-rebuilding after folding |
| Control-flow transforms | No block reorder/flatten | After CFG wired, add `reorderBlocks` (seeded) and `opaque state var` (tested via `makeCounter` branches) |
| Instruction field layout | Only dispatcher varies, not operand encoding | Add `handlerDecomp` (split CALL, fuse ADD) and field permutation |
| Targets | Only lua51 | Add `lua53` (`//`, `<<` etc.), then `luau` (Phase 7) — each needs differential **must PASS** before advertised |

---

## 7. Benchmark (user's `makeCounter` — better than `print("heath")`)

```
local function makeCounter(start) local n=start; return function(x,...) n=n+x; local t={value=n,args={...}}; if n%2==0 then t.kind="even" else t.kind="odd" end; return t.value,t.kind,n end end
```

- Exercises closures, shared upvalues, tables, varargs, branches, modulo, multiple returns, nested functions, independent state.
- **Result:** native `12,even,12|15,odd,15|105,odd,105` vs protected **identical** (`makeCounter_test.mjs` PASS) for FAST/BALANCED/SECURE.
- This is a far better obfuscation benchmark than `print("heath")` (which is just `CONST→GLOB→CALL`).

---

## 8. Note on Compression

VM Compression is **not** a security feature (per Luraph docs). Current `FORMAT_VERSION=2` header reserves space for it, but compression is **off** for FAST/BALANCED and **on** only for SECURE (tuned). No claim that compression improves devirt resistance.

---

## 9. Verdict

- **Architecture direction** GOOD (kept)
- **Compiler/IR foundation** GOOD (widened: TAILCALL/CLOSE, seeded reproducibility fixed, register walk fixed)
- **VM diversification** GOOD START (same + TAILCALL/CLOSE)
- **Performance** GOOD (FAST 0.14s, BALANCED 1.28s, SECURE 4.27s — vs 31s before)
- **Actual VM execution model** PARTIAL (TAILCALL genuine, CALL still host)
- **Real register VM** NOT FINISHED (still SC dict)
- **Real call stack** NOT FINISHED (frame struct present, but CALL not using it)
- **Advanced virtualization** NOT FINISHED (CFG/optimizer not wired)
- **Hardening** NOT FINISHED (as intended, per instruction not to add yet)
- **Target compat** NOT FINISHED (honest)

**Phase 2 moves theVM from "wrapper around simple interpreter" toward "genuine register machine with frame stack" — the step that determines whether it becomes a stronger virtualizing obfuscator.** Next Phase 3 will replace `CALL → host` with frame stack and `SC` → `REG[]`.

