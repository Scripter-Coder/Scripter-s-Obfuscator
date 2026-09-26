# AUDIT_VM15_PARITY

## Status

This audit confirms the profile split is now material in the generated VM pipeline. OPAL and ONYX no longer only differ by aliasing or opcode numbering; they have distinct serialized instruction layouts, dispatch flow, and handler-family organization in the emitted VM.

## Verified results

- OPAL and ONYX generate distinct serialized VM output for the same source and same seed.
- The generated VM includes a different instruction layout and handler-family structure per profile.
- The generated code path uses a direct compact dispatch for OPAL and a family-based fragmented path for ONYX.
- The runtime still preserves the authoritative scheduler ABI, as the semantic execution path remains the same while the generated representation differs.

## Evidence

Verified via the focused regression script:

- `node tools/opal_onyx_differential_test.mjs`
- `node tools/vm_structure_fingerprint.mjs`

These checks confirm that the same logical operation produces a distinct serialized bytecode stream and matching result under each profile.

## Notes

This is a targeted parity check for the VM generation split; it does not claim the full 14-part VM feature matrix is complete. The specific structural difference required for the OPAL/ONYX batch is implemented and has been verified in the current workspace state.
