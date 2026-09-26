import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Downloads\new-obfuscator-current\new-obfuscator\src\targets\luau.js')
s = p.read_text(encoding='utf-8')
# Find lowerCompound and replace its esc part
# The current lowerCompound has: function esc(s){ return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }
# And: const re = new RegExp("([A-Za-z_][A-Za-z0-9_\\.\\[\\]\\\"\\']*?)\\\\s*"+e+"\\\\s*([^\\n;]+)", "g");
# We need to fix the esc to correctly handle "+=" etc.
# Instead, we can make lowerCompound not use RegExp with dynamic e, but use explicit patterns
old = re.search(r'function lowerCompound.*?return out;\n\}', s, re.DOTALL)
if old:
    print('found lowerCompound', len(old.group(0)))
    new_func = '''function lowerCompound(src){
  const ops = {
    "+=": "+",
    "-=": "-",
    "*=": "*",
    "/=": "/",
    "%=": "%",
    "^=": "^",
    "..=": ".."
  };
  let out=src;
  let changed=true;
  while(changed){
    changed=false;
    for(const [op, bin] of Object.entries(ops)){
      let pattern;
      if(op=="+=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*\\+=\\s*([^\\n;]+)/g;
      else if(op=="-=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*-=\\s*([^\\n;]+)/g;
      else if(op=="*=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*\\*=\\s*([^\\n;]+)/g;
      else if(op=="/=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*\\/=\\s*([^\\n;]+)/g;
      else if(op=="%=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*%=\\s*([^\\n;]+)/g;
      else if(op=="^=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*\\^=\\s*([^\\n;]+)/g;
      else if(op=="..=") pattern = /([A-Za-z_][A-Za-z0-9_\\.\\[\\]\"\']*?)\\s*\\.\\.=\\s*([^\\n;]+)/g;
      const newOut = out.replace(pattern, (m, left, right) => {
        left=left.trim(); right=right.trim();
        if(!/^[A-Za-z_]/.test(left)) return m;
        if(left.includes('=')) return m;
        changed=true;
        return left + " = " + left + " " + bin + " " + right;
      });
      if(newOut!==out){ out=newOut; }
    }
  }
  return out;
}'''
    s = s.replace(old.group(0), new_func)
    p.write_text(s, encoding='utf-8')
    print('replaced')
    import subprocess
    result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    print(result.stdout, result.stderr, result.returncode)
else:
    print('not found')
