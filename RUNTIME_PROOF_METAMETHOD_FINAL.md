# RUNTIME PROOF METAMETHOD FINAL — 2026-09-22

## 1. Scope

This report supersedes the earlier `RUNTIME_PROOF_METAMETHOD_REPORT.md` blocker note. The supplied Fengari archive was made executable in the repository and the requested runtime proof was re-run against the current code.

The pass also fixed two correctness issues exposed by runtime testing:

1. VM state polling initially rejected the legitimate sparse `REG[]` stack layout by comparing `SP` with `#REG`; the check was changed to validate the live `BASE/TOP/SP` window instead.
2. MBA subtraction rewrites and IR ADD splitting/fusion could change Lua metamethod dispatch. Metamethod-sensitive arithmetic is now protected from those rewrites unless the operands are statically provably numeric.
3. The AST inliner could incorrectly inline a multi-return function into an expandable final call argument. Multi-return functions are no longer AST-inlined, and calls with potentially expandable final arguments are left on the normal VM CALLM path.

No VM architecture redesign or native fallback was added for these fixes.

## 2. Fengari verification

Repository:

- Node: `v22.16.0`
- npm: `10.9.2`
- Fengari: `0.1.5`
- luaparse: `0.3.1`

Fengari was supplied as `fengari-master.zip`. Its `package.json` identifies version `0.1.5`. The source was extracted into `node_modules/fengari`. The repository's dependency directories for Fengari's declared Node dependencies were empty, so local runtime compatibility files were restored for `sprintf-js`, `tmp`, and `readline-sync`; no network package installation was required.

Exact smoke proof:

```text
FENGARI_SMOKE 0.1.5 true 5
```

The smoke test executed Lua `return 2+3` through Fengari and obtained `5`.

## 3. Exact source verification

Executed:

```text
node --check vm-bytecode.js
node --check src/transform/mba.js
node --check src/transform/inline.js
```

All passed.

Existing production files inspected:

- `vm-bytecode.js`
- `src/ir/pipeline.js`
- `src/ir/fusion.js`
- `src/ir/splitting.js`
- `src/transform/mba.js`
- `src/transform/inline.js`
- `test_metamethod_phase.mjs`
- scheduler / PCALL / coroutine / STACKALLOC tests

## 4. Existing metamethod test

Command:

```text
node test_metamethod_phase.mjs
```

Result:

```text
PASS __call VM expect=6 got=6
PASS __call native expect=6 got=6
PASS __index VM expect=foo! got=foo!
PASS __newindex VM expect=6 got=6
PASS __add expect=3 got=3
```

## 5. Complete VM-closure metamethod matrix

Runtime cases covered:

- `__add`
- `__sub`
- `__mul`
- `__div`
- `__mod`
- `__pow`
- `__concat`
- `__eq`
- `__lt`
- `__le`
- `__gt` semantics via Lua's reversed `__lt`
- `__ge` semantics via Lua's reversed `__le`
- `__unm`
- `__len`
- `__index`
- `__newindex`
- `__call`

Per-operation VM-closure and native-function controls were executed.

Result:

```text
17/17 VM metamethod cases PASS
17/17 native-function control cases PASS
```

The native controls used actual Lua built-ins such as `rawlen`, `table.concat`, `rawequal`, `rawget`, `rawset`, and `type` where their signatures provide a valid metamethod control.

## 6. Native-vs-virtual differential

Each VM-closure metamethod program was executed twice:

1. original Lua reference program in Fengari
2. generated custom-VM program in Fengari

The comparison included the returned string representation and error/success status.

Result:

```text
METAMETHOD DIFFERENTIAL 17/17 pass, 0 fail
```

A first draft of the `__index` reference case accidentally read an existing key, so the metamethod was not invoked by native Lua. That test was corrected to access a missing key before the final differential run. The final differential is 17/17.

## 7. Scheduler-native path

The production generated dispatcher was verified to contain direct `VMM[metamethodFunction]` lookup and `FRAMES[]` transitions for VM closures.

For intercepted VM metamethods, the generated path is:

