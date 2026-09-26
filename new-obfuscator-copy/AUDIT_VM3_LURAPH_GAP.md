# ScripterHub VM3 → Luraph V15 Class Virtualizing Obfuscator — Full Audit

**Date:** 2026-09-21
**Auditor:** Muse Spark (Opencode)
**Scope:** `custom-obfuscator.js`, `vm-bytecode.js`, `vm-pass.js`, `vm-stack.test.mjs`, `deob.py`, `obfuscator.test.mjs`, `luraph-vm-pro.js`, all `*.mjs` tests

> This audit was produced BEFORE any code modification, by reading every supplied file.  
> Every claimed status is evidence-backed. File refs use `path:line`.

---

## 1. Executive Summary

Current system is a **working hybrid pipeline**: user Lua → bytecode VM (tier 2) → literal vault + chunk blob + interpreter → wrapped in security wrapper → encrypted through 1–30 seed-chain cipher layers (split-key capable) with decoy slots. It achieves real virtualization for most 5.1 syntax but is **NOT yet a Luraph-class virtualizer** across the 22 capability axes. Critical gaps: no true IR/CFG/optimizer, stack model instead of virtual registers, control-flow transformation is only label jumps (no block reordering/flattening/opaque predicates at IR level), instruction mutation is opcode-value randomization only, VM generation is name/shuffle-level not structural, no per-function VM presets, single target (5.1), no `LPH_ATTRIBUTES` equivalent, compression = none (blob not compressed), no handler fusion/splitting.

`deob.py:86` proves the gap: a 1030-line Python script statically recovers VM dispatcher, vault key, blob cipher, opcode→handler mapping, chunks, and reconstructs near-original Lua via `ChunkDec`. If that pipeline succeeds, only cipher-key randomization protects the build.

---

## A. Current Architecture (monolithic)

| File | Lines | Role | Entry |
|------|-------|------|-------|
| `custom-obfuscator.js:1` | ~1296 | Orchestrator: validate → vm-pass/vm-bytecode → `buildSecurityWrapper` → `buildLoader` (chain cipher) → optional double/triple wrap → optional outer deserializer (`luraphMode`) | `applyCustomObfuscator:1069` |
| `vm-bytecode.js:1` | ~1451 | **Compiler + emitter in one file**. `compile():127` → AST→ bytecode `code[]`; `emitVM():910` → vault cipher, blob cipher, Lua VM source | `applyBytecodeVm:1431` |
| `vm-pass.js:1` | ~479 | Lite fallback: AST→ vaulted source with proxy dispatch | `applyVmPass:55` |
| `vm-stack.test.mjs` `obfuscator.test.mjs` etc. | — | Fengari differential tests | — |
| `deob.py:86` | 1030 | Attacker tool: demonstrates residual semantic recoverability | `VM.parse_vm:96` etc. |

Dependency graph:
```
src → luaparse:121 → custom-obfuscator:30 → {vm-pass:29, vm-bytecode:30}
         ↓                         ↓
      validateLuaSource:37   buildLoader:679 (genChainParams:176, encChain:153)
                                   ↓
                              buildSecurityWrapper:215
      vm-bytecode: compile:127 → emitVM:910 → Lua string
                                     ↓ (injected into payload)
                              payload → buildLoader
```

No separation into `parser/ast/semantic/ir/optimizer/transforms/compiler/bytecode/vm/runtime/generators/targets/security/compression/crypto/cli`.

**Immediate defect:** `custom-obfuscator.js:1021` references `polyNum` (defined only in `vm-bytecode.js:34`) → `ReferenceError` on any `intensity>=1` non-debug run (reproduced `node obfuscator.test.mjs`). Blocks tests.

---

## B. Current Compiler Flow

```
Lua source text
  ↓ luaparse 0.3.1  (luaVersion 5.1)  vm-bytecode.js:121
AST
  ↓ direct bytecode emission, no separate IR
code[]  (integer opcode stream)
  labels[] + labelPos  (patchLabels:193)
  chunks[]  (compileFunctionChunk:845, top chunk:872)
  vaultPlain[] + refs[]  (addConstS:144)
  seed (random 32-bit) + OPCODES map (random 500..60000)
  ↓ emitVM: vault encrypt + blob encode
Lua VM source string (returned to custom-obfuscator)
```

