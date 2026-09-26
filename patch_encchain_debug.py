import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;"""
new = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q;
        if (typeof _isDebugLoader !== 'undefined' && _isDebugLoader) {
            q = ((s * l.c1 + prev * l.c2 + n1 * 31) % 251) + 5;
        } else {
            q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;
        }"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched encChain debug conditional')
else:
    print('not found encChain q')
    idx = s.find("var s = l.seed")
    print(s[idx-200:idx+600])

# also patch Lua walker to be conditional on _isDebugLoader
old2 = """    // 16 rounds ChaCha quarter-round + S-box, not 6 q loops
    out.push('  local q=0; for _r=1,16 do q = ((' + X + '(q, s) + c1*(_r%3+1) + ' + PV + '*c2 + n1*31 + _r*73)%251)+5 end');"""
new2 = """    if (_isDebugLoader) {
        out.push('  local q=((s*c1+' + PV + '*c2+n1*'+polyNum(31)+')%'+polyNum(251)+')+'+polyNum(5));
    } else {
        out.push('  local q=0; for _r=1,16 do q = ((' + X + '(q, s) + c1*(_r%3+1) + ' + PV + '*c2 + n1*31 + _r*73)%251)+5 end');
    }"""
if old2 in s:
    s = p.read_text(encoding='utf-8')
    s = s.replace(old2, new2)
    p.write_text(s, encoding='utf-8')
    print('patched lua walker debug conditional')
else:
    print('not found lua walker')
    idx = s.find("16 rounds ChaCha")
    print(s[idx-300:idx+800] if idx!=-1 else 'no idx')
