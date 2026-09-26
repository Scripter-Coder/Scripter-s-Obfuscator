# Phase 7 IR Audit — 2026-09-22

## Result

**IMPLEMENTED for the current Lua51 production path; allocation/fusion/splitting remain partial.**

The Lua51 production compiler now emits symbolic VM instructions into chunk IR records, builds real basic blocks/edges, runs conservative production IR optimization and storage analysis, validates targets, and lowers the resulting IR to the existing numeric custom bytecode before VM generation.

Current production path:

```text
Lua source
→ luaparse AST
→ AST transforms
→ symbolic VM IR
→ CFG
→ conservative IR optimizer
→ storage/lifetime analysis
→ custom bytecode lowering
→ encoding
→ generated VM
```

The requested authoritative path:

```text
AST
→ normalization
→ AST transforms
→ IR
→ CFG
→ optimizer
→ register/storage allocation
→ mutation/fusion/splitting
→ bytecode lowering
→ encoding
→ VM generation
```

is not fully wired.

## Verified transform evidence

- INLINE: runtime + structural proof PASS; eligible simple calls reduce CALL count.
- UNROLL: runtime suite PASS for zero/one/multiple/negative/break/nested/nonconstant cases.
- MBA: runtime equivalence PASS for tested rewrite families and deterministic seed behavior.
- STACKALLOC: runtime closure/coroutine semantics PASS after captured-slot USET fix.
- Transform composition: `phase7_transform_composition.mjs` **34/34 PASS** across FAST/BALANCED/SECURE and seeds 0/1/42/123/999.

## Remaining Phase 7 work

1. Make IR a real production intermediate representation.
2. Build CFG from the actual compiled functions.
3. Run optimizer/register allocation on that real IR.
4. Lower the transformed IR to the existing custom bytecode.
5. Emit before/after IR + CFG + final bytecode proof artifacts.
6. Implement genuine VM-level fusion/splitting rather than primarily structural metadata/optimizer scaffolding.

No IMPLEMENTED claim is made for those unfinished architectural items.
