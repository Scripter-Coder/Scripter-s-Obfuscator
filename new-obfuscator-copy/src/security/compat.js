// src/security/compat.js — Compatibility Mode (Phase 6, §19)
// Disables transforms requiring assumptions unavailable on selected target, document why.

export const TRANSFORM_DISABLE = {
  mba: 'mba',
  unroll: 'unroll',
  inline: 'inline',
  ast_rewrite: 'ast_rewrite',
};

export const COMPAT_RULES = {
  lua51: {
    disabled: [],
    why: 'Full support',
    perf: 'baseline',
  },
  lua53: {
    disabled: ['bitwise_mba'], // MBA bitwise needs native bitops only on 5.3+
    why: 'Lua 5.3 has native bitwise & integer semantics; disable MBA patterns that assume floats',
    perf: 'MBA preset STANDARD not STRONG',
  },
  lua54: {
    disabled: ['tbc_not_implemented'],
    why: 'Lua 5.4 <close> to-be-closed vars need precise scope handling',
    perf: 'no unrolling where <close> present',
  },
  luajit: {
    disabled: ['ffi_unless_enabled'],
    why: 'FFI only when ENABLE_FFI true',
    perf: 'FFI native fast',
  },
  luau: {
    disabled: ['type_strip'],
    why: 'Luau type syntax must be stripped, not executed',
    perf: 'separate parse',
  },
};

export function applyCompatTransforms(transforms, targetName, compatibilityOn) {
  const key = String(targetName).toLowerCase();
  const rules = COMPAT_RULES[key] || COMPAT_RULES.lua51;
  let out = (transforms || []).filter(t => !rules.disabled.includes(t.name));
  if (compatibilityOn) {
    out = out.filter(t => !['mba', 'unroll', 'inline', 'arithmetic_rewrite', 'boolean_rewrite', 'branch_rewrite'].includes(t.name));
  }
  return out;
}

export function compatFlags(targetName, compatibilityOn) {
  return {
    compatibilityOn: !!compatibilityOn,
    skipMba: !!compatibilityOn,
    skipUnroll: !!compatibilityOn,
    skipInline: !!compatibilityOn,
    skipAstRewrite: !!compatibilityOn,
    report: compatReport(targetName),
  };
}

export function compatReport(targetName) {
  const r = COMPAT_RULES[String(targetName).toLowerCase()] || COMPAT_RULES.lua51;
  return { target: targetName, disabled: r.disabled, why: r.why, perf: r.perf };
}
