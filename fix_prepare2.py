import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
old = """export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(/\\+=|-=|\\*=|\\/=|%=|\\^=|\\.\\.=/.test(src)){
    src = lowerCompound(src);
  }
  if(/\\bcontinue\\b/.test(src)){
    src = lowerContinue(src);
  }"""
new = """export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){
    src = lowerCompound(src);
  }
  if(src.includes("continue")){
    src = lowerContinue(src);
  }"""
if old in s:
    s = s.replace(old, new)
    print('replaced prepareSource')
else:
    print('old not found')
    # Find the actual old
    import re
    m=re.search(r'export function prepareSource.*?lowerContinue', s, re.DOTALL)
    print(repr(m.group(0)[:1000]) if m else 'no match')
p.write_text(s, encoding='utf-8')
print('done')
