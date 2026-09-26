import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """    var seed = _opts.seedOverride != null ? (_opts.seedOverride >>> 0) : Math.floor(Math.random() * 4294967296);
    var vaultPlain = [];"""
new = """    var seed = _opts.seedOverride != null ? (_opts.seedOverride >>> 0) : Math.floor(Math.random() * 4294967296);
    if (_opts.target && String(_opts.target).toLowerCase() !== 'lua51') {
        throw new Error('Target ' + _opts.target + ' not yet implemented — only lua51 is supported. See src/targets/registry.js');
    }
    var _astOpts = { luaVersion: '5.1' };
    var ast = resolveLuaparse().parse(src, _astOpts);
    if (!ast || !ast.body) throw new Error('no body');
    var vaultPlain = [];"""
if old in t:
    t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print("fixed ast")
else:
    print("not found ast patch")
    idx = t.find("var seed = _opts")
    print(t[idx-200:idx+800])
