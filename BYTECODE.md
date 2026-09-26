# BYTECODE.md — Custom Bytecode Format

**Version:** `src/bytecode/format.js:4` `FORMAT_VERSION=2`

**Image:** `{ver, buildId, vmId, target, profile, seed, funcs, constPool, integrity}`

**Func record (old blob):** `[nParams 2B LE, params 2B each, vararg 0/1, maxReg 2B, nCode 4B LE, code words 4B LE each]` — length-prefixed, `nCode` 4B (not 1B) for big scripts.

**Vault:** `V` bytes encrypted `plain ^ ((a*p+b+seed*((p*p)%m))%251+c + prev*d)` per constant with `iv + id*salt` chaining (typed salts `saltStr/Num/Int/Float/Misc`).

**Blob cipher:** `blob[i] ^= ((i*i*BP.a+i*BP.b+BP.c)%4294967296)%251+4` — laundered `%4294967296` for 32-bit runtimes.

**Instruction encoding (Phase 4):** `src/bytecode/encoding.js` families `A:op|A|B|C`, `B:A|op|C|B`, `C:op|block`, `D:state/op mixed`; `pickFormat(seed, profile)` FAST→A, SECURE→A/B/C/D random; per-build operand XOR (`PROTO_SALT` for NEWF, `JMP_SALT` for jumps, `REG_SHIFT` for regs); decoy vault + decoy chunks.

**Decoder:** Generated per build — same seed+profile → same format, else different; universal parser not used (spec §3).

**Integrity:** `integrityHash` FNV32 separate from crypto.
