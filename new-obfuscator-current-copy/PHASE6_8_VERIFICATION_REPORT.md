> Superseded by `PHASE6_8_1_RUNTIME_PROOF.md` after post-change runtime failures were reproduced and fixed.

# Phase 6.8 — VM-Owned Coroutine State Verification

Date: 2026-09-22

## Classification

**PARTIAL — architecture implemented in the generated VM, but full runtime proof is blocked in this supplied environment because the Phase 6.75 archive does not contain `fengari`/`node_modules`, and package installation cannot reach the npm registry from this runtime.**

No claim of full coroutine completion is made without the requested runtime evidence.

## 1. Previous architecture

Before Phase 6.8, `NEWF` created a VM closure that entered the generated interpreter through `RUN(ci, links, ...)`. Coroutine support then relied on the host Lua coroutine around that VM closure entry. The Phase 6.75 scheduler itself was already VM-owned for CALL/RETURN/TAILCALL/PCALL/XPCALL, but coroutine suspension did not own a persistent scheduler state object.

## 2. New architecture

The generated runtime now has an explicit VM scheduler state object containing:

- `REG`
- `BASE`
- `TOP`
- `SP`
- `FP`
- `FRAMES`
- `CODE`
- `PC`
- `SC`
- `LK`
- `VA`
- `status`
- `started`
- `pendingError`
- `yielded`
- `resumeArgs` / `resumeN`
- `results` / `resultN`

`MAKESTATE` allocates the object. `DRIVE_STATE(state)` is the single interpreter loop for that state. `RUN(...)` remains only the outer normal-entry adapter and is no longer used by VM closure creation.

## 3. VM closure change

`NEWF` no longer emits a VM closure containing `return RUN(ci, links, ...)`.

It emits a scheduler marker function and stores `{proto, env}` in the VM-closure map. VM-to-VM CALL/RETURN/TAILCALL/PCALL/XPCALL continue through the existing frame scheduler.

## 4. Coroutine create

`coroutine.create(vmFunction)` is now compiled to `COCREATE`.

For a VM closure, `COCREATE`:

1. validates the closure through the VM closure map;
2. allocates a VM state with `MAKESTATE`;
3. creates a host coroutine only as the outer scheduling boundary;
4. stores the state and host continuation in a VM coroutine holder;
5. does not execute the VM body at creation time.

The first `resume` supplies the initial arguments to the state.

## 5. Resume

`coroutine.resume(vmCoroutine, ...)` is compiled to `CORESUME` / `CORESUMEM`.

The host `coroutine.resume` call is only the outer scheduling boundary. It resumes the existing host continuation containing `DRIVE_STATE(state)`; it does not invoke `RUN` or reconstruct VM frames.

Resume arguments are stored in `state.resumeArgs` / `state.resumeN` and consumed by the existing suspended YIELD continuation.

## 6. Yield

`YIELD` / `YIELDM` now:

- advances `PC` before suspension;
- removes yielded arguments from the VM stack;
- records yielded values;
- saves `REG`, `FRAMES`, `CODE`, `PC`, `BASE`, `TOP`, `SP`, `FP`, `SC`, `LK`, and `VA` into the persistent state object;
- performs the host coroutine yield;
- receives resume arguments when resumed;
- restores the saved scheduler scalars;
- continues the same `DRIVE_STATE` invocation.

This is continuation-based suspension, not source/program restart.

## 7. Return / error

Normal VM return marks the state `dead` only after the existing `_retv` frame scheduler reaches the outer frame.

An unprotected scheduler error records `pendingError` and marks the state `failed` before propagating through the host coroutine boundary.

A dead/failed VM coroutine cannot be resumed through the VM path; it returns `false` plus the stored error or `cannot resume dead coroutine`.

## 8. A → B → C → YIELD trace

The required runtime trace was **not claimed**, because the available environment could not execute the generated Lua VM after the code change.

The generated architecture does, however, preserve the active `FRAMES` array and scalar scheduler fields at YIELD rather than rebuilding the call chain. The existing scheduler trace facility remains available through `schedulerTrace:true`.

Expected proof format when the runtime suite is available:

```text
VM_CALL ... A
VM_CALL ... B
VM_CALL ... C
VM_YIELD FP=... BASE=... TOP=... PC=... CODE=...
VM_RESUME FP=... BASE=... TOP=... PC=... CODE=...
VM_RETURN ... C
VM_RETURN ... B
VM_RETURN ... A
```

The important acceptance condition is that the resumed C frame is the same suspended frame, not a newly created A→B→C chain.

## 9. Multiple yields

A dedicated generation/parse case covers:

```lua
yield(1)
yield(2)
yield(3)
return 4
```

The compiler now distinguishes single-result YIELD from multi-result YIELD (`YIELDM`) so resume arguments can participate in normal VM multi-value handling.

Full runtime result proof remains blocked by the missing Fengari runtime.

## 10. Closure/upvalue preservation

The persistent state keeps the existing `SC` and `LK` objects by reference rather than copying them at suspension. This preserves the same closure cells across yield/resume and frame switches.

