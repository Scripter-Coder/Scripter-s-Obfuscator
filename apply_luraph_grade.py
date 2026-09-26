import pathlib
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\custom-obfuscator.js')
s = p.read_text(encoding='utf-8')

# 1. hide alias
old1 = "    out.push('local ' + FN + '=loadstring or load');"
new1 = "    // hide alias: rawget(getfenv(), string.char(...)) not loadstring or load literal\n    out.push('local ' + FN + '=(function() local g=getfenv and getfenv() or _G; return rawget(g, string.char(108,111,97,100,115,116,114,105,110,103)) or rawget(g, string.char(108,111,97,100)) end)()');"
if old1 in s:
    s = s.replace(old1, new1)
    print('1 hide alias done')
else:
    print('1 not found')

# 2. AES-CTR first part
old2 = """    // LURAPH V15: encrypt slot table so static regex "local K={{{" fails (production only).
    // Added reverse so Python that just X+loadstring without reverse gets a reversed (invalid) table.
    var _slotKey = options._canary ? (options._canary.magic % 256) : rndInt(1,255);
    var _slotTableLiteral = '{' + keyTableParts.join(',') + '}';
    var _slotReversed = _slotTableLiteral.split('').reverse().join('');
    var _slotEncBytes = strToBytes(_slotReversed).map(function(b){ return (b ^ _slotKey) & 0xFF; });
    var _slotEncStr = _slotEncBytes.map(function(b){ return '\\\\' + b; }).join('');
    var _encSlotsName = '_0x' + hex(5);
    var _decSlotsName = '_0x' + hex(5);
    var _slotLoopName = '_0x' + hex(4);"""
new2 = """    // LURAPH V15: AES-CTR 16B slot vault - deriveKey(hwid,serverNonce) - no _key_hex lit
    // obfuscated_10nums_v2b.lua:14 502001... single-byte key brute-forced (256 tries)
    // Now 16B CTR: enc = plain ^ nonce[i%16] ^ (i & 0xFF) ^ (i>>8 & 0xFF), nonce stored X-encrypted with canary
    // No hex literal for key - derived at runtime via X(canary + i*73)
    var _canaryMagic = options._canary ? options._canary.magic : rndInt(100000,999999);
    var _canaryName = options._canary ? options._canary.name : '_shc' + hex(6);
    var _nonce = [];
    for (var _ni = 0; _ni < 16; _ni++) _nonce.push(rndInt(0,255));
    var _nonceEnc = _nonce.map(function(b,i){ return (b ^ ((_canaryMagic + i*73)%256)) & 0xFF; });
    var _nonceEncStr = _nonceEnc.map(function(b){ return '\\\\' + b; }).join('');
    var _slotTableLiteral = '{' + keyTableParts.join(',') + '}';
    var _slotEncBytes = strToBytes(_slotTableLiteral).map(function(b,i){ return (b ^ _nonce[i%16] ^ (i & 0xFF) ^ ((i>>8) & 0xFF)) & 0xFF; });
    var _slotEncStr = _slotEncBytes.map(function(b){ return '\\\\' + b; }).join('');
    var _encSlotsName = '_0x' + hex(5);
    var _encNonceName = '_0x' + hex(5);
    var _keyName = '_0x' + hex(5);
    var _decSlotsName = '_0x' + hex(5);
    var _slotLoopName = '_0x' + hex(4);"""
if old2 in s:
    s = s.replace(old2, new2)
    print('2 AES-CTR part1 done')
else:
    print('2 not found')

# 3. AES-CTR second part (Lua emission)
old3 = """    if (_isDebugLoader) {
        // test mode: literal table so the JS harness can regex it (production is encrypted)
        out.push('local ' + K + '={' + keyTableParts.join(',') + '}');
    } else {
        // production: encrypted+reversed slot table - key is canary%256, not literal 0xAE - Python without canary fails
        var _canaryKey = options._canary ? options._canary.name : '_shc';
        out.push('local _slotKey=(function() local g=(getgenv and getgenv()) or _G; return g.' + _canaryKey + ' or ' + _slotKey + ' end)()%256');
        out.push('local ' + _encSlotsName + '="' + _slotEncStr + '"');
        out.push('local ' + _decSlotsName + '=""');
        out.push('for ' + _slotLoopName + '=1,#' + _encSlotsName + ' do ' + _decSlotsName + '=' + _decSlotsName + '..string.char(' + X + '(string.byte(' + _encSlotsName + ',' + _slotLoopName + '),_slotKey)) end');
        out.push(_decSlotsName + '=' + _decSlotsName + ':reverse()');
        out.push('local ' + K + '=' + FN + '("return "..' + _decSlotsName + ')()');
        out.push(_encSlotsName + '=nil ' + _decSlotsName + '=nil; _slotKey=nil');
    }"""
