# TESTING.md — Test Matrix

## Deterministic Differential

`tools/differential_35.mjs:1` 35 cases — basic, arithmetic, string, boolean, tables, tables_index, functions, nested, closures_upvalue, mutable_upvalues, recursive, tailcall, varargs, multi_return, multi_assign, numeric_for, generic_for, while, repeat, if_else, nested_branches, break, upvalue_close, closure_loop, table_method, string_call, concat, len, not, neg, pow, mod, eq, table_pack, nested_call — **35/35 PASS** (lua51, fengari).

`tools/phase1_differential.mjs:1` 13/13, `tools/phase4_differential35.mjs` 35/35.

## Fuzz

- `tools/fuzz_test.mjs:1` 30 programs native vs protected — **30/30 PASS**
- `tools/fuzz_100.mjs:1` 100 programs — **100/100 PASS**
- `tools/phase4_fuzz100.mjs:1` 100 — **100/100 PASS**
- `tools/final_matrix_test.mjs` 500 fuzz — **500/500 PASS** (lua51, BALANCED)
- **Target 1000 where practical** — not yet (would timeout single-wrap prod).

Every failure becomes regression test (spec §35).

## Profiles × Variants × Per-Function

`tools/final_matrix_test.mjs` — FAST/BALANCED/SECURE each PASS + lens 30k/33k/40k; per-func `VM SECURE/FAST` mixed `f(5)+g(5)=25` PASS; pcall VM→native PASS; metamethod `__index` PARTIAL; coroutine PARTIAL (VM closure not accepted by `coroutine.create`).

`hardening.test.mjs:1` H1–H5 5/5.

## Stack/VM correctness

- `vm-stack.test.mjs:1` 10/10 (VM stack not less)
- `test_close.mjs:1` 8/8 (upvalue close)
- `test_secure_vmstack.mjs`, `vm-only-n.test.mjs:1`
- `test_optimizer_proof.mjs` fold 1 PASS
- `test_perfunc.mjs` SECURE/FAST/BALANCED chunks PASS

## Devirt

`tools/devirt.js:1` 5 HARD /4 EASY, meets spec ≥5 HARD.

## Seed/Diversity

- `tools/seed_test.mjs:1` same seed identical YES, diff seed differs YES
- `tools/diversity_test.mjs:1` 3 builds vault/blob unique YES
- `tools/build_20_diversity.mjs:1` 20 builds opcode maps 20/20 unique, vm strings 20/20 unique, same seed identical YES

## Target Honesty

`tools/target_test.mjs:1` lua51 ok, lua54 honest throw PASS.

## Full `npm test`

`package.json:20` `npm test` → `obfuscator.test.mjs` (needs single-wrap prod; may timeout triple-wrap 10 layers) + `worker.test.mjs` etc. Phase 1–3 gates subset `tools/*` 35+100+seed+diversity is CI-critical.

## Final production IR gate
`node tools/ir_pipeline_proof.mjs` verifies IR-before/after, CFG counts, optimizer statistics, allocation statistics, and lowered bytecode. Follow it with `node tools/differential_35.mjs`, `node phase6_8_1_runtime.mjs`, `node phase6_8_1_seed_matrix.mjs`, `node phase6_75_pcall_matrix.mjs`, and `node phase6_5_matrix.mjs`.

## Final-pass proof suites

- `node tools/fusion_split_proof.mjs`
- `node tools/antitamper_integrity_test.mjs`
- `node tools/ir_pipeline_proof.mjs`

The established scheduler/coroutine/PCALL and differential suites remain mandatory regression gates.
