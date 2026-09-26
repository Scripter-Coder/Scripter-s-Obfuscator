# IR.md — Intermediate Representation

**File:** `src/ir/ir.js:1`

IR op set superset of `vm-bytecode.js` `OP_NAMES`: `MOVE, LOADK, LOADN, LOADNIL, LOADBOOL, GETGLOBAL/SETGLOBAL, GETUPVAL/SETUPVAL, GETTAB/SETTAB, NEWTAB, SETLIST_APPEND, SELF, ADD/SUB/MUL/DIV/MOD/POW/CONCAT/EQ/NEQ/LT/LE/GT/GE/LEN/NEG/NOT, TEST/TESTSET, JMP/JIF/JIT/JNIL/ANDK/ORK, CALL/TAILCALL/RETURN/VARARG/CLOSURE/CLOSE, FOR_PREP/FOR_LOOP, ...`

- **Func IR:** `{params, vararg, blocks, consts, upvalues, nextReg, maxReg}` via `makeFuncIR`.
- **Block:** `{id, insts, succ, pred, phis}` via `makeBlock`.
- **Typed const pool:** `addConst(funcIR, type, value)` — `type` string/number/bool/nil, distinct handling (Phase 4 constant virtualization).
- **Lowering:** IR → legacy code word stream via `CFG.toLegacyCode(opcodeMap)` after optimizer.

**Not 1:1 Lua 5.3 bytecode**: typed, SSA-ish, explicit operands (spec §3).

## Production use
The IR is now on the authoritative Lua51 production path. `src/ir/pipeline.js` consumes symbolic compiler instructions, builds typed IR records and CFG blocks, validates branch targets, runs conservative optimizer passes, records storage/lifetime allocation, and lowers to the existing custom VM bytecode. Lexical/captured IDs remain stable because they are part of the closure/upvalue ABI.

## Final-pass lowering transforms

Production IR lowering now applies deterministic seeded VM-level fusion/splitting immediately before custom bytecode lowering. Fused instructions retain required operands (for example NUMK constant index) and split instructions use real VM opcodes with generated handlers.
