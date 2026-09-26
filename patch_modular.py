import pathlib
# vm-pass.js
p = pathlib.Path('vm-pass.js')
t = p.read_text(encoding='utf-8')
old1 = "    function vaultKey(p1) { return ((seed * 1.0 * p1 * MA + p1 * MB + MC) % 251) + 5; }"
new1 = "    function vaultKey(p1) { return ((((seed%251)*(p1%251)%251 * (MA%251)%251 + (p1%251)*(MB%251)%251 + MC) %251) + 5); }"
t = t.replace(old1, new1)
old2 = "    DR += '  local a=' + V + '[p] local b=(' + seed + '*1.0*p*' + MA + '+p*' + MB + '+' + MC + ')%251+5';"
new2 = "    DR += '  local a=' + V + '[p] local b=(((' + seed + '%251)*(p%251)%251 * (' + MA + '%251)%251 + (p%251)*(' + MB + '%251)%251 + ' + MC + ') %251+5';"
t = t.replace(old2, new2)
p.write_text(t, encoding='utf-8')
print('patched vm-pass')

# vm-bytecode.js
p2 = pathlib.Path('vm-bytecode.js')
t2 = p2.read_text(encoding='utf-8')
old3 = "    L.push('  local a=' + V + '[p] local b=(' + VP.a + '*p+' + VP.b + '+' + seedExpr + '*1.0*((p*p)%' + VP.m + '))%251+' + VP.c);"
new3 = "    L.push('  local a=' + V + '[p] local b=(((' + VP.a + '%251)*(p%251)%251 + ' + VP.b + '%251 + (' + seedExpr + '%251)*(((p*p)%' + VP.m + ')%251)%251 )%251+' + VP.c + ');"
# Actually need to handle seedExpr which may be E["..."] or number, so seed%251 may not work for E["..."]
# For seedExpr being a number, seed%251 works, for E["..."] being a genv lookup, we need to do (seedExpr%251) in Lua, which is valid even if seedExpr is a table lookup
# So we do: ((' + seedExpr + '%251)*(((p*p)%' + VP.m + ')%251)%251
new3 = "    L.push('  local a=' + V + '[p] local b=(((' + VP.a + '%251)*(p%251)%251 + ' + VP.b + '%251 + (' + seedExpr + '%251)*(((p*p)%' + VP.m + ')%251)%251 )%251+' + VP.c + ');"
# Our old string includes *1.0, need to match
old3_check = "    L.push('  local a=' + V + '[p] local b=(' + VP.a + '*p+' + VP.b + '+' + seedExpr + '*1.0*((p*p)%' + VP.m + '))%251+' + VP.c);"
if old3_check in t2:
    t2 = t2.replace(old3_check, new3)
    print('patched vm-bytecode b')
else:
    print('old3 not found')
    # debug
    import re
    m=re.search(r"L\.push\('  local a=' \+ V.*?VP\.c\)", t2, re.S)
    print(m.group(0)[:300] if m else 'no')
p2.write_text(t2, encoding='utf-8')
print('done')
