import { prepareSource } from './src/targets/luau.js';
function stripLocalTypes(line) {
  return line.replace(/(\blocal\s+[A-Za-z_][A-Za-z0-9_]*)\s*:\s*[^=,\n]+(?=\s*(?:=|,|$))/g,'$1');
}
console.log(stripLocalTypes("local x: number = 5"));
console.log(prepareSource("local x: number = 5\nx+=2\nprint(x)"));
