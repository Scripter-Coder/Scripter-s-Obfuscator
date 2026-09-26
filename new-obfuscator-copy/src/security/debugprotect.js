// src/security/debugprotect.js — Debug Library Protection (Phase 6, §20)

export const DEBUG_APIS = ['getinfo','getlocal','getupvalue','setupvalue','gethook','sethook','traceback'];

export function debugProtectMode(config) {
  if(config===true || config==='protected') return 'protected';
  if(config===false || config==='normal') return 'normal';
  return 'protected'; // default for SECURE
}

export function wrapDebugFunction(fnName, mode) {
  if(mode==='normal') return `debug.${fnName}`;
  return `function(...) error("debug ${fnName} protected",0) end`;
}

export function emitDebugProtectLua(mode) {
  if (mode !== 'protected') return [];
  return [
    'do',
    ' local _od=debug',
    ' if type(_od)=="table" then',
    '  local _nd={}',
    '  local function _block(name)',
    '   return function()',
    '    error("debug "..tostring(name).." protected",0)',
    '   end',
    '  end',
    '  for _,n in ipairs({"getinfo","getlocal","getupvalue","setupvalue","gethook","sethook","traceback","getfenv","setfenv"}) do',
    '   _nd[n]=_block(n)',
    '  end',
    '  debug=_nd',
    ' end',
    'end',
  ];
}

export function testDebugProtect() {
  return DEBUG_APIS.map(api=>({
    api,
    normal: `debug.${api} should work on non-virtualized functions`,
    protected: `debug.${api} should fail/error on virtualized`,
    closure: `closure upvalues protected`,
  }));
}
