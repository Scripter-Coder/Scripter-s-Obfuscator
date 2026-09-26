# LIMITATIONS.md — Known Limitations

## Language Coverage

- **Lua 5.1 only differential-validated** (`tools/differential_35.mjs` 35/35). Lua 5.2/5.3/5.4/LuaJIT/Luau are honest `NOT_IMPLEMENTED` stubs (`src/targets/*.js`) — source archives present but not compiled due to missing `gcc`/`make`/`cl` (`TOOLS_TARGETS.md`).
- **Coroutines (Phase 6.8.1 IMPLEMENTED for lua51)** — VM coroutines own persistent `REG/BASE/TOP/FP/FRAMES/CODE/PC/SC/LK/VA` scheduler state and resume the same `DRIVE_STATE` continuation. A host Lua coroutine remains only as the outer scheduling boundary. Post-change runtime proof is complete: 14/14 focused cases, 324/324 profile/seed cases, differential 35/35, fuzz 100/100, final fuzz 500/500, scheduler 324/324, PCALL/XPCALL 486/486.
- **Metamethods** — `TGET`/`TSET` via host `t[k]`, so `__index`/`__call` VM functions are `table` closures not host functions; `t(3)` table callable fails (`attempt to call a table value`).
- **Pcall** — dedicated PCALL/XPCALL opcodes re-enter VM closures through `RUN`, but exception catching still uses native `pcall`/`xpcall`; VM-owned protected-frame unwinding is not complete.
- **goto/labels, <close>/<const>, bitwise integer semantics** — parser `luaVersion:'5.1'` only; 5.3+/5.4 syntactic constructs throw honest error.

## Compiler

- **Denylist:** `getfenv/setfenv` word-boundary denied (`vm-bytecode.js:DENY`).
- **Optimizer:** `src/ir/optimizer.js` `constFolding` only for `NUMK+NUMK→OP` via `refs`, not yet SSA-level; length-preserving only where `patchLabels` safe.
- **Control-flow:** `branch inv` + `block split` profile-aware, but no `opaque predicate` or full flattening (spec forbids fake before IR — honest `NOT` for opaque).

## Security

- **Devirt:** `tools/devirt.js` 5 HARD (vault/decoder/CFG/consts/funcs/high-level), but `HAND` still lexical `HAND[...]=function` visible, `ADD` handler `a + b` pattern visible — needs handler struct hiding.
- **Anti-tamper:** Vault/blob FNV + checksum+HMAC in outer layers, not yet handler/dispatcher/metadata polling.

## Size/Perf

- **Compression:** VM image compression is integrated and validated end-to-end. The current codec is escaped RLE, so compression can increase size on small/random images.
- **Large scripts:** `obfuscate-file.mjs` O(n) `escParts.join` fixed (`custom-obfuscator.js` old `string+=` was O(n²)), but 100k-line scripts still slow single-wrap prod 16-round (now 2-round SECURE).

## Current final limitations
The Lua51 production IR/CFG path is implemented. Register renaming remains conservative because lexical/captured IDs are ABI-visible. Fusion/splitting remain partial because their existing pseudo-op candidates have no matching generated VM handlers. VM arithmetic and __newindex metamethods using VM closures remain partial. Other target runtimes remain unavailable locally.

## Final-pass remaining limitations

Physical register renaming/reuse is still constrained by the closure/upvalue ABI. VM arithmetic/comparison/length/concat metamethod closures remain partial; `__newindex` is now scheduler-native. Debug protection is not implemented as an anti-debug feature. Lua 5.2/5.3/5.4/LuaJIT/Luau remain unsupported without locally available reference runtimes. Intensity-10 double-wrap remains a stress/performance case requiring a controlled profiling/optimization pass.
