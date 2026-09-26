import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = """    // HMAC-SHA256 truncated keyed by canary (not sum%0x3b9aca07)
    var _hmacCanary = options._canary ? options._canary.magic : 0x5A;
    var h = _hmacCanary % 4294967296;
    for (var _hi=0; _hi<bytes.length; _hi++) h = (h*33 + bytes[_hi]) % 4294967296;
    var chk = h % 4294967291;
    var mod = chk % 256;"""
new = """    var chk, mod;
    if (_isDebugLoader) {
        chk = checksum(bytes);
        mod = chk % 256;
    } else {
        var _hmacCanary = options._canary ? options._canary.magic : 0x5A;
        var h = _hmacCanary % 4294967296;
        for (var _hi=0; _hi<bytes.length; _hi++) h = (h*33 + bytes[_hi]) % 4294967296;
        chk = h % 4294967291;
        mod = chk % 256;
    }"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('fixed hmac debug conditional')
else:
    print('not found hmac js simple for debug fix')
    idx = s.find("var _hmacCanary")
    print(s[idx-300:idx+600])

# also fix Lua part to be conditional on _isDebugLoader
# Find the Lua push for CH
old2 = """    out.push('local ' + CH + '= (function() local g=(getgenv and getgenv()) or _G; local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i])%4294967296 end; return h%4294967291 end)()');"""
new2 = """    if (_isDebugLoader) {
        out.push('local ' + SUM + '=0 local ' + XF + '=0');
        out.push('for ' + IV + '=1,' + C + ' do ' + SUM + '=' + '(' + SUM + '+' + T + '[' + IV + '])%' + polyNum(1000000007) + ' ' + XF + '=' + X + '(' + XF + ',' + T + '[' + IV + ']) end');
        out.push('local ' + CH + '=(' + SUM + '+' + XF + '*' + polyNum(31) + ')'+'%' + polyNum(1000000007));
    } else {
        out.push('local ' + CH + '= (function() local g=(getgenv and getgenv()) or _G; local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i])%4294967296 end; return h%4294967291 end)()');
    }"""
if old2 in s:
    s = p.read_text(encoding='utf-8')
    s = s.replace(old2, new2)
    p.write_text(s, encoding='utf-8')
    print('fixed hmac lua conditional')
else:
    print('not found hmac lua for debug fix')
    # find CH push
    idx = s.find("local ' + CH + '= (function()")
    print(s[idx-500:idx+800] if idx!=-1 else 'no idx')
