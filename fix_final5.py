import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
# Fix stripParamTypes to handle ... and complex return types
old_strip = """function stripParamTypes(line) {
  return line.replace(/(function\\s+[^\\(]*\\()([^\\)]*)(\\))/g, (_m,a,params,c) => {
    const p=params.replace(/([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\\n]*>)?(?:\\[\\])?(?:\\s*\\|\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>]*>)?)*/g,'$1');
    return a+p+c;
  }).replace(/(\\))\\s*:\\s*[A-Za-z_][A-Za-z0-9_]*(?:<[^>\\n]*>)?(?:\\[\\])?(?:\\s*\\|\\s*[A-Za-z_][A-Za-z0-9_]*)*/g,'$1');
}"""
new_strip = """function stripParamTypes(line) {
  return line.replace(/(function\\s*[^\\(]*\\()([^\\)]*)(\\))/g, (_m,a,params,c) => {
    // Handle params like "a: number", "...: number", "a: Array<number>" etc.
    const p=params.replace(/([A-Za-z_][A-Za-z0-9_]*|\\.\\.\\.)\\s*:\\s*[^,\\)]+/g,'$1');
    return a+p+c;
  }).replace(/\\)\\s*:\\s*[^\\n]*?(?=\\s*(?:local|return|end|do|then|\\n|$))/g, ')');
}"""
if old_strip in s:
    s = s.replace(old_strip, new_strip)
    print('fixed stripParamTypes')
else:
    print('old_strip not found')
    # Try to find it
    m=re.search(r'function stripParamTypes.*?\n}', s, re.DOTALL)
    print(repr(m.group(0)[:1000]) if m else 'no match')
p.write_text(s, encoding='utf-8')
print('written', len(s))
import subprocess
result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
print(result.stdout, result.stderr, result.returncode)
