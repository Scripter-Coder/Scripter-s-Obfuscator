import fs from 'node:fs';

const repository = {
  LPH_ATTRIBUTES: ['per-function metadata alias', 'tools/public_macros_test.mjs'],
  VM: ['OPAL/ONYX/NONE lowering', 'tools/vm_none_matrix_test.mjs'],
  PRESET: ['FAST/BALANCED/SECURE profiles', 'tools/target_test.mjs'],
  TRANSFORM: ['per-function pipeline metadata', 'tools/perfunc_production_test.mjs'],
  INLINE: ['supported IR/AST subset', 'tools/final_feature_runtime.mjs'],
  UNROLL: ['supported numeric-loop subset', 'tools/unroll_test.mjs'],
  LPH_REWRITE: ['bounded seeded MBA grammar', 'tools/lph_rewrite_test.mjs'],
  LPH_STACKALLOC: ['VM stack allocation with safe fallback', 'tools/stackalloc_test.mjs'],
  LPH_ENCSTR: ['encrypted vault string lowering', 'tools/public_macros_test.mjs'],
  LPH_ENCBUF: ['Luau-only encrypted vault lowering', 'tools/public_macros_test.mjs'],
  LPH_ENCNUM: ['encrypted vault number lowering', 'tools/public_macros_test.mjs'],
  LPH_ENCFUNC: ['anonymous function NEWF lowering', 'tools/public_macros_test.mjs'],
  LPH_PRECHECK: ['protected anonymous-function scalar/array precheck chunk', 'tools/lph_precheck_semantic_test.mjs'],
  LPH_CRASH: ['protected runtime error', 'tools/public_macros_test.mjs'],
  LPH_OBFUSCATED: ['deterministic compile-state boolean', 'tools/public_macros_test.mjs'],
  LPH_LINE: ['source-line lowering', 'tools/public_macros_test.mjs'],
  NO_UPVALUES: ['capture rejection during lowering', 'tools/public_macros_test.mjs'],
  Target_Version: ['versioned target adapters', 'tools/target_test.mjs'],
  Static_Environment: ['static environment option', 'tools/final_feature_runtime.mjs'],
  Compatibility_Mode: ['compatibility transform mode', 'tools/final_feature_runtime.mjs'],
  Use_Debug_Library: ['debug protection path', 'tools/final_feature_runtime.mjs'],
  Intense_VM_Structure: ['no authoritative repository equivalence claim', 'AUDIT_PUBLIC_V15_SURFACE.md'],
  VM_Compression: ['secure compressed bytecode blob', 'tools/constant_virt_test.mjs'],
  Enable_FFI_Library: ['LuaJIT-gated FFI detection', 'tools/target_test.mjs'],
  Hardcode_Globals: ['safe hard-global caching', 'tools/hard_globals_test.mjs'],
};

const rows = Object.entries(repository).map(([feature, [repoBehavior, evidence]]) => ({
  feature,
  documentedBehavior: 'UNVERIFIED: authoritative current Luraph v15 documentation is not present in this repository',
  repositoryBehavior: repoBehavior,
  status: 'UNVERIFIED',
  evidence,
}));
const output = { oracle: 'UNAVAILABLE', documentationSource: 'UNAVAILABLE', rows };
console.log(JSON.stringify(output, null, 2));
if (process.env.LURAPH_MATRIX_OUTPUT) fs.writeFileSync(process.env.LURAPH_MATRIX_OUTPUT, JSON.stringify(output, null, 2));
