import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
idx = s.find('if(/')
print(repr(s[idx-50:idx+200]))
idx2 = s.find('prepareSource')
print(repr(s[idx2:idx2+500]))
