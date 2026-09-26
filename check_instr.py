import pathlib, re
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
for m in re.finditer(r"_instr", t):
    s = t[max(0,m.start()-400):m.start()+500]
    print("----")
    print(s)
    print("----")
