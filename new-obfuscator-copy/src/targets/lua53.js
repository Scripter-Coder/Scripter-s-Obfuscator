// Lua 5.3.6 target backend adapter. Integer/bitwise semantics are selected
// by the target registry; conservative transforms are disabled for this target.
export const TARGET = {
  name:'lua53', version:'5.3.6', parserOpts:{luaVersion:'5.3'},
  number:{integer:true,float:'double',intOps:true}, bitwise:{native:true,lib:null},
  env:{get:'_ENV',set:'_ENV'}, syntax:{goto:true,continue:false,bitwiseOps:true,integerDiv:true},
  coroutine:{supported:true}, status:'IMPLEMENTED_PARTIAL',
  partial:'target parser + goto lowering verified; native Lua 5.3.6 runtime verification unavailable in current environment',
};
export function validate(_src){return {ok:true};}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
