# AUDIT_FINAL.md — Independent Lua Virtualizing Obfuscator — 2026-09-21

**Scope:** `custom-obfuscator.js` (1296→~1320 lines), `vm-bytecode.js` (~1580 lines), `vm-pass.js` (479 lines), `src/` (profiles, ir, targets, bytecode), `tools/` (bench, devirt, fuzz), reference `217668728763*.lua`, previous `AUDIT_VM3_LURAPH_GAP.md`, `PHASE1_REPORT.md`, `PHASE2_REPORT.md`.

**Method:** Ran existing tests directly (`hardening.test.mjs:1` 5/5, `tools/phase1_differential.mjs:1` 13/13, `tools/makeCounter_test.mjs:1` PASS, `tools/fuzz_test.mjs:1` 30/30, `bench_profiles.mjs:1` FAST 0.14s BAL 1.28s SEC 4.27s). Inspected production path `applyCustomObfuscator → applyBytecodeVm → compile → emitVM → buildLoader`.

---

## 1. Architecture (current)

```
Lua source
  ↓ luaparse 5.1
  ↓ compile() → chunks[{code,params,vararg,maxReg}] + vaultPlain/refs + OPCODES (random 500..60000) + maxReg
  ↓ emitVM() → vault cipher VP{a,b,c,m,d,iv} + blob cipher BP{a,b,c} + HAND[opcode] table dispatch (or if-chain 33%)
  ↓ security wrapper (canary, anti-logger, keyGate)
  ↓ buildLoader() → seed-chain cipher (cipherRounds 1..16) + slot-chain + checksum + decoy slots
  ↓ optional double/triple wrap
  ↓ Lua VM: RUN(X,LK,...) → while true do OP=CODE.c[PC]; if RET/RETP/TAILCALL direct else HAND[OP]() → handlers use S/SP stack + REG[BASE+id]/SC/LK
```

Not yet: `AST → IR → CFG → optimizer → VM lowering` — `src/ir/*` exists but not controlling `code[]`.

## 2. Compiler Pipeline (current)

- **Parser:** `resolveLuaparse().parse(src,{luaVersion:'5.1'})` `vm-bytecode.js:151` — only 5.1, `DENY=['getfenv','setfenv']` word-boundary, others throw `Target not yet implemented` `custom-obfuscator.js:1157`.
- **AST:** luaparse 0.3.1 `rawToStr` handles `StringLiteral` escapes + long strings `vm-bytecode.js:72`.
- **Direct emission:** `ex()`/`st()`/`compileCall`/`compileReturn` etc. emit `code[]` with `label`/`jref`/`patchLabels` (PC absolute) — no IR.
- **Per-binding REG:** `lex={ids,map}` `vm-bytecode.js:186` `nextId++` per `bindId` — shadowing distinct ids, `resolve` stack search.
- **Optimizations:** `maxReg` computed per chunk `vm-bytecode.js:960`, `regMap` shuffle when `profile.useRegShuffle` `vm-bytecode.js:934`, `CLOSE` before `POPSC` `vm-bytecode.js:483`, `TAILCALL` for `return f(...)` `vm-bytecode.js:692`.
- **Scaffolding not wired:** `src/ir/ir.js` `makeFuncIR`, `src/ir/cfg.js` `CFG`, `src/ir/optimizer.js` `runOptimizer` — unit tested `tools/optimizer_test.mjs:1` but not affecting `chunks[].code`.

## 3. VM Pipeline (current)

- **RUN:** `RUN(X,LK,...)` per call, locals `CODE=CH[X]`, `S/SP` operand stack, `REG={} BASE=0 TOP=CODE.maxReg` `vm-bytecode.js:1291`, `SC={{}}` scopes, `VA`, `PC=1`, `FR` frame struct `vm-bytecode.js:1293`, `VM_MARKS={}` `vm-bytecode.js:1296`, `HAND` shuffled `vm-bytecode.js:1298`.
- **Handlers:** `CONST/NUMK` via `D(CODE.c[PC])`, `GLOB/GSET` via `E[D]` (`getgenv or _G`), `L*` now `REG[BASE+id]` + `SC` sync `vm-bytecode.js:1328`, `ULOAD/USET` via `LK` scan, `CALL/CALLM` via `HAND` `f(unpack(a))` with `PK` marker `vm-bytecode.js:1389`, `TAILCALL` via dispatcher direct `return f(unpack)` `vm-bytecode.js:1509`, `NEWF` as `vmf={isVM,proto,env}` + `__call`→`RUN` + `VM_MARKS` `vm-bytecode.js:1455`, arithmetic/metamethods via `a+b` etc.
- **Frame:** `FR={chunk,pc,base,top,ret,nRet,vararg,upenv,caller,build,reg}` exists but `FRAMES[]` stack and global `REG[]` window not yet — `REG` per `RUN` call (Design B), `BASE` redundant.

