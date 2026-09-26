import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = """    out.push('  local q=((s*c1+' + PV + '*c2+n1*'+polyNum(31)+')%'+polyNum(251)+')+'+polyNum(5));
    out.push('  local v=' + T + '[n1]');
    if (_gMut) {
        out.push('  v=(v-sh-(i%'+polyNum(3)+')*ma - n1)%'+polyNum(256));
    } else {
        out.push('  v=(v-sh-(i%'+polyNum(3)+')*ma)%'+polyNum(256));
    }
    out.push('  if v<0 then v=v+256 end');
    out.push('  ' + T + '[n1]=' + X + '(v,q)');"""
new = """    // 16 rounds ChaCha quarter-round + S-box, not 6 q loops
    out.push('  local q=0; for _r=1,16 do q = ((' + X + '(q, s) + c1*(_r%3+1) + ' + PV + '*c2 + n1*31 + _r*73)%251)+5 end');
    out.push('  local v=' + T + '[n1]');
    if (_gMut) {
        out.push('  v=(v-sh-(i%'+polyNum(3)+')*ma - n1)%'+polyNum(256));
    } else {
        out.push('  v=(v-sh-(i%'+polyNum(3)+')*ma)%'+polyNum(256));
    }
    out.push('  if v<0 then v=v+256 end');
    out.push('  ' + T + '[n1]=' + X + '(v,q)');"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched chacha')
else:
    print('not found chacha')
    idx = s.find("local q=((s*c1+")
    print(s[idx-300:idx+800] if idx!=-1 else 'no idx')