Steps in detail:
1. `compile()` creates `seed`, `vaultPlain`, `refs`, `chunks`, `nameIds/nextId`, `lex` stack. `OPCODES` randomized `500..60000` per build `vm-bytecode.js:140-149`.
2. Expression compiler `ex:196` handles literals, Identifier via `resolve()` (`local/upval/global`), `MemberExpression`/`IndexExpression` → `TGET`, Calls via `compileCall:291`, binary via `compileBinary:306`, tables via `compileTable:336`.
3. Statement compiler `st:372` dispatches `LocalStatement`, `AssignmentStatement`, `FunctionDeclaration`, `ReturnStatement`, `Do/If/While/Repeat/ForNumeric/ForGeneric/Break`, with `PUSHSC/POPSC` scoping. Unsupported `Goto/Label` → throw.
4. No lowering to CFG, no optimization, no IR. `patchLabels` finalizes jump targets as absolute `code` indices.
5. No constant dedup beyond `rawToStr:72` (string unescaping) reuse; `NUMK` still goes via vault string `tonumber(D(ix))`.

Contrast target pipeline (spec §3):
```
SOURCE → Lexer/Parser → AST → Semantic analysis → Target-independent IR
→ Optimization passes → Control-flow transformation → Virtualization lowering
→ Custom VM IR / bytecode → Register allocation → Constant virtualization
→ Instruction encoding/mutation → Per-build VM generation → ...
```
**Gap:** middle 6 stages missing.

---

## C. Current VM Flow

**Handler set:** `OP_NAMES:56` (53 ops). Handlers emitted as `HAND[opcode]=function()` table dispatch `vm-bytecode.js:1184,1404`. Order shuffled per build `1181-1183`, dead handlers added `1372-1387`, opcode values randomized — but **one table dispatcher**, no indirect dispatcher hierarchy, no state-based transitions.

**Stack model, not registers:** Shared operand stack `S:[1171]`, pointer `SP`, scopes `SC:[1172]` (array of scope tables), links `LK` (upvalue chain), program counter `PC`, code `CODE.c`. Handlers operate on `S/SP`:

- `CONST:1191`: `S[++SP]=D(CODE.c[PC++])`
- `NUMK:1194`: `D(ix)->tonumber`
- `LLOAD:1210` scans `SC` reverse; `ULOAD:1224` scans `LK`
- `LNEW:1220` pops `S[SP]` into current scope dict `SC[#SC][id]={v}`
- `TGET/TSET:1239`, `CALL/CALLM:1271`, `RET/RETP:1293`, `JMP/JIF/JIT/JNIL:1341`, `ANDK/ORK:1358`

No virtual register file; `register metadata` absent. Temporaries are hidden locals with `bindId('\x00t'+counter)` plus `SC` dict lookups (hash, not register file). No frame object; CALL does not push a frame containing caller/callee/IP/base/return-dest/expected-returns — instead flattens varargs via `PK` packed marker tables `1064-1078`.

**Call frame gaps:**
- No frame struct (spec §6: caller, callee, IP, base, return-dest, vararg state, pcall state).
- Returns via Lua native `return`/`return unpack(a)` inside handler `RET` — leaks host call stack.
- No virtual `CLOSE` for open upvalues.

**Closure model:** `NEWF:1314` captures `LK + SC` arrays by reference (`links[#links+1]=LK[i]/SC[i]`). This **does** provide shared mutable cells (table `{v}`), so mutable upvalue semantics work (verified by tests), but lifetime is via JS closure + Lua tables, no `CLOSE` opcode, no open/close distinction.

**Control-flow:** Only `JMP/JIF/JIT/JNIL/ANDK/ORK` over absolute `PC`. No block splitting/reordering/flattening/opaque predicates at IR level.

---

## D. Current Serialization / Encryption Flow

