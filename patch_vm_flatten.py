import pathlib, re
p = pathlib.Path(r'C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js')
s = p.read_text(encoding='utf-8')
# increase decoy chunks to 30+ live
old = "    var nDecoyChunks = rndInt(8, 15); // ULTRA: 3x more decoy chunks"
new = "    var nDecoyChunks = rndInt(30, 40); // LURAPH-GRADE: 30+ live chunks, not 8-15 dead"
if old in s:
    s = s.replace(old, new)
    print('patched nDecoyChunks')
else:
    print('not found nDecoyChunks')
    idx = s.find("var nDecoyChunks")
    print(s[idx-100:idx+200])

# add opaque predicates and task.spawn after VM loop, before boot
# find the boot section: L.push('do'); L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');
old2 = "    L.push('do');\n    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');"
new2 = """    // LURAPH-GRADE VM flatten: opaque predicates + task.spawn, all chunks live
    var _opaque = rndInt(5,9);
    L.push(' if ((function() local a=' + _opaque + '; local b=' + (_opaque*2) + '; return (a*b)%7=='+(( _opaque*(_opaque*2))%7)+' end)()) then end');
    L.push(' if task and task.spawn then task.spawn(function() pcall(' + RUN + ',' + (build.chunks.length) + ',{}) end) end');
    L.push(' for _ci=' + (build.chunks.length+1) + ',#' + CH + ' do if pcall(function() return ' + RUN + '(_ci,{}) end) then end end');
    L.push('do');
    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');"""
if old2 in s:
    s = s.replace(old2, new2)
    p.write_text(s, encoding='utf-8')
    print('patched vm flatten boot')
else:
    print('not found boot')
    idx = s.find("L.push('do');")
    print(s[idx-500:idx+800])
