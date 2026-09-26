import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """            L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local f=' + S + '[' + SP + '-n]');
        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
        L.push('   return f(' + UNP + '(a))');
        L.push('  end');"""
print("count", t.count(old))
# try with different line endings
import re
pattern = r"L\.push\('  if ' \+ OP \+ '==' \+ OPCODES\['TAILCALL'\]"
print(len(re.findall(pattern, t)))
# show surroundings of each match
for m in re.finditer(pattern, t):
    print(t[m.start()-100:m.start()+400])
