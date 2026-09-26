# VM_GENERATION.md — VM Generation

**Flow:** `compile` → `build {chunks, vaultPlain, refs, seed, OPCODES, profile, constPool, vmVariant, encFormat, dispatcher}` → `emitVM(build)` → Lua source.

**Variability (per-build, `seed` LCG):**

1. **State layout** — `_stateFields` shuffled, `_frameLayout.stride` 8–32, `useRetField` bool, `REG_SHIFT` 0–7, `stateLayout` pc/state/opcode/frame/nextState/tmp order (`src/vm/variants.js`, `src/vm/dispatcher.js`).
2. **Instruction format** — `pickFormat` A/B/C/D, field order per family (`src/bytecode/encoding.js`), operand XOR, jump proto salts.
3. **Register encoding** — `regMap` bijection via seeded Fisher-Yates on `nextId` ids.
4. **Handler decomposition** — `src/vm/handlers.js` monolithic vs decomposed2/4 vs helper per `CALL`.
5. **Dispatcher** — `pickDispatcher` TABLE/BRANCH/NUMERIC/MIXED; `while true do … HAND[OP]()` vs `if OP==…` chain.
6. **Handler selection/ordering** — shuffled `order` slice of `OP_NAMES`, dead handlers 3–8 (`HAND[60001..65000]`).
7. **Constant repr** — `buildConstantPool` descriptors + `VP` salts, decoy vault + decoy chunks profile-tuned (`FAST 2–4/2–6, BAL 4–8/8–15, SEC 8–12/15–20`).
8. **Control-flow state** — `reorderBlocks`, branch inversion, block split (`vm-bytecode.js:1034`).

**Reproducibility:** `seedOverride` → whole build seeded (opcode+handlers+vault+blob+names+buildId). `tools/seed_test.mjs` PASS, `tools/build_20_diversity.mjs` 20/20 unique vm strings.

**Honest:** Not Luraph's actual handlers/opcode map; own ISA, own ciphers.

## Final-pass structural transforms

Generated VM opcode maps now include the production fusion/splitting opcodes when the compiler emits them. Same-seed generation remains deterministic; profile/seed selection controls whether the forms are used.
