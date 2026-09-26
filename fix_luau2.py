import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
s = s.replace("  if(/\\+=|-=|\\*=|\\/=|%=|\\^=|\\.\\.=/.test(src)){", "  if(src.includes(\"+=\") || src.includes(\"-=\") || src.includes(\"*=\") || src.includes(\"/=\") || src.includes(\"%=\") || src.includes(\"^=\") || src.includes(\"..=\")){")
s = s.replace("  if(/\\bcontinue\\b/.test(src)){", "  if(src.includes(\"continue\")){")
# Also fix the lowerCompound's regex if needed - but keep it
p.write_text(s, encoding='utf-8')
print('fixed')
print(s[1800:2500])
