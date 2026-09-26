import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = "    out.push('local ' + FN + '=loadstring or load');"
new = "    // hide alias: rawget(getfenv(), string.char(...)) not loadstring or load literal\n    out.push('local ' + FN + '=(function() local g=getfenv and getfenv() or _G; return rawget(g, string.char(108,111,97,100,115,116,114,105,110,103)) or rawget(g, string.char(108,111,97,100)) end)()');"
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched hide alias')
else:
    print('not found')
    print(s[s.find('loadstring or load')-200:s.find('loadstring or load')+200])
