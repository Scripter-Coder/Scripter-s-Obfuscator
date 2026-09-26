# Phase 6 — VM-Owned Scheduler Report

Verified: 2026-09-22

## Result

**Scheduler: IMPLEMENTED for direct VM→VM CALL/RETURN/TAILCALL execution.**

The active VM no longer executes a VM closure by recursively calling the generated `RUN()` interpreter from the CALL handler. Direct VM→VM calls push a VM frame and continue in the same scheduler loop.

Host/native boundaries remain host boundaries. A host-invoked VM closure (for example through Lua's external coroutine/metamethod machinery) may create its own scheduler invocation; this is separate from the VM→VM path.

## Architecture

The generated VM now maintains, per scheduler invocation:

- `REG[]` — single authoritative VM operand/register storage for that scheduler
- `BASE` — current frame's register/operand window base
- `TOP` — current top of the active window
- `FP` — active frame index
- `FRAMES[]` — suspended/current VM frame records
- `CODE`, `PC`, `SC`, `LK`, `VA` — current execution state

Each frame records the equivalent of:

`BASE, TOP, CODE, PC, SC, LK, VA, retDest, nRet`

## Old path

Before Phase 6, the VM→VM path was effectively:

`CALL → VM registry lookup → RUN(callee) → nested Lua interpreter invocation → return`

The production CALL path also contained the generic host-call form for non-VM functions.

## New path

For a VM closure:

1. CALL reads the callee and arguments from `REG`.
2. Caller `TOP`/`PC` are saved into `FRAMES[FP]`.
3. `FP` increments.
4. The callee receives a new `BASE` window above the caller's retained operand area.
5. `CODE`, `PC`, `SC`, `LK`, and `VA` switch to the callee.
6. Execution returns to the same `while true` scheduler loop.
7. No recursive `RUN(callee,...)` call is made.

RETURN:

1. Return values are collected from the current frame.
2. The suspended caller is loaded from `FRAMES[FP-1]`.
3. `FP` decrements.
4. `CODE`, `PC`, `BASE`, `SC`, `LK`, and `VA` are restored.
5. Values are copied to the caller's saved `retDest`.
6. The scheduler continues in the caller without entering another interpreter.

TAILCALL reuses the active frame and changes its `CODE/PC/SC/LK/VA` instead of pushing another VM frame.

## Critical runtime tests

### A → B → C → B → A

PASS.

Program result: `10`.

### Recursion

`fact(10)` PASS with result `3628800`.

The scheduler also passed `fact(20)` execution structurally; the current Lua 5.1 numeric representation used by the test VM does not preserve the exact decimal integer beyond its supported representation, so the regression assertion uses `fact(10)` for exact-value verification.

### Mutual recursion

A/B mutual recursion PASS.

### Closure/upvalues

PASS for nested closures, escaping closures, shared upvalues, recursive closures, and nested VM calls.

### STACKALLOC

Existing stackalloc tests remain PASS, including nested captured-variable tests.

### VM metamethods

PASS for the current tested set:

- `__call`
- `__index`
- `__newindex`
- `__add`

The Phase 6 scheduler uses a per-scheduler `REG` table so host-triggered VM metamethod execution cannot corrupt the active scheduler's register storage.

## PCALL/XPCALL

Existing VM-aware PCALL/XPCALL tests remain PASS and the VM→VM path does not contain the generic `f(unpack(...))` fallback.

The protected-call exception boundary still uses Lua's native protected-call primitive; full VM-frame exception unwinding remains a separate limitation.

## Coroutine/YIELD

Existing coroutine/YIELD tests remain PASS.

The current coroutine implementation still relies on host coroutine scheduling around the VM scheduler invocation rather than implementing a separately virtualized coroutine scheduler object.

## Dispatcher/handlers

The frame scheduler is shared by the existing dispatcher strategies rather than being implemented as a separate interpreter per dispatcher.

Handler decomposition, opaque/state dispatch, and compression regression tests remain PASS.

## Seed regression

Tested:

`0, 1, 2, 3, 42, 123, 999`

plus 20 additional deterministic seeds (`1000`–`1019`) across the critical call-chain/recursion/closure cases.

Result: **108/108 PASS**.

A seed-dependent failure initially exposed a generated-name collision introduced by the additional scheduler state variables. The root cause was fixed by making generated VM identifiers globally unique within each emitted VM.

No seed-specific feature disable or seed-123 special case was added.

## Regression results

- Phase 6 scheduler test: PASS
- A→B→C→B→A: PASS
- recursion: PASS
- mutual recursion: PASS
- closure scheduler tests: PASS
- differential: **25/25 PASS**
- fuzz 100: **100/100 PASS**
- final matrix: **FAST/BALANCED/SECURE PASS**
- fuzz 500: **500/500 PASS**
- closure/close: **8/8 PASS**
- STACKALLOC: PASS
- PCALL/XPCALL: PASS
- coroutine/YIELD: PASS
- metamethods: PASS
- handler/opaque/compression: PASS
- per-function: PASS
- hardening: PASS
- randomized seed matrix: **108/108 PASS**

## Full npm test

`npm test` was rerun. Tests 1–7 of `obfuscator.test.mjs` passed, including real execution. The command again reached the existing intensity-10 double-wrap execution test and exceeded the 180-second timeout.

This remains a performance/runtime-duration limitation of that existing test rather than a Phase 6 scheduler correctness pass.

## Files changed for Phase 6

- `vm-bytecode.js`
  - VM-wide scheduler state
  - FRAMES push/pop
  - VM-native direct CALL/RETURN transition
  - VM tailcall frame reuse
  - VM `__call` handling
  - per-scheduler REG storage
  - unique generated identifier protection
  - optional scheduler trace emission
- `phase6_scheduler.test.mjs`
  - critical scheduler regression tests and static VM→VM recursive-RUN check
- `trace_phase6.mjs`
  - scheduler trace smoke test

## Remaining limitations

1. PCALL/XPCALL still uses the host's protected-call primitive for exception boundaries; VM-frame exception unwinding is not a fully independent VM subsystem.
2. Coroutine scheduling still uses the host coroutine implementation.
3. Metamethod coverage is behaviorally verified for the tested operations, but not every Lua metamethod category has a dedicated VM-native dispatcher.
4. The Lua 5.1 numeric runtime remains the authoritative target; other targets are not implemented.
5. The existing full `npm test` intensity-10 double-wrap test remains too slow for the current 180-second command window.

## Exact verification commands

```text
node phase6_scheduler.test.mjs
node trace_phase6.mjs
node test_vm_call.mjs
node test_close.mjs
node test_stackalloc_phase.mjs
node test_pcall_phase.mjs
node test_coroutine_phase.mjs
node test_metamethod_phase.mjs
node test_handler_opaque_compress.mjs
node test_diff_phase4.mjs
node test_random.mjs
node test_perfunc.mjs
node hardening.test.mjs
node tools/fuzz_100.mjs
node tools/final_matrix_test.mjs
npm test
```
