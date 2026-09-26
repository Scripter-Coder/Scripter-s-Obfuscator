# TARGETS.md — Lua Targets

**Registry:** `src/targets/registry.js:1` `getTarget(name)`, `listTargets()`, `targetCapabilities(name)` → `{parse, compile, capabilities, semantics, unsupportedFeatures, supported:true/false}`

| Target | Version | Parser | Status | Reason | Differential |
|--------|---------|--------|--------|--------|--------------|
| **lua51** | 5.1.5 | `luaVersion:'5.1'` | **IMPLEMENTED** | — | `tools/differential_35.mjs` 35/35, `tools/fuzz_100.mjs` 100/100, `test_close.mjs` 8/8, `makeCounter` 3 configs PASS |
| **lua52** | 5.2.4 | `5.2` | **NOT IMPLEMENTED** | `Lua 5.2 backend NOT READY — native reference runtime unavailable` (`Downloads/lua-5.2.0.tar.gz` 246k source not compiled) | — |
| **lua53** | 5.3.6 | `5.3` | **NOT IMPLEMENTED** | `Downloads/lua-5.3.5_Win64_bin` missing, have `lua-5.3.0.tar.gz` 278k < final 5.3.6 not compiled | `tools/target_test.mjs` honest throw PASS |
| **lua54** | 5.4.8/5.4.9 | `5.4` | **NOT IMPLEMENTED** | `lua-5.4.2_Win64_bin\lua.exe not found`, have `lua-5.4.0.tar.gz` 349k < final not compiled | Not differential until `lua.exe -v` 5.4.8+ |
| **luajit** | 2.1 | `5.1`+FFI | **NOT IMPLEMENTED** | `luajit.exe not found` in `Downloads`/`PATH`, `ENABLE_FFI` target-specific | — |
| **luau** | 0.709 | Luau | **NOT IMPLEMENTED** | `luau.exe` not found | — |

**Honesty:** `status=IMPLEMENTED` only after differential passes (spec §29). No `target != implemented ? pretend`. `TOOLS_TARGETS.md` documents discovery.

**Target-specific semantics (Phase 7 stubs):**

- `lua54.js`: integers/64-bit, floats/double, `<close>` `__close`, `<const>`, `goto/labels`, coroutine, `_ENV`, metamethods, varargs/closures — all `NOT_IMPLEMENTED` until runtime.
- `lua53.js`: integer/float, bitwise `<<>>`, `&|~`, `//`, `utf8` lib etc. — stub.
- `lua52.js`: `_ENV`, yieldable pcall, `goto`, bit32, ephemeron — stub.
- `lua51.js`: `getfenv/setfenv`, varargs, coroutines, closures, tailcalls — `IMPLEMENTED` via `fengari` differential.
- `luajit.js`: `ffi` gated via `ENABLE_FFI`, JIT interaction — `NOT_IMPLEMENTED`.
- `luau.js`: type syntax, iteration, Roblox env — isolated.

**CLI:** `node cli.mjs --target lua54 …` → honest error with available list.
