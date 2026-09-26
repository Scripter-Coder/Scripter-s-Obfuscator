import pathlib, re
src_fixed = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\new_luau_fixed.js').read_text(encoding='utf-8')
src_correct = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\new_luau.js').read_text(encoding='utf-8')
m = re.search(r'function stripParamTypes.*?\n}', src_correct, re.DOTALL)
if m:
    correct_strip = m.group(0)
    # Replace in fixed
    src_fixed = re.sub(r'function stripParamTypes.*?\n}', correct_strip, src_fixed, count=1, flags=re.DOTALL)
    print('replaced stripParamTypes')
else:
    print('no match correct')
# Fix prepareSource
src_fixed = src_fixed.replace('  if(/\\+=|-=|\\*=|\\/=|%=|\\^=|\\.\\.=/.test(src)){', '  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){')
src_fixed = src_fixed.replace('  if(/\\bcontinue\\b/.test(src)){', '  if(src.includes("continue")){')
dst = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
dst.write_text(src_fixed, encoding='utf-8')
print('written', dst.stat().st_size)
# Verify
import subprocess
result = subprocess.run(['node', '--check', str(dst)], capture_output=True, text=True)
print(result.stdout, result.stderr, result.returncode)
