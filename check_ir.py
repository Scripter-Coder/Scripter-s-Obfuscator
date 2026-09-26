import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
print("irStats" in t)
print("folded" in t)
print("totalFolded" in t)
print(t.count("per-function maxReg"))
print(t.count("IR→CFG"))
# Find compile return
idx = t.find("return { chunks:")
print(t[idx-1000:idx+500])
