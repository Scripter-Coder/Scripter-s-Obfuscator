import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
# Fix stripLocalTypes to be simpler and more robust
old = """function stripLocalTypes(line) {
  return line.replace(/(\\blocal\\s+[A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*[^=,\\n]+(?=\\s*(?:=|,|$))/g,'$1');
}"""
new = """function stripLocalTypes(line) {
  return line.replace(/:\\s*[^=\\n,]+(?=\\s*=)/g, '');
}"""
if old in s:
    s = s.replace(old, new)
    print('fixed stripLocalTypes')
else:
    print('old not found')
    # Try alternative
    m=re.search(r'function stripLocalTypes.*?\n\}', s, re.DOTALL)
    print(repr(m.group(0)[:500]) if m else 'no match')
p.write_text(s, encoding='utf-8')
print('written')
import subprocess
result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
print(result.stdout, result.stderr, result.returncode)
