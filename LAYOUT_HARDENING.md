# LAYOUT_HARDENING.md — bytecode layout hardening

> What this layer does, what it measurably buys, what it costs, and — stated
> up front — what it does **not** buy. Implemented in `src/vm/code-layout.js`,
> wired into `src/ir/production-pipeline.js`.

---

## 1. The weakness it targets

A stack VM is cheap to decompile while its **address order is its execution
order**. Opcode values, handler bodies, handler order, dispatch topology and
constant keys are all already randomized per build — and none of that stops the
first step, which is:

```
read chunk.c[] in address order  →  split at leaders  →  rebuild source
```

Randomization changes *what* the instructions say. It does not change the
skeleton that says *which instruction comes next*. The skeleton is the part an
analyst gets for free, and it is enough to recover `if` / `while` / `for` and
the whole constant flow.

This layer removes the skeleton.

## 2. What it does

Applied per chunk, per build, after the optimizer/transforms and before
encoding (`src/ir/production-pipeline.js`):

### 2.1 Block relocation

A per-build subset of basic blocks is moved out of line to the end of the
chunk, in a shuffled order. The slot each one vacated becomes an explicit `JMP`
trampoline, so control flow no longer follows the address order.

*Safety.* Every edge into a moved block is resolved through one old-PC →
new-PC map after the rebuild — the fall-through (the trampoline), conditional
jumps, unconditional jumps, **and** the jump trampolines that
`applySafeCfgRewriting` appends past the final `RET`. A relocated block whose
last instruction falls through gets an explicit `JMP` re-stating that edge,
because the out-of-line bodies are shuffled and would otherwise fall into an
unrelated neighbour.

### 2.2 Hole filling

Each vacated slot is refilled with code built from the **real** instruction set
and the **real** constant pool: `NEWTAB / CONST / CONST / TSET`,
`NUMK / NUMK / ADD / POP`, and so on — all stack-neutral. Some holes carry an
unconditional back edge, which decodes as `while true do <body> end`.

Nothing here is new instruction-set surface: every opcode used already has a
handler, so the artifact's instruction alphabet is unchanged.

### 2.3 Identifier scrambling

One permutation, shared by every chunk, over:

* constant-pool indices, with `build.refs` **reordered to match** (re-pointing
  instructions without moving the ranges changes what the program computes,
  which is a bug, not obfuscation);
* lexical / upvalue ids.

Ids also appear outside the instruction stream, and those move too:
`chunk.params` (the scheduler binds arguments into scope slots by id) and the
`VM(NONE)` bridge's capture descriptors.

### 2.4 The invariant

**Nothing injected is reachable.** Reachability is computed from the chunk entry
with the VM's own control-flow semantics, and only space vacated by a relocated
block is ever filled. `verifyUnreachable()` re-walks the finished stream and
throws if an injected instruction is reachable — on every build, not behind a
flag, because a filler that is reachable is a bug that ships.

## 3. Measured effect

`tools/bench/deob-oracle.mjs` — the same source, the same seed, hardening OFF
then ON. The oracle is handed the cipher result and the opcode map (those are
not what this layer defends); it measures the *image* an analyst is left with.

```
BALANCED   seed 4242 OFF   image= 220 insts  dead=  2.3%  scrambled=  2.5%  back-edges=  5
BALANCED   seed 4242 ON    image= 524 insts  dead= 45.8%  scrambled= 49.9%  back-edges= 41

SECURE     seed 4242 OFF   image= 220 insts  dead=  2.3%  scrambled=  2.5%  back-edges=  5
SECURE     seed 4242 ON    image= 722 insts  dead= 54.8%  scrambled= 64.4%  back-edges= 64
```

* `dead` — share of the image unreachable from the chunk entry.
* `scrambled` — block pairs laid out in the *opposite* order to execution
  (0 = address order is execution order).
* `back-edges` — backward jumps an address-order reader meets out of sequence.

## 4. Measured cost

`tools/bench/size-perf.mjs <source.lua>` — `test.lua`, 143 KB:

| profile | artifact OFF | artifact ON | multiplier OFF → ON | executor run OFF → ON |
|---------|--------------|-------------|---------------------|------------------------|
| BALANCED | 492 535 | 752 224 | 3.4x → 5.2x | 1 862 ms → 1 953 ms |
| SECURE   | 571 811 | 879 088 | 4.0x → 6.1x | 1 574 ms → 2 219 ms |

