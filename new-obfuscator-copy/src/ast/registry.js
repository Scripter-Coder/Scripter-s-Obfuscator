// src/ast/registry.js — AST Transformation Registry (Phase 5, §11)
// Each transform declares name, compatibility, cost, safety, target, profile requirements.

export const TRANSFORM_REGISTRY = [
  {
    name: 'arithmetic_rewrite',
    compat: ['lua51','lua53','lua54'],
    cost: 1,
    safety: 'safe',
    target: 'expr',
    profile: ['BALANCED','SECURE'],
    desc: 'a+b -> b+a, a*2 -> a+a',
    fn: null,
  },
  {
    name: 'comparison_rewrite',
    compat: ['lua51','lua53','lua54'],
    cost: 1,
    safety: 'safe',
    target: 'expr',
    profile: ['SECURE'],
    desc: 'a==b -> not (a~=b), etc.',
  },
  {
    name: 'boolean_rewrite',
    compat: ['lua51','lua53','lua54'],
    cost: 1,
    safety: 'safe',
    target: 'expr',
    profile: ['SECURE'],
    desc: 'not (a==b) -> a~=b',
  },
  {
    name: 'branch_rewrite',
    compat: ['lua51','lua53','lua54'],
    cost: 2,
    safety: 'safe',
    target: 'stmt',
    profile: ['BALANCED','SECURE'],
    desc: 'if cond -> if not not cond etc.',
  },
  {
    name: 'expression_extraction',
    compat: ['lua51'],
    cost: 2,
    safety: 'cautious',
    target: 'expr',
    profile: ['SECURE'],
    desc: 'extract subexpr to local',
  },
  {
    name: 'expression_restructuring',
    compat: ['lua51'],
    cost: 2,
    safety: 'safe',
    target: 'expr',
    profile: ['BALANCED','SECURE'],
    desc: 'restructure a and b or c etc.',
  },
  {
    name: 'local_normalization',
    compat: ['lua51','lua53','lua54'],
    cost: 1,
    safety: 'safe',
    target: 'stmt',
    profile: ['FAST','BALANCED','SECURE'],
    desc: 'normalize locals',
  },
  {
    name: 'safe_function_transforms',
    compat: ['lua51'],
    cost: 3,
    safety: 'cautious',
    target: 'func',
    profile: ['SECURE'],
    desc: 'function hoisting etc.',
  },
  {
    name: 'control_flow_transforms',
    compat: ['lua51','lua53','lua54'],
    cost: 4,
    safety: 'cautious',
    target: 'stmt',
    profile: ['SECURE'],
    desc: 'block reorder, branch inv',
  },
];

export function transformsForProfile(profileName) {
  const up = String(profileName||'BALANCED').toUpperCase();
  return TRANSFORM_REGISTRY.filter(t=>t.profile.includes(up));
}

export function validateTransform(name, target) {
  const t = TRANSFORM_REGISTRY.find(x=>x.name===name);
  if(!t) return { ok:false, error:'unknown transform '+name };
  if(!t.compat.includes(target.name || 'lua51')) return { ok:false, error:'incompatible target' };
  return { ok:true, transform:t };
}
