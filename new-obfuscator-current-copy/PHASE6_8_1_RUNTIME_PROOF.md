# Phase 6.8.1 Runtime Proof — COMPLETE

Date: 2026-09-22

## Classification

**IMPLEMENTED** for the supported Lua 5.1 VM runtime.

The post-Phase-6.8 coroutine implementation was executed against the recovered local Fengari 0.1.5 runtime. The remaining Phase 6.8.0 failures were reproduced, fixed, and regression-tested.

## Runtime dependency

Recovered locally from the existing project archive:

- fengari 0.1.5
- luaparse 0.3.1

No network install was required.

## Root causes fixed

### 1. VM closure identity collision under Fengari

The generated VM wrapper function had no distinguishing upvalue. Fengari 0.1.5 can treat closures with identical prototype/upvalue shape as equal when no distinguishing closure state exists. That caused separate VM closures to collide in the `VMM` map.

Fix: every generated VM closure wrapper now captures a unique per-closure `_vmToken`, making the wrapper identity distinct while retaining the existing `VMM[function] -> {proto,env}` architecture.

This fixed:

- mutable upvalues
- upvalue close
- closure-loop
- separate closure instances

### 2. Coroutine resume argument bug

The host coroutine wrapper used `unpack(...)` directly when constructing `resumeArgs`, treating the first resume argument as the table argument to `unpack`.

Fix:

`stc.resumeArgs={...}`

This fixed basic and multiple-yield runtime failures.

### 3. `coroutine.create(make())` argument expansion

The generic call-argument expander represented a final call argument as a packed multi-return value. `coroutine.create` requires the single function value.

Fix: `coroutine.create` now explicitly evaluates exactly one argument in single-value context.

### 4. STACKALLOC captured-slot assignment

The stackalloc assignment lowering always emitted `LSET`, even when the stackallocated binding had become an upvalue in a nested VM closure.

Fix: assignment now resolves the binding and emits `USET` for captured stackalloc slots.

This proves mutable stackalloc storage survives closure/coroutine suspension.

### 5. VM metamethod call inside protected execution

TAILCALL/PCALL/XPCALL did not resolve VM `__call` metamethods before deciding between VM and host execution.

Fix: callable-table resolution now feeds VM `__call` closures back into the existing scheduler-native path.

### 6. VM `__index` metamethod

Host table indexing would invoke a VM `__index` wrapper directly, bypassing the scheduler.

Fix: `TGET` detects VM `__index` and creates a normal VM scheduler frame for the metamethod.

## Required runtime cases

`phase6_8_1_runtime.mjs`: **14/14 PASS**

- basic create/resume/yield/return
- multiple yields
- A → B → C → YIELD → C → B → A
- closure/upvalue across yield
- two independent coroutines
- coroutine reentrancy
- coroutine error
- yield → resume → error
- PCALL inside coroutine
- XPCALL inside coroutine
- TAILCALL inside coroutine
- STACKALLOC inside coroutine
- upvalue close
- closure loop

## Critical scheduler trace

Nested A → B → C → YIELD:

```text
VM_CALL    1 0 0 5
VM_YIELD   1 1 2 5 table: 0xa6
VM_RESUME  1 1 2 5 table: 0xa6
VM_RETURN  0 1 2 10
```

The same `FP=1`, `BASE=1`, `TOP=2`, `PC=5`, and the same `CODE` table identity were restored after resume. The call chain was not rebuilt from A.

## Multi-coroutine isolation

PASS:

```text
co1: 1,2,3
co2: 10,20,30
```

Alternating resumes produced:

```text
1,10,2,20,3,30
```

No REG/FRAMES/BASE/TOP/FP/PC/CODE state corruption was observed.

## PCALL/XPCALL

Post-change scheduler matrix:

**486/486 PASS**

The matrix includes VM→VM protected calls, nested protected calls, VM handlers, errors, nil/multiple-return cases, and native boundaries.

## Phase 6.8 profile/seed matrix

`phase6_8_1_seed_matrix.mjs`:

**324/324 PASS**

Profiles:

- FAST
- BALANCED
- SECURE

Seeds:

- 0, 1, 2, 3, 42, 123, 999
- 1000–1019

Cases cover nested yield, closure yield, XPCALL, and STACKALLOC/yield.

## Regression

- differential: **35/35 PASS**
- fuzz: **100/100 PASS**
- final matrix: **500/500 fuzz PASS**
- scheduler/profile matrix: **324/324 PASS**
- PCALL/XPCALL: **486/486 PASS**
- tailcall suite: PASS
- CLOSE/closure suite: **8/8 PASS**
- per-function: PASS
- handler/decomposition: PASS
- opaque dispatcher: PASS
- compression: PASS
- metamethod `__index`: PASS
- metamethod `__call`: PASS

`vm-stack.test.mjs` could not run because it references an external Windows path that is not present in this Linux execution environment. This is an environment-specific test-input limitation, not a runtime failure.

## Static no-recursive-RUN audit

`phase6_8_static_audit.mjs`: **13/13 PASS**

`phase6_8_generated_audit.mjs`: PASS

Generated VM closure RUN-like calls: **0**

Legitimate outer boot entry: **1**

Coroutine create/resume/yield contain no VM `RUN` invocation.

## Performance

`bench_profiles.mjs` current run:

| Mode | Size | Time |
|---|---:|---:|
| Native | 73 | 7 ms |
| FAST VM | 43,381 | 298 ms |
| BALANCED VM | 39,887 | 190 ms |
| SECURE VM | 45,063 | 93 ms |
| FAST full loader | 22,328 | 388 ms |
| BALANCED full loader | 195,967 | 4,273 ms |
| SECURE full loader | 234,082 | 11,657 ms |

Compression benchmark:

- compressed execution PASS
- corruption rejection PASS
- compression overhead in focused benchmark: approximately 3–4 ms

## Intensity-10 limitation

The full `obfuscator.test.mjs` reaches real execution of the intensity-10 double-wrapped artifact but did not finish within a 45-second controlled runtime window.

It is therefore **not claimed PASS**. Generation and round-trip decoding of the intensity-10 artifact do pass.

## Final Phase 6.8 assessment

The VM-owned coroutine state requirement is now runtime-proven for the supported Lua 5.1 implementation. The host Lua coroutine remains only the outer suspension boundary; VM execution state is persisted in `MAKESTATE` and resumed through the same `DRIVE_STATE` scheduler.
