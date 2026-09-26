import { CFG } from '../src/ir/cfg.js';
import { runOptimizer } from '../src/ir/optimizer.js';
import { makeFuncIR, makeBlock } from '../src/ir/ir.js';

console.log('=== Optimizer unit tests ===');
const func = makeFuncIR({params:[], vararg:false});
const b0 = makeBlock(0);
b0.insts = [
  {op:'LOADK', a:1},
  {op:'LOADK', a:2},
  {op:'ADD'},
  {op:'RET', a:1},
];
func.blocks = [b0];
const cfg = new CFG(func); cfg.build();
console.log('CFG built blocks', cfg.blocks.length, 'succ', cfg.blocks[0].succ);
const before = JSON.stringify(b0.insts);
const res = runOptimizer(func, {profile:'BALANCED'});
console.log('optimizer stats', res.stats);
console.log('changed', res.changed);
console.log('Optimizer test PASS (scaffold runs)');
