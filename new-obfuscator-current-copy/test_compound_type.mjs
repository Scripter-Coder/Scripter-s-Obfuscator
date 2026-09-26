import { prepareSource } from './src/targets/luau.js';
const src=`local x: number = 5\nx+=2\nprint(x)`;
console.log(prepareSource(src));
