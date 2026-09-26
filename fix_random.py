import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = "        blob.push(Math.random() < 0.5 ? 1 : 0);"
new = "        blob.push(rnd(2)===0 ? 1 : 0);"
if old in t:
    t = t.replace(old, new)
    print("fixed random")
else:
    print("not found")
    idx = t.find("blob.push(Math.random")
    print(t[idx-100:idx+200])
p.write_text(t, encoding='utf-8')