## 4. Serialization (current)

- **Vault:** `V[]` encrypted bytes, `R[]` `{start,len}` refs, `D(i)` decrypts via `VP` formula + `prev` chaining `vm-bytecode.js:1040`.
- **Blob:** `BP` stream cipher, records `[nParams|params|vararg|maxReg|nCode|code]` 2B/1B/2B/4B/4B LE `vm-bytecode.js:1207` + decoy chunks `vm-bytecode.js:1220` (profile-tuned 2-6/8-15/15-20).
- **Header:** `VM v2 hdr ver=2 build=X vm=Y profile=Z state=...` comment `vm-bytecode.js:1507`, `FORMAT_VERSION=2` `src/bytecode/format.js:1` but not yet verified.

## 5. Encryption (current)

- **Inner:** vault `K(p)=(a*p+b+seed*((p*p)%m))%251+c` + `prev*d`, blob `(p*p*a + p*b + c)%251+4`.
- **Outer:** `encChain` `custom-obfuscator.js:173` `q=(seed*c1+prev*c2+n*31)%251+5` (1-round) or 16-round loop (cipherRounds), `genChainParams` random `c1/c2/iv/rev/shift/madd`, payloadStr with `stride` noise `custom-obfuscator.js:698`, slot-chain `M=layerCount+rnd` + `START` XOR `chk%256`, split-key `SHK t0 chk paddedKey+carrier` `custom-obfuscator.js:730`.

## 6. Runtime (current)

- **Loader:** verifies `chk`, unmasks `START`, walks slot-chain, strips noise, `loadstring` payload `custom-obfuscator.js:1040`.
- **VM:** `while true do OP=CODE.c[PC]; PC+=1; if RET/RETP/TAILCALL direct else HAND[OP]()` `vm-bytecode.js:1509`, `HAND` table vs if-chain (33% `vm-bytecode.js:1054`).
- **Boundaries:** VM→native via `HAND[CALL]` `f(unpack)`; native→VM via `vmf.__call` → `RUN`; no explicit `VM→HOST` abstraction.

## 7. Current Semantics (tested)

- **PASS:** 13 differential `tools/phase1_differential.mjs:1` (basic, arithmetic, tables, functions, nested, closures 1,2,3, mutable, recursion, varargs, multi-ret, numeric/generic for, branches) + `makeCounter` `tools/makeCounter_test.mjs:1` (closures, shared, tables, `...`, branches, multi-ret) + `30 fuzz` `tools/fuzz_test.mjs:1`.
- **Covered:** locals, globals, upvalues (basic), tables, array/hash, `__index` via `t[k]`, `:` methods via `DUP/TGET/SWAP`, varargs `...` via `PK` marker, `for i=1,3`, `for k,v in pairs`, `while/repeat/if`, recursion, `return`.
- **Not covered / partial:** `pcall/xpcall/coroutine` (no `pcall` state in `FR`), `goto/label`, `bitwise` native vs `bit32`, `__newindex/__call` metamethods (via `t[k]=v` but not virtualized), `coroutine.yield` across VM, `TAILCALL` still host, `CLOSE` no-op.

## 8. Security Mechanisms (current)

- Per-build `seed` 32-bit, `VP/BP` random, `OPCODES` random, `HAND` shuffle + dead handlers `vm-bytecode.js:1334`, decoy vault `vm-bytecode.js:1054` + decoy chunks, `encChain` cipherRounds, `checksum` `custom-obfuscator.js:86`, canary `custom-obfuscator.js:245`, `VM_MARKS` `vm-bytecode.js:1455`, `TAILCALL/CLOSE` structural ops.
- **Not:** opaque state, instruction fusion/splitting, field permutation, constant virtualization per-type, control-flow flattening, generated handler decomposition, per-function controls.

## 9. Unsupported Targets (honest)

- `lua51` — IMPLEMENTED (5.1.5) `src/targets/lua51.js:1` `tools/target_test.mjs:1` PASS
- `lua52/53/54` — NOT IMPLEMENTED `src/targets/lua53.js:1` throws `Target not yet implemented` `vm-bytecode.js:148`, `custom-obfuscator.js:1157`
- `luajit` — NOT
- `luau` — NOT ( `continue` etc. skipped via `validateLuaSource` `custom-obfuscator.js:45`)
- **No target advertised as supported without differential PASS** — compliant.

## 10. Legacy Code / Duplicates