```text
metamethod opcode
→ metatable lookup
→ VMM lookup
→ save caller PC/TOP
→ FP increment
→ BASE/CODE/PC/SC/LK/VA switch
→ FRAMES[FP] creation
→ dispatcher continues
→ _retv() restores caller
```

The existing generated audit also reports:

```text
VM closure RUN-like calls: 0
legitimate top-level boot entries: 1
```

Forbidden-pattern audit:

```text
FORBIDDEN_f_unpack NONE
```

The VM-closure metamethod path does not use the generic `f(unpack(...))` host-call route.

Existing scheduler audits also remain green for CALL/PCALL/XPCALL/coroutine paths.

## 8. Nested integration cases

Executed combined runtime cases:

```text
PASS add→nested VM call→RETURN 9
PASS metamethod→PCALL→VM error→XPCALL false,false,H:[str
PASS newindex→coroutine→yield/resume 10
PASS metamethod→STACKALLOC→nested VM call 18
PASS metamethod→multiple return→caller CALLM 5,6
PASS __call metamethod tailcall 12
```

These exercise nested VM calls, protected calls, error handling, coroutine yield/resume, stack allocation, multiple-result CALLM behavior, and tailcall behavior from a metamethod closure.

## 9. Multi-seed / profile matrix

The full metamethod suite was run independently per operation under:

Profiles:

- FAST
- BALANCED
- SECURE

Seeds:

- 0
- 1
- 2
- 3
- 42
- 123
- 999
- 20 additional deterministic seeds: 1000 through 1703 in increments of 37

Per profile:

```text
459/459 pass, 0 fail
```

Overall:

```text
1377/1377 metamethod profile/seed executions PASS
```

No seed or profile was special-cased and no native fallback was enabled for a failing case.

## 10. VM state polling

The generated dispatcher now checks the live VM state before each instruction dispatch after initial frame setup.

Checks cover:

- FP bounds
- BASE/TOP relationship
- SP lower bound
- SP relative to the live TOP window
- current frame existence
- current frame BASE consistency

The previous `SP > #REG + 1` test was incorrect for sparse Lua tables because Lua's `#table` is not a capacity query. A valid `SP=2` with a sparse register table triggered a false failure. The check was corrected to validate `SP` against the live VM window instead.

Valid-state proof:

```text
PASS valid valid execution
```

Controlled corruption proof:

```text
PASS invalid_FP VM state failure: FP
PASS invalid_frame VM state failure: FP
PASS invalid_BASE VM state failure: stack window
PASS invalid_TOP VM state failure: stack window
PASS invalid_SP VM state failure: stack window
PASS invalid_frame_BASE VM state failure: frame boundary
```

The corruption was performed by mutating generated VM state locals; no native memory corruption was used.

Classification for state polling: **IMPLEMENTED** under the requested polling gate.

## 11. Metamethod/transform correctness fixes exposed by the matrix

### MBA metamethod safety

The existing MBA family `a-b -> a+(-b)` was semantically unsafe for arbitrary Lua values because it changes `__sub` dispatch into `__unm`/`__add` dispatch. Similar issues apply to commutation and identity rewrites around metamethod-bearing values.

The MBA pass now only permits those algebraic rewrites when the operands are statically provably numeric.

### ADD fusion/splitting safety

SECURE seeded splitting can replace ADD with `SPLIT_ADD_PREP/SPLIT_ADD_EXEC`. That path cannot itself perform VM metamethod detection. The IR now carries metamethod-sensitivity metadata and fusion/splitting skip operations that may require metamethod dispatch.

The existing fusion/splitting proof was updated to use a provably numeric expression for its structural transform test.

### Inline multi-return safety

The AST inliner was allowing a multi-return function to be substituted into a context where a final call argument could expand multiple returns into several parameters. This produced nil arithmetic in the big-script B4 case.

The inliner now rejects multi-result function definitions and avoids inlining calls with potentially expandable final arguments when fewer arguments than parameters are supplied.

After the fix:

```text
ALL BIG-SCRIPT VM TESTS PASSED
ALL INLINE PASS
```

## 12. Regression results actually rerun after the fixes

### Core VM / scheduler

