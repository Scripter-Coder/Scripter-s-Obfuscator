import { makeRng } from '../rng.js';
// src/vm/frame.js — Genuine VM call-frame system (spec §6)
// Implemented BEFORE hardening per additional requirement #2.
// Each frame is a plain Lua table emitted into the generated VM (not JS object).

// Lua template for a frame (emitted as Lua source by generator). Fields per spec:
// caller frame, callee chunk idx, pc, reg base, ret dest frame+pc, expected nRet,
// arg count, vararg packed, upvalue env, pcall state, line meta (optional)

export function luaFrameTemplate(vars) {
  // vars: { FR, CUR, STACK, REG, PC, BASE, TOP }
  const { FR, CUR, STACK } = vars;
  return [
    `-- frame: {chunk, pc, base, top, retDest, nRet, vararg, upenv, pcall}`,
    `local ${FR} = {}`,
    `local ${CUR} = nil -- current frame ptr`,
    `-- alloc: ${STACK}[base .. top] is register window`,
  ].join('\n');
}

// JS helper: describe frame layout variability (spec requirement #6)
// Layout is per-build randomized: field order, names, storage.
export function randomizeFrameLayout(seed) {
  // Shared per-build RNG: the local LCG's low bits are degenerate (see
  // src/rng.js), which would lock whole seed ranges to one field order.
  const { rnd } = makeRng(seed);
  const next = rnd;
  const fields = ['chunk','pc','base','top','ret','nRet','vararg','upenv','pcall','caller'];
  // shuffle field order
  for (let i = fields.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [fields[i], fields[j]] = [fields[j], fields[i]];
  }
  return {
    order: fields,
    // per-build register window base stride (8..32)
    stride: 8 + (next() % 25),
    // whether returns are stored via frame.ret field or via stack spill
    useRetField: (next() % 2) === 0,
  };
}

// Live upvalue cell semantics (spec §7)
// Cell is { [1]=value } by reference. Capture = alias, not copy.
// Emitted logic (in generated VM) must ensure:
//  - nested functions capture cell reference, not value
//  - open upvalues are shared across closures created in same scope
//  - CLOSURE op copies links[] + SC[] as references (already in vm-bytecode NEWF:1314)
// Doc here for generator to emit CLOSURE handler accordingly.

export const UPVALUE_DOC = `
Upvalue cell: Lua table {value}
  captureScope = SC[#SC][id]  -- already a cell
  link search: for i=#LK,1,-1 do if LK[i][id] then cell=LK[i][id] break
  new closure links = { table.unpack(LK), table.unpack(SC) }  -- shared references
  ULOAD/USET index by id scanning LK reverse; LLOAD/LSET scan SC reverse (inner-most first)
  CLOSE: when scope POPSC, cells that are closed become closedCells[id]=cell (still shared)
`;
