import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i], _isDebugLoader);"
new = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i], !!(options && options._debug));"
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('fixed')
else:
    print('not found')
    idx = s.find("for (var i = 0; i < layerCount; i++) bytes = encChain")
    print(s[idx-200:idx+400])
