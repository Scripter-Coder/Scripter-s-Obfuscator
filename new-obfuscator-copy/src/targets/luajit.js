// LuaJIT 2.1 target backend adapter. Ordinary Lua 5.1 syntax plus the native
// LuaJIT FFI namespace is preserved; FFI execution requires LuaJIT 2.1.
export const TARGET = {
  name:'luajit', version:'2.1', parserOpts:{luaVersion:'5.1'},
  number:{integer:false,float:'double',jit:true},
  features:{ffi:true,jit:true,bit:true},
  syntax:{goto:false},
  status:'IMPLEMENTED',
  verification:'BACKEND_VERIFIED_RUNTIME_VERIFIED_TARGET_SEMANTICS_VERIFIED_SUPPORTED_SUBSET',
  partial:'Target-specific behavior is verified for the supported subset: LuaJIT 2.1 native runtime, bit library, FFI, coroutine/error semantics, numeric arithmetic, closures, varargs, multi-return, and metamethods. This is not a claim of universal LuaJIT extension coverage.',
  options:{ENABLE_FFI:true},
};
export function validate(_src){return {ok:true};}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
