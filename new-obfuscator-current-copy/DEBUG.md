# DEBUG.md — Debug Library Protection

**Spec §20 — Configurable handling for `debug.getinfo/getlocal/getupvalue/setupvalue/gethook/sethook/traceback`**

**Implementation:** `src/security/debugprotect.js:1`

- `DEBUG_APIS: ['getinfo','getlocal','getupvalue','setupvalue','gethook','sethook','traceback']`
- `debugProtectMode(config) → 'protected'|'normal'` (`true`/`'protected'` → protected, `false`/`'normal'` → normal, default protected for SECURE).
- `wrapDebugFunction(fnName, mode)` → `debug.fn` or `function(...) error("debug … protected") end`.

**Not yet fully wired into VM** — handler stubs not emitting `debug` traps into generated VM (marked `NOT IMPLEMENTED` in `FINAL_FEATURE_MATRIX.md`). Tests `normal mode` (virtualized functions allow debug), `protected mode` (error), closures/upvalues — planned.

**Current:** `custom-obfuscator.js` checks `string.dump` only; full library not yet virtualized. `TOOLS_TARGETS.md` notes `fengari` has real `debug.getinfo` (what="C" for native), so hook check works without tostring tricks — `obfuscator.test.mjs` checks `print/warn` overrides not triggering.

**When runtime available:** differentiate `lua51` `getfenv` vs `5.2+` `debug` behavior per target.
