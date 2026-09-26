import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = """        var q = ((l.seed[(n1 - 1) % l.seed.length] * l.c1 + prev * l.c2 + n1 * 31) % 251) + 5;"""
new = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched encChain')
else:
    print('not found encChain')
    idx = s.find("var q = ((l.seed")
    print(s[idx-200:idx+400] if idx!=-1 else 'no idx')
