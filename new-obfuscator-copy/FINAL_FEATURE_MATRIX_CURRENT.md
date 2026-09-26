# Current Feature Matrix — reconciled repository

| Feature | Current status | Evidence |
|---|---|---|
| VM-wide REG/BASE/TOP/FP/FRAMES scheduler | IMPLEMENTED + VERIFIED | scheduler architecture 8/8; edge 10/10; runtime baseline 10/10 |
| VM CALL/RETURN/TAILCALL/CLOSE | IMPLEMENTED + VERIFIED | 35/35 + scheduler/runtime suites |
| PCALL/XPCALL | IMPLEMENTED + VERIFIED | scheduler edge + runtime baseline |
| Persistent coroutine state | IMPLEMENTED + VERIFIED | scheduler edge + coroutine/metamethod 10/10 |
| Coroutine + metamethod scheduling | IMPLEMENTED + VERIFIED | 10/10 |
| AST → IR → CFG → optimizer → physical allocation → transforms → lowering | IMPLEMENTED + VERIFIED | production pipeline proof |
| Constant virtualization | IMPLEMENTED + VERIFIED | constant virtualization test |
| MBA | IMPLEMENTED + VERIFIED | production path/regression |
| INLINE | IMPLEMENTED + PARTIALLY VERIFIED | explicit production option; conservative scope |
| UNROLL | IMPLEMENTED + VERIFIED | focused UNROLL suite |
| Fusion | IMPLEMENTED + VERIFIED | production proof: 1 concrete fusion |
| Splitting | IMPLEMENTED + VERIFIED | production proof: 1 concrete split |
| Opcode mutation | IMPLEMENTED + VERIFIED | production proof: concrete mutation |
| Physical temporary allocation/reuse | IMPLEMENTED + VERIFIED | production proof: reuse/remapping |
| STACKALLOC | IMPLEMENTED + VERIFIED | 8/8 focused runtime cases; production `STACKNEW/GET/SET/LEN` |
| Safe CFG rewriting | IMPLEMENTED + VERIFIED | rewritten runtime 35; output differs; JMP 6 vs 3 |
| Arbitrary aggressive CFG flattening/reordering | NOT IMPLEMENTED | deliberately not claimed under absolute-PC ABI |
| Hard-coded globals | IMPLEMENTED + VERIFIED | 5/5 focused cases; HGLOB emitted |
| Static environment | IMPLEMENTED + PARTIALLY VERIFIED | runtime/feature coverage; conservative semantics |
| Debug-library protection | IMPLEMENTED + VERIFIED | normal + protected feature tests |
| Anti-tamper/state validation | IMPLEMENTED + VERIFIED | corruption rejection + state markers |
| Per-function attributes | IMPLEMENTED + PARTIALLY VERIFIED | STACKALLOC attribute changes production output |
| LuaJIT FFI subset/gating | IMPLEMENTED + VERIFIED (supported subset) | LuaJIT-only gating + native LuaJIT FFI native/obfuscated 17/17 |
| Lua 5.2.4 backend | IMPLEMENTED + PARTIALLY VERIFIED | backend/goto tests + exact Lua 5.2.4 runtime |
| Lua 5.3.6 backend | IMPLEMENTED + PARTIALLY VERIFIED | backend/goto tests + exact Lua 5.3.6 runtime |
| Lua 5.4.8 backend | IMPLEMENTED + PARTIALLY VERIFIED | common subset/goto + exact Lua 5.4.8 runtime |
| LuaJIT 2.1 backend | IMPLEMENTED; RUNTIME VERIFIED; TARGET-SEMANTICS VERIFIED (supported subset) | Exact supplied LuaJIT 2.1.1788856981 built natively; arithmetic/closures/varargs/multi-return/coroutines/metamethods/pcall/bit/FFI native-vs-obfuscated all PASS |
| Luau 0.709 backend | IMPLEMENTED + PARTIALLY VERIFIED | source normalization/backend test |
| Luau 0.709 runtime verification | BLOCKED BY ENVIRONMENT | supplied `luau-windows/luau.exe` is Windows PE; Linux cannot execute it; no Luau 0.709 source tree is supplied |
| Lua 5.4 `<close>` / `<const>` | NOT IMPLEMENTED | explicit parser/backend rejection |
| Luau `continue` / compound assignment | NOT IMPLEMENTED | explicit backend rejection |
| Universal LuaJIT FFI | NOT IMPLEMENTED | only supported LuaJIT subset is claimed |
| Intensity-10 Fengari completion | IMPLEMENTED + PARTIALLY VERIFIED | artifact semantic result reached; process termination is not consistently clean |

## 2026-09-23 LuaJIT verification pass

- Exact source: `/mnt/data/runtimes/src/LuaJIT-2.1`
- Exact source `.relver`: `1788856981`
- Built binary: `/mnt/data/runtimes/src/LuaJIT-2.1/src/luajit`
- Runtime banner: `LuaJIT 2.1.1788856981 -- Copyright (C) 2005-2026 Mike Pall.`
- Native-vs-obfuscated runtime suite: arithmetic 64/64; closures 17/17; varargs 3:19/3:19; multi-return 3,5,8/3,5,8; coroutines BC/BC; metamethods 10:9/10:9; pcall false:E/false:E; bit 48/48; FFI 17/17.
- LuaJIT target backend tests: basic 10 PASS; LuaJIT FFI lowering PASS; non-LuaJIT FFI rejection PASS.
- Intensity-10: the current Fengari smoke still does not terminate in a fresh process for the full bytecode-VM build. The same generated 1.08 MB output executes and exits cleanly under the exact native LuaJIT runtime in ~0.5 s. This evidence points to a Fengari/runtime-harness compatibility/performance issue rather than a generated-VM process-lifecycle failure. No VM behavior was weakened.
- Luau 0.709 runtime remains `BLOCKED BY ENVIRONMENT`; only Windows PE executables are available locally.