```
compile.build {chunks, vaultPlain, refs, seed, OPCODES}
  ↓ emitVM:910
  vault encrypt:  K(p,prev)=((a*p+b+seed*((p*p)%m))%251)+c  (VP.a/b/c/m/d/iv random)  vm-bytecode.js:923-949
  decoy vault runs appended (same cipher, decoy refs) 956-972
  chunk blob: records [nParams(2B)+params+vararg(1B)+nCode(4B)+codeWords(4B LE each)] 1080-1123
          decoy chunks appended (30-40 big) non-executed 1111-1123
          stream encrypt: k=(p1^2*a+p1*b+c)%2^32%251+4 (BP.a/b/c random) 1130-1134
  handlers shuffled, dead handlers 1181-1387, VM source L[] emitted
  ↓ custom-obfuscator: payload = securityWrapper + vmSrc 1141
        genChainParams:176 → layers[] (seed/iv/c1/c2/rev/off/shift/madd)
        encChain:153 (per-byte q + reverse + cipher feedback)
        bytes→ payloadStr with stride noise 771-781
        slot table M=layerCount+randdecoys (real chain linked via nextOf) 796-835
        buildLoader:779-1064 (vault payloadStr + slot table + checksum + decoy junkLines:116)
            if splitKey: paddedKey + carrier 715-762 (djb2 pad, VM seed carrier 729-757)
            while walker (outer) 1005-1033 (seed-chain peeling, 16-round q in prod)
            source→ loadstring → call 1045-1053
        double/triple wrap 1155-1193 (same loader nested)
        optional outer LPH deserializer 1210-1270 (xor+reverse raw, string literal, no VM)
  returned to caller 1274
```

Encryption ≠ virtualization. Compression missing (`VM compression` claimed but only blob record packing; no `zlib/lz4`).

---

## E. Current Security Features

| Feature | Where | Strength | Testable? |
|---------|-------|----------|-----------|
| Randomized identifiers | `makeNames:108` via `hex` | Weak (entropy per name) | yes |
| Per-build keys (OPCODES + VP/BP + chain seeds) | `vm-bytecode:140,923,1088`, `custom-obfuscator:176` | Real but cipher form partly fixed | yes (hardening.test H1) |
| Encrypted payload (slot chain) | `encChain:153`, `buildLoader:694` | Real; decoy slots + rev + feedback | yes (obfuscator.test decodeLoader) |
| Split payload / shards | Split-key block `862-976` | Real (missing START seed, carrier) | yes H4/H5 |
| Randomized opcode IDs | `OPCODES random 500..60000` | Real per-build | yes |
| Indirect dispatcher | Single `HAND` table `1404` | Minimal (not indirect) | yes |
| Decoy VM operations | Dead handlers `1372`, decoy vault/chunks `956,1101` | Non-trivially removable? Some yes | partial |
| Opaque state mixing | None at IR level; only cipher mixing | Missing | — |
| Anti-tamper | Checksum `79,856-860` deriving `mod` + START seed XOR; `while` walker aborts on mismatch | Layer-level; not VM image/handler integrity | yes test [9] |
| Anti-hook / canary | `_shc` canary `245,1042` + wrapper scan (antiLogger `478`) | Real canary + decoy decryptor `279-305` | yes tests [26-30] |
| Debug protection | `debug` not touched; `string.dump` trap `1026` (luraph-vm.js artifact) | Minimal | no |
| Junk / bloat | `junkLuaLines:116`, `junkStrs:793` | Cosmetic | yes |

Every check is testable except debug. Failure mode documented.

---

## F. Current Semantic Coverage

Evaluated against required 35-case matrix (§23). Result via code read + existing tests:

