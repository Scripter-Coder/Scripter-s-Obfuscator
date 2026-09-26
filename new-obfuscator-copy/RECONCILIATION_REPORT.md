# Repository Reconciliation Report

## Source determination

The stale `/tmp/prevrepo/new-obfuscator` tree was **not** treated as authoritative.

The newest verified source tree found in the available workspace was:

`/mnt/data/current/new-obfuscator`

It contained the production-pipeline state, including:

- `src/ir/production-pipeline.js`
- `tools/pipeline_production_test.mjs`
- production wiring in `vm-bytecode.js`
- production fusion/splitting/mutation
- physical temporary allocation

The corresponding archive was:

`/mnt/data/current/new-obfuscator-pipeline-final.zip`

The stale feature-pass archive was:

`/mnt/data/current/new-obfuscator-final-feature-pass.zip`

The stale `/tmp/prevrepo` tree was later than the pipeline tree by filesystem time, but it was a different branch/state and had lost the production pipeline. It was therefore treated as a feature-change source, not the base.

No original Git history was present in the supplied repository trees. A temporary three-way Git repository was used only to reconcile the pipeline base with the stale feature branch; its `.git` metadata was removed from the actual repository after the merge.

## Reapplied / merged features

The following stale-pass work was merged onto the production-pipeline tree without replacing the pipeline:

- STACKALLOC production lowering and VM handlers
- safe CFG jump-trampoline rewriting
- hard-coded global specialization (`HGLOB`)
- per-function `VMATTR(STACKALLOC=false)` behavior
- target-specific parser/backend selection groundwork
- LuaJIT-only FFI gating/pass-through
- anti-tamper frame ownership/state validation
- target-specific Lua 5.2/5.3/5.4/LuaJIT adapters
- Luau 0.709 source normalization adapter
- focused tests for all of the above

The production IR modules from the newer pipeline tree were retained as authoritative.

## Merge conflicts / targeted fixes

Three merge conflicts occurred:

1. `package.json` — retained the pipeline/feature regression scripts and added focused feature-test scripts.
2. `src/ir/optimizer.js` — retained the newer production-pipeline optimizer implementation; the stale scaffold was not allowed to overwrite it.
3. `vm-bytecode.js` — manually reconciled imports, front-end IR representation, STACKALLOC, HGLOB, per-function metadata, goto/label handling, CFG rewriting, and production-pipeline invocation.

Additional integration fixes discovered by real tests:

- CFG rewriting was originally written against numeric bytecode but production compilation now uses object-form front-end IR. It was adapted to rewrite the IR object form before lowering.
- Goto emission was adapted to emit front-end IR objects rather than numeric opcode pairs.
- `debugProtect` was restored after the stale branch accidentally replaced the production debug-environment path.
- Frame-register cleanup was adjusted so normal frames clear their normal window and only clear the extended STACKALLOC region when it was actually used.

## Production pipeline verification

The authoritative path is present and invoked from `vm-bytecode.js`:

`AST -> front-end IR -> CFG -> optimizer -> physical allocation -> production transforms -> lowering -> scheduler VM bytecode`

Production proof reported:

- CFG blocks: 13 on the reconciled CFG-rewrite proof case
- physical reuse: 13
- applied temporary remappings: 12
- optimizer fold: 1
- fusion: 1
- splitting: 1
- opcode mutation: 1

`tools/pipeline_production_test.mjs`: PASS.

## Scheduler verification

- scheduler architecture: **8/8 PASS**
- scheduler edge suite: **10/10 PASS**
- runtime baseline: **10/10 PASS**
- coroutine + metamethod scheduler suite: **10/10 PASS**
- no recursive ordinary VM-closure `RUN()` fallback detected by the scheduler architecture test

## Full regression

`npm test`: completed successfully.

Results included:

- differential: **35/35 PASS**
- Phase-4 differential: **35/35 PASS**
- fuzz: **30/30 PASS**
- fuzz100: **100/100 PASS**
- fuzz500/final matrix: **500/500 PASS**
- makeCounter: **PASS**
- constant virtualization: **PASS**
- seed reproducibility: **PASS**
- UNROLL: **all focused cases PASS**
- optimizer production proof: **PASS**
- feature runtime: **PASS**
- production pipeline proof: **PASS**
- target backend selection: **PASS**

Focused merged-feature tests:

