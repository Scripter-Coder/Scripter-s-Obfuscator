# Phase 6.8 Runtime Proof — POST-CHANGE RESULT

Date: 2026-09-22

## Classification

**PARTIAL**

The local Fengari runtime dependency was recovered from an existing project archive. The Phase 6.8 generated code was executed after the refactor. Runtime proof therefore proceeded; however the required definition-of-done is not met.

## Runtime dependency

Recovered locally from:

`/mnt/data/Obfuscator-s Website(1).zip`

Versions:

- fengari 0.1.5
- luaparse 0.3.1

No network install was required.

## Exact commands run

- `node phase6_8_static_audit.mjs`
- `node phase6_8_generated_audit.mjs`
- `node phase6_8_generation_matrix.mjs`
- `node test_phase6_scheduler.mjs`
- `node test_coroutine_phase.mjs`
- `node tools/differential_35.mjs`
- `node tools/fuzz_100.mjs`
- `node phase6_5_tailcall.mjs`
- `node tools/final_matrix_test.mjs`
- `node phase6_75_pcall_matrix.mjs` (did not complete within the controlled timeout)

## Runtime results

### Existing scheduler

`test_phase6_scheduler.mjs`: **PASS**

- abc PASS
- fact PASS
- mutual PASS
- closure PASS
- tail PASS

### Coroutine

`test_coroutine_phase.mjs` executed against the NEW Phase 6.8 runtime.

- Basic create/resume/yield: **FAIL** — `attempt to get length of a number value`
- Multiple yields: **FAIL** — first result became `attempt to get length of a nil value`
- Nested yield: **FAIL** — `attempt to get length of a nil value`
- Closure yield: **FAIL** — `attempt to get length of a nil value`
- OFF vs ON diversity check: PASS
- forbidden `f(unpack)` coroutine check: PASS

An additional runtime experiment after the host-boundary adjustment produced:

- basic yield: `10` PASS
- multiple yields: `1,2,3` PASS
- closure yield: `6` PASS
- nested VM call across yield: **FAIL**, `VM frame overflow`

This demonstrates that basic persistent-state suspension can execute, but the required nested frame proof is not established.

### Differential

`tools/differential_35.mjs`:

**32/35 PASS**

Failures:

- 10_mutable_upvalues
- 23_upvalue_close
- 24_closure_loop

These are post-Phase-6.8 runtime failures and prevent a full regression PASS.

### Fuzz

`tools/fuzz_100.mjs`:

**100/100 PASS**

### Tailcall

`phase6_5_tailcall.mjs`:

- simple tail recursion PASS
- tail args PASS (5050)
- tail multiple PASS (24)
- tail closure PASS (7)
- deep tail PASS (5000)
- frame reuse trace PASS (5 transitions)

### Final matrix

`tools/final_matrix_test.mjs` began successfully:

- FAST PASS
- BALANCED PASS
- SECURE PASS
- per-function mixed PASS
- pcall VM->native PASS
- coroutine create/resume FAIL
- metamethod `__index` FAIL (`VM closure requires VM scheduler`)
- metamethod `__call` PASS

The complete matrix did not finish within the controlled timeout.

### PCALL/XPCALL

`phase6_75_pcall_matrix.mjs` did not complete within the controlled runtime timeout after the Phase 6.8 changes, so **486/486 is not claimed post-change**.

## Static/generated proof

### Static audit

`phase6_8_static_audit.mjs`: **13/13 PASS**

### Generated audit

PASS:

- Lua parse
- VM closure RUN-like calls: 0
- legitimate top-level boot entries: 1
- VM coroutine create site present
- VM coroutine resume host boundary present
- yield sites present

### Generation matrix

`phase6_8_generation_matrix.mjs`:

**729/729 PASS** across FAST/BALANCED/SECURE and the defined seed set.

Generation/parsing success is not being counted as runtime success.

## Important runtime bug discovered

The new persistent-state `RUN` path initially passed varargs into `table.unpack(...)` as `table.unpack(...)` with no table argument. This produced:

`attempt to get length of a nil value`

The call was corrected to construct `{...}` directly for the state `resumeArgs` array. This restored the ordinary scheduler regression and exposed the deeper coroutine/closure failures documented above.

## Final assessment

Phase 6.8 remains **PARTIAL**.

The runtime dependency is available and the NEW Phase 6.8 implementation was actually executed. The missing proof is therefore not an environment limitation anymore; the implementation itself has unresolved runtime failures.

The following required claims are intentionally NOT made:

- A→B→C→YIELD→C→B→A PASS
- complete multi-coroutine isolation PASS
- coroutine reentrancy PASS
- coroutine error semantics PASS
- PCALL/XPCALL 486/486 post-change PASS
- differential 35/35 post-change PASS
- full Phase 6.8 IMPLEMENTED classification

No existing passing suite was deleted or replaced by a smaller suite.