* **Size** is the real cost: roughly +55% artifact at BALANCED, +55% at SECURE.
  That is the trade against `c3bda3c`'s 600 KB budget — a 143 KB source at
  SECURE was already 572 KB and is now 879 KB. `tools/bench/size-perf.mjs`
  exists so this is never chosen blind.
* **Runtime** is nearly free per executed instruction (junk is never executed).
  The visible rise is startup: the blob is ~2x larger and the emitter decodes it
  byte-by-byte through an 8-iteration bit loop, so decode time scales with blob
  size, not with what actually runs.
* **Build time** rises (733 ms → 5.9 s for that source). Build-side only.

Per-profile knobs are in `LAYOUT` at the top of
`src/ir/production-pipeline.js`:

```js
FAST:     { relocateRatio: 0,    fillRatio: 0,   maxLoops: 0 }
BALANCED: { relocateRatio: 0.20, fillRatio: 0.7, maxLoops: 1 }
SECURE:   { relocateRatio: 0.35, fillRatio: 1.0, maxLoops: 3 }
```

`VMATTR(TRANSFORM=NO_JUNK)` opts a single function out.

## 5. What this does NOT buy — read this before counting on it

**A reachability-aware decompiler still recovers the real program.** Dead code
is dead code: prune the unreachable blocks and the original control flow is
sitting there in the remaining 45%. This layer raises the cost of the first
step and defeats *linear* readers, which is real, but it is not a barrier.

The reason is structural, not a tuning gap. An analyst who has decoded the image
can evaluate any predicate over decoded data, so opaque predicates do not help
against them either. Any defense that relies on the analyst being unable to
*evaluate* what they have already decoded is a defense against tooling that
stops one pass in.

What is left that genuinely resists a full decode:

1. **Runtime-only secrets** — the server-bound seed (`build.seedFromGenv`) and
   the key gate. Nothing in the artifact is extractable without them. This is
   the only barrier here that does not depend on the analyst's patience.
2. **Constant virtualization (MBA)** — numbers as arithmetic identities,
   strings built from char codes, so a decoded constant is not the constant.
3. **Handler-body structural polymorphism** — a per-build rewriting of handler
   bodies so the opcode → semantics map must be re-derived for each artifact.
4. **Control-flow flattening at the IR level** — the CFG is destroyed by
   construction rather than padded afterwards.

Items 2–4 are not implemented. Until they are, the honest claim is:

> The emitted VM is expensive to devirtualize and cannot be recovered by
> pattern-matching tools, but a motivated analyst with a decoder and an hour can
> still recover the source. That is short of Luarmor-grade.

## 6. Harnesses

| Tool | Question it answers |
|------|--------------------|
| `tools/bench/vm-correctness.mjs` | Do the emitted artifacts still compute the right thing? 13 fixtures x 3 profiles x N seeds, differential against the original in fengari. |
| `tools/bench/deob-oracle.mjs` | What does an analyst recover from the image? A/B, hardening off vs on. |
| `tools/bench/deob-resistance.mjs` | Same metrics plus the `deob.py` oracle verdict per build. |
| `tools/bench/size-perf.mjs` | What does the hardening cost in bytes, build time and run time? |
| `tools/bench/emit-vm-layer.mjs` | Emit the raw VM layer (no outer loader) for offline tooling. |

```
node tools/bench/vm-correctness.mjs --quiet
node tools/bench/deob-oracle.mjs --seeds 1
node tools/bench/size-perf.mjs test.lua --profiles SECURE
```

## 7. A note on `deob.py`

`deob.py` **crashes on the current emitter at every profile, including FAST**,
where this layer is switched off. It was written against an older emitter that
used an `if OP == N then` dispatch chain and an in-function `local CH =
CHUNKTABLE[chunk]`. Both are gone: dispatch is a permuted-key table or an
opaque decision tree, and the chunk table is filled from the blob decoder.

So `deob.py` is currently a regression detector that always reports "the
attacker is stuck", and it says nothing about the attacker. Do not read it as
evidence. `deob-oracle.mjs` exists because of this: it measures the artifact
rather than one frozen attacker's luck. A current-generation devirtualizer is
the missing instrument, and it is the next thing worth writing.