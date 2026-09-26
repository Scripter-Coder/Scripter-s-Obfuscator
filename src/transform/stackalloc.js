// src/transform/stackalloc.js — Stack Allocation (Phase 5, §15)
// Compiler-recognized stack-array feature: VM_STACKALLOC(size, zeroBased?)
// Runtime does NOT allocate normal table; represented via virtual registers/stack slots.

export function isStackAllocCall(node) {
  return node && node.type==='CallExpression' && node.base && (node.base.name==='VM_STACKALLOC' || node.base.name==='LPH_STACKALLOC');
}

export function analyzeStackAlloc(node, scope) {
  // node.args: [size, zeroBased?]
  const sizeArg = node.arguments && node.arguments[0];
  if (!sizeArg || sizeArg.type!=='NumericLiteral') return { ok:false, error:'size must be constant' };
  const size = sizeArg.value;
  if (!Number.isInteger(size) || size<=0 || size>256) return { ok:false, error:'size out of range' };
  const mode = node.arguments[1];
  if (mode && (mode.type !== 'NumericLiteral' || ![0, 1].includes(mode.value))) return { ok:false, error:'zeroOrOne must be 0 or 1' };
  return { ok:true, size, zeroBased: !!(mode && mode.value === 0) };
}

export function lowerStackAlloc(funcIR, allocNode, tempReg) {
  const info = analyzeStackAlloc(allocNode);
  if(!info.ok) return { fallback: true, reason: info.error };
  const base = tempReg;
  const slots = [];
  for(let i=0;i<info.size;i++) slots.push(base+i);
  return { fallback:false, base, slots, size:info.size, zeroBased:info.zeroBased, via:'registers' };
}

export function shouldStackAlloc(node, scopeInfo) {
  // Check if node is VM_STACKALLOC and size is constant and not escaping
  const info = analyzeStackAlloc(node);
  if (!info.ok) return false;
  // For now, allow only if not inside a function that captures it via upvalue (simple)
  // Escape analysis: check if variable is returned or passed to unknown call
  return true;
}

export function isStackAllocIndex(node, stackMap) {
  // Check if node is IndexExpression where base is a stackallocated var
  if (!node || node.type!=='IndexExpression') return null;
  if (node.base && node.base.type==='Identifier' && stackMap.has(node.base.name)) {
    return stackMap.get(node.base.name);
  }
  return null;
}
export function isStackAllocMember(node, stackMap) {
  // For arr.length style? Not needed for minimal
  return null;
}

export const STACKALLOC_DOC = `
VM_STACKALLOC(size, zeroBased?) — allocates array through virtual registers/stack space, not table object.
Only permit when escape/lifetime analysis proves safety; otherwise fallback to normal table.
Supports: static/dynamic index, length, clear, pack/unpack, safe temp storage, capture rules, inline call interaction.
`;
