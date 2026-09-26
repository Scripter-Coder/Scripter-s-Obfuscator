import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
m = re.search(r'function stripLocalTypes.*?\n}', s, re.DOTALL)
if m:
    print(repr(m.group(0)[:1000]))
    new_func = "function stripLocalTypes(line) {\n  return line.replace(/:\\s*[^=\\n,]+(?=\\s*=)/g, '');\n}"
    s = s.replace(m.group(0), new_func)
    p.write_text(s, encoding='utf-8')
    print('fixed')
    import subprocess
    result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    print(result.stdout, result.stderr, result.returncode)
else:
    print('not found')
