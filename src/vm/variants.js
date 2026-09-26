// src/vm/variants.js — VM Variants (Phase 4, §10)
// Genuine independent VM profiles: FAST_VM, BALANCED_VM, SECURE_VM (+ optional stronger).
// Own names, not Luraph's actual implementations.

export const VM_VARIANTS = {
  FAST_VM: {
    name: 'FAST_VM',
    alias: 'CRYSTAL',
    dispatch: 'direct_table_dispatch',
    stateLayout: 'compact',
    instructionFormat: 'A',
    handlerOrg: 'monolithic',
    registerRepr: 'direct_dict',
    constantAccess: 'direct_index',
    frameMeta: 'minimal',
    transforms: [],
    decoyLevel: 'low',
  },
  BALANCED_VM: {
    name: 'BALANCED_VM',
    alias: 'ONYX2',
    dispatch: 'branch_or_table',
    stateLayout: 'shuffled',
    instructionFormat: 'A_or_B',
    handlerOrg: 'mixed',
    registerRepr: 'shuffled_array',
    constantAccess: 'typed_memo',
    frameMeta: 'standard',
    transforms: ['branch_inv'],
    decoyLevel: 'medium',
  },
  SECURE_VM: {
    name: 'SECURE_VM',
    alias: 'OBSIDIAN',
    dispatch: 'mixed_state',
    stateLayout: 'opaque_stateVar',
    instructionFormat: 'C_or_D',
    handlerOrg: 'decomposed',
    registerRepr: 'window_shifted',
    constantAccess: 'lazy_memo_per_type',
    frameMeta: 'full',
    transforms: ['branch_inv','block_split','fusion','split'],
    decoyLevel: 'high',
  },
  // Optional stronger variants (stronger than SECURE)
  PHANTOM_VM: {
    name: 'PHANTOM_VM',
    alias: 'PHANTOM',
    dispatch: 'state_opcode',
    stateLayout: 'opaque_state_machine',
    instructionFormat: 'D',
    handlerOrg: 'decomposed_helper',
    registerRepr: 'remapped_window',
    constantAccess: 'encrypted_per_type_lazy',
    frameMeta: 'full_plus_integrity',
    transforms: ['branch_inv','block_split','fusion','split','opaque_pred'],
    decoyLevel: 'ultra',
  },
};

export function pickVariant(seed, profileName) {
  if (profileName==='FAST') return VM_VARIANTS.FAST_VM;
  if (profileName==='SECURE') return VM_VARIANTS.SECURE_VM;
  return VM_VARIANTS.BALANCED_VM;
}

export function pickVariantByName(name) {
  const up = String(name).toUpperCase();
  if (VM_VARIANTS[up]) return VM_VARIANTS[up];
  for(const k in VM_VARIANTS) if(VM_VARIANTS[k].alias===up) return VM_VARIANTS[k];
  return VM_VARIANTS.BALANCED_VM;
}

export function variantDiffers(a,b) {
  return JSON.stringify(a)!==JSON.stringify(b);
}
