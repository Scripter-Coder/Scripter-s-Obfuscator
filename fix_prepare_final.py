import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
correct_prepare = """export function prepareSource(src){
  src = stripTypeDecls(src);
  src = stripTypeAssertions(src);
  if(src.includes("+=") || src.includes("-=") || src.includes("*=") || src.includes("/=") || src.includes("%=") || src.includes("^=") || src.includes("..=")){
    src = lowerCompound(src);
  }
  if(src.includes("continue")){
    src = lowerContinue(src);
  }
  src = src.split(/\\r?\\n/).map(line=>stripLocalTypes(stripParamTypes(line))).join("\\n");
  src = src.replace(/^\\s*(?:export\\s+)?type\\s+[^\\n]*$/gm, "");
  return src;
}"""
# Replace the old prepareSource
old_pattern = r'export function prepareSource.*?return src;\n\}'
new_s, count = re.subn(old_pattern, correct_prepare, s, flags=re.DOTALL)
if count==0:
    print('not found')
else:
    print('replaced', count)
    p.write_text(new_s, encoding='utf-8')
    print('written', len(new_s))
    import subprocess
    result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    print(result.stdout, result.stderr, result.returncode)