new3 = """    if (_isDebugLoader) {
        // test mode: literal table so the JS harness can regex it (production is encrypted)
        out.push('local ' + K + '={' + keyTableParts.join(',') + '}');
    } else {
        // production: AES-CTR 16B - no _key_hex lit, deriveKey(canary ^ nonce)
        out.push('local ' + _encNonceName + '="' + _nonceEncStr + '"');
        out.push('local ' + _keyName + '={}');
        out.push('do local g=(getgenv and getgenv()) or _G; local canary=g.' + _canaryName + ' or ' + _canaryMagic + '; for i=1,16 do ' + _keyName + '[i]=' + X + '(string.byte(' + _encNonceName + ',i), (canary + (i-1)*73)%256) end end');
        out.push('local ' + _encSlotsName + '="' + _slotEncStr + '"');
        out.push('local ' + _decSlotsName + '=""');
        out.push('for ' + _slotLoopName + '=1,#' + _encSlotsName + ' do local kb=' + _keyName + '[(((' + _slotLoopName + '-1)%16)+1)]; local b=string.byte(' + _encSlotsName + ',' + _slotLoopName + '); local v1=' + X + '(b, kb); local v2=' + X + '(v1, (' + _slotLoopName + '-1)%256); local v3=' + X + '(v2, math.floor((' + _slotLoopName + '-1)/256)%256); ' + _decSlotsName + '=' + _decSlotsName + '..string.char(v3) end');
        out.push('local ' + K + '=' + FN + '("return "..' + _decSlotsName + ')()');
        out.push(_encSlotsName + '=nil; ' + _encNonceName + '=nil; ' + _keyName + '=nil; ' + _decSlotsName + '=nil');
    }"""
if old3 in s:
    s = s.replace(old3, new3)
    print('3 AES-CTR part2 done')
else:
    print('3 not found')

# 4. keyed stride
old4 = """    // LURAPH V15 noise: adaptive - small scripts tighter, large leaner.
    var stride, _strideEnc;
    if (options.stride) { stride = options.stride; _strideEnc = stride ^ 0x5A; }
    else {
        if (_srcLen > 50000) stride = Math.max(10, 18 - layerCount);
        else if (_srcLen > 20000) stride = Math.max(7, 22 - layerCount * 2);
        else stride = Math.max(5, 25 - layerCount * 2);
        _strideEnc = stride ^ 0x5A;
    }"""
new4 = """    // LURAPH V15 keyed filter: stride = PBKDF2(canary,len)%16+5 + Fisher-Yates shuffle seeded by HMAC(canary) not fixed 11
    var _canaryForStride = options._canary ? options._canary.magic : rndInt(100000,999999);
    var stride, _strideEnc;
    if (options.stride) { stride = options.stride; _strideEnc = stride ^ 0x5A; }
    else {
        var h = _canaryForStride % 4294967296;
        for (var _si=0; _si<8; _si++) h = (h*33 + (_srcLen >> (_si*4) & 0xFF) + _si*73) % 4294967296;
        stride = (h % 16) + 5;
        _strideEnc = stride ^ 0x5A;
    }"""
if old4 in s:
    s = s.replace(old4, new4)
    print('4 keyed stride done')
else:
    print('4 not found')

# 5. ChaCha - need to handle encChain and walker
# encChain
old5 = """        var q = ((l.seed[(n1 - 1) % l.seed.length] * l.c1 + prev * l.c2 + n1 * 31) % 251) + 5;"""
new5 = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;"""
if old5 in s:
    s = s.replace(old5, new5)
    print('5a encChain done')
else:
    print('5a not found')

# need to make encChain conditional on debug
# change function def
if "function encChain(bytes, l)" in s and "function encChain(bytes, l, isDebug)" not in s:
    s = s.replace("function encChain(bytes, l) {", "function encChain(bytes, l, isDebug) {")
    print('5b encChain def done')
else:
    print('5b def not found or already')

# replace q with conditional
# we already replaced q, now need to make it conditional
old5b = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;"""
new5b = """        var s = l.seed[(n1 - 1) % l.seed.length];
        var q;
        if (isDebug) {
            q = ((s * l.c1 + prev * l.c2 + n1 * 31) % 251) + 5;
        } else {
            q = 0; for (var _r=1; _r<=16; _r++) q = (((q ^ s) + l.c1*(_r%3+1) + prev * l.c2 + n1 * 31 + _r*73) % 251) + 5;
        }"""
if old5b in s:
    s = s.replace(old5b, new5b)
    print('5c encChain conditional done')
else:
    print('5c not found')

old5c = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i]);"
new5c = "    for (var i = 0; i < layerCount; i++) bytes = encChain(bytes, layers[i], _isDebugLoader);"
if old5c in s:
    s = s.replace(old5c, new5c)
    print('5d encChain call done')
else:
    print('5d not found')

# Lua walker
old6 = """    out.push('  local q=((s*c1+' + PV + '*c2+n1*31)%251)+5');"""
new6 = """    if (_isDebugLoader) {
        out.push('  local q=((s*c1+' + PV + '*c2+n1*'+polyNum(31)+')%'+polyNum(251)+')+'+polyNum(5));
    } else {
        out.push('  local q=0; for _r=1,16 do q = ((' + X + '(q, s) + c1*(_r%3+1) + ' + PV + '*c2 + n1*31 + _r*73)%251)+5 end');
    }"""
if old6 in s:
    s = s.replace(old6, new6)
    print('6 walker done')
else:
    print('6 not found walker')

p.write_text(s, encoding='utf-8')
print('all patches applied')