```text
differential 35/35 PASS
fuzz 100/100 PASS
fuzz 500/500 PASS
scheduler 324/324 PASS
PCALL/XPCALL 486/486 PASS
coroutine 14/14 PASS
transform composition 34/34 PASS
CLOSE/closures 8/8 PASS
STACKALLOC PASS
makeCounter PASS
```

### Compiler / transforms / hardening

```text
IR pipeline proof PASS
fusion/splitting proof PASS
handler/decomposition + opaque dispatcher + compression PASS
INLINE PASS
UNROLL PASS
MBA PASS
constant virtualization PASS
diversity PASS
anti-tamper integrity PASS
static coroutine audit PASS
generated coroutine audit PASS
per-function PASS
```

### Final matrix

`tools/final_matrix_test.mjs`:

```text
FAST PASS
BALANCED PASS
SECURE PASS
per-func mixed PASS
coroutine create/resume 10
metamethod __index foo!
metamethod __call 6
fuzz 500 500 pass 0 fail
```

### Big-script regression

```text
B1 huge function PASS
B2 250 functions PASS
B3 plain {n=...} argument PASS
B4 multi-result expansion PASS
B5 closures/upvalues PASS
B6 deep loop/branch/string stress PASS
ALL BIG-SCRIPT VM TESTS PASSED
```

### Core application tests

Worker, anticrack, split-key, auth, chunked storage, GitHub-storage, user-token, and hardening suites were exercised during the post-change run. Worker and hardening output reached their PASS completions.

`worker-resilience.test.mjs` still fails on its expected-200 assertion because the local run receives HTTP `429` rate limiting at the second resilience stage. This is an external/request-rate condition, not a VM runtime failure.

`vm-stack.test.mjs` could not complete because its fixture references a missing absolute file path:

```text
C:/Users/Ryzen 9 5900x/Desktop/Mine Scripts/Clone Kingdom Tycoon/Full Script.txt
```

It is therefore not counted as a pass.

## 13. Intensity-10

The requested controlled intensity-10 run was attempted once after the main runtime work.

Observed:

```text
[1] single-wrap generation PASS
[2] single-wrap decode PASS
[3] double-wrap generation PASS
[4] double-wrap decode PASS
[5] minimal options PASS
[6] uniqueness PASS
[7] single-wrap real execution PASS
[8] double-wrap real execution — TIMEOUT
```

The process remained in the intensity-10 real-execution stage until the 180-second controlled timeout. No PASS is claimed.

## 14. Final classification

### IMPLEMENTED under this pass's specific gates

- VM state polling: valid execution, active checks, and deliberate state corruption rejection all passed.

### PARTIAL

- Metamethod completeness remains PARTIAL at the project release level because the user's requested final gate also requires the entire post-change regression to remain green. The focused metamethod proof itself is complete: 17/17 differential, 17/17 native controls, 1377/1377 profile/seed runs, and all six nested scheduler integrations passed.
- Overall project completion remains PARTIAL because intensity-10 remains a timeout, unsupported target runtimes remain unavailable, and unrelated application/regression fixtures include the 429 resilience test and missing vm-stack fixture.

No historical PASS result was copied into this report as a substitute for the new runtime executions.

## 15. Remaining limitations

1. Intensity-10 double-wrap real execution still times out under the controlled 180-second run.
2. Lua 5.2/5.3/5.4, LuaJIT 2.1, and Luau 0.709 remain unsupported without their native/reference runtimes.
3. Full physical register reuse remains constrained by the closure ABI.
4. Static environment / compatibility semantics remain incomplete.
5. Debug-library protection is not implemented as a complete anti-debug contract.
6. Worker resilience is rate-limited (`429`) in the current local test environment.
7. The vm-stack suite requires an unavailable external fixture path.

## 16. Bottom line

The missing Fengari blocker is cleared. The latest metamethod implementation is now runtime-proven across the complete requested metamethod operation set, native controls, native-vs-virtual differential, nested scheduler integrations, 27 seeds, and all three profiles.

The state-polling implementation is also runtime-proven, including deliberate corruption rejection.

The project as a whole remains **PARTIAL** because the final release gate is not fully green: intensity-10 is still a timeout and two unrelated environment/application regression conditions remain.
