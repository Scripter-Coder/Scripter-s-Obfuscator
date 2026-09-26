# TOOLS_TARGETS.md — Toolchain & Target Inventory (Phase 4–8)

> Generated 2026-09-21 — Windows, reuse existing installs, do not reinstall available tools.

## Tool Inventory

| Tool | Detected version | Executable path | Target | Usable now | Notes |
|------|------------------|-----------------|--------|------------|-------|
| **node** | 24.18.0 | `C:\Program Files\nodejs\node.exe` | JS runtime, VM, CLI | **YES** | `node -v` 24.18.0, `package.json` engines |
| **npm** | 11.16.0 | `C:\Program Files\nodejs\npm.ps1` | JS package manager | **YES** | `npm --version` 11.16.0 |
| **npx** | 11.16.0 | `C:\Program Files\nodejs\npx.ps1` | Run JS CLIs | **YES** | via `vite` |
| **py** (launcher) | 3.13.4 | `C:\WINDOWS\py.exe` | Python 3.13 | **YES** | `py --version` 3.13.4, use `py -3` |
| **python** | — | `where python` not found | alias | **MISSING** (use `py`) | `TOOLS_AVAILABLE.md` already documents |
| **python3** | — | `where python3` not found | alias | **MISSING** (use `py`) | — |
| **git** | 2.55.0.windows.5 | `C:\Program Files\Git\cmd\git.exe` | VCS | **YES** | `.git` repo at workdir |
| **vite** | 5.4.0 | `node_modules/.bin/vite` | bundler | **YES** | `package.json:28` |
| **fengari** | 0.1.5 | `node_modules/fengari` | Lua 5.3 VM in JS | **YES** | differential, fuzz, bench `tools/*` |
| **luaparse** | 0.3.1 | `node_modules/luaparse` | Lua parser | **YES** | `vm-bytecode.js:151` |
| **lua** | — | not in PATH | Native Lua VM | **MISSING** | No `lua.exe` in `%PATH%` |
| **luac** | — | not in PATH | Lua compiler | **MISSING** | — |
| **luajit** | — | not in PATH | LuaJIT 2.1 | **MISSING** | Search `Downloads` + `PATH` found none |
| **luau** | — | not in PATH | Luau 0.709 | **MISSING** | — |
| **gcc** | — | not found | C compiler | **MISSING** | No MinGW/MSYS/WSL gcc |
| **clang** | — | not found | C compiler | **MISSING** | — |
| **cl.exe** | — | not found | MSVC | **MISSING** | `C:\Program Files\Microsoft Visual Studio` has no `cl.exe` (Build Tools not installed) |
| **cmake** | — | installer only | build | **MISSING** | `cmake-4.3.5-windows-i386.msi` in Downloads, not installed |
| **tar** | bsdtar 3.8.8 | `C:\Windows\System32\tar.exe` | archive | **YES** | `tar --version` bsdtar 3.8.8 |
| **unzip/zip** | — | not found | archive | **MISSING** (use `tar`/`Expand-Archive`) | — |

## Downloads — Lua Reference Runtimes

Inspected `C:\Users\Ryzen 9 5900x\Downloads` via `fs.readdirSync`:

| Candidate | Expected Path | Found | Size / Details | Usable as reference? |
|-----------|---------------|-------|----------------|----------------------|
| **Lua 5.3** | `%USERPROFILE%\Downloads\lua-5.3.5_Win64_bin` | **NOT FOUND** | Directory missing | No |
| **Lua 5.4** | `%USERPROFILE%\Downloads\lua-5.4.2_Win64_bin` | **NOT FOUND** | Directory missing | No |
| **lua-5.2.0.tar.gz** | `Downloads\lua-5.2.0.tar.gz` | **YES** | 246,377 bytes | **Source only** — not compiled, needs `gcc`/`cl` |
| **lua-5.3.0.tar.gz** | `Downloads\lua-5.3.0.tar.gz` | **YES** | 278,045 bytes | Source only — version **5.3.0** < final **5.3.6** |
| **lua-5.4.0.tar.gz** | `Downloads\lua-5.4.0.tar.gz` | **YES** | 349,308 bytes | Source only — version **5.4.0** < final **5.4.8** |
| **lua-5.5.0.tar.gz** | `Downloads\lua-5.5.0.tar.gz` | **YES** | 396,950 bytes | Source only — future, not Luraph target |
| **win64\** | `Downloads\win64\` | **YES** | NW.js bundle (node.dll, ffmpeg.dll) — not Lua | No |

### Lua Win64 binaries — NOT YET COMPILED

The `lua-5.3.5_Win64_bin` / `lua-5.4.2_Win64_bin` directories referenced in Phase 4 spec **do not exist** on this machine.

**Source archives** for 5.2.0 / 5.3.0 / 5.4.0 / 5.5.0 are present in `Downloads`, but **no compiler toolchain** (`gcc`, `clang`, `cl.exe`, `make`) is installed to build them:

- `where gcc` → not found
- `where clang` → not found
- `where cl` → not found (Visual Studio 2022 installed but Build Tools/VC++ component missing)
- `cmake` installer (`cmake-4.3.5-windows-i386.msi`) in Downloads **not installed**

**Action taken:** Documented as **NOT READY** — targets `lua53` / `lua54` will be implemented as abstractions with honest `NOT_IMPLEMENTED` status until a native reference runtime is built or downloaded. `fengari` (Lua 5.3 in JS) remains the differential reference for `lua51`.

> Luraph public reference versions: Lua 5.1.5, 5.2.4, 5.3.6, 5.4.8, Luau 0.709, LuaJIT 2.1. Do not claim 5.3.6/5.4.8/5.4.9 merely because an older `lua-5.3.0`/`lua-5.4.0` source archive exists.

## Current Known Runtime Candidates (spec §0)

| Candidate | Configured Path | Actual Version (if built) | Target | Usable now |
|-----------|-----------------|---------------------------|--------|------------|
| Lua 5.3 | `%USERPROFILE%\Downloads\lua-5.3.5_Win64_bin\lua.exe` | — (archive `5.3.0` != 5.3.6) | lua53 | **NO** — compile required |
| Lua 5.4 | `%USERPROFILE%\Downloads\lua-5.4.2_Win64_bin\lua.exe` | — (archive `5.4.0` != 5.4.8/5.4.9) | lua54 | **NO** — compile required |
| Lua 5.2 | `%USERPROFILE%\Downloads\lua-5.2.0.tar.gz` → `lua.exe` | 5.2.0 < 5.2.4 | lua52 | **NO** |
| Lua 5.5 | `%USERPROFILE%\Downloads\lua-5.5.0.tar.gz` | 5.5.0 (not Luraph target) | — | **NO** |
| LuaJIT | `Downloads` / `PATH` search | absent | luajit | **NO** |
| Luau | `Downloads` / `PATH` search | absent (`Cobalt.luau` etc. are scripts, not `luau.exe`) | luau | **NO** |

### Verification Commands Used (PowerShell/Node `fs`)

```powershell
# PowerShell — Downloads inspection (quoted for spaces in USERPROFILE)
node -e "const fs=require('fs'),p=require('path'),os=require('os');let d=p.join(os.homedir(),'Downloads');console.log(fs.readdirSync(d).join('\n'))"
Get-Command lua -ErrorAction SilentlyContinue
Get-Command luajit -ErrorAction SilentlyContinue
Get-Command luau -ErrorAction SilentlyContinue
```

Result: no `lua*` in `PATH`; no `lua-5.4.2_Win64_bin` / `lua-5.3.5_Win64_bin` directories.

## Target Status (honest, `src/targets/registry.js`)

| Target | Version | Reference Runtime | `src/targets/*.js` | Differential Tests | Status |
|--------|---------|-------------------|--------------------|--------------------|--------|
| **lua51** | 5.1.5 | `fengari` 0.1.5 (JS, 5.3 compat + `luaparse` `luaVersion:'5.1'`) | `src/targets/lua51.js` **IMPLEMENTED** | 35/35 + 100/100 fuzz **PASS** (`tools/differential_35.mjs`, `tools/fuzz_100.mjs`) | **IMPLEMENTED** |
| **lua52** | 5.2.4 | missing — source `lua-5.2.0.tar.gz` not compiled | stub not yet | — | **NOT IMPLEMENTED** (explicit `Lua 5.2 backend NOT READY — native reference runtime unavailable`) |
| **lua53** | 5.3.6 | missing — source `lua-5.3.0.tar.gz` not compiled, final is 5.3.6 | `src/targets/lua53.js` stub `NOT_IMPLEMENTED` | 0 | **NOT IMPLEMENTED** |
| **lua54** | 5.4.8 / 5.4.9 | missing — source `lua-5.4.0.tar.gz` not compiled, final is 5.4.8+ | planned `src/targets/lua54.js` | 0 | **NOT IMPLEMENTED** |
| **luajit** | 2.1 | missing | planned `src/targets/luajit.js` | 0 | **NOT IMPLEMENTED** |
| **luau** | 0.709 | missing (`luau.exe` not found) | planned `src/targets/luau.js` | 0 | **NOT IMPLEMENTED** |

> Each target `status = IMPLEMENTED` **only after** `target.supported = true` via differential tests against native runtime (spec §29). No `target != implemented ? pretend`.

## Build Variability (per-build ciphers + VM diversity)

Verified `hardening.test.mjs` + `tools/seed_test.mjs` + `tools/diversity_test.mjs`:

- Vault cipher `VP={a,b,c,m,d,iv,salt,saltStr,saltNum,saltMisc}` **per-build random** — 12/12 distinct shapes
- Blob cipher `BP={a,b,c}` per-build random
- `PROTO_SALT` (function ref XOR) per build, `JMP_SALT` (jump encoding) per build, `REG_SHIFT` per profile
- `OPCODES` randomized 500..60000 per build, handler order shuffled
- Same seed → byte-identical, different seed → materially different

## Next Steps to Obtain Native Runtimes (without violating "do not install merely because missing")

1. **Do NOT auto-install** `lua`/`luajit`/`luau` — spec §0: `Do NOT install anything merely because it isn't found`.
2. When explicitly requested, either:
   - **Compile from source** in `Downloads` using `tar -xzf` + `make` once a toolchain (`gcc`/`cl`/`make` or `cmake`) is made available, OR
   - **Download prebuilt official binaries** for Lua 5.3.6 (`lua-5.3.6_Win64_bin.zip`) and Lua 5.4.8/5.4.9 (`lua-5.4.x_Win64_bin.zip`) from lua.org / lua-builds — verify `lua.exe -v` reports expected final patch.
3. Until then, keep `fengari` + `luaparse` as **development/reference runtimes**, not final compatibility claims — HONEST.

## Commands to Verify When Binaries Become Available

```powershell
& "$env:USERPROFILE\Downloads\lua-5.4.2_Win64_bin\lua.exe" -v
& "$env:USERPROFILE\Downloads\lua-5.4.2_Win64_bin\luac.exe" -v
& "$env:USERPROFILE\Downloads\lua-5.3.5_Win64_bin\lua.exe" -v
& "$env:USERPROFILE\Downloads\lua-5.3.5_Win64_bin\luac.exe" -v
node tools/differential_35.mjs
node tools/fuzz_100.mjs
```
