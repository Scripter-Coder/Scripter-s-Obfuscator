# NOTE — SUPERSEDED

This blocker-only report describes the state before the supplied Fengari 0.1.5 runtime was made executable. The completed proof is in `RUNTIME_PROOF_METAMETHOD_FINAL.md`.

# RUNTIME PROOF — METAMETHOD / VM STATE PASS

Date: 2026-09-22

## Status

**PARTIAL** — runtime proof could not be completed because Fengari 0.1.5 is not available in the supplied/local environment and network DNS is unavailable. No metamethod was promoted to IMPLEMENTED from this pass.

## 1. Repository inspection

The supplied working directory is an extracted repository and contains **no `.git` directory**, so `git status` cannot be executed against it. The authoritative files inspected were:

- `FINAL_PASS_SESSION.md`
- `FINAL_COMPLETION_TRACKER.md`
- `FINAL_FEATURE_MATRIX.md`
- `FINAL_PROJECT_COMPLETION_REPORT.md`
- `vm-bytecode.js`
- `test_metamethod_phase.mjs`
- package/test configuration

The previous session claims were reproduced from the files rather than accepted blindly.

## 2. Local dependency recovery

### luaparse

A local copy was found at:

`public/vendor/luaparse.js`

The empty `node_modules/luaparse` directory was restored as a minimal local package using that existing vendored parser. A smoke parse succeeded:

`require('./node_modules/luaparse').parse('return 1').type` → `Chunk`

This is a local recovery; no network package installation was used for luaparse.

### Fengari

The local `node_modules/fengari` directory exists but is empty.

Searches across the supplied workspace and local filesystem found no usable Fengari installation or archive. npm cache inspection did not contain the required package. An offline package attempt returned `ENOTCACHED`.

A network installation attempt was made only after the required local search. It timed out, and direct registry access failed because DNS/network access is unavailable:

`curl: (6) Could not resolve host: registry.npmjs.org`

Therefore Fengari 0.1.5 could not be recovered in this environment.

## 3. Baseline

The full `npm test` baseline was attempted.

Result: **BLOCKED** at the first test because the runtime dependency `fengari`/the originally empty dependency environment is incomplete.

Before that, the vendored luaparse recovery allowed parser-dependent tests to proceed to the next missing dependency.

Available dependency-independent proof:

- `tools/antitamper_integrity_test.mjs` — **PASS** (`ANTI-TAMPER INTEGRITY PROOF PASS`)
- `node --check vm-bytecode.js` — **PASS**
- `node --check custom-obfuscator.js` — **PASS**

`tools/ir_pipeline_proof.mjs` and `tools/fusion_split_proof.mjs` remained blocked by the incomplete runtime dependency path in this environment.

## 4. Metamethod implementation audit

The production scheduler contains explicit VM-native interception for:

- `__add`
- `__sub`
- `__mul`
- `__div`
- `__mod`
- `__pow`
- `__concat`
- `__eq`
- `__eq` inversion for `~=`
- `__lt`
- `__le`
- reversed-argument `__lt` for `__gt`
- reversed-argument `__le` for `__ge`
- `__unm`
- `__len`

The audited path constructs a new VM frame in `FRAMES[]`, switches `CODE/PC/BASE/TOP/SC/LK/VA`, and sets a return destination. The fallback handler executes only when `_transition` is false. This is consistent with the requested scheduler-native architecture, but without Fengari execution this remains **structural evidence, not runtime proof**.

## 5. Existing focused runtime test

`test_metamethod_phase.mjs` already contains VM/native-control cases for `__call`, `__index`, `__newindex`, and `__add`.

Execution now reaches the missing Fengari dependency and fails with:

`Cannot find package '/mnt/data/obfwork/node_modules/fengari/index.js'`

Therefore no PASS result is claimed for the new arithmetic/comparison/unary/length metamethod family.

## 6. VM state polling audit

Production generated VM code contains runtime checks for:

- `FP` bounds
- stack window (`BASE`, `TOP`, `SP`) sanity
- current frame existence
- current frame `BASE` consistency

The checks execute inside the generated dispatcher loop before normal instruction handling. This proves placement in production code generation, but the requested valid-state and deliberate-corruption runtime tests could not be executed without Fengari.

## 7. Static audit

The metamethod code uses `VMM[metamethodFunction]` to identify generated VM closures and transitions directly to a VM frame. The source does not use the generic host `f(unpack)` route for these intercepted VM-closure metamethods.

Existing `__index`/`__newindex` paths were also inspected. No claim is made that the complete runtime matrix passes.

## 8. Seeds / profiles

The requested FAST/BALANCED/SECURE matrix and deterministic seed matrix were **not run** for the new metamethod paths because the required Lua execution engine is unavailable.

No seed was special-cased and no profile was silently downgraded.

## 9. Full regression

The requested full regression suites could not honestly be reported as passing in this environment. In particular, the requested 35/35, 100/100, 500/500, 324/324, and 486/486 results were not re-executed during this pass.

Historical results in the repository documentation are retained as historical evidence and are not relabeled as results of this runtime-proof pass.

## 10. Classification

### IMPLEMENTED

None of the newly audited metamethods or VM-state polling is promoted to IMPLEMENTED by this pass, because the required runtime execution evidence is unavailable.

### PARTIAL

- VM arithmetic/comparison/unary/length/concat metamethod scheduler paths — production code and structural path present, runtime proof blocked.
- VM-state polling — production checks present, runtime corruption tests blocked.

### NOT IMPLEMENTED

No new NOT IMPLEMENTED classification was introduced by this pass.

## 11. Exact blocker

The decisive blocker is the absence of Fengari 0.1.5. The supplied `node_modules/fengari` directory is empty; no local archive/cache copy was found; npm has no cached package; and external registry access is unavailable in the execution environment.

The next exact action once Fengari 0.1.5 is available is to run `test_metamethod_phase.mjs`, expand it to the complete 14-operation VM/native matrix and requested nested PCALL/XPCALL/coroutine/closure/STACKALLOC cases, then run the VM-state corruption tests and full regression matrix.
