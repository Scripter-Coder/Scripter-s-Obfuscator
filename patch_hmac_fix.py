import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')
old = "    out.push('local ' + CH + '= (function() local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i] + math.floor(h/65536)%256)%4294967296 end; return h%4294967291 end)()');"
new = "    out.push('local ' + CH + '= (function() local g=(getgenv and getgenv()) or _G; local h=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,' + C + ' do h=(h*33 + ' + T + '[i] + math.floor(h/65536)%256)%4294967296 end; return h%4294967291 end)()');"
if old in s:
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print('fixed hmac g')
else:
    print('not found hmac g fix')
    idx = s.find("local ' + CH + '= (function()")
    print(s[idx-200:idx+600])
