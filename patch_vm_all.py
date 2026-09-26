import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js')
s = p.read_text(encoding='utf-8')
# add polyNum if not already
if 'function polyNum' not in s:
    s = s.replace("function hex(len) {", "function hex(len) {")
    # actually add polyNum after hex
    old = """function hex(len) {
    var c = '0123456789abcdef', s = '';
    for (var i = 0; i < len; i++) s += c[rnd(16)];
    return s;
}"""
    new = """function hex(len) {
    var c = '0123456789abcdef', s = '';
    for (var i = 0; i < len; i++) s += c[rnd(16)];
    return s;
}
function polyNum(n){
    if(n>500) return '0x'+n.toString(16);
    var r=rnd(2);
    if(r===0) return '0x'+n.toString(16);
    var a=rndInt(1, Math.max(1,n-1));
    return '('+a+'+'+(n-a)+')';
}"""
    if old in s:
        s = s.replace(old, new)
        print('added polyNum')
    else:
        print('polyNum add not found')

# fix HAND to use polyNum
old2 = "        L.push(' ' + HAND + '[' + oc + ']=function()');"
new2 = "        // metamorphic qf 228: HAND[500] static -> polyNum so 500 -> 0x1F4 / (a+b), no literal\n        L.push(' ' + HAND + '[' + polyNum(oc) + ']=function()');"
if old2 in s:
    s = s.replace(old2, new2)
    print('fixed HAND polyNum')
else:
    print('HAND not found')
    # try to find HAND line
    import re
    for line in s.splitlines():
        if 'HAND[' in line and 'function()' in line:
            print(repr(line))

# add string.dump
old3 = "    L.push('local ' + E + '=_G');"
new3 = "    L.push('local ' + E + '=_G');\n    // string.dump anti-lupa: Luau vs lupa dump differs\n    L.push('if string.dump then local _d=string.dump(function() return ' + HAND + ' end) end');"
if old3 in s:
    s = s.replace(old3, new3)
    print('added string.dump')
else:
    print('string.dump base not found')

# fix nDecoyChunks
old4 = "    var nDecoyChunks = rndInt(8, 15); // ULTRA: 3x more decoy chunks"
new4 = "    var nDecoyChunks = rndInt(30, 40); // LURAPH-GRADE: 30+ live chunks, not 8-15 dead"
if old4 in s:
    s = s.replace(old4, new4)
    print('fixed nDecoyChunks')
else:
    # try original without comment
    if "var nDecoyChunks = rndInt(8, 15);" in s:
        s = s.replace("var nDecoyChunks = rndInt(8, 15);", "var nDecoyChunks = rndInt(30, 40); // LURAPH-GRADE")
        print('fixed nDecoyChunks alt')
    else:
        print('nDecoyChunks not found')

# add VM flatten boot
old5 = "    L.push('do');\n    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');"
new5 = """    // LURAPH-GRADE VM flatten: opaque predicates + task.spawn, all chunks live
    var _opaque = rndInt(5,9);
    L.push(' if ((function() local a=' + _opaque + '; local b=' + (_opaque*2) + '; return (a*b)%7=='+(( _opaque*(_opaque*2))%7)+' end)()) then end');
    L.push(' if task and task.spawn then task.spawn(function() pcall(' + RUN + ',' + (build.chunks.length) + ',{}) end) end');
    L.push(' for _ci=' + (build.chunks.length+1) + ',#' + CH + ' do if pcall(function() return ' + RUN + '(_ci,{}) end) then end end');
    L.push('do');
    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');"""
if old5 in s:
    s = s.replace(old5, new5)
    print('fixed vm flatten')
else:
    print('vm flatten not found')
    idx = s.find("L.push('do');")
    print(s[idx-500:idx+800] if idx!=-1 else 'no idx')

p.write_text(s, encoding='utf-8')
print('done vm patches')
