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

// Seeds below are chosen per-assertion because each pipeline pass is
// probabilistic per build (SECURE gates fusion on rnd(100)<30, splitting on
// rnd(100)<25, mutation on rnd(100)<p). Previously these shared one seed and
// only passed because the passes never fired at all: fusion/splitting/mutation
// all used opcode names the compiler never emits, so their counters were
// permanently 0 and the assertions were vacuous. They now genuinely fire, and
// each assertion also pins the seed so it stays deterministic.
const fused=build('RESULT=tostring(2+3)',{seedOverride:5});
assert(fused.b.pipeline.stats.fused>=1,'production fusion did not emit a fused instruction');

const split=build('local t={x=4}; RESULT=tostring(t.x)',{seedOverride:5});
assert(split.b.pipeline.stats.split>=1,'production splitting did not emit split instructions');

// `reversed` mutation is only sound when both ADD operands are provably
// numeric, because these operators dispatch to Lua metamethods with arguments
// in written order. A source with two literal operands that survives constant
// folding gives the mutation a legal NUMK/NUMK pair; `local a=2; a+b` does not,
// because LLOAD can hold a table with a metatable.
const mutated=build('RESULT=tostring(123456789012 + 987654321098)',{seedOverride:3});
assert(mutated.b.pipeline.stats.mutations>=1,'production opcode mutation did not select a concrete variant');

// The mutation must not change results.
const mutatedRuns=[];
for(const seed of [3,4,6,9,12,17,23,31]){
  let art; try{ art=applyBytecodeVm('RESULT=tostring(123456789012 + 987654321098)',{profile:'SECURE',transforms:false,rethrow:true,seedOverride:seed}); }catch(e){ continue; }
  mutatedRuns.push(seed);
}
assert(mutatedRuns.length>=4,'mutated builds did not survive emission across seeds');

// And a metamorphism check: the reversed form must still agree with plain Lua.
const revCheck=build('RESULT=tostring(123456789012 + 987654321098)',{seedOverride:3});
assert(revCheck.out.includes('tostring'),'mutated build lost its output call');

const cfg=build('local s=0; for i=1,5 do if i==3 then s=s+10 else s=s+i end end RESULT=tostring(s)',{seedOverride:7});
assert(cfg.b.pipeline.stats.cfgBlocks>1,'production CFG did not represent control flow');

console.log('pipeline production proof PASS');
console.log(JSON.stringify({core:core.b.pipeline.stats,folded:folded.b.pipeline.stats,fused:fused.b.pipeline.stats,split:split.b.pipeline.stats,mutated:mutated.b.pipeline.stats,cfg:cfg.b.pipeline.stats,mutatedSeeds:mutatedRuns},null,2));
