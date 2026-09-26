# Phase 5 Integration Report — verified 2026-09-22

## Scope

This report reflects the repository state actually executed in this workspace. Older reports were treated as historical context only.

## Changes made

- `vm-bytecode.js`
  - fixed option propagation: `applyBytecodeVm()` now passes `opts` into `compile()`, so profile/seed and feature toggles actually affect compilation
  - deterministic seeded VM generation for explicit seeds
  - guaranteed distinct first opcode anchor for different nearby seeds; 20-build opcode-map diversity now 20/20
  - added typed constant-pool metadata to compiler output
  - fixed captured `VM_STACKALLOC` slots: nested closures now use `ULOAD/USET` against captured slot cells instead of the inner function's local `BASE/SC`
  - handler decomposition is now on the production CALL path; decomposed handlers use generated prepare/resolve/invoke helpers
  - dispatcher strategy is now active in the production dispatch loop; non-table strategies select between live handler tables using build state
  - integrated VM image compression into the actual image pipeline: serialize -> compress -> encrypt -> embed; runtime decrypt -> decompress -> length/checksum validate -> decode
  - added dedicated `PCALL`, `PCALLM`, `XPCALL`, `XPCALLM` opcodes with VM-closure registry/re-entry through `RUN`
  - added `YIELD` opcode; VM closures remain real Lua functions so host coroutine scheduling can suspend/resume the VM execution call stack
  - VM-to-VM CALL now detects registered VM closures and re-enters `RUN` directly rather than invoking the closure with the generic `f(unpack(...))` path
  - preserved explicit bounded unpacking so nil arguments are not lost
- `src/compression/compress.js`
  - replaced ambiguous RLE format with an escaped, reversible format that safely handles literal `0xFF`
- `src/transform/mba.js`
  - explicit `mba:true` now guarantees a deterministic rewrite when a safe candidate exists
  - Lua 5.1 target skips the `a^2 -> a*a` rewrite because the differential runtime exposed a numeric-string semantic difference
- `test_pcall_phase.mjs`
  - fixed stale missing `_vmBcCompile` import
  - structural comparison now compares complete chunk code, not only serialized length
- `test_handler_opaque_compress.mjs`
  - structural checks now inspect compiler metadata instead of looking for obsolete helper names
  - compression assertion checks that the real pipeline is active rather than requiring compression to win on every small/random image

## Verified results

### Core correctness

- `tools/differential_35.mjs`: **35/35 PASS**
- `tools/fuzz_100.mjs`: **100/100 PASS**
- `tools/final_matrix_test.mjs`: **FAST/BALANCED/SECURE PASS + 500/500 fuzz PASS**
- `test_close.mjs`: **8/8 PASS**
- `test_stackalloc_phase.mjs`: **basic + closure + nested capture PASS**
- `tools/constant_virt_test.mjs`: **PASS**
- `hardening.test.mjs`: **5/5 PASS**

### Phase-specific

- INLINE: PASS
- UNROLL: PASS
- MBA: PASS, including deterministic same-seed output
- STACKALLOC: nested captured-slot regression fixed and PASS
- handler decomposition: production-path structural difference PASS
- opaque/state dispatcher: production-path diversity PASS
- compression: runtime execution + corruption rejection PASS
- PCALL/XPCALL: behavioral and structural tests PASS
- coroutine/YIELD: single/multiple/nested/closure-yield tests PASS
- metamethod tests: `__call`, `__index`, `__newindex`, `__add` PASS
- seed determinism: same seed identical, different seeds different
- 20-build diversity: **20/20 unique opcode maps**, unique VM output

## Important findings

### VM frames

The current repository does **not** contain a fully integrated VM-owned `FRAMES[]` call stack equivalent to the frame architecture described by the historical reports. VM-to-VM calls now re-enter the generated `RUN` interpreter directly through the VM registry, which removes the generic host-call fallback for VM closures, but the execution call stack is still represented by nested Lua `RUN` invocations rather than one VM-wide frame scheduler.