| Case | Impl | Evidence | Notes |
|------|------|----------|-------|
| 01 basic / 02 arithmetic / 03 boolean / 04 strings | IMPLEMENTED | `compileBinary:326-333`, `ex` literals, vault strings | — |
| 05 tables | IMPLEMENTED | `compileTable:336`, `TGET/TSET` handlers | `rawget/rawset` not explicitly separated |
| 06 metatables | PARTIAL | No `SETMETATABLE` opcode; relies on host `t[k]=v` triggering metamethods, but `__*` paths not virtualized | Tables/metatables target says ❌ — correct, only incidental host semantics |
| 07 functions / 08 nested / 09 closures / 10 mutable upvalues | IMPLEMENTED* | `NEWF:1314`, `SC/LK` capture, tests `vm-stack.test:1` large script | Open upvalue `CLOSE` missing; heavy recursion verified via `vm-only-n.test:1` but not formally fuzzed |
| 11 recursive / 12 mutual recursion | IMPLEMENTED | `FunctionDeclaration:800` `LNEW` vs `LSET` for recursion, chunk capture | — |
| 13 varargs `...` | IMPLEMENTED | `VARGP:1308`, `PUSHSC/POPSC` + `PK` marker `1064` | — |
| 14 multiple returns | IMPLEMENTED | `CALL/CALLM` flatten marker, `RET/RETP:1293`, `UNPK/UNPKR:1255` | — |
| 15 tailcalls | PARTIAL | `compileReturn:672` emits `RETP` for `return f(...)`; but no `TAILCALL` opcode, host TCO not guaranteed | Spec requires `TAILCALL` |
| 16 numeric for / 17 generic for | IMPLEMENTED | `compileNumericFor:694`, `compileGenericFor:752`, handlers `JNIL:1352`, `UNPK1F` | `break` inside generic-for fixed via `POP` at `endLabel:804` |
| 18 while / 19 repeat / 20 if/else / 21 nested branches | IMPLEMENTED | `st While/Repeat/If` emitting `JIF/JMP` | No flattening transform |
| 22 coroutines | NOT IMPLEMENTED | No `COROUTINE`/`YIELD` opcode; host coroutine yields would cross VM boundary | Declared but not tested |
| 23 pcall / 24 xpcall / 25 errors | NOT/ PARTIAL | Loader uses `pcall(game.HttpGet)` but compiler has no `PCALL` opcode; VM does `error("bad opcode")` `1405` only | `pcall` body not virtualized as protected call |
| 26 environment `_ENV` | PARTIAL | `GLOB/GSET:1204` via `E[D(ix)]` where `E = getgenv() or _G` `1024-1028`; no `ENV` upvalue handling | Luau/Roblox `getgenv` hack, not spec `_ENV` |
| 27 methods `self` | IMPLEMENTED | `compileCall ':'` branch `291-307` `DUP+TGET+SWAP` | — |
| 28 native functions | IMPLEMENTED | `CALL` lowers to `f(unpack(a))` host call | Hook detection minimal |
| 29 bitwise | PARTIAL | 5.1 arithmetic via `bit32` not emitted; only `.. + - * / % ^` ops present; Luau `/` etc. not lowered | Target matrix requires per-target integer/bitwise |
| 30 integer semantics | PARTIAL | `NUMK` via `tonumber(D(ix))` coerces via Lua number text; 64-bit int not distinguished | Lua 5.3 int/float split absent |
| 31 large program / 32 deep nesting / 33 many constants / 34 many functions / 35 many upvalues | PARTIAL | `vm-stack.test.mjs` runs 10 attempts on real Clone Kingdom script — passes but not systematic 35-case harness | Need fuzz + differential suite |

**Overall semantic coverage: ~70% for Lua 5.1 scripts without coroutines/pcall/bitwise. No Luau semantics.**

---

## G. Current Target Support

| Target | Claimed | Tested | Parser | Number/bitwise | Env | Result |
|--------|---------|--------|--------|---------------|-----|--------|
| lua51 | YES | YES | `luaparse luaVersion 5.1` `vm-bytecode:121` | doubles, via bit32 compat `844` | `getgenv or _G` | IMPLEMENTED (only real target) |
| lua52/53/54 | NO | NO | No `_ENV`, `goto`, `//`, `type` guards only in `validateLuaSource:47` | No | — | NOT IMPLEMENTED |
| luajit | NO | NO | No | No | — | NOT IMPLEMENTED |
| luau | NO | NO | Deny list only `DENY=['getfenv','setfenv']:53`, no Luau `continue`, `type` etc. | No | Task mentions but not implemented | NOT IMPLEMENTED |

Spec requirement §17 demands explicit target abstractions `targets/lua51|52|53|54|luajit|luau` with parser compat, number semantics, bitwise, coroutine behavior. Only `lua51` exists. **Must not advertise others as supported.**

---

## H. Current Weaknesses (attacker viewpoint — trying to de-virtualize own output)

1. **Single universal bytecode format:** `blob` record `[nParams|params|vararg|nCode|codeWords]` (`vm-bytecode:1088-1103`) is fixed forever. Deobfuscator `deob.py:216-244` walks it without needing per-build format discovery. Spec §4 says format must NOT mirror Lua 5.3 forever and must include version/build/vm IDs, prototype records, upvalue descriptors, etc. — missing.

2. **Handler recoverability:** Although opcode values randomized and handler order shuffled, body patterns are stable and `deob.py:247-338` classifies each opcode via `S[T]` regexes (`PUSHSTR`: `D(C.c[P])`, `ADD`: `a+b`, etc.) — one Python rule per semantic. No handler splitting, fusion, or layout diversity. Spec §11 handler structural diversity missing.

3. **Dispatcher is obvious:** One `while true do local OP=CODE.c[PC++] if OP==RET... if OP==RETP... local _fn=HAND[OP] _fn() else error` (`1388-1406`). Search `while true do` finds real VM in one regex (`deob.py:98-107`). Added decoy VM (`972-1022`) but it matches same pattern with `if false then` guard — trivially filtered. Luraph docs show OPAL/ONYX with distinct dispatchers; here only one.

