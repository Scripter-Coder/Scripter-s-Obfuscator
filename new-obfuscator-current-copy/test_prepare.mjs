import { prepareSource } from './src/targets/luau.js';
const src=`for i=1,5 do\n  if i==3 then continue end\n  print(i)\nend`;
console.log(prepareSource(src));
console.log('---');
const src2=`local x=5\nx+=1\nprint(x)`;
console.log(prepareSource(src2));
