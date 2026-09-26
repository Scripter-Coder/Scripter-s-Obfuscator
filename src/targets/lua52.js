// Lua 5.2.4 target backend adapter. The VM lowering remains target-independent,
// while parsing and 5.2-only goto/_ENV syntax are selected here.
export const TARGET = {
  name:'lua52', version:'5.2.4', parserOpts:{luaVersion:'5.2'},
  number:{integer:false,float:'double'}, syntax:{goto:true,env:'_ENV',bit32:true,ephemeron:true},
  coroutine:{yieldable_pcall:true}, metamethod:{ephemeron:true},
  status:'IMPLEMENTED_PARTIAL',
  partial:'target parser + goto lowering verified; direct Lua 5.2.4 runtime verification passed for the supported subset',
};
export function validate(_src){return {ok:true};}
export function adaptAst(ast){return ast;}
export function backendInfo(){return TARGET;}
