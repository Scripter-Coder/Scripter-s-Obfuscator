import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\vm-bytecode.js')
s = p.read_text(encoding='utf-8')
# Fix the erroneous targetName references in emitVM
# The file has at line 1310: if (targetName === 'luau') { L.push('if getfenv ...') }
# Should be build.target
s = s.replace("if (targetName === 'luau') { L.push('if getfenv", "if (build.target === 'luau') { L.push('if getfenv")
# The other occurrence: if (build.staticEnv || build.debugProtect || targetName === 'luau')
# Already fixed to build.target in previous patch? Check
# The error was at line 1311: if (targetName === 'luau') { L.push('if getfenv ...')
# We already have that, but we need to also fix the later ones
# Fix the second occurrence inside the ENV block that we introduced
# Search for the pattern we added for frozen check that uses targetName
s = s.replace("if (targetName === 'luau') {\n        L.push('do local _frozen", "if (build.target === 'luau') {\n        L.push('do local _frozen")
# Fix the ENV metatable check
s = s.replace("if (targetName === 'luau') {\n            L.push('setmetatable", "if (build.target === 'luau') {\n            L.push('setmetatable")
# Also fix the earlier check for staticEnv that we added
# It should be build.target === 'luau'
# The earlier patch added: if (build.staticEnv || build.debugProtect || targetName === 'luau')
# But that was already correct (build.target not targetName) - check
if "targetName === 'luau'" in s:
    print('still has targetName')
    # Find and replace
    s = s.replace("targetName === 'luau'", "build.target === 'luau'")
    print('replaced remaining')
p.write_text(s, encoding='utf-8')
print('fixed')
print(s[1300*100:1300*100+2000] if len(s)>130000 else s[-2000:])
