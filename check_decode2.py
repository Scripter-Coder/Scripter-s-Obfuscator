import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
idx = t.find("while rp<=#' + BL")
print(t[idx-100:idx+1200])
