import pathlib
content = '''import { prepareSource } from './src/targets/luau.js';
function stripLocalTypes(line) {
  return line.replace(/(\\blocal\\s+[A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*[^=,\\n]+(?=\\s*(?:=|,|$))/g,'$1');
}
console.log(stripLocalTypes("local x: number = 5"));
console.log(prepareSource("local x: number = 5\\nx+=2\\nprint(x)"));
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_strip.mjs')
target.write_text(content, encoding='utf-8')
print('written')
