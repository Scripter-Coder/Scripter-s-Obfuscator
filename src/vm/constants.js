// src/vm/constants.js — Real Constant Virtualization (Phase 4, §2)
// Distinct handling for strings, integers, floats, booleans, nil, prototype refs, special values.
// Not one encrypted array: typed descriptors, build-specific representation, access strategy, typed decode, lazy+memoized.

export const CONST_CATEGORY = {
  STRING: 'string',
  INT: 'int',
  FLOAT: 'float',
  BOOL: 'bool',
  NIL: 'nil',
  PROTO: 'proto',
  SPECIAL: 'special', // NaN, inf, -0, etc.
};

export function categorizeRaw(raw) {
  if (raw == null) return CONST_CATEGORY.NIL;
  if (typeof raw === 'boolean') return CONST_CATEGORY.BOOL;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return CONST_CATEGORY.SPECIAL;
    if (Number.isInteger(raw)) return CONST_CATEGORY.INT;
    return CONST_CATEGORY.FLOAT;
  }
  if (typeof raw === 'string') {
    // check if numeric string that represents int vs float
    if (/^-?\d+$/.test(raw.trim())) return CONST_CATEGORY.INT;
    if (/^-?\d*\.\d+(e[+-]?\d+)?$/i.test(raw.trim())) return CONST_CATEGORY.FLOAT;
    return CONST_CATEGORY.STRING;
  }
  return CONST_CATEGORY.SPECIAL;
}

// Constant descriptor: per-constant metadata, build-specific.
export function makeDescriptor({ id, category, raw, start, len, salt, access }) {
  return { id, category, raw, start, len, salt, access, memo: true, lazy: false };
}

// Build-specific constant representation (spec: constant IDs, descriptors, encoding)
export function buildConstantPool({ vaultPlain, refs, seed, profileName }) {
  // This mirrors vm-bytecode.js VP salts but exposed as typed pool
  let s = seed >>> 0;
  const rnd = n => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
  const rndInt = (a,b) => a + rnd(b-a+1);
  const VP = {
    a: rndInt(29,251),
    b: rndInt(29,251),
    c: rndInt(5,251),
    m: rndInt(3,31),
    d: rndInt(1,127),
    iv: rndInt(0,255),
    salt: rndInt(1,127),
    saltStr: rndInt(1,127),
    saltNum: rndInt(1,127),
    saltMisc: rndInt(1,127),
    saltInt: rndInt(1,127),
    saltFloat: rndInt(1,127),
  };
  const descriptors = [];
  for (let i=0;i<refs.length;i++) {
    const r = refs[i];
    // infer category from first bytes? Use length parity fallback if not known
    // For our vault, strings and numbers are stored as raw byte sequences of their source text
    const sample = (() => {
      try {
        let t=''; for(let j=0;j<Math.min(r.len,20);j++) t+=String.fromCharCode(vaultPlain[r.start+j]); return t;
      } catch(e){return '';}
    })();
    let cat = CONST_CATEGORY.STRING;
    if (/^-?\d+$/.test(sample.trim())) cat = CONST_CATEGORY.INT;
    else if (/^-?\d*\.\d/.test(sample.trim())) cat = CONST_CATEGORY.FLOAT;
    else if (r.len===0) cat = CONST_CATEGORY.NIL;
    const salt = cat===CONST_CATEGORY.STRING ? VP.saltStr : cat===CONST_CATEGORY.INT ? VP.saltInt : cat===CONST_CATEGORY.FLOAT ? VP.saltFloat : VP.saltMisc;
    const access = (profileName==='SECURE' && cat===CONST_CATEGORY.STRING) ? 'lazy_memo' : (cat===CONST_CATEGORY.INT ? 'memo' : 'direct');
    descriptors.push(makeDescriptor({ id: i+1, category: cat, raw: sample, start: r.start, len: r.len, salt, access }));
  }
  return { VP, descriptors };
}

// Typed decode (build-specific): mirrors Lua D(i) but per-category
export function typedDecode(descriptor, vault, D_fn) {
  // For testing: dispatch to correct decoder
  if (descriptor.category === CONST_CATEGORY.BOOL) return descriptor.raw === 'true';
  if (descriptor.category === CONST_CATEGORY.NIL) return null;
  if (descriptor.category === CONST_CATEGORY.PROTO) return { proto: descriptor.raw };
  // strings/numbers use D_fn memo
  return D_fn(descriptor.id);
}

// Decoy descriptor (only when structural purpose)
export function makeDecoyDescriptor({ id, start, len, salt }) {
  return { id, category: CONST_CATEGORY.SPECIAL, raw: '<decoy>', start, len, salt, access: 'decoy', memo: false, lazy: false, decoy: true };
}

// Tests helpers
export function plaintextScan(vmSrc, secret) {
  return vmSrc.includes(secret);
}
export function layoutCompare(buildA, buildB) {
  // compare constant layout: descriptor count, start positions, categories
  const a = buildA.descriptors || [];
  const b = buildB.descriptors || [];
  if (a.length!==b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i].category!==b[i].category || a[i].len!==b[i].len) return false;
  return true; // same shape => not diverse
}
