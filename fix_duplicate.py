import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');"""
new = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');"""
if old in t:
    t = t.replace(old, new)
    print("fixed duplicate")
else:
    print("duplicate not found")
    # try to find pattern
    import re
    for m in re.finditer(r"L\.push\(' while true do'\);.*?L\.push\('  local ' \+ OP", t, re.DOTALL):
        print(t[m.start():m.start()+500])
        break
p.write_text(t, encoding='utf-8')
