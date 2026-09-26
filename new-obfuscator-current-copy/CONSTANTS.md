# CONSTANTS.md — Constant Virtualization

**Spec §2 — Not one encrypted array.**

## Categories

`src/vm/constants.js:CONST_CATEGORY` — `STRING`, `INT`, `FLOAT`, `BOOL`, `NIL`, `PROTO`, `SPECIAL`.

- **STRING** → `CONST` + `D(i)` + memo chain `VP.saltStr`.
- **INT/FLOAT** → `NUMK` + `tonumber(D(i))` + `NC memo` (`VP.saltInt/Float`).
- **BOOL/NIL** → `TRUE`/`FALSE`/`NIL` opcodes (no vault).
- **PROTO** → `NEWF operand XOR PROTO_SALT` (function ref virtualization).
- **SPECIAL** (NaN/inf) → typed handling.

## Descriptors

`makeDescriptor({id, category, raw, start, len, salt, access})` — `id` 1-based, `access` `direct`/`memo`/`lazy_memo`/`decoy`, `memo`+`lazy` flags.

`buildConstantPool({vaultPlain, refs, seed, profile})` → `{VP, descriptors[]}` — `VP` per-build, `saltStr/Num/Int/Float/Misc`, descriptors per ref via content sample (int regex `^-?\d+$`, float `^-?\d*\.\d`).

**Build-specific:** `VP` coefficients random per build; vault byte `K(p) = ((a*p+b+seed*((p*p)%m))%251)+c + prev*d`, `prev = (iv+id*salt)%256`, chaining `prev=plain`.

## Access Strategy

- `direct_index` (FAST), `typed_memo` (BALANCED), `lazy_memo_per_type` (SECURE) — `src/vm/variants.js`.
- Lua `D(i)` memoized `C[i]` + typed salts `(ln%2==0)?saltStr:saltNum` + `prev` chaining; `NC[ix]` for numbers.
- Decoy/unused values only structural: decoy vault runs + decoy refs + decoy chunks same cipher, same shape (`vm-bytecode.js:1311`), indistinguishable.

## Tests

`tools/constant_virt_test.mjs` — plaintext scan (no secret leak), pool extraction (2 descs), index recovery (execution PASS), layout comparison (same shape deterministic), execution correctness (`hello,42,3.14,true,nil` PASS), build-to-build per-build salts differ PASS.

> Do not confuse encryption with virtualization — descriptors + typed decode + access strategy are virtualization layer; cipher is encryption layer.
