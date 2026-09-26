import pathlib
content = '''import { prepareSource } from './src/targets/luau.js';
const src=`local x: number = 5\\nx+=2\\nprint(x)`;
console.log(prepareSource(src));
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_compound_type.mjs')
target.write_text(content, encoding='utf-8')
print('written')
