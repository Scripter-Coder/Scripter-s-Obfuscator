# LIMITATIONS.md — Known Limitations

## Language Coverage (updated 2026-09-23)

- **Lua 5.1 only differential-validated** (`tools/differential_35.mjs` 35/35). Lua 5.2/5.3/5.4/LuaJIT/Luau are honest `NOT_IMPLEMENTED` stubs (`src/targets/*.js`) — source archives present but not compiled due to missing `gcc`/`make`/`cl` and filesystem MCP isolation (see FINAL_COMPLETION_TRACKER.md blockers). StaticEnv/Compat/Debug now IMPLEMENTED for lua51.
- **Coroutines** — VM frames `FRAMES` exist but `CALL` for `isVM` closures still host `f(unpack)`; `coroutine.create(VM closure)` fails (`bad argument #1`). Needs `RUN` re-entry without host.
- **Metamethods** — `TGET`/`TSET` via host `t[k]`, so `__index`/`__call` VM functions are `table` closures not host functions; `t(3)` table callable fails (`attempt to call a table value`).
- **Pcall** — protected frame state not fully virtualized (still host `pcall` for VM→VM).
- **goto/labels, <close>/<const>, bitwise integer semantics** — parser `luaVersion:'5.1'` only; 5.3+/5.4 syntactic constructs throw honest error.

## Compiler

- **Denylist:** `getfenv/setfenv` word-boundary denied (`vm-bytecode.js:DENY`).
- **Optimizer:** `src/ir/optimizer.js` `constFolding` only for `NUMK+NUMK→OP` via `refs`, not yet SSA-level; length-preserving only where `patchLabels` safe.
- **Control-flow:** `branch inv` + `block split` profile-aware, but no `opaque predicate` or full flattening (spec forbids fake before IR — honest `NOT` for opaque).

## Security

- **Devirt:** `tools/devirt.js` 5 HARD (vault/decoder/CFG/consts/funcs/high-level), but `HAND` still lexical `HAND[...]=function` visible, `ADD` handler `a + b` pattern visible — needs handler struct hiding.
- **Anti-tamper:** Vault/blob FNV + checksum+HMAC in outer layers, not yet handler/dispatcher/metadata polling.

## Size/Perf

- **Compression:** RLE stub present, not yet in `emitVM` blob pipeline; no `lz-string` benchmark for `uncompressed vs compressed load/decompress` yet.
- **Large scripts:** `obfuscate-file.mjs` O(n) `escParts.join` fixed (`custom-obfuscator.js` old `string+=` was O(n²)), but 100k-line scripts still slow single-wrap prod 16-round (now 2-round SECURE).
