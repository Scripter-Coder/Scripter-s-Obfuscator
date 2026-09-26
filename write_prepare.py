import pathlib
content = '''import { prepareSource } from './src/targets/luau.js';
const src=`for i=1,5 do\\n  if i==3 then continue end\\n  print(i)\\nend`;
console.log(prepareSource(src));
console.log('---');
const src2=`local x=5\\nx+=1\\nprint(x)`;
console.log(prepareSource(src2));
'''
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_prepare.mjs')
target.write_text(content, encoding='utf-8')
print('written')
