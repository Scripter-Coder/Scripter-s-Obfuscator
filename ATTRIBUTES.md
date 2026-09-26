# ATTRIBUTES.md — Per-Function Attributes

**Spec §17 — Replace limited `-- @VM` parser with real metadata architecture.**

## Syntax

Project-specific `VMATTR(...)` — not Luraph copy:

```lua
VMATTR(VM=SECURE, PRESET=SECURE, TRANSFORM=CONTROL_FLOW, INLINE=true, UNROLL=true, MBA=STRONG, STACKALLOC=true, DEBUG=false, CONSTANTS=strong, CONTROL_FLOW=heavy)
```

Supported keys: `VM, PRESET, TRANSFORM, INLINE, UNROLL, MBA, STACKALLOC, DEBUG, CONSTANTS, CONTROL_FLOW, TARGET, COMPRESSION, STATIC_ENV, COMPAT` — see `src/ast/perfunc-enhanced.js:SUPPORTED_KEYS`.

Legacy: `-- @VM SECURE` within 3 lines of `function` (`src/ast/perfunc.js:PRESET_RE`).

## Propagation

`parseVMAttr(src)` → `[{raw, attrs, index}]` regex `VMATTR\s*\(([^)]+)\)` split `,` `=` trim, bool/int coercion.

`attachEnhancedPerFuncMeta(ast, src)` → `Map<node, attrs>` line-based (5 lines before func), merges onto `perFuncMap` (takes precedence).

`inheritedMeta(funcMap, ast)` — parent settings propagate to nested unless overridden (documented inheritance).

**Flow:** `src` → `AST` (luaparse locations) → `perFuncMap` → `IR` → `optimizer` → `lowering` → `VM generator` (profile per chunk `vm-bytecode.js:915` `profile: _chunkProfile`, per-function `compileFunctionChunk`).

## Test

`test_perfunc.mjs` — `chunks[SECURE, FAST, BALANCED]` PASS; `tools/final_matrix_test.mjs` `VMATTR` mixed PASS (`f(5)+g(5)=25`).

Parent inheritance: outer `VM=SECURE` without inner override → inner inherits SECURE (via `inheritedMeta`).
