// src/profiles.js — VM security presets (spec §12)
// FAST / BALANCED / SECURE are REAL, measurable profiles — not CLI stubs.
// Each controls: VM complexity, control-flow strength, constant protection,
// handler splitting, decoy density, anti-tamper, debug, compression, perf tradeoffs.

export const PROFILES = {
  FAST: {
    name: 'FAST',
    vmComplexity: 1,
    handlerSplit: false,
    decoyDensity: 0.2,
    decoyVaultRuns: [2, 4],
    decoyChunks: [2, 6],
    controlFlow: 'none',          // no transform
    constant: 'basic',            // single vault cipher, no per-type
    cipherRounds: 1,              // debug-style 1-round q (fast)
    instructionMutation: 'opcodeOnly',
    antiTamper: 'checksumOnly',
    debugProtect: false,
    compression: false,
    layerCount: 1,
    stride: 8,
    description: 'Minimal VM, single encryption layer, no hardening — fastest load/exec.',
  },
  BALANCED: {
    name: 'BALANCED',
    vmComplexity: 2,
    handlerSplit: false,
    decoyDensity: 0.5,
    decoyVaultRuns: [4, 8],
    decoyChunks: [8, 15],
    controlFlow: 'light',         // block reorder where safe
    constant: 'typed',            // typed const pools
    cipherRounds: 1,
    instructionMutation: 'fieldShuffle',
    antiTamper: 'checksum+canary',
    debugProtect: 'light',
    compression: false,
    layerCount: 3,
    stride: 6,
    description: 'Balanced — moderate decoy + real VM, compression off.',
  },
  SECURE: {
    name: 'SECURE',
    vmComplexity: 3,
    handlerSplit: true,
    decoyDensity: 0.8,
    decoyVaultRuns: [8, 12],
    decoyChunks: [15, 20],
    controlFlow: 'heavy',
    constant: 'strong',
    cipherRounds: 2,              // 2-round q — ~2x BALANCED cost, not 16x absurd
    instructionMutation: 'full',
    antiTamper: 'full',
    debugProtect: true,
    compression: true,
    layerCount: 4,
    stride: 4,
    description: 'Maximum — 4 layers, 2-round cipher (tuned from 16 to avoid 30s tiny).',
  },
};

// OBSIDIAN / ONYX-like aliases (spec allows independent naming)
export const PRESET_ALIASES = {
  OBSIDIAN: 'SECURE',
  ONYX: 'SECURE',
  OPAL: 'FAST',
};

export function resolveProfile(name) {
  if (!name) return PROFILES.BALANCED;
  const up = String(name).toUpperCase();
  if (PROFILES[up]) return PROFILES[up];
  if (PRESET_ALIASES[up] && PROFILES[PRESET_ALIASES[up]]) return PROFILES[PRESET_ALIASES[up]];
  return PROFILES.BALANCED;
}

// Build metadata carried per compilation (spec §27)
export function makeBuildMeta({ target = 'lua51', seed = null, profile = 'BALANCED', overrides = {} } = {}) {
  const p = resolveProfile(profile);
  return {
    target,
    seed: seed != null ? seed : Math.floor(Math.random() * 4294967296),
    profile: p.name,
    config: { ...p, ...overrides },
    // filled during compilation:
    opcodeMap: null,
    handlerMap: null,
    registerMap: null,
    constantParams: null,
    instructionParams: null,
    controlFlowParams: null,
    security: null,
    compression: p.compression,
    debugProtect: p.debugProtect,
  };
}
