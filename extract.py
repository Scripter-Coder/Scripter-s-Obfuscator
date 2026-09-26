import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
idx = t.find("OPCODES['TAILCALL']")
print("idx", idx)
snippet = t[idx-400:idx+900]
# write to file for inspection
pathlib.Path("snippet.txt").write_text(snippet, encoding='utf-8')
print(repr(snippet[:800]))
