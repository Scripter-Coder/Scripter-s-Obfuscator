import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
print(t.count("while true do"))
# Find all occurrences of local OP
import re
for m in re.finditer(r"L\.push\('  local ' \+ OP", t):
    print(t[m.start()-100:m.start()+200])