4. **Vault key brute-forceable per-string?** Old design had `vaultKey(p)=((seed*p*ma+p*mb+mc)%251)` constants → now randomized (`VP.a/b/c/m/d`) `923` plus chaining, but `seed` still drives key; `deob.py:166-188` brute-forces `0..512` then scores plaintext bytes. Current 32-bit seed + `d` chaining raises cost but `deob.py` still recovers `seed` by scoring strings — needs updating to respect `VP` randomization. Nevertheless vault+blob formulas are now per-build random (`H1` passes), so improvement is real.

5. **Constant pool transparency:** Vault `V[]` is flat byte array, refs `R[]` are `{start,len}` contiguous — after decrypt, `D(i)` yields plaintext via `table.concat`. No per-constant type-specific encodings, no string splitting, no numeric obfuscation.

6. **Control-flow not transformed:** Original `if/while/for` structure maps 1:1 to `JMP/JIF` with absolute PC targets → `ChunkDec:366` rebuilds `if ... then else end` directly. No basic-block reordering, no opaque predicates, no flattening. Spec §9 requires IR CFG transforms.

7. **No VM compression:** `compress→encrypt` pipeline absent; blob is merely packed (length-prefix) not compressed. Spec §19 requires measured `serialize→compress→encrypt→embed`.

8. **Instruction mutation minimal:** Only opcode numbers vary (`OPCODES`); operand order/width/encoding fixed (`code` is 1 or 2 words per op, second word is always 1 operand). Spec §10 wants field-width permutation, register masks, immediate masks, jump encoding, fused operations.

9. **Error/protected-call not virtualized:** `pcall` bodies still host calls; error `xpcall` traceback leaks host VM.

10. **Spurious defects:** Duplicate tail after `hardening.patch` style duplication in `vm-bytecode.js` trailing lines (opaque/task.spawn repeated `1408-1418`), incomplete `luraph-vm-pro.js` stub, and the `polyNum` bug above indicate ad-hoc patching rather than pipeline refactor.

---

## I. Feature-by-Feature Gap Analysis (requirements matrix + 4-way VM diversity)

Legend: IMPLEMENTED / PARTIAL / NOT IMPLEMENTED — evidence-based, no stubs.

