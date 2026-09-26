# TOOLS_AVAILABLE.md — Toolchain Inventory 2026-09-21 (Windows, no new installs)

> **Rule:** Reuse existing tools. Do not reinstall available tools. `MISSING` only for truly absent.

## Inventory

| Tool | Version | Path | Available | Purpose | Used by project |
|------|---------|------|-----------|---------|-----------------|
| **node** | 24.18.0 | `C:\Program Files\nodejs\node.exe` | **YES** | JS runtime, builds, tests, VM, CLI | `package.json:6` `dev/build/test:obfuscator` `fengari` `luaparse` |
| **npm** | 11.16.0 | `C:\Program Files\nodejs\npm.ps1` | **YES** | JS package manager | `package-lock.json:3` |
| **npx** | 11.16.0 | `C:\Program Files\nodejs\npx.ps1` | **YES** | Run JS CLIs without global install | `vite` |
| **py** (Python launcher) | 3.13.4 | `C:\WINDOWS\py.exe` | **YES** | Python 3.13 via `py --version` / `py -3` | `deob.py:1`, `apply_luraph_grade.py`, patch `*.py` |
| **python** | — | `where python` not found | **MISSING** (use `py`) | Alias for `py` | — |
| **python3** | — | `where python3` not found | **MISSING** (use `py`) | Alias | — |
| **lua** | — | not in PATH | **MISSING** | Native Lua VM | **Not needed** — `fengari` provides Lua 5.3 VM in JS `tools/*` |
| **lua5.1** | — | not found | **MISSING** | Lua 5.1 VM | Not needed — `fengari` + `luaparse` `luaVersion:'5.1'` |
| **lua5.2** | — | not found | **MISSING** | — | — |
| **lua5.3** | — | not found | **MISSING** | — | — |
| **lua5.4** | — | not found | **MISSING** | — | — |
| **luajit** | — | not found | **MISSING** | LuaJIT 2.1 | Not needed until Phase 17 `luajit` target |
| **luac** | — | not found | **MISSING** | Lua bytecode compiler | Not needed — custom `vm-bytecode.js` + `luaparse` |
| **gcc** | — | not found | **MISSING** | C compiler | Not needed — JS-only, `fengari` is JS |
| **clang** | — | not found | **MISSING** | C compiler | — |
| **cmake** | — | not found | **MISSING** | — | — |
| **make** | — | not found | **MISSING** | — | — |
| **gdb** | — | not found | **MISSING** | — | — |
| **lldb** | — | not found | **MISSING** | — | — |
| **git** | 2.55.0.windows.5 | `C:\Program Files\Git\cmd\git.exe` | **YES** | VCS | `.git/` |
| **unzip** | — | not found | **MISSING** | Archive | Use PowerShell `Expand-Archive` |
| **zip** | — | not found | **MISSING** | Archive | Use PowerShell `Compress-Archive` |
| **vite** | 5.4.0 | `node_modules/.bin/vite` via `npx vite` | **YES** | JS bundler/dev | `package.json:28` `vite.config.js` |
| **fengari** | 0.1.5 | `node_modules/fengari` | **YES** | Lua 5.3 VM in JS (differential, fuzz, bench) | `tools/*`, `obfuscator.test.mjs`, `vm-stack.test.mjs` |
| **luaparse** | 0.3.1 | `node_modules/luaparse` | **YES** | Lua parser (AST, `luaVersion`) | `vm-bytecode.js:151`, `vm-pass.js`, `src/parser` |
| **pnpm** | — | `C:\Users\Ryzen 9 5900x\AppData\Local\pnpm\bin` | **YES** (alt) | JS pkg | — |

## Project-Specific

| Area | Tool | Status |
|------|------|--------|
| Parser/compiler | `luaparse` 0.3.1 | **YES** — `vm-bytecode.js:151` `luaVersion:'5.1'`, `src/parser` |
| VM/debug | `fengari` 0.1.5 | **YES** — `tools/*`, `bench_profiles` `FAST/BAL/SEC` |
| Devirtualization | `tools/devirt.js:1` `deob.py:1` | **YES** — 9-task harness `EASY/MEDIUM/HARD` |
| Tests | `node` + `luaparse` + `fengari` | **YES** — `package.json:20` `test` runs 11 `*.test.mjs` |
| JS builds | `vite` 5.4 | **YES** — `npm run build` |
| C experiments | `gcc/clang` | **MISSING** — not needed (JS VM) |
| Bytecode inspection | `luac` | **MISSING** — use `vm-bytecode.js` `CH` decode + `tools/devirt.js` |
| Perf bench | `node` + `fengari` | **YES** — `tools/bench.js` `tools/bench_profiles.mjs` `native/FAST/BAL/SEC` |

## Recommended Environment (ONLY existing tools)

**Do not install Lua binaries — use `fengari` + `luaparse` already in `node_modules`.**

- **Compilation:** `node` + `luaparse` `vm-bytecode.js:151` (target `lua51` honest `src/targets/registry.js:1`), `vite` for JS
- **Running Lua:** `fengari` `lauxlib.luaL_newstate` `tools/*` — differential vs native `lua` not needed
- **Bytecode:** `luaparse` AST + `vm-bytecode.js` `CH` blob `BP` cipher + `tools/devirt.js:1` 9 tasks
- **Differential:** `node tools/phase1_differential.mjs:1` 13/13 + `tools/fuzz_test.mjs:1` 30/30 + `tools/makeCounter_test.mjs:1`
- **Fuzzing:** `node` generator `tools/fuzz_test.mjs:1` (100+ planned Phase 24)
- **JS builds:** `npx vite` / `npm run dev|build` `vite.config.js:1`
- **C experiments:** **skip** — JS VM, no `gcc` needed
- **Debugging:** `node --inspect` + `console` + `fengari` stack `lua_tostring` + `luaparse` errors
- **Bytecode inspection:** `tools/devirt.js:1` + `deob.py:1` (via `py`) + `CH.maxReg` `vm-bytecode.js:960`
- **Perf bench:** `node bench_profiles.mjs:1` `native 4ms FAST 0.14s BAL 1.28s SEC 4.27s` (already `tools/bench*`)

**Missing → alternatives:**

- `python`/`python3` → `py` / `py -3` (3.13.4) for `deob.py`
- `lua*`/`luac` → `fengari` (Lua 5.3) + `luaparse`
- `gcc`/`clang`/`cmake`/`make`/`gdb` → not needed (no C)
- `unzip`/`zip` → `Expand-Archive`/`Compress-Archive` PowerShell

**Build with existing env:**

```powershell
npx vite build
node obfuscator.test.mjs
node hardening.test.mjs
node tools/phase1_differential.mjs
node tools/fuzz_test.mjs
node bench_profiles.mjs
py deob.py protected.lua -o out.lua
```

No new dependency needed until `luajit`/`luau` targets (Phase 17) — then add `luajit` binary, otherwise `fengari` suffices.
