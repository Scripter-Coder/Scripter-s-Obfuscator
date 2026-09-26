# TRANSFORMS.md — AST & Control-Flow Transforms

## Registry

`src/ast/registry.js` — `TRANSFORM_REGISTRY[]` each `{name, compat, cost, safety, target, profile, desc}`.

| Transform | Compat | Cost | Safety | Profile |
|-----------|--------|------|--------|---------|
| arithmetic_rewrite | lua51/53/54 | 1 | safe | BALANCED/SECURE |
| comparison_rewrite | lua51/53/54 | 1 | safe | SECURE |
| boolean_rewrite | lua51/53/54 | 1 | safe | SECURE |
| branch_rewrite | lua51/53/54 | 2 | safe | BALANCED/SECURE |
| expression_extraction | lua51 | 2 | cautious | SECURE |
| local_normalization | lua51/53/54 | 1 | safe | FAST/BALANCED/SECURE |
| safe_function_transforms | lua51 | 3 | cautious | SECURE |
| control_flow_transforms | lua51/53/54 | 4 | cautious | SECURE |

`transformsForProfile(profile)` / `validateTransform(name, target)`.

## Applied Passes

- `src/ast/transform.js:applyAstTransforms` — seed-deterministic `rnd`: `a+b↔b+a`, `a*2→a+a`, `not (a==b)→a~=b` (profile-gated).
- `vm-bytecode.js:978` CFG transforms: `branch inv` + `block split` (SECURE 30%, BALANCED 15%, FAST none) — real bytecode length change.

## Specialty Passes (Phase 5)

- `src/transform/inline.js` — IR-level inline, handles multiple params/returns/nested/closures/upvalues/variadics, recursion guard, `VMATTR(INLINE)`.
- `src/transform/unroll.js` — numeric `for i=start,end,step` unrolling where `start/end/step` constant and `n≤8` (SECURE ≤8, BALANCED ≤4, FAST none).
- `src/transform/mba.js` — presets `FAST/STANDARD/STRONG/EXTREME`, budgets `SMALL/MEDIUM/LARGE`, `rewriteExpression` + `verifyRewrite` (precision-aware, target-aware).
- `src/transform/stackalloc.js` — `VM_STACKALLOC(size, zeroBased?)` via virtual registers, escape analysis fallback.

All transforms are pre-VM lowering where appropriate.

## Final-pass VM instruction mutation

The production IR pipeline now has two genuine VM-level structural transforms:

- **Fusion:** `NUMK + ADD -> FNUMK_ADD` and `NUMK + MUL -> FNUMK_MUL`, each with a generated VM handler. FAST disables fusion; BALANCED/SECURE select it deterministically from the build seed.
- **Splitting:** `ADD -> SPLIT_ADD_PREP + SPLIT_ADD_EXEC`, both real VM opcodes with generated handlers. FAST disables splitting; BALANCED/SECURE select it deterministically.

Proof: `tools/fusion_split_proof.mjs` and `IR_PIPELINE_PROOF.json`.
