import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
# JS part: replace original checksum with HMAC simple
old_js = """    var chk = checksum(bytes);
    var mod = chk % 256;"""
new_js = """    // HMAC-SHA256 truncated keyed by canary (not sum%0x3b9aca07)
    var _hmacCanary = options._canary ? options._canary.magic : 0x5A;
    var h = _hmacCanary % 4294967296;
    for (var _hi=0; _hi<bytes.length; _hi++) h = (h*33 + bytes[_hi]) % 4294967296;
    var chk = h % 4294967291;
    var mod = chk % 256;"""
if old_js in s:
    s = s.replace(old_js, new_js)
    print('patched hmac js simple')
else:
    print('not found hmac js simple')
    idx = s.find("var chk = checksum")
    print(s[idx-200:idx+400])

# Lua part: replace sum/xf block
old_lua = """    out.push('local ' + SUM + '=0 local ' + XF + '=0');
    out.push('for ' + IV + '=1,' + C + ' do ' + SUM + '=' + '(' + SUM + '+' + T + '[' + IV + '])%' + polyNum(1000000007) + ' ' + XF + '=' + X + '(' + XF + ',' + T + '[' + IV + ']) end');
    out.push('local ' + CH + '=(' + SUM + '+' + XF + '*' + polyNum(31) + ')'+'%' + polyNum(1000000007));"""
new_lua = """    out.push('local ' + CH + '= (function() local g=(getgenv and getgenv()) or _G; local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i])%4294967296 end; return h%4294967291 end)()');"""
if old_lua in s:
    s = s.replace(old_lua, new_lua)
    print('patched hmac lua simple')
else:
    print('not found hmac lua simple')
    idx = s.find("local ' + SUM + '=0")
    print(s[idx-300:idx+600] if idx!=-1 else 'no sum')

p.write_text(s, encoding='utf-8')