- STACKALLOC: **8/8 PASS**
- CFG rewrite: **PASS**; rewritten and baseline semantics both 35; output differs; JMP count 6 vs 3
- hard-coded globals: **5/5 PASS**
- per-function STACKALLOC attribute: **PASS**
- anti-tamper/state validation: **PASS**
- target backend tests: **PASS**

## Exact target runtime verification

The supplied source runtimes were built/used where necessary:

- Lua 5.2.4: **runtime PASS**, `RESULT=1`
- Lua 5.3.6: **runtime PASS**, `RESULT=1`
- Lua 5.4.8: **runtime PASS**, `RESULT=1`
- LuaJIT 2.1: **runtime PASS**, `RESULT=10`
- LuaJIT 2.1 FFI: **runtime PASS**, `RESULT=42`

These are genuine target-runtime executions of reconciled generated output, not merely label/registry checks.

Luau:

- Luau 0.709 backend/source-normalization path: **IMPLEMENTED + PARTIALLY VERIFIED**
- supplied Luau executable: Windows PE32+ x86-64
- current environment: Linux
- Wine/QEMU executable access: unavailable
- Luau 0.709 runtime execution: **BLOCKED BY ENVIRONMENT**

## Intensity-10 status

The reconciled repository generates the intensity-10 artifact successfully. A native Lua 5.3/5.4 execution of the generated artifact completed successfully.

The existing Fengari-based `tools/intensity10_smoke.mjs` did not consistently terminate within the available timeout after reconciliation. One run reached `RESULT verified 362880` before the process timeout, but the exact test process was not consistently cleanly terminating.

Therefore intensity-10 is **IMPLEMENTED + PARTIALLY VERIFIED**, not marked fully verified.

This is a genuine remaining runtime/performance issue, not being hidden as a PASS.

## Final feature classification

| Feature | Classification |
|---|---|
| VM scheduler / REG / BASE / TOP / FP / FRAMES | IMPLEMENTED + VERIFIED |
| VM CALL / RETURN / TAILCALL / CLOSE | IMPLEMENTED + VERIFIED |
| PCALL / XPCALL | IMPLEMENTED + VERIFIED |
| persistent coroutine state | IMPLEMENTED + VERIFIED |
| coroutine + metamethod scheduling | IMPLEMENTED + VERIFIED |
| AST -> IR -> CFG -> optimizer -> allocation -> transforms -> lowering | IMPLEMENTED + VERIFIED |
| constant virtualization | IMPLEMENTED + VERIFIED |
| MBA | IMPLEMENTED + VERIFIED |
| INLINE | IMPLEMENTED + PARTIALLY VERIFIED |
| UNROLL | IMPLEMENTED + VERIFIED |
| fusion | IMPLEMENTED + VERIFIED |
| splitting | IMPLEMENTED + VERIFIED |
| opcode mutation | IMPLEMENTED + VERIFIED |
| physical temporary allocation/reuse | IMPLEMENTED + VERIFIED |
| STACKALLOC | IMPLEMENTED + VERIFIED |
| safe CFG rewriting | IMPLEMENTED + VERIFIED |
| arbitrary aggressive CFG flattening/reordering | NOT IMPLEMENTED |
| hard-coded globals | IMPLEMENTED + VERIFIED |
| static environment | IMPLEMENTED + PARTIALLY VERIFIED |
| debug protection | IMPLEMENTED + VERIFIED |
| anti-tamper/state validation | IMPLEMENTED + VERIFIED (focused corruption coverage) |
| per-function attributes | IMPLEMENTED + PARTIALLY VERIFIED |
| LuaJIT FFI subset/gating | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.2.4 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.3.6 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Lua 5.4.8 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| LuaJIT 2.1 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 backend | IMPLEMENTED + PARTIALLY VERIFIED |
| Luau 0.709 runtime execution | BLOCKED BY ENVIRONMENT |
| Lua 5.4-only `<close>` / `<const>` backend syntax | NOT IMPLEMENTED |
| Luau `continue` / compound-assignment lowering | NOT IMPLEMENTED |
| universal LuaJIT FFI | NOT IMPLEMENTED |
| arbitrary unsafe CFG flattening | NOT IMPLEMENTED |
| intensity-10 Fengari process completion | IMPLEMENTED + PARTIALLY VERIFIED |

## Repository state

The reconciled source is now in-place at:

`/mnt/data/current/new-obfuscator`

No replacement ZIP was created or used as the completion mechanism.
