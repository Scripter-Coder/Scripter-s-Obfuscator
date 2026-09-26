import pathlib
p = pathlib.Path('vm-bytecode.js')
t = p.read_text(encoding='utf-8')
old = "    L.push(' while true do');\n    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');\n    L.push('  local _fn=' + HAND + '[' + OP + ']');\n    L.push('  if _fn then _fn() else error(\"bad opcode \"..tostring(' + OP + '),0) end');\n    L.push(' end');"
new = "    L.push(' while true do');\n    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');\n    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');\n    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');\n    L.push('   if n==0 then return end');\n    L.push('   if n==1 then return ' + S + '[' + SP + '] end');\n    L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');\n    L.push('   return ' + UNP + '(a)');\n    L.push('  end');\n    L.push('  if ' + OP + '==' + OPCODES['RETP'] + ' then');\n    L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');\n    L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');\n    L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');\n    L.push('   for j=1,p.n do a[k+j]=p[j] end');\n    L.push('   return ' + UNP + '(a)');\n    L.push('  end');\n    L.push('  local _fn=' + HAND + '[' + OP + ']');\n    L.push('  if _fn then _fn() else error(\"bad opcode \"..tostring(' + OP + '),0) end');\n    L.push(' end');"
if old not in t:
    print('old not found')
    # debug: find nearby
    idx = t.find("L.push(' while true do');")
    print(t[idx-200:idx+800])
else:
    t2 = t.replace(old, new)
    p.write_text(t2, encoding='utf-8')
    print('patched ret')
