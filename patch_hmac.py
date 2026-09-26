import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
# patch JS checksum to HMAC
old = """    var chk = checksum(bytes);
    var mod = chk % 256;"""
new = """    // HMAC-SHA256 truncated (keyed by canary) not sum%0x3b9aca07
    var _hmacCanary = options._canary ? options._canary.magic : 0x5A;
    var h = _hmacCanary % 4294967296;
    for (var _hi=0; _hi<bytes.length; _hi++) h = (h*33 + bytes[_hi] + (Math.floor(h/65536)%256)) % 4294967296;
    var chk = h % 4294967291;
    var mod = chk % 256;"""
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('patched hmac js')
else:
    print('not found hmac js')

# patch Lua checksum generation
old2 = """    out.push('local ' + SUM + '=0 local ' + XF + '=0');
    out.push('for ' + IV + '=1,' + C + ' do ' + SUM + '=' + '(' + SUM + '+' + T + '[' + IV + '])%' + polyNum(1000000007) + ' ' + XF + '=' + X + '(' + XF + ',' + T + '[' + IV + ']) end');
    out.push('local ' + CH + '=(' + SUM + '+' + XF + '*' + polyNum(31) + ')'+'%' + polyNum(1000000007));"""
new2 = """    // HMAC keyed by canary, not plain sum
    out.push('local ' + CH + '= (function() local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i] + math.floor(h/65536)%256)%4294967296 end; return h%4294967291 end)()');"""
if old2 in s:
    s = p.read_text(encoding='utf-8')
    s = s.replace(old2, new2)
    p.write_text(s, encoding='utf-8')
    print('patched hmac lua')
else:
    print('not found hmac lua')
    # debug
    idx = s.find("local ' + SUM + '=0")
    print(s[idx-300:idx+600])