| Feature | Target | Current | Evidence | Gap |
|---------|--------|---------|----------|-----|
| Random variable/function names | YES | IMPLEMENTED | `makeNames:108`, scopes `vm-pass:136`, `vm-bytecode nameIds:133` | — |
| Random per-build keys | YES | IMPLEMENTED | `seed 32-bit`, `VP/BP/genChainParams` random | — |
| Encrypted payload | YES | IMPLEMENTED | `encChain:153`, `encLayer:135`, slot chain `1005` | — |
| Split payload/shards | YES | IMPLEMENTED | `splitKey:711`, carrier `729`, H4/H5 tests | — |
| Randomized opcode IDs | YES | IMPLEMENTED | `OPCODES 500..60000` `vm-bytecode:140` | — |
| Indirect dispatcher | YES | PARTIAL | Single `HAND` table `1404`; not multi-level indirect | Need indirect dispatch |
| Decoy VM operations | YES | PARTIAL | Dead handlers `1372`, decoy vault/chunks `956/1101` but trivially removable (tests keep `POP` at generic-for exit etc.) | Need non-trivial decoys |
| Opaque state mixing | YES | NOT IMPLEMENTED | No opaque predicates, state vars | — |
| **Actual custom bytecode** | REAL | PARTIAL | Blob is custom integers but fixed format (record per chunk) | Need versioned, diverse ISA |
| **Program executes inside VM** | REAL | IMPLEMENTED | `RUN(ci,links,...)` executes bytecode | — (but still uses host for CALL) |
| Generated VM source structure | REAL structural | PARTIAL | Name randomization + handler shuffle only; no stmt-field layout diversity | Need helper decomposition, field permutation |
| Generated dispatcher | REAL | PARTIAL | Shuffle only, not structural variant | Need OPAL/ONYX profiles |
| Generated handler set | REAL | PARTIAL | Same 53 handlers per build, dead ones fake | Need fusion/split, alternate encodings |
| Generated bytecode encoding | REAL | PARTIAL | Stream XOR only; operand widths fixed | Need field permutation, multi-encodings |
| Virtualized registers | REAL | NOT IMPLEMENTED | Stack `S/SP`, dict `SC` — not register file | Need frame `reg[]`, base/top |
| Virtualized CALL/RETURN | REAL | PARTIAL | `CALL/CALLM` flattened to host `f(unpack(a))`, no VM frame struct | Need frame + return dest + tailcall |
| Virtualized closures/upvalues | REAL | PARTIAL | Shared cells via tables, but no `CLOSE`, no child proto descriptors | Need proper open/close |
| Virtualized tables/metatables | REAL | PARTIAL | `TGET/TSET/NEWTAB/APD` only; metatables via host | Need virtual metamethod dispatch |
| Virtualized branches/jumps | REAL | PARTIAL | `JMP/JIF/JIT/JNIL/ANDK/ORK` present, but no virtualized `for` iterator etc. | Need full CFG |
| Constant virtualization | REAL | PARTIAL | Vault strings + NUMK strings only; not typed/unsplit; layout varies only by decoy runs | Need IR types + per-constant schemes |
| Control-flow transformation | REAL | NOT IMPLEMENTED | Passthrough labels `patchLabels`; no CFG | Need block splitting, flattening |
| Instruction-level mutation | REAL | PARTIAL | `OPCODES` + `VP/BP` randomization; but `polyNum` only used for handler table keys, not per-instruction field mutation; `VM` not fused | Need per-encodings, operand shuffle |
| Anti-tamper / anti-hooking | layered testable | PARTIAL | Checksum `856`, canary `245`, logger scan `498`; no VM image/handler integrity hashing | Need layered integrity (spec §15) |
| Debug-library protection | layered configurable | NOT IMPLEMENTED | No `debug.getinfo/getlocal` traps; only `string.dump` check | Need `debug` layer (spec §16) |
| Target-specific compiler/runtime | real backends | NOT IMPLEMENTED | Only `lua51`, no `targets/` abstractions | Need 5 targets sequentially |
| Optimization passes | real | NOT IMPLEMENTED | Zero optimizer (spec §18 list) | — |
| VM compression | real | NOT IMPLEMENTED | Record packing only; no zlib/lz | — |
| Per-function protection controls | real attributes | NOT IMPLEMENTED | No `LPH_ATTRIBUTES`/`VM()`/`PRESET()`/`TRANSFORM()` parser support | — |
| Lua/Luau semantic compatibility | compiler+VM | PARTIAL | Host `load` executes VM glue via native semantics; not custom compiler semantics | Need per-target semantics |
| Version/build/VM IDs, func proto records, upvalue descs, register metadata etc. (format §4) | — | NOT IMPLEMENTED | Format is just `code[]` + `refs` + seed | — |
| Optimization: constant folding, DCE, jump folding etc. | — | NOT IMPLEMENTED | — | — |
| Bytecode diversity (A/B/C builds differ structurally) | hardening | PARTIAL | `H1` distinct ciphers across 12 builds; but opcode maps still 53-entry same set | Need artifact diversity metrics (spec §21) |
| Devirtualization resistance | internal harness | NOT IMPLEMENTED | `deob.py` succeeds; no internal harness against own outputs | Need §22 harness (9 tasks) |

**Summary counts:** IMPLEMENTED 6, PARTIAL 12, NOT 11 (of matrix rows). Luraph-V15 column in user table shows ❌ for every advanced row; current VM3 matches that table. Progress requires moving PARTIAL→REAL and NOT→IMPLEMENTED via IR refactor, not more layers.

---

## J. Proposed New Architecture (target pipeline)

```
SOURCE (.lua)
  ↓  parser/lexer  (luaparse fork per target, or tree-sitter-lua)
       targets/lua51|52|53|54|luajit|luau  (spec §17)
AST  (annotated with VMAttr/TRANSFORM attrs)
  ↓  semantic/  (scope resolution, upvalue analysis, vararg/return arity, _ENV/env, tail position)
Target-independent IR  (CFG with basic blocks, SSA-ish, typed constants)
  ↓  optimizer/  (constant folding/propagation, DCE, jump-chain, move elimination, block simp)
  ↓  transforms/ (block split/reorder, opaque state vars, branch inversion, flattened regions, redundant states)
  ↓  compiler/  (virtualization lowering: Lua ops → VM IR ops; register allocation; liveness; shuffling)
Custom VM IR  (own ISA — 60+ ops including TAILCALL, CLOSE, setup upvalue descs, frame ops)
  ↓  bytecode/  (versioned image: header {ver,buildId,vmId,profile,seed} + func records + const sections + upvalue descs + code + integrity)
  ↓  generators/ (per-build VM source emitter: handler templates, dispatcher variants OPAL/ONYX-like, state layout, operand decoder layout, register storage layout)
  ↓  security/  (constant virtualization per-type, anti-tamper hashing, debug traps — separate from encryption)
  ↓  compression/ (lz-string/deflate over serialized image)
  ↓  crypto/  (seed-chain layers with slot-chain, carriers — as now, but keyed from build metadata only)
Generated protected Lua loader  (decrypt→decompress→validate→decode→execute through generated VM)
```

