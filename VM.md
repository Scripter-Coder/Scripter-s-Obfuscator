# VM.md — Virtual Machine

**Emitter:** `vm-bytecode.js:1210` `emitVM(build)` → Lua source (self-contained interpreter).

**Per-build randomization:**

- `OPCODES` 500–60000 per opcode, `VP {a,b,c,m,d,iv,salt*}` + `BP {a,b,c}`, `PROTO_SALT`, `JMP_SALT`, `REG_SHIFT_VAR` 0–7, `_stateFields` shuffle, `_frameLayout {stride, useRetField, fields}`, `_useIfChain` 33%, handler order Fisher-Yates, names `hex(6)`, buildId/vmId.

**Runtime state:**

- Vault `V`, refs `R`, chunk table `CH` (decrypted from blob `BL` via stream XOR `((i*i*BP.a+i*BP.b+BP.c)%4294967296)%251+4`), stack `S/SP`, scopes `SC`, vararg `VA`, `CODE/PC/OP`, stack `S/SP`, scopes `SC`, upvalue links `LK`, vararg `VA`, `CODE/PC` (REG/BASE/TOP legacy docs updated to stack VM; register allocation now maps virtual locals to stack-slot reuse) `{code,pc,base,top,s,sp,sc,va,lk,fr,nRet,retDest}`, `VMM` marker.

**Handlers:** `HAND[opcode]` table (or if-chain variant) — `CONST, NUMK (memo `NC`), NIL/TRUE/FALSE, GLOB/GSET, LLOAD/LSET/LNEW/ULOAD/USET, PUSHSC/POPSC, TGET/TSET, NEWTAB/APD, DUP/POP/SWAP/UNPK*, CALL/CALLM, VARGP, NEWF (proto XOR), ADD/SUB/.../CONCAT, NOT/NEG/LEN, JMP/JIF... (jump XOR), dead handlers 3–8`.

**Dispatcher:** `while true do local OP=CODE.c[PC] PC=PC+1; if OP==RET then … elseif OP==RETP then … elseif OP==TAILCALL then … else HAND[OP]()` — variant via `src/vm/dispatcher.js` (`TABLE`/`BRANCH`/`NUMERIC`/`MIXED`).

**Frame:** `FR={chunk,pc,base,top,ret,nRet,vararg,upenv,caller,build,reg}` — per-build stride/layout.

**Variant:** `src/vm/variants.js` `FAST_VM`/`BALANCED_VM`/`SECURE_VM`/`PHANTOM_VM` — differ dispatch/state/format/handler/reg/constant/frame/transforms.
