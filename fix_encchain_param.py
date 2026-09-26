import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
# fix encChain definition to accept isDebug
old = "function encChain(bytes, l) {"
new = "function encChain(bytes, l, isDebug) {"
if old in s:
    s = s.replace(old, new)
    print('fixed encChain def')
else:
    print('not found def')

old2 = "        var s = l.seed[(n1 - 1) % l.seed.length];\n        var q;\n        if (typeof _isDebugLoader !== 'undefined' && _isDebugLoader) {"
new2 = "        var s = l.seed[(n1 - 1) % l.seed.length];\n        var q;\n        if (isDebug) {"
if old2 in s:
    s = s.replace(old2, new2)
    print('fixed encChain if')
else:
    print('not found if')
    idx = s.find("var s = l.seed")
    print(s[idx-200:idx+600])

# fix calls
old3 = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i]);"
new3 = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i], _isDebugLoader);"
if old3 in s:
    s = s.replace(old3, new3)
    print('fixed call')
else:
    print('not found call')

p.write_text(s, encoding='utf-8')