Key invariants (§29): never `source→encrypt→load(source)` as main execution; never claim compression==security.

ISA minimum (§4 list) already covered by `OP_NAMES`; add `TAILCALL`, `CLOSE`, maybe `MOVE`, `SELF`, `VARARG` refinements, `ERROR`-protected-call ops, `EXTRAARG`.

---

## K. Files That Need Modification

- `custom-obfuscator.js` — fix `polyNum` import (`custom-obfuscator.js:1021` → import from `vm-bytecode.js` or inline), remove duplicated outer `luraphMode` raw-string builder (rely on real VM), wire `targets/` selection, expose `--seed` reproducibility, expose CLI profiles.
- `vm-bytecode.js` — **split** into smaller modules; fix duplicate trailing lines `1408-1418`, fix `OP_NAMES` duplication across files, make `compile` emit IR not raw `code[]` so optimizer/transforms can run.
- `vm-pass.js` — keep as `FAST` profile lite path, but wire through same `parser/semantic` instead of its own scope pass.
- `luraph-vm-pro.js` — delete or replace; currently placeholder stub, not used.
- All `*.test.mjs` — extend to differential matrix (§23 35 cases) plus H tests; add `secrets not leaked` checks that also verify vault diversity.
- `.github/workflows`, `vite.config.js`, `server.cjs` — add target-specific build matrix.
- `test.lua`, `test_obf.lua` etc. — treat as fixtures, not committed artifacts.

---

## L. New Files/Modules Required (project structure §26)

```
project/
  parser/          → per-target luaparse adapters + attr grammar (VM()/PRESET()/TRANSFORM())
  ast/             → AST node types, attr attachment
  semantic/        → name resolution, upvalue marking, vararg/return analysis
  ir/              → IR ops, CFG, basic blocks, constant pools
  optimizer/       → 10 passes (spec §18)
  transforms/      → control-flow + instruction mutation + fusion/splitting
  compiler/        → lowering IR → VM IR, register allocation, constant virtualization planning
  bytecode/        → image serializer (versioned), deserializer spec
  vm/
    runtime/       → VM helpers (frame, upvalue cell, table traps) templates
    generators/    → dispatcher templates (OPAL/ONYX-like), handler templates, state layout gen
  targets/
    lua51/ lua52/ lua53/ lua54/ luajit/ luau/  (each: parser compat, number/int/bitwise, env, coroutine, metamethod specs)
  security/
    antitamber/    → image/handler/state hashing
    debug/         → debug.get* traps (configurable)
  compression/     → lz/deflate wrapper (measured separately)
  crypto/          → seed-chain (current buildLoader) refactored out
  cli/             → argument parser, reproducible --seed, --target, --preset, attribute CLI
  tests/
    differential/  → 35-case harness + fuzz generator
    diversity/     → build A/B/C artifact comparator (§21)
    devirtualize/  → internal analysis harness (§22 9 tasks)
  tools/
    deob/
    bench/
  docs/
```

Does not put compiler+VM+serializer+generator into one file — the top failure mode.

---

## M. Testing Plan

Derived from spec §23-25, §21-22, §28.

1. **Regression suite** 35 cases (§23): `01_basic` … `35_many_upvalues`. Each case = Lua source, expected stdout/stderr/return/exit/error; run `native` vs `protected` via fengari; assert identical. Must pass for each advertised target.

2. **Differential fuzz:** random program generator covering expressions, branches, tables, closures, loops, multiple returns, varargs (§24). 500–1000 programs, run both paths, compare capture; any mismatch = compiler bug.

3. **Diversity tests (§21):** same source × 3 builds (`seed` random). Compare opcode maps, handler names/order, dispatcher shape, state layout, bytecode bytes, constant encoding — assert substantial structural diff (≥ H1 H3 metrics).

