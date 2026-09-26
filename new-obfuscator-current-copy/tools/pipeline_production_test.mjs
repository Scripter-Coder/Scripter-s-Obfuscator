import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

function build(src, opts={}) { let b; const out=applyBytecodeVm(src,{profile:'SECURE',transforms:false,rethrow:true,onBuild:x=>b=x,...opts}); if(!out||!b) throw new Error('build failed'); return {b,out}; }
function assert(c,m){ if(!c) throw new Error(m); }

const core=build('local a,b=1,2; RESULT=tostring(a+b)');
const p=core.b.pipeline;
assert(p?.stages?.join('>')==='AST>IR>CFG>optimizer>register-allocation>transforms>lowering>VM-bytecode','pipeline stages missing');
assert(p.stats.cfgBlocks>=1,'CFG was not built');
assert(p.stats.reused>=1,'register allocator did not report reuse');
assert(p.stats.appliedReuse>=1,'physical temporary allocation was not applied to production IR');

const folded=build('local x=2+3; local y=5; RESULT=tostring(x+y)',{seedOverride:99});
assert(folded.b.pipeline.stats.folded>=1,'production optimizer did not fold an eligible constant expression');

const fused=build('RESULT=tostring(2+3)',{seedOverride:4});
assert(fused.b.pipeline.stats.fused>=1,'production fusion did not emit a fused instruction');

const split=build('local t={x=4}; RESULT=tostring(t.x)',{seedOverride:4});
assert(split.b.pipeline.stats.split>=1,'production splitting did not emit split instructions');

const mutated=build('local a=2; local b=3; RESULT=tostring(a+b)',{seedOverride:1});
assert(mutated.b.pipeline.stats.mutations>=1,'production opcode mutation did not select a concrete variant');

const cfg=build('local s=0; for i=1,5 do if i==3 then s=s+10 else s=s+i end end RESULT=tostring(s)',{seedOverride:7});
assert(cfg.b.pipeline.stats.cfgBlocks>1,'production CFG did not represent control flow');

console.log('pipeline production proof PASS');
console.log(JSON.stringify({core:core.b.pipeline.stats,folded:folded.b.pipeline.stats,fused:fused.b.pipeline.stats,split:split.b.pipeline.stats,mutated:mutated.b.pipeline.stats,cfg:cfg.b.pipeline.stats},null,2));
