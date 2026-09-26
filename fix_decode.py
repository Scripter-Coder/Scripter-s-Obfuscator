import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """    L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
    L.push('  local nc=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216 rp=rp+4');"""
new = """    L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
    L.push('  local mr=' + BL + '[rp] + ' + BL + '[rp+1]*256 rp=rp+2');
    L.push('  local nc=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216 rp=rp+4');"""
if old in t:
    t = t.replace(old, new)
    print("fixed decode va->mr")
else:
    print("not found old decode")
    # try with different indent
    import re
    pattern = r"L\.push\('  local va=\(' \+ BL \+ '\[rp\]==1\) rp=rp\+1'\);"
    for m in re.finditer(pattern, t):
        print(t[m.start()-100:m.start()+200])
old2 = """    L.push('  ' + CH + '[#' + CH + '+1]={c=cd,p=ps,v=va}');"""
new2 = """    L.push('  ' + CH + '[#' + CH + '+1]={c=cd,p=ps,v=va,maxReg=mr}');"""
if old2 in t:
    t = t.replace(old2, new2)
    print("fixed CH decode2")
else:
    print("CH decode2 not found")
    idx = t.find("CH + '[#'")
    print(t[idx-200:idx+400])

p.write_text(t, encoding='utf-8')
print("saved")
