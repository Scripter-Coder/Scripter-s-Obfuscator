# Phase 6.5 — VM Scheduler Verification and Correctness Closure

Verified: 2026-09-22

## Classification

**Scheduler: PARTIAL for the strict Phase 6.5 definition.**

Direct VM→VM `CALL`, `RETURN`, and `TAILCALL` use the single VM-owned scheduler and do not recursively invoke `RUN`. The verification phase also found and fixed two real scheduler correctness gaps:

1. VM varargs were installed as an unmarked table, so `VARGP` could not expand them through a subsequent VM/native call.
2. VM multi-return values crossing a scheduler frame boundary were copied as individual values even when the caller had requested the packed `CALLM` form.

After those fixes, the full 35-case differential suite passes and dedicated tailcall/frame tests pass.

The strict Phase 6.5 requirement is **not yet fully satisfied** because VM-aware `PCALL`/`XPCALL` still use host protected-call wrappers around a `RUN(...)` invocation. Coroutine scheduling also remains host-coroutine based. These are explicitly retained as limitations rather than hidden or reclassified as scheduler-native.

## Files changed

- `vm-bytecode.js`
  - `VARGP` now normalizes the current `VA` object to the per-build packed-vararg marker before pushing it.
  - scheduler `_retv` now respects `FRAMES[FP].nRet`: `CALLM` receives a marker-tagged packed result, while ordinary `CALL` receives one result.
  - scheduler trace now emits `VM_TAILCALL` when a VM tailcall reuses the current frame.
- `phase6_5_tailcall.mjs`
  - dedicated tailcall, multi-return, closure, deep-tail, and frame-reuse trace tests.
- `phase6_5_matrix.mjs`
  - 324-case profile/seed/nested-feature matrix.
- `phase6_5_static_audit.mjs`
  - static audit of direct CALL/TAILCALL paths and all generated RUN call sites.
- `PHASE6_5_VERIFICATION_REPORT.md`
  - this report.

## Baseline verification

The previous Phase 6 report was read before testing. The repository ZIP does not contain a `.git` directory, so `git status` cannot be executed against the supplied archive itself.

The current package uses the existing Phase 6 test suite and source as the verification baseline.

## Direct scheduler path

### VM CALL

Verified generated `CALL/CALLM` handler contains no `RUN(...)` invocation.

Path:

`CALL → save FRAMES[FP] → FP++ → BASE/TOP switch → CODE/PC switch → same while-loop`

### VM RETURN

Verified scheduler return restores the caller frame without entering a new interpreter.

Path:

`RETURN → collect values → restore FRAMES[FP-1] → FP-- → restore CODE/PC/BASE/SC/LK/VA → copy result → same loop`

### VM TAILCALL

Verified dedicated tailcall path reuses the current frame.

No new `FRAMES[]` entry is created for a VM tailcall.

## Tailcall tests

Dedicated tests:

- simple tail recursion: PASS
- tailcall with arguments: PASS (`5050`)
- tailcall with multiple returns: PASS (`24`)
- tailcall through closure: PASS (`7`)
- deep tail recursion: PASS (`5000`)

### Tailcall trace

Observed runtime trace:

```text
VM_CALL      1  0  1  13
VM_TAILCALL  1  2  2   1
VM_TAILCALL  1  2  2   1
VM_TAILCALL  1  2  2   1
VM_TAILCALL  1  2  2   1
VM_TAILCALL  1  2  2   1
VM_RETURN    0  2  3  13
```

The important property is that `FP` remains `1` for every tailcall. There is no unbounded frame growth.

## CLOSE / upvalue lifetime

The existing close/closure suite was rerun:

- escaping closure: PASS
- shared upvalue: PASS
- nested closure: PASS
- recursive closure: PASS
- mutually recursive closure: PASS
- parent return then mutate: PASS
- closure after creator frame returns: PASS
- loop closure: PASS

Result: **8/8 PASS**.

This verifies that captured storage survives creator-frame destruction in the tested closure model.

## A → B → C → B → A

The Phase 6 scheduler test remains PASS for the nested call chain.

The scheduler transition model remains:

```text
A entry       FP=0
A CALL B      FP=1
B CALL C      FP=2
C RETURN      FP=1
B RETURN      FP=0
A RETURN      host
```

## Recursion / mutual recursion

- `fact(10)`: PASS, `3628800`
- deeper `fact(20)`: structural execution PASS; exact decimal representation is limited by the Lua 5.1 numeric runtime used by the harness.
- mutual recursion: PASS

## Varargs regression found and fixed

The full 35-case differential suite initially failed case 13 (`varargs`).

Root cause:

`CALL` frame setup created `VA` as a plain `{1..n,n=n}` table. `VARGP` expected the per-build packed marker used by the CALL flattening logic, so `select(...)` received the table itself instead of the expanded varargs.

Fix:

`VARGP` now lazily adds the marker to an existing `VA` table before pushing it.

After the fix:

**35/35 differential PASS.**

## Multi-return regression found and fixed

A dedicated tailcall test exposed a second scheduler issue:

A VM function returning multiple values through a `CALLM` frame was restoring all values individually, while the caller expected one marker-tagged packed result.

Fix:

`_retv` now checks the suspended frame's `nRet` metadata:

- `nRet == 0`: create a marker-tagged packed result containing all return values.
- ordinary call: restore the first return value as the single result.

This fixed VM tailcall → multi-return → caller assignment semantics.

## Static no-recursive-RUN audit

The new static audit reports:

```text
STATIC VM->VM CALL: PASS (no RUN)
STATIC VM TAILCALL: PASS (no RUN)
```