4. **Devirtualization resistance (§22 internal harness):**
   1. extract VM image  2. identify decoder  3. identify instruction boundaries
   4. infer opcode map  5. identify handlers  6. reconstruct CFG
   7. recover constants  8. recover function boundaries  9. reconstruct high-level ops  
   For each, measure effort (lines of code × time). Current harness is `deob.py` — must be internalized and run on every CI build.

5. **Performance (§25):** measure compile/output-size/load/startup/exec/memory for native vs FAST/BALANCED/SECURE; assert SECURE not absurdly slow.

6. **Reproducibility (§28):** `same src + target + config + --seed → identical output`; without seed, variance.

7. **Security layers:** anti-tamper flip-one-byte must abort (§K test [9]), canary one-shot (§K tests [26-30]), split-key H4/H5.

All tests run via `npm test` unified entry; currently `package.json:20` lists 11 suites — post-refactor, include `differential` + `diversity` + `bench`.

---

## N. Milestones (spec §31 order, updated with audit fixes)

**PHASE 0 — Audit (this document) + hotfixes**
- Deliver this audit. Fix `polyNum` bug, deduplicate `vm-bytecode.js` trailing, wire `validateLuaSource` to respect `--target`.
- Criteria: `npm test` passes again on `lua51`.

**PHASE 1 — Stabilize compiler/IR**
- Extract `parser/semantic/ir/optimizer/transforms` from `vm-bytecode.js`. Introduce CFG, preserve semantics.
- Deliver AST/IR with tests; no behavior change visible to `deob.py` yet.

**PHASE 2 — Stabilize custom VM**
- Introduce register file + frame struct, `TAILCALL/CLOSE`, proper `PC` stepping, pcall/coroutine stubs with explicit unsupported errors.
- Deliver differential tests for `tailcalls/closures/varargs/multiple-returns` with new VM.

**PHASE 3 — Make VM genuinely generated**
- Factorize `generators/` (handler templates, dispatcher variants, state/register layout). Each build varies structure beyond names.
- Deliver diversity test (A/B/C artifacts structurally different).

**PHASE 4 — Security transformations**
- Constant virtualization per-type (string/number/bool/nil/func), IR-level control-flow (split/reorder/flatten/opaque), instruction fusion/splitting, semantic lowering, anti-tamper hashing, debug protection.
- Deliver §15+16 layered checks with disable flags.

**PHASE 5 — Build profiles**
- Implement `FAST | BALANCED | SECURE | OBSIDIAN/ONYX-like` profiles (§12) controlling complexity/fusion/decoy/compression/perf.

**PHASE 6 — Per-function configuration**
- Grammar for `VMATTR(VM=...,PRESET=...)` + `VM()/PRESET()/TRANSFORM()/DEBUG_PROTECT` attrs; parser→AST→IR→codegen honored; inheritance rules; tests where `VM(NONE)` bypasses virtualization for that function with `pcall` boundary.

**PHASE 7 — Target backends (sequential, each must pass differential)**
- `lua53 → lua54 → lua52 → lua51 (stabilize) → luajit → luau` (spec order §17 + §31); each adds `targets/<name>/` shim; never advertise before tests pass.

**PHASE 8 — Hardening**
- Run diversity + self-analysis + fuzz/differential + perf benchmarks; tune output-size; publish final matrices (feature × implemented/tested/target/limitations, target support matrix, bench numbers, build examples).

**Performance plan (§25 + §19):** compression measured independently; bench native vs FAST/BALANCED/SECURE on `50..5000-line` fixtures; cap SECURE overhead (e.g., < 8× exec, < 3× size) unless configured.

**Final acceptance:** 22 criteria (§33) — custom ISA, IR, virtual registers, CALL/RETURN, closures/upvalues, tables/metatables, branches/jumps, constant virtualization, control-flow transform, mutation, structural VM variance, handler/dispatcher variance, anti-tamper, debug, optimizations, compression, per-function controls, target differential, build diversity, no false target ads — plus audit matrices (§30, §32 N).

---

## Appendix — Raw Requirement Matrix (for implementers)

See user spec table at top of prompt; this audit’s table (§I) is the evidence-backed instantiation. The most important split — `Generated VM per script/build` into (source structure | dispatcher | handler set | bytecode encoding) — all four must be REAL structural, not rename/shuffle.

Do not pursue proprietary Luraph source; study public docs + supplied `217668728763*.lua` specimen only for concept reference.