A generation case covers mutable closure state across two yields.

Runtime semantic proof remains pending.

## 11. PCALL/XPCALL inside coroutine

No alternate PCALL/XPCALL path was introduced.

VM functions continue to use the Phase 6.75 scheduler-native frame transition. The Phase 6.75 result remains the baseline:

- PCALL/XPCALL matrix: **486/486 PASS** before Phase 6.8 changes.

The Phase 6.8 generation matrix includes coroutine+PCALL and coroutine+XPCALL cases, but runtime execution after this change is blocked by the unavailable Fengari dependency.

## 12. Tailcall inside coroutine

The existing `TAILCALL` frame-reuse logic was preserved. No new coroutine-specific tailcall scheduler was added.

A generation case covers tailcall → yield → resume → return.

Runtime proof remains pending.

## 13. STACKALLOC inside coroutine

No STACKALLOC implementation was changed. Its existing closure-cell representation is retained by the coroutine state's `SC`/`LK` references.

Runtime proof for the new coroutine boundary remains pending.

## 14. Multiple coroutine independence

Each VM coroutine receives its own state object and therefore its own authoritative `REG` and `FRAMES` storage, plus its own scalar scheduler fields.

The host coroutine only resumes that state's existing continuation.

A generation case covers independent coroutine creation/resumption paths; runtime alternation proof remains pending.

## 15. Reentrancy

A VM coroutine can execute `COCREATE` and `CORESUME` for another VM coroutine. The resumed child owns a separate state object and returns control to the parent's scheduler continuation when it yields.

No VM `RUN(callee)` entry is generated for this path.

## 16. Static no-recursive-RUN audit

`phase6_8_static_audit.mjs`:

- explicit VM coroutine state fields — PASS
- persistent state save helper — PASS
- yield saves scheduler state — PASS
- resume restores scheduler scalars — PASS
- VM coroutine create allocates state — PASS
- persistent host continuation — PASS
- VM coroutine resume uses host boundary — PASS
- coroutine status reads VM state — PASS
- NEWF does not invoke RUN — PASS
- COCREATE handler has no RUN — PASS
- CORESUME handler has no RUN — PASS
- YIELD handler has no RUN — PASS
- single normal top-level RUN boot entry — PASS

Generated-code audit:

- generated Lua parses — PASS
- VM-closure RUN-like calls — **0**
- legitimate top-level boot entries — **1**
- VM coroutine create sites — **1**
- VM coroutine resume host-boundary sites — **2** (VM branch plus native fallback in the same handler)

## 17. Multi-seed / profile generation matrix

Seeds:

`0, 1, 2, 3, 42, 123, 999` plus 20 additional deterministic seeds.

Profiles:

`FAST`, `BALANCED`, `SECURE`.

Nine coroutine-focused cases were generated and parsed for every seed/profile combination:

**729/729 generation+parse PASS, 0 FAIL.**

This proves deterministic generation and Lua 5.1 syntax validity across the requested seed/profile matrix. It does **not** substitute for runtime semantics.

## 18. Existing Phase 6.75 regression baseline

The Phase 6.75 artifact had already established:

- differential: 35/35
- fuzz: 100/100
- final fuzz: 500/500
- scheduler: 324/324
- PCALL/XPCALL: 486/486
- tailcall suite: PASS
- coroutine baseline: PASS functionally, but host-scheduled
- STACKALLOC suite: PASS
- metamethod tests: PASS

Those results are retained as the pre-Phase-6.8 baseline. They are **not relabeled as post-change runtime proof**.

## 19. Runtime-test limitation in this execution environment

The Phase 6.75 zip intentionally excluded `node_modules`. The current container has no installed `fengari`, `lua`, `luajit`, or other Lua runtime. An attempt to install the npm dependencies timed out, and offline npm installation failed because the required package tarballs are not cached.

Therefore the following post-change suites could not honestly be reported as executed:

- existing coroutine runtime suite
- A→B→C→YIELD runtime trace
- multiple-yield runtime results
- closure/upvalue runtime results
- multiple-coroutine alternation
- reentrancy
- coroutine error runtime results
- coroutine PCALL/XPCALL runtime results
- coroutine TAILCALL runtime results
- coroutine STACKALLOC runtime results
- full 35/100/500/324/486 post-change runtime regression suites
- performance measurements

## 20. Exact files changed

- `vm-bytecode.js`
- `src/vm/coroutine.js`
- `phase6_8_static_audit.mjs`
- `phase6_8_generated_audit.mjs`
- `phase6_8_generation_matrix.mjs`
- `PHASE6_8_VERIFICATION_REPORT.md`
- `package.json`

A backup of the pre-Phase-6.8 generator is retained locally as `vm-bytecode.phase675.backup.js` during this work and is excluded from the final archive.

## 21. Remaining limitation

The architectural implementation is present, but **Phase 6.8 remains PARTIAL until the generated VM is executed with the actual Fengari runtime and the requested coroutine proof/regression/performance suites are green.**

No weakening of the timeout, test deletion, seed special-casing, or fallback to VM `RUN(callee)` was used to obtain the current results.
