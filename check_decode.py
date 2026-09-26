import pathlib, re
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
idx = t.find("local va=(")
print(t[idx-200:idx+800])
print("---")
print("maxReg count", t.count("maxReg"))
print("mr in decode", "local mr" in t)
print("CH[#CH+1] contains", t.count("CH[#CH+1]"))
# find blob encode
idx2 = t.find("blob.push(ch.vararg")
print(t[idx2-200:idx2+500])
