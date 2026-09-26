import pathlib, re
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')

# Fix CALL handler print line: replace Lua multi and -1 or 1 with JS ternary evaluation
# Find the line with CALL instrumentation print we inserted
old_print = """                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(multi and -1 or 1))) end');"""
# Our previous patch inserted that exact string; check if exists
if old_print in t:
    print("found old CALL print")
    # Replace with JS ternary version: need to handle both CALL and CALLM separately but our handler is lumped, so we need to compute at runtime via JS variable 'multi' embedded as Lua literal?
    # Simplest: emit Lua that does `tostring(` + (multi ? '-1' : '1') + `)` is already JS ternary, but we had `tostring(multi and -1 or 1)` which is Lua. Replace with correct JS ternary.
    # We need to replace the last part: tostring(multi and -1 or 1) -> tostring(' + (multi ? '-1' : '1') + ')
    # But inside the JS string, `multi` is JS var, so at emit time it will be replaced with string "-1" or "1"
    new_print = """                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(' + (multi ? '-1' : '1') + '))) end');"""
    t = t.replace(old_print, new_print)
    p.write_text(t, encoding='utf-8')
    print("fixed CALL print")
else:
    print("old CALL print not found")
    if "CALL %%s->%%s FP" in t:
        idx = t.find("CALL %%s->%%s FP")
        print(t[idx-200:idx+400])

# Also need to fix any other occurrence: our earlier patch also inserted wrong nRet for frame push? Let's verify that line is correct
# Frame push uses JS ternary already correct: (multi ? '-1' : '1')
if "nRet=' + (multi ? '-1' : '1') + '" in t:
    print("frame nRet correct")
else:
    print("frame nRet potentially wrong")
    idx = t.find("nRet=")
    print(t[idx-200:idx+400])

# Now fix TAILCALL dispatcher via regex replacement
# Pattern to find TAILCALL handling and replace with VM-aware version
# We'll replace both occurrences using regex with function

def tail_repl(match):
    full = match.group(0)
    # We need to capture variable names: we have access to outer variables VMM, CODE, PC, S, SP, SC, VA, LK, FR, REG, BASE, TOP, CH, PK, UNP, UNPKM, FRAMES, FP etc. But inside repl we need to generate JS code that uses those names.
    # Instead of generating here, we will return a fixed JS snippet that correctly handles VM tailcall.
    # But we need to know the JS variable names: they are defined in outer scope of emitVM, not accessible here. However the matched text already contains them via concatenation: `+ CODE +` etc. So we can reconstruct by using the same concatenation pattern.
    # Simpler: just return a JS string that will be inserted as JS code, referencing the same JS variables via string concatenation.
    # We need to produce JS code that will be inside emitVM and will use the JS variables.
    # We'll produce: L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then'); ... etc with VM branch.
    # For now, return a placeholder that we will expand later after reading variable names? Easier to directly construct the replacement JS code with the correct variable names as they appear in the file (they are generated via nm() random, not fixed). But we can use the same JS variables CODE, PC, etc. as before - they are the JS variables holding the random Lua names.
    # So we can just write the JS code using those JS variable names (CODE, PC, etc.) as strings; the JS will evaluate them.
    # Let's return JS code snippet.
    # We need to ensure we have MARK, VMM, etc. available.
    snippet = """        L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local f=' + S + '[' + SP + '-n]');
        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
        L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
        L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
        L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
        L.push('   else return f(' + UNP + '(a)) end');
        L.push('  end');"""
    return snippet

# Use regex to find and replace both occurrences
pattern = r"        L\.push\('  if ' \+ OP \+ '==' \+ OPCODES\['TAILCALL'\] \+ ' then'\);\n        L\.push\('   local n=' \+ CODE \+ '\.c\[' \+ PC \+ '\] ' \+ PC \+ '=' \+ PC \+ '\+1'\);\n        L\.push\('   local f=' \+ S \+ '\[' \+ SP \+ '-n\]'\);\n        L\.push\('   local a=\{\} for j=1,n do a\[j\]=' \+ S \+ '\[' \+ SP \+ '-n\+j\] end ' \+ SP \+ '=' \+ SP \+ '-n-1'\);\n        L\.push\('   local la=#a if la>0 and ' \+ UNPKM \+ '\(a\[la\]\) then local pt=a\[la\]; local flat=\{\}; local fi=0; for j=1,la-1 do fi=fi\+1 flat\[fi\]=a\[j\] end; for j=1,pt\.n do fi=fi\+1 flat\[fi\]=pt\[j\] end; a=flat; end'\);\n        L\.push\('   return f\(' \+ UNP \+ '\(a\)\)'\);\n        L\.push\('  end'\);"
cnt = len(re.findall(pattern, t))
print("TAILCALL pattern count", cnt)
if cnt>0:
    # Instead of using re.sub with complex, do simple string replace for each occurrence using the snippet with correct JS variable names
    # We'll use a simple approach: replace the exact sequence of 6 pushes with the new snippet via python string replace using the snippet text that matches exactly what was in file (including JS concatenations)
    # Build the exact old string as it appears in file (with JS concatenations)
    old_tail_js = "        L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');\n        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');\n        L.push('   local f=' + S + '[' + SP + '-n]');\n        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');\n        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');\n        L.push('   return f(' + UNP + '(a))');\n        L.push('  end');"
    # Verify count via simple string count
    print("string count", t.count(old_tail_js))
    if t.count(old_tail_js)==2:
        # Build new tail snippet as JS code string (needs to be inserted as JS code, not as Lua)
        # The repl snippet above is already JS code, but we need to ensure it uses the same JS variables
        new_tail_js = """        L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local f=' + S + '[' + SP + '-n]');
        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
        L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
        L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
        L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
        L.push('   else return f(' + UNP + '(a)) end');
        L.push('  end');"""
        t = t.replace(old_tail_js, new_tail_js)
        print("patched TAILCALL via string replace")
        pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js").write_text(t, encoding='utf-8')
    else:
        print("old_tail_js count not 2, found", t.count(old_tail_js))
else:
    print("no tail pattern")

