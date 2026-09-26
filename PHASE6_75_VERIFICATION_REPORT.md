# Phase 6.75 — Final VM Scheduler Closure

Verified: 2026-09-22

## Classification

**Scheduler: PARTIAL under the strict Phase 6.75 definition.**

The remaining Phase 6.5 PCALL/XPCALL gap is closed: VM-aware protected calls now push normal VM frames, execute inside the existing `REG[]/BASE/TOP/FP/FRAMES[]` scheduler, and unwind through one protected scheduler trampoline. No VM-aware PCALL/XPCALL handler invokes `RUN(callee)`.

The coroutine boundary remains the final strict gap. Existing coroutine behavior is correct, but coroutine scheduling still uses Lua's host coroutine mechanism around the VM entry function. It was not redesigned in this phase because doing so would require turning the current scheduler locals into a persistent cross-coroutine state object, which is a larger scheduler redesign than the requested closure-only scope.

## Files changed

- `vm-bytecode.js`
  - VM PCALL/PCALLM now mark the caller frame as protected and push the VM callee frame directly.
  - VM XPCALL/XPCALLM use the same protected-frame mechanism.
  - Added a single protected scheduler trampoline around the existing `DRIVE` loop. Errors unwind `DRIVE`, then restore the protected frame and resume the same scheduler state.
  - VM error handlers that are VM closures are entered as scheduler frames; native XPCALL handlers remain native host calls.
  - `_retv` handles successful protected returns and VM XPCALL handler returns without `RUN` re-entry.
  - Removed the dormant decomposed-call helper's VM `RUN` fallback.
- `phase6_75_pcall_matrix.mjs`
  - 486-case PCALL/XPCALL profile/seed matrix.
- `phase6_75_static_audit.mjs`
  - Static regression audit for forbidden VM-aware `RUN` use.
- `package.json`
  - Added Phase 6.75 PCALL and static-audit commands.
- `FINAL_FEATURE_MATRIX.md`
  - PCALL/XPCALL classification updated.
- `LIMITATIONS.md`
  - Coroutine limitation clarified.
- `PHASE6_75_VERIFICATION_REPORT.md`
  - This report.

## Previous PCALL/XPCALL path

Previously the generated VM used:

`PCALL VM closure -> host pcall(function() return RUN(callee) end)`

and:

`XPCALL VM closure -> host xpcall(function() return RUN(callee) end, ...)`

That created a second interpreter entry for the protected VM function.

## New PCALL/XPCALL path

The generated path is now:

`PCALL -> mark FRAMES[FP].protect -> FP++ -> BASE/TOP/CODE/PC switch -> same DRIVE loop`

On return:

`VM RETURN -> _retv -> protected result tuple -> caller frame -> same DRIVE loop`

On error:

`DRIVE error -> outer protected trampoline -> locate protected FRAMES entry -> discard callee frames -> restore caller CODE/PC/BASE/TOP/SC/LK/VA -> produce pcall result -> resume DRIVE`

For VM XPCALL handlers:

`VM error -> protected trampoline -> push VM error-handler frame -> same DRIVE -> handler RETURN -> xhandler result tuple`

Native error handlers remain on the legitimate native boundary.

## PCALL/XPCALL verification

Dedicated cases:

- PCALL success: PASS
- PCALL VM error: PASS
- nested PCALL: PASS
- XPCALL VM error: PASS
- VM XPCALL handler: PASS
- nested XPCALL: PASS
- nil/multiple return values: PASS

Matrix:

**486/486 PASS** across FAST/BALANCED/SECURE and 27 deterministic seeds.

## Existing scheduler regressions

- Differential: **35/35 PASS**
- Fuzz 100: **100/100 PASS**
- Fuzz 500: **500/500 PASS**
- Scheduler profile/seed matrix: **324/324 PASS**
- Tailcall suite: **5/5 PASS**
- Closure/CLOSE: **8/8 PASS** from Phase 6.5 baseline
- STACKALLOC: PASS
- Coroutine behavioral suite: PASS
- Metamethods: PASS
- Compression: PASS
- Hardening: PASS

## Static no-recursive-RUN audit

The new Phase 6.75 audit reports:

- PCALL handler has no RUN: **PASS**
- XPCALL handler has no RUN: **PASS**
- PCALL handler has scheduler frame push: **PASS**
- XPCALL handler has scheduler frame push: **PASS**
- protected scheduler uses the single DRIVE loop: **PASS**
- no dormant VM helper `RUN` invocation: **PASS**

Remaining generator `RUN` sites are limited to:

1. definition of the outer VM entry function
2. creation of a normal VM closure callable from a host/native boundary
3. top-level VM bootstrap

There are no PCALL/XPCALL `RUN(callee)` sites.

## Coroutine status

Behavioral tests remain green:

- create/resume: PASS
- multiple yields: PASS
- nested yield: PASS
- closure capture across yield: PASS

However, coroutine execution still relies on the host Lua coroutine scheduler around the VM closure entry function. Therefore the strict requirement that coroutine execution itself be entirely represented as a persistent VM-owned scheduler state is **not claimed complete**.

## Intensity 10

Controlled `npm test` execution reached the real intensity-10 execution test.

Before the timeout window:

- single-wrap generation: PASS, ~206 KB
- double-wrap generation: PASS, ~1.12 MB
- single-wrap real execution: PASS, ~3.2 s
- double-wrap real execution: still exceeds the 25-second controlled window and was not counted as PASS

The timeout is therefore still an existing stress/performance characteristic of the high-intensity nested wrapper path. It was not masked by increasing the timeout or weakening the test.

## Final classification

**SCHEDULER: PARTIAL**

The VM-owned CALL/RETURN/TAILCALL scheduler remains intact, and PCALL/XPCALL are now scheduler-native. The remaining strict Phase 6.75 limitation is a fully VM-owned coroutine state scheduler rather than host coroutine scheduling around VM execution.
