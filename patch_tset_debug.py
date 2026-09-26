import pathlib
p = pathlib.Path('vm-bytecode.js')
t = p.read_text(encoding='utf-8')
old = "            case 'TSET':\n                L.push('   local v=' + S + '[' + SP + '] local k=' + S + '[' + SP + '-1] local t=' + S + '[' + SP + '-2] t[k]=v ' + SP + '=' + SP + '-3');\n                break;"
new = "            case 'TSET':\n                L.push('   local v=' + S + '[' + SP + '] local k=' + S + '[' + SP + '-1] local t=' + S + '[' + SP + '-2] if k==nil then print(\"TSET k nil\", k, v, t) end if t==nil then print(\"TSET t nil\", t, k, v) end t[k]=v ' + SP + '=' + SP + '-3');\n                break;"
if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print('patched')
else:
    print('old not found')
    # debug
    import re
    m=re.search(r"case 'TSET':.*?break;", t, re.S)
    print(m.group(0)[:500] if m else 'no')
