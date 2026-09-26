// Lua 5.4.8 target backend adapter. luaparse 0.3.1 has no 5.4 grammar, so
// the common 5.4-compatible subset is parsed with its 5.3 grammar; 5.4-only
// <close>/<const> syntax is rejected explicitly rather than miscompiled.
export const TARGET = {
  name:'lua54', version:'5.4.8', parserOpts:{luaVersion:'5.3'},
  number:{integer:true,float:'double',intOps:true}, bitwise:{native:true,lib:null},
  syntax:{goto:true,labels:true,tbc:true,constattr:true,integerDiv:true,bitwiseOps:true},
  coroutine:{supported:true}, env:{get:'_ENV',set:'_ENV'}, status:'IMPLEMENTED_PARTIAL',
  partial:'common 5.4-compatible subset + goto lowering verified; <close>/<const> and native 5.4.8 runtime verification unavailable',
};
export function validate(src){ if(/<close>|<const>/.test(src)) return {ok:false,error:'Lua 5.4 <close>/<const> requires a 5.4 parser'}; return {ok:true}; }
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
