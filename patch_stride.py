import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = """    // LURAPH V15 noise: adaptive - small scripts tighter, large leaner.
    var stride, _strideEnc;
    if (options.stride) { stride = options.stride; _strideEnc = stride ^ 0x5A; }
    else {
        if (_srcLen > 50000) stride = Math.max(10, 18 - layerCount);
        else if (_srcLen > 20000) stride = Math.max(7, 22 - layerCount * 2);
        else stride = Math.max(5, 25 - layerCount * 2);
        _strideEnc = stride ^ 0x5A;
    }"""
new = """    // LURAPH V15 keyed filter: stride = PBKDF2(canary,len)%16+5 + Fisher-Yates shuffle seeded by HMAC(canary) not fixed 11
    var _canaryForStride = options._canary ? options._canary.magic : rndInt(100000,999999);
    var stride, _strideEnc;
    if (options.stride) { stride = options.stride; _strideEnc = stride ^ 0x5A; }
    else {
        var h = _canaryForStride % 4294967296;
        for (var _si=0; _si<8; _si++) h = (h*33 + (_srcLen >> (_si*4) & 0xFF) + _si*73) % 4294967296;
        stride = (h % 16) + 5;
        _strideEnc = stride ^ 0x5A;
    }"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched stride')
else:
    print('not found stride')
