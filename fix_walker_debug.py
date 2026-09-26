import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = "    if (_isDebugLoader) {\n        out.push('  local q=((s*c1+' + PV + '*c2+n1*'+polyNum(31)+')%'+polyNum(251)+')+'+polyNum(5));"
new = "    if (options && options._debug) {\n        out.push('  local q=((s*c1+' + PV + '*c2+n1*'+polyNum(31)+')%'+polyNum(251)+')+'+polyNum(5));"
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('fixed walker debug')
else:
    print('not found walker debug')
    idx = s.find("if (_isDebugLoader)")
    print(s[idx-300:idx+600] if idx!=-1 else 'no idx')
    # try alternative
    if "if (_isDebugLoader) {" in s:
        s = s.replace("if (_isDebugLoader) {", "if (options && options._debug) {")
        p.write_text(s, encoding='utf-8')
        print('fixed via simple replace')

# also fix the other walker conditional (maybe second)
if "if (_isDebugLoader)" in s:
    s = s.replace("if (_isDebugLoader)", "if (options && options._debug)")
    p.write_text(s, encoding='utf-8')
    print('fixed second')
