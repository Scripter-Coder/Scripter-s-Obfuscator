import pathlib
src_path = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\new_luau_fixed.js')
dst_path = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = src_path.read_text(encoding='utf-8')
# Fix prepareSource to use includes
s = s.replace('  if(/\\+=|-=|\\*=|\\/=|%=|\\^=|\\.\\.=/.test(src)){', '  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){')
s = s.replace('  if(/\\bcontinue\\b/.test(src)){', '  if(src.includes("continue")){')
# Also fix the lowerCompound's esc - ensure it is correct
# The lowerCompound's esc function should be correct, but check
# The file's lowerCompound has a regex error for "..=" where "." needs escaping
# Our new_luau_fixed.js's lowerCompound already has correct esc
# Write to dst
dst_path.write_text(s, encoding='utf-8')
print('written', dst_path.stat().st_size)
# Verify
print(s[1800:2200])
