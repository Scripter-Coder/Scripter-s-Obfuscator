// src/targets/registry.js — Target selection (honest, spec §10, §29)
import * as lua51 from './lua51.js';
import * as lua52 from './lua52.js';
import * as lua53 from './lua53.js';
import * as lua54 from './lua54.js';
import * as luajit from './luajit.js';
import * as luau from './luau.js';

const REG = { lua51, lua52, lua53, lua54, luajit, luau };

export function getTarget(name) {
  const key = String(name || 'lua51').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === '54' || key === 'lua54') return REG.lua54;
  if (key === '53' || key === 'lua53') return REG.lua53;
  if (key === '52' || key === 'lua52') return REG.lua52;
  if (key === '51' || key === 'lua51' || key === 'luau51') return REG.lua51;
  if (key === 'luajit' || key === 'jit') return REG.luajit;
  if (key === 'luau') return REG.luau;
  return REG.lua51;
}

export function listTargets() {
  return Object.values(REG).map(m => ({ name: m.TARGET.name, version: m.TARGET.version, status: m.TARGET.status, capabilities: m.TARGET }));
}

// Each target must expose parse/compile/run/reference/capabilities/semantics/unsupportedFeatures (spec §29)
export function targetCapabilities(name) {
  const t = getTarget(name);
  return {
    parse: t.TARGET.parserOpts,
    compile: t.validate ? 'validate' : 'none',
    capabilities: t.TARGET,
    semantics: t.TARGET.semantics || null,
    unsupportedFeatures: t.TARGET.unsupportedFeatures || [],
    supported: t.TARGET.status === 'IMPLEMENTED',
  };
}
