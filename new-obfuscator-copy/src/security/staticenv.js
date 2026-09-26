// src/security/staticenv.js — Static Environment (Phase 6, §18)
// Configurable: if enabled, assume env does not change, optimize global lookups; if disabled preserve dynamic behavior.

export const STATIC_ENV_OPTS = {
  enabled: false,
  note: 'When true, GLOBAL lookups are cached via local alias; when false, each GLOB/TGET re-reads _G.',
};

export function shouldStaticEnv(profileName, perFuncMeta, globalOpts) {
  if(globalOpts && globalOpts.staticEnv===true) return true;
  if(globalOpts && globalOpts.staticEnv===false) return false;
  // SECURE defaults to false (dynamic), FAST defaults to true (perf)
  if(profileName==='FAST') return true;
  if(profileName==='SECURE') return false;
  return perFuncMeta && perFuncMeta.STATIC_ENV===true;
}

export function lowerGlobalLookup(inst, useStatic) {
  if(!useStatic) return inst;
  if(inst.op==='GLOB') return {...inst, op:'LLOAD', static:true};
  return inst;
}

export function globLuaSnippet(vars, useStatic) {
  const { SP, S, E, D, CODE, PC } = vars;
  if (useStatic) {
    return [
      SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + E + '[' + D + '(' + CODE + '.c[' + PC + '])] ' + PC + '=' + PC + '+1',
    ];
  }
  return [
    'local env=_G if getgenv then env=getgenv() end if not env then env=_G end',
    SP + '=' + SP + '+1 ' + S + '[' + SP + ']=env[' + D + '(' + CODE + '.c[' + PC + '])] ' + PC + '=' + PC + '+1',
  ];
}

// Tests: env mutation, global reassignment, _ENV behavior
export function testStaticEnv() {
  return [
    { name:'env mutation', config:true, shouldFail:false },
    { name:'global reassignment', config:false, shouldFail:true },
  ];
}