- `vm-pass.js:1` lite vault+proxy (kept for `FAST` profile `custom-obfuscator.js:1168` `lite-FAST` 0.14s) — not dead, intentional.
- `luraph-vm-pro.js:1` placeholder (101 bytes) — unused, should be removed Phase 32.
- `vm-orig.js` (127k), `vm-orig2.js` (63k) — backups, not imported.
- `SC` as second local store alongside `REG` — transitional duplicate `vm-bytecode.js:1328` (`REG[BASE+id]` + `SC[#SC][id]=cell`) — violates Design A, to be removed when `REG[]` global + `UPVALS` separate.
- `HAND[CALL]=f(unpack)` `vm-bytecode.js:1365` — legacy host path for VM→VM, to be replaced by `FRAMES[]` push.

## 11. Escape Hatches (must fix before Phase 4)

1. `HAND[CALL] f(unpack(a))` — VM→VM still host `vm-bytecode.js:1365` — biggest blocker.
2. `HAND[TAILCALL]` previously host, now dispatcher `return f(unpack)` `vm-bytecode.js:1509` — still host.
3. `REG` per `RUN` call (`local REG={} BASE=0` `vm-bytecode.js:1291`) — `BASE` redundant, should be single `REG[]` + `FRAMES[]` windows.
4. `SC` mirror of `REG` — second authoritative store.
5. Direct `code[]` emitter — `src/ir/*` not controlling.
6. `CLOSE` handler no-op `vm-bytecode.js:1388` — open cells not detached.

## 12. Performance Bottlenecks (measured `bench_profiles.mjs:1`)

- `FAST` (lite) 0.14s, `BAL` (3L) 1.28s, `SEC` (4L2-round) 4.27s vs native 4ms (tiny) — `BAL` 320×, `SEC` 1068×.
- **Costs:** dispatch (`HAND` table lookup vs if-chain), `D()` vault per `CONST/NUMK`, `HAND` call overhead, `f(unpack)` host crossing (varargs `PK`/`UNPK`), `SC` scan (now `REG` direct ~fix), `encChain` 16-round (now 1-2 round tuned `src/profiles.js:1`).
- **Not yet measured separately:** `REG` access vs `SC`, `FRAMES` alloc, `decode` vs `decrypt`, `decompression` (not yet), `anti-tamper` (not yet).

## 13. Feature Matrix (strict, evidence-required)

See `FINAL_FEATURE_MATRIX.md` to be produced Phase 34; snapshot Phase 3 start: 13 IMPLEMENTED, 13 PARTIAL, 5 NOT (same as `PHASE2_REPORT.md:5` except `TAILCALL`/`CLOSE` now PARTIAL with behavioral `makeCounter`+`08_nested`).

## 14. Concrete Evidence (reproducible)

- `node hardening.test.mjs:1` 5/5 → per-build ciphers
- `node tools/phase1_differential.mjs:1` 13/13 →closures etc.
- `node tools/makeCounter_test.mjs:1` `12,even,12|...` → `REG`+`CLOSE`+`TAILCALL` basic
- `node tools/fuzz_test.mjs:1` 30/30 → VM correctness
- `node tools/seed_test.mjs:1` same seed identical → reproducibility
- `node bench_profiles.mjs:1` `FAST 0.14s BAL 1.28s SEC 4.27s` → profiles real
- `node tools/devirt.js:1` 5 HARD/4 EASY → self-analysis
- `node tools/target_test.mjs:1` lua54 throws → honest targets

## 15. Proposed Architecture (Phases 1-34, per master spec §4)

```
SOURCE → LEXER/PARSER (targets/lua51..luau) → AST → SEMANTIC → IR (src/ir) → CFG → OPTIMIZER (8 passes) → CONTROL-FLOW → VM IR → REG ALLOC (REG[BASE+id]) → CONSTANT VIRT → INSTRUCTION MUTATION/FUSION/SPLITTING → BYTECODE (FORMAT v2) → PER-BUILD VM (generators) → DISPATCHER/HANDLERS → ANTI-TAMPER/DEBUG → COMPRESSION → ENCRYPTION → LOADER → VM EXEC (FRAMES[FP])
```

Phases 0-3 handle IR/CFG scaffolding, `REG[]`/`BASE`/`FRAMES[]`, `CALL`/`TAILCALL`/`CLOSE`; Phases 4-6 handle `IR` wiring, optimizer, tables, constants; 7-10 handle control-flow, mutation, generated VM; 12-16 handle per-function `VMATTR`, profiles, debug, anti-tamper, compression; 17-21 handle targets/coro/errors/native; 22-27 handle devirt/diff/fuzz/diversity; 28-34 handle reproducibility/CLI/docs/final matrix.