Remaining generated `RUN(...)` call sites are:

1. the old handler-decomposition helper (not used by the direct CALL path)
2. VM-aware PCALL
3. VM-aware XPCALL
4. VM closure creation used when a closure is entered from a host boundary
5. top-level scheduler bootstrap

The PCALL/XPCALL sites are the important remaining strict-gap: they still wrap `RUN(...)` in Lua's host `pcall`/`xpcall` primitives.

Therefore the strict statement “no VM→VM recursive RUN path remains” cannot honestly be marked complete.

## PCALL / XPCALL

Runtime regression tests:

- pcall success: PASS
- pcall error: PASS
- nested pcall: PASS
- xpcall: PASS
- VM→native pcall: PASS
- static forbidden `f(unpack(...))` check: PASS

However, the implementation still contains host protected-call wrappers around VM `RUN(...)` for VM-aware pcall/xpcall. This is a known architectural limitation and prevents a strict `IMPLEMENTED` classification for the entire Phase 6.5 scheduler requirement.

## Coroutine / YIELD

Existing tests:

- coroutine create/resume: PASS
- multiple yields: PASS
- nested yield: PASS
- closure yield: PASS

The current implementation continues to use host coroutine scheduling around the VM scheduler. This is behaviorally verified but is not a fully independent virtual coroutine scheduler.

## Metamethods

Verified:

- VM `__call`: PASS
- native `__call`: PASS
- VM `__index`: PASS
- VM `__newindex`: PASS
- VM `__add`: PASS

## STACKALLOC

Verified:

- STACKALLOC off/on semantic equivalence: PASS
- closure capture: PASS
- nested capture across VM frame switches: PASS
- lowered structure differs: PASS

## Dispatcher / handlers / compression

Existing integration tests remain PASS:

- handler decomposition: PASS
- opaque dispatcher: PASS
- 20-seed dispatcher diversity: PASS
- compression pipeline: PASS
- compressed execution: PASS
- corrupted compressed payload rejection: PASS
- no plaintext leakage: PASS
- direct VM→VM no `f(unpack(...))`: PASS

## Full differential / fuzz regression

- differential 35/35: **PASS**
- fuzz 100/100: **PASS**
- final matrix, including fuzz 500: **500/500 PASS**

The standalone archive does not contain a separate `tools/fuzz_500.mjs`; the authoritative final matrix runs the 500-case fuzz gate successfully.

## Profile / seed matrix

Profiles:

- FAST
- BALANCED
- SECURE

Seeds:

```text
0, 1, 2, 3, 42, 123, 999,
1000–1019
```

Nested scheduler cases covering call/closure/STACKALLOC/pcall/coroutine/metamethod interactions were run for all profile/seed combinations.

Result:

**324/324 PASS**.

No seed-specific disable or special case was introduced.

## Hardening

Hardening suite:

- H1 cipher diversity: PASS
- H2 loader header: PASS
- H3 decoys: PASS
- H4 seed carrier: PASS
- H5 split/carrier execution: PASS

Result: **5/5 PASS**.

## Intensity-10 investigation

`npm test` was rerun with the existing test command.

The command passes tests 1–7 of `obfuscator.test.mjs` and reaches:

`[8] REAL EXECUTION of double-wrapped script (intensity 10)...`

It does not complete within the 185-second verification window.

This is therefore **not counted as a pass**.

A separate benchmark showed:

| Mode | Artifact | Execution |
|---|---:|---:|
| native | source | 16 ms |
| FAST VM | 33,194 chars | 252 ms avg |
| BALANCED VM | 33,194 chars | 72.3 ms avg |
| SECURE VM | 35,763 chars | 55.7 ms avg |
| custom intensity 5 | 151,408 chars | 3,545 ms |
| custom intensity 10 | not completed in verification window | timeout |

The benchmark is not a statistically rigorous performance study; it is a regression-oriented measurement on one representative script.

The available evidence does **not** establish that the scheduler itself is the sole cause of the intensity-10 timeout. The timeout occurs in the broader nested obfuscation/loader pipeline and requires separate profiling before assigning causality.

## Final status

### Scheduler: PARTIAL

### Proven implemented

- VM-owned direct CALL frame push/switch
- VM-owned RETURN frame restore
- VM-owned TAILCALL frame reuse
- authoritative scheduler `REG[]`
- `BASE/TOP/FP/FRAMES[]` transitions
- A→B→C→B→A
- recursion
- mutual recursion
- closure lifetime across frame transitions
- STACKALLOC frame interaction
- direct CALL/TAILCALL no recursive `RUN`
- VM multi-return across scheduler frames
- VM varargs across scheduler frames

### Remaining limitations

1. VM-aware PCALL/XPCALL still use host protected-call wrappers around `RUN(...)`.
2. Coroutine scheduling still uses host coroutine machinery.
3. The closure's generated host-callable wrapper contains a `RUN(...)` entry for host-originated invocation; direct VM CALL detects the VM registry and does not use that wrapper.
4. The standalone repository archive does not include a separate `fuzz_500.mjs`; the final matrix provides the 500-case result.
5. Full intensity-10 double-wrap execution remains too slow for the current verification window.
6. Lua 5.1 remains the authoritative target.

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
node tools/differential_35.mjs
node tools/phase4_differential35.mjs
node tools/fuzz_100.mjs
node tools/final_matrix_test.mjs
node phase6_5_tailcall.mjs
node phase6_5_static_audit.mjs
node phase6_5_matrix.mjs
node hardening.test.mjs
npm test
```
