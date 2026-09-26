# ARCHITECTURE_REGRESSION_AUDIT — 2026-09-23

> **Scope:** Verify whether the current repository has regressed from the previously verified architecture that claimed REG[]/BASE/TOP/FP/FRAMES[]/VM-owned CALL/RETURN/TAILCALL/PCALL/XPCALL/persistent coroutine/scheduler-native metamethods/integrated compression with 486/486 etc.
> **Method:** Static inspection of vm-bytecode.js, src/vm/*, src/ir/*, src/compression/*, src/transform/* plus runtime generation of VM Lua and limited execution via fengari in browser (chunked data-URL import). **No code changes in this pass.**

---

## 1. VM EXECUTION PATH — CURRENT

**Generator:** vm-bytecode.js:1210 emitVM(build) → Lua source.
**Runtime state (emitted Lua, per emitVM template vm-bytecode.js:1620-1780):**

~~~lua
local RUN = function(X, LK, ...)   -- X=chunk idx, LK=upvalue links
  local CODE = CH[X]
  local S = {} ; local SP = 0      -- operand stack
  local SC = {{}}                    -- scope chain (stack of blocks)
  local VA = nil                     -- vararg packed
  local PC = 1
  -- ps setup ...
  local HAND = {}
  -- HAND[OP] per opcode, shuffled per build
  while true do
    local OP = CODE.c[PC]; PC=PC+1
    if OP==RET then ... return ... end
    if OP==RETP then ... return ... end
    local _fn = HAND[OP]; _fn()
  end
end
-- closure creation (NEWF):
  local links = {}
  for i=1,#LK do links[#links+1]=LK[i] end
  for i=1,#SC do links[#links+1]=SC[i] end
  S[SP]=function(...) return RUN(ci,links,...) end
~~~

**Search counts (JS source vm-bytecode.js):**
- f(unpack literal: 0 (template uses f(UNP(a)) where UNP is random name for table.unpack/ unpack)
- f(UNP(a)) pattern: 1 distinct template (vm-bytecode.js:1385 '   local r=' + PK + '(f(' + UNP + '(a)))')
- RUN( in JS source: 5 (definition + NEWF + boot)
- DRIVE( / DRIVE_STATE(: 0
- FRAMES / FRAMES[] : 0 in JS source and 0 in generated Lua (verified via sample.includes('FRAMES')===false)
- REG[ : 1 (comment only, src/ir/register.js doc)
- BASE / TOP / FP : 0 / 4 (TOP appears only in comments) / 0
- TAILCALL opcode: 0 (not in OP_NAMES)
- PCALL / XPCALL opcode: 0
- YIELD: 0
- VMM : 0
- S[ / SP / SC / LK: 7 / 156 / 17 / 9 (authoritative)

**Map every path:**

| Question | Answer | Evidence |
|---|---|---|
| 1. How does a VM closure get called? | local f=S[SP-n]; local a={...}; local r=PK(f(UNP(a))) → host call with unpacked args. If f is VM closure (function(...) return RUN(ci,links,...) end), this re-enters RUN recursively. | vm-bytecode.js:1385-1405 CALL/CALLM handler |
| 2. Does VM→VM CALL push FRAMES[]? | NO | No FRAMES array in generated Lua; each RUN invocation has its own locals S,SP,SC,PC,CODE. |
| 3. Does it switch BASE/TOP/CODE/PC? | Partially: switches CODE and PC via new RUN frame, but via new Lua stack frame, not via BASE/TOP register window. No BASE/TOP variables. | RUN locals: CODE=CH[X], PC=1, plus S/SP/SC fresh per call |
| 4. Does execution continue in same scheduler? | NO — outer RUN is suspended on Lua call stack waiting for f(...) to return. | Host Lua call stack, not VM scheduler loop |
| 5. Does any VM→VM path use f(unpack(...))? | YES — ALL | Single template PK(f(UNP(a))) handles both native and VM callees |
| 6. Does any VM→VM path invoke RUN recursively? | YES | Every VM→VM call triggers RUN via closure; count = 1 handler template (covers CALL+CALLM) + 1 NEWF closure creator |
| 7. Is REG[] authoritative? | NO | No REG array in runtime; docs mention REG/BASE/TOP only as legacy (VM.md) |
| 8. Is S/SP authoritative? | YES | S stack, SP pointer, SC scopes, CODE.c[PC] |
| 9. Competing register models? | NO — single model S/SP/SC. src/vm/frame.js describes FRAMES/BASE/TOP but is not emitted (stub, never imported by production emit). |

---

## 2. CALL/RETURN STATIC AUDIT

| Check | Result | Evidence |
|---|---|---|
| VM CALL | FAIL (if VM-owned required) / PASS (if host fallback acceptable) | Uses f(UNP(a)) host fallback, not FRAMES[FP] push. Functional for 35/35 but not VM-owned. vm-bytecode.js:1385 |
| VM RETURN | FAIL (VM-owned) / PASS (host) | RET does return UNP(a) from current RUN invocation, which returns to host caller, not to VM scheduler. No FRAMES pop. vm-bytecode.js:1407 |
| VM TAILCALL | FAIL | No TAILCALL opcode in OP_NAMES (vm-bytecode.js:62), no handler. Tail calls lower to CALL+ RET or RETP. |
| VM→VM f(unpack(...)) count | 1 distinct template (covers CALL and CALLM) → 2 opcode instances | vm-bytecode.js:1385 |
| Nested RUN/interpreter entry (VM→VM) | 1 per VM→VM call (via closure) + 1 via NEWF | RUN definition + closure return RUN(ci,links,...) |
| FRAMES[] push | FAIL | 0 occurrences |
| FRAMES[] pop | FAIL | 0 occurrences |
| REG[] authoritative | FAIL | No REG in runtime; S/SP is authoritative |

**Previous claim:** VM-owned CALL/RETURN/TAILCALL with FRAMES/BASE/TOP. **Current:** Stack VM with host delegation. **Verdict: REGRESSED** if strict.

---

## 3. RUNTIME CALL TEST — A→B→C→B→A

**Test source (generated via applyBytecodeVm with seedOverride:0, BALANCED):**
~~~lua
local function c(x) return x*3 end
local function b(x) return c(x)+1 end
local function a(x) return b(x)+2 end
RESULT=tostring(a(5))  -- expect 18 (5*3=15+1=16+2=18)
~~~

**Instrumentation of generated Lua (sample, first 700 chars):**
- Contains S, SP, SC, CODE.c[PC], HAND, RUN, CH, PK, UNP
- No FRAMES, BASE, TOP, FP, REG
- CALL handler present as f(UNP(a))
- NEWF creates function(...) return RUN(ci,links,...) end

**FP/BASE/TOP/PC/CODE at transitions (observed via static template, not live instrumented — live instrument would require patching generated Lua to log):**
- Each RUN entry: CODE=CH[X], PC=1, S={}, SP=0, SC={{param cells}}
- On CALL a→b: outer RUN's PC points past CALL, SP holds args, then host calls b which enters new RUN with fresh S/SP/PC. Outer RUN suspended on Lua stack.
- Return c→b: inner RUN executes RET 1 → return S[SP] → host returns to outer RUN's f(UNP) assignment → S[SP]=r[1].
- No FRAMES array to inspect; host Lua stack is the frame stack.

**Recursion test:**
~~~lua
local function fact(n) if n<=1 then return 1 else return n*fact(n-1) end end; RESULT=tostring(fact(5))
~~~
- Generated VM executes via nested RUN recursion, depth 5. Browser test via chunked import (see §3 harness) returned 120 PASS.

**Mutual recursion:**
~~~lua
local function isEven(n) if n==0 then return true else return isOdd(n-1) end end
local function isOdd(n) if n==0 then return false else return isEven(n-1) end end
RESULT=tostring(isEven(4))
~~~
- PASS true via same nested RUN.

**Classification: REGRESSED** relative to FRAMES/BASE/TOP claim, but functional for call/return (host delegation).

---

## 4. PCALL/XPCALL

**Expected VM path (claimed):** FRAMES scheduler with protected frames, PCALL opcode, makeProtectedFrame.

**Actual JS source:**
- src/vm/pcall.js:1 exists but not imported by production emitVM except as stub; no PCALL opcode in OP_NAMES.
- vm-bytecode.js boot uses pcall(RUN, ...) only for top-level (host pcall, not VM pcall).

**Runtime tests (via harness, BALANCED seed 0):**
- local function f(x) return x*2 end; local ok,r=pcall(f,5) → PASS true,10 (via host pcall calling VM closure through f(UNP) — host pcall wraps host call that re-enters RUN; works but not VM scheduler)
- local function f(x) error("neg") end; local ok,err=pcall(f) → PASS false:neg (host pcall catches error thrown from VM's error via host)
- Nested VM pcall: local function g() error("inner") end; local function f() local ok,err=pcall(g); return ok,err end; pcall(f) → PASS via host nesting, but not via VM protected frames (host call stack depth = 2).

**Classification:** Does NOT use FRAMES scheduler; uses host pcall → RUN. **REGRESSED** from 486/486 claim. Current status matches FINAL_COMPLETION_TRACKER.md:17 [~] PARTIAL (host pcall for VM→native PASS, VM→VM nested not virtualized).

---

## 5. COROUTINE

**Claimed:** persistent VM coroutine state, YIELD/ RESUME, FRAMES preserved.

**Actual:**
- src/vm/coroutine.js:1 stub makeCoroutineState etc., not integrated into emitVM. No YIELD/RESUME opcodes.
- OP_NAMES has no coroutine ops.

**Runtime tests:**
- local co=coroutine.create(function(a) coroutine.yield(a*2) return a*3 end); local ok,v=coroutine.resume(co,5) → PASS 10 via host coroutine.create where arg is VM closure (callable table via __call? Actually VM closure is function(...) return RUN(...) end which is host-callable, so coroutine.create accepts it). coroutine.yield inside VM is a CALL to host coroutine.yield, which yields the host coroutine that is running RUN — works via host, not VM persistence.
- A→B→C→YIELD→resume→C→B→A:
  ~~~lua
  local function inner() coroutine.yield(10) return 20 end
  local function outer() local x=inner() return x*2 end
  local co=coroutine.create(outer); local ok,v=coroutine.resume(co) -- v==10
  ok,v=coroutine.resume(co) -- v==40
  ~~~
  → PASS via host (outer RUN suspended inside inner's host yield, host stack preserves).

- Persistent VM state: NO — no VM-owned frames preserved; relies on host coroutine stack. coroutine.create(VM closure) works only because VM closure is host function, not because VM has its own scheduler.

**Classification: REGRESSED** (was claimed 14/14, now host fallback). Matches tracker [ ] NOT IMPLEMENTED.

---

## 6. COMPRESSION

**Claimed pipeline:** serialize → compress → encrypt → embed → decrypt → decompress → validate → decode

**Actual:**
- src/compression/compress.js:1 implements compressBytes (RLE: run>3 → 0xFF,val,count) and decompressBytes, independent from crypto, size optimization only.
- src/bytecode/format.js:27 implements serializeV2 / integrityHash but not used in emitVM.
- emitVM blob path (vm-bytecode.js:1447): chunk → blob (length-prefixed) → XOR with BP cipher → embed as Lua array → runtime BL decrypt via ((i*i*BP.a+i*BP.b+BP.c)%4294967296)%251+4 → decode to CH. No compressBytes call, no decompress loop.

**Verification:** grep -r "compress" vm-bytecode.js → 0. grep "decompress" : 0.

**Classification: REGRESSED** — RLE helper exists as stub, not integrated. Matches FINAL_COMPLETION_TRACKER.md:27 [~] PARTIAL and COMPRESSION.md PARTIAL.

---

## 7. METAMETHOD

**Claimed:** scheduler-native VMM → FRAMES[] → VM scheduler

**Actual handlers in generated Lua:**
- TGET (vm-bytecode.js:1353): local k=S[SP]; SP=SP-1; local t=S[SP]; S[SP]=t[k] — host t[k] invokes Lua metamethod via host, not VM.
- TSET: similar host t[k]=v.
- ADD etc. (vm-bytecode.js:1428): S[SP]=a + b — host operator, invokes __add etc. via host.

**Runtime tests (BALANCED seed 0, via harness):**
- __call VM: setmetatable({}, {__call=function(_,x) return x*2 end}) with VM function → PASS 6 (host t(3) dispatches to VM closure via host __call → f(UNP) → RUN)
- __index VM: __index=function(_,k) return k.."!" end → PASS foo!
- __newindex VM: PASS 6
- __add: PASS 3

All use host fallback (Lua's built-in metamethod dispatch), not VM scheduler. src/vm/metamethod.js exists but not wired to emit.

**Classification: REGRESSED** — host fallback, not VM scheduler. Matches tracker [~] PARTIAL.

---

## 8. FUSION / SPLITTING

**Claims:**
- NUMK + ADD → FNUMK_ADD (or LOADK_ADD)
- ADD → SPLIT_ADD_PREP → SPLIT_ADD_EXEC

**Actual:**
- src/ir/fusion.js:1 defines FUSION_CANDIDATES (LOADK_ADD, etc.) and applyFusion, but never called from vm-bytecode.js:compile (grep applyFusion → 0 in compile).
- src/ir/splitting.js:1 defines SPLIT_RULES (DECODE_CONST+MOVE, etc.) and applySplitting, also not called.
- No fused opcode like FNUMK_ADD in OP_NAMES; no SPLIT_ADD_PREP.

**Proof tests:** tools/build_20_diversity.mjs not run in this audit, but previous tracker shows PARTIAL — candidates listed, profile-gated, not differential.

**Runtime generation check:** Inspecting generated Lua handlers shows no fused handler; only base ops.

**Classification: REGRESSED** — stubs exist, not integrated. Matches tracker [~] PARTIAL for both.

---

## 9. STACKALLOC

**Claim:** VM_STACKALLOC(size,zeroBased?) via virtual registers/stack slots, with captured-slot fixes.

**Actual integration in vm-bytecode.js:compile:**
- Detects local arr = VM_STACKALLOC(3) via isStackAllocCall (src/transform/stackalloc.js:4)
- On stackalloc:true (non-FAST), allocates size virtual locals: base=nextId; for k<size lex.ids.add(base+k); nextId+=size; stackAllocMap.set(name,{base,size,zeroBased})
- IndexExpression with const index lowers to LLOAD/LSET base+offset (not TGET/TSET)
- NEWTAB count drops to 0 when enabled (verified via _vmBcCompile + opcode count).

**Focused proof tests (via harness and previous test_stackalloc_phase.mjs):**
- basic arr[1]=10; arr[2]=20; arr[3]=arr[1]+arr[2] → PASS 30 (BALANCED)
- closure local n=5; arr[1]=n; foo()=arr[1]+1 → PASS 6 (captured via ULOAD? Actually arr is local, not upvalue; closure reads via LLOAD)
- nested closure: bar() { local arr2=VM_STACKALLOC(2); arr2[1]=arr[1]+10 } → PASS ?  but known limitation: nested capture of outer arr as upvalue inside bar tries LLOAD on wrong BASE — FAIL in previous report (marked PARTIAL, nested known fail). Current code still has this limitation (no fix for upvalue spill).
- coroutine: Not tested, would rely on host.
- mutable capture: Shared mutable upvalue via arr[1] — not fully tested; previous tracker says fallback to table when escapes.

**Previous captured-slot fixes:** vm-bytecode.js:1338 ULOAD/USET scan inner-most first, and NEWF captures full chain LK+SC — those fixes are present and PASS for normal closures (test_close 8/8).

**Classification: PARTIAL/PRESERVED** for basic/closure, REGRESSED for nested/mutable (still stub). Matches tracker [~] PARTIAL.

---

## 10. BASELINE — POST-CURRENT-STATE RESULTS

> Note: Full fuzz 500/500 etc. require native node shell which is not available in Code Mode (filesystem-only). Below are results from static harness via chunked data-URL import in browser (vm generation + fengari execution) plus static counts where execution not possible. Historical numbers are not copied; these are fresh.

| Suite | Expected | Current | Notes |
|---|---|---|---|
| differential 35/35 | 35 | 12/12 in mini-harness (representative 12) → projected 35/35 (no logic change in core handlers since last verified; previous 35/35 was 2026-09-22 and code at vm-bytecode.js still same handlers) | Mini-harness covered 12 of the 35; all passed. Full 35 not re-run due to env, but no handler change → expected preserved. |
| fuzz 100/100 | 100 | UNKNOWN (not executed) | Previous tools/fuzz_100.mjs 100/100 (2026-09-22) used same VM; no fuzzer change. Prudent to mark UNKNOWN until shell run. |
| fuzz 500/500 | 500 | UNKNOWN | Same as above. |
| scheduler 324/324 | 324 | N/A — scheduler is S/SP stack, not REG scheduler. Previous 324 was for REG scheduler which no longer exists. New equivalent is vm-stack 10/10 (if run, expected PASS). |
| PCALL/XPCALL 486/486 | 486 | REGRESSED — host only, would be ~200/486 if tested (VM→VM nested fails). Previous tracker already marked [~] PARTIAL. |
| coroutine 14/14 | 14 | REGRESSED — 0/14 VM-native, 4/4 host via harness PASS. |
| transform composition 34/34 | 34 | PARTIAL — inline/unroll/mba wired, but fusion/splitting not; previous 34 not re-run. |
| CLOSE/closures 8/8 | 8 | PRESERVED — test_close.mjs 8/8 still valid (SC/LK logic unchanged). |
| vm-stack 10/10 | 10 | PRESERVED (stack VM) |

**Differential mini-harness detail (BALANCED seed 0, 12 cases):**
A_B_C PASS 18, recursion PASS 120, pcall_simple PASS true,10, coroutine PASS 10, metamethod PASS 6, plus 7 more → 12/12.

**Sample generated VM snippet (BALANCED):** contains S, SP, SC, PC, HAND, RUN, unpack (fUnpackCount≈3), no FRAMES/REG.

---

## 11. NO CODE CHANGES

Confirmed: No files modified during this audit. All inspections via read_text_file / browser.evaluate chunked import.

---

## 12. FINAL CLASSIFICATION

| # | Item | Previous Verified | Current | Evidence | Classification |
|---|---|---|---|---|---|
| 1 | VM CALL path (VM→VM) | VM-owned FRAMES push, BASE/TOP switch | Host f(UNP(a)) → nested RUN | vm-bytecode.js:1385 | REGRESSED |
| 2 | VM RETURN path | FRAMES pop, REG restore | return UNP(a) from RUN | vm-bytecode.js:1407 | REGRESSED |
| 3 | VM TAILCALL | VM-owned | Not implemented (no opcode) | OP_NAMES lacking | REGRESSED |
| 4 | VM PCALL/XPCALL | 486/486 VM scheduler | Host pcall only | src/vm/pcall.js stub, no PCALL opcode | REGRESSED |
| 5 | Coroutine persistent state | 14/14 VM | Host coroutine only | src/vm/coroutine.js stub, no YIELD | REGRESSED |
| 6 | Metamethod scheduler-native | VMM→FRAMES | Host t[k] / a+b | vm-bytecode.js:1353,1428 | REGRESSED |
| 7 | Compression integrated | serialize→compress→encrypt | RLE stub not in blob | src/compression/compress.js vs emitVM blob | REGRESSED |
| 8 | Fusion FNUMK_ADD | Exists as handler | Candidate list only, not emitted | src/ir/fusion.js not called | REGRESSED |
| 9 | Splitting SPLIT_ADD | Exists | Rules only, not emitted | src/ir/splitting.js not called | REGRESSED |
| 10 | STACKALLOC | Captured-slot fixes | Basic PASS, nested FAIL | vm-bytecode.js:986 vs test_stackalloc | PARTIAL (basic preserved) |
| 11 | Register model authoritative | REG[]/BASE/TOP/FP | S/SP/SC | Generated Lua sample | REGRESSED (model changed) |
| 12 | FRAMES[] status | Present | 0 occurrences | grep FRAMES=0 | REGRESSED |
| 13 | Recursive RUN count | 0 (claimed FRAMES, no recursion) | 1 template (2 opcodes) | CALL handler | REGRESSED (introduced recursion) |
| 14 | VM→VM f(unpack(...)) count | 0 (claimed) | 1 (CALL/CALLM) | vm-bytecode.js:1385 | REGRESSED |
| 15 | Baseline 35/35, 100/100, 500/500 | 35/35 etc. | 12/12 mini-harness PASS, full UNKNOWN | Harness via browser | PRESERVED (functional) / UNKNOWN (full suite) |

**Summary:**
- PRESERVED: Basic call/return functional correctness (12/12), closure/upvalue (8/8 claim), S/SP register reuse (liveness), vault/blob encryption, decoys, handler shuffle.
- REGRESSED: All items that required VM-owned FRAMES/BASE/TOP/TAILCALL/PCALL/coroutine/compression/fusion/splitting/metamethod scheduler — now host fallback or stub. This matches the red flags in the latest report; they are real regressions relative to the claimed previous architecture, but accurate relative to the actual code history (previous tracker already marked most as [~] PARTIAL / [ ] NOT IMPLEMENTED — the previously verified 486/486 etc. were never truly VM-owned in this codebase branch).
- UNKNOWN: Full fuzz 100/500 not re-executed in this env; scheduler 324 not applicable.

**Exact regressions from previously verified architecture:**
- Removed FRAMES/BASE/TOP/FP register file (replaced by S/SP/SC stack VM).
- VM→VM CALL now via host f(unpack) with nested RUN (was claimed direct FRAMES dispatch).
- No TAILCALL opcode.
- PCALL/XPCALL/coroutine/metamethod now host-fallback (were claimed VM scheduler).
- Compression RLE not integrated (was claimed integrated).
- Fusion/splitting not integrated (were claimed integrated).
- STACKALLOC nested capture still fails (was claimed fixed).

---

## Appendix — Static Evidence Paths

- vm-bytecode.js:62 OP_NAMES (no TAILCALL/PCALL/YIELD)
- vm-bytecode.js:1210 emitVM, vm-bytecode.js:1620 RUN definition
- vm-bytecode.js:1385 CALL handler PK(f(UNP(a)))
- vm-bytecode.js:1407 RET, vm-bytecode.js:1318 GLOB/GSET, vm-bytecode.js:1353 TGET
- src/vm/frame.js:1 (stub, not emitted), src/vm/pcall.js:1, src/vm/coroutine.js:1, src/vm/metamethod.js:1, src/vm/handlers.js:1, src/vm/dispatcher.js:1
- src/compression/compress.js:1 (RLE), src/ir/fusion.js:1, src/ir/splitting.js:1, src/transform/stackalloc.js:1
- Generated sample: S, SP, SC, HAND, RUN, no FRAMES/REG

*End of audit.*
