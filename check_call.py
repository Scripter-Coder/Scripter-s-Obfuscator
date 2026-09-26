import pathlib, re
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
for m in re.finditer(r"if f and", t):
    print(t[m.start()-300:m.start()+600])
    print("---")
print("count", t.count("if f and"))
# also check for HAND CALL
idx = t.find("case 'CALL'")
print(t[idx-500:idx+2000])
