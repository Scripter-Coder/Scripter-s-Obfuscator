import pathlib
p = pathlib.Path('vm-bytecode.js')
t = p.read_text(encoding='utf-8')
old = 'if t==nil then print("TSET t nil", "SP", \''
new = 'if k==nil then print("TSET k nil", k, v, t) end if t==nil then print("TSET t nil", "SP", \''
if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print('patched')
else:
    print('old not found')
    # debug
    import re
    m=re.search(r"if t==nil then print\(\"TSET t nil\".*?t\[k\]=v", t, re.S)
    print(m.group(0)[:300] if m else 'no')
