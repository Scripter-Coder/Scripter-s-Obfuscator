import pathlib
content = open(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\test_luau_simple2.mjs', encoding='utf-8').read()
# Fix imports
content = content.replace("from 'C:/Users/Ryzen 9 5900x/Downloads/new-obfuscator-current/new-obfuscator/vm-bytecode.js'", "from './vm-bytecode.js'")
# The file already has relative for luaparse, keep it
target = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\test_simple_luau.mjs')
target.write_text(content, encoding='utf-8')
print('written', target, target.stat().st_size)
print(content[:400])