Therefore full VM-frame CALL/RETURN/TAILCALL virtualization remains **PARTIAL**.

### PCALL/XPCALL

Dedicated opcodes are now active and VM closures are dispatched through `RUN` inside the protected call. The exception boundary itself still uses Lua's native `pcall`/`xpcall` primitives. Full protected VM-frame unwinding remains **PARTIAL**.

### Coroutine

`YIELD` is now a dedicated VM opcode and the VM closure remains a Lua function so `coroutine.create` can suspend the interpreter call stack. Scheduling is provided by the host coroutine implementation. A separately virtualized coroutine scheduler/state object is not implemented.

### Metamethods

The current implementation relies on Lua's native metamethod machinery for table operations. Behavioral coverage passes for the tested metamethod cases, but there is not yet a dedicated VM-native metamethod dispatch subsystem for every Lua metamethod category.

### Compression

Compression is a size optimization only. It is not treated as a security feature. For small/random VM images it can legitimately make the final artifact larger because the RLE representation has overhead.

## Historical blocker note

The historical reports state that several Phase 5 implementations were reverted after SECURE seed 123 instability. The current repository no longer contained those implementations on the active path, so the exact historical failure mechanism could not be reproduced from the active source. The current integration therefore avoids seed-specific exceptions and keeps a deterministic SECURE seed-123 regression path in the test matrix.

## Full npm test

`npm test` was started. Tests 1–7 of `obfuscator.test.mjs` passed, including real execution. The suite reached the existing intensity-10 double-wrap execution test and exceeded the 180-second command timeout. The timeout is performance-related; it was not treated as a correctness pass.

The standalone `vm-stack.test.mjs` could not run because it contains a hard-coded Windows path to a Clone Kingdom Tycoon source file that is not present in this repository/workspace.

`anticrack.test.mjs` was also started separately; its first tests passed but the standalone run exceeded the available command timeout before completion.

## Remaining classifications

### IMPLEMENTED / verified for this phase

- lua51 compilation/execution
- deterministic seeded builds
- opcode-map diversity
- handler decomposition on production CALL path
- stateful dispatcher selection on production path
- captured stackalloc slot handling
- constant-pool metadata
- VM image compression/decompression validation
- dedicated PCALL/XPCALL opcodes with VM re-entry
- dedicated YIELD opcode
- nil-safe bounded argument passing
- VM-to-VM direct `RUN` re-entry
- existing INLINE/UNROLL/MBA behavior under regression tests

### PARTIAL

- full VM-wide `REG/BASE/TOP/FRAMES` scheduler
- VM-native protected-frame unwinding
- VM-native coroutine scheduler/state object
- complete VM-native metamethod dispatch
- full per-function VM profile execution semantics
- complete IR -> CFG -> lowering production pipeline
- handler decomposition beyond the currently integrated CALL path
- all VM variant structures described by the documentation

### NOT IMPLEMENTED / still honest

- Lua 5.2/5.3/5.4 native differential backends
- LuaJIT backend
- Luau backend
- full Lua 5.4 syntax/semantics
- full `<close>`, `<const>`, `goto` and newer-version semantics

## Exact verification commands

```text
node tools/differential_35.mjs
node tools/fuzz_100.mjs
node test_close.mjs
node test_stackalloc_phase.mjs
node test_pcall_phase.mjs
node test_coroutine_phase.mjs
node test_metamethod_phase.mjs
node test_handler_opaque_compress.mjs
node tools/final_matrix_test.mjs
node tools/constant_virt_test.mjs
node test_inline_phase.mjs
node test_unroll_phase.mjs
node test_mba_phase.mjs
node tools/seed_test.mjs
node tools/diversity_test.mjs
node tools/build_20_diversity.mjs
node hardening.test.mjs
npm test
```
