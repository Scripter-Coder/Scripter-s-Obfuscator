import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');
    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   if ' + FP + '>0 then');
    L.push('     if ' + VMM + '._instr then print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
    L.push('     local retVals={}');
    L.push('     if n==0 then local _=0');
    L.push('     elseif n==1 then retVals[1]=' + S + '[' + SP + ']; ' + SP + '=' + SP + '-1');
    L.push('     else for j=1,n do retVals[j]=' + S + '[' + SP + '-n+j] end; ' + SP + '=' + SP + '-n end');
    L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');
    L.push('     if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=retVals[1]');
    L.push('     elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(retVals)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r');
    L.push('     else for j=1,#retVals do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=retVals[j] end end');
    L.push('   else');
    L.push('     if n==0 then return end');
    L.push('     if n==1 then return ' + S + '[' + SP + '] end');
    L.push('     local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end; return ' + UNP + '(a)');
    L.push('   end');
    L.push('  end');
    L.push('  if ' + OP + '==' + OPCODES['RETP'] + ' then');
    L.push('   if ' + VMM + '._instr and ' + FP + '>0 then print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
    L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
    L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
    L.push('   for j=1,p.n do a[k+j]=p[j] end');
    L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');
    L.push('  end');
    L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local f=' + S + '[' + SP + '-n]');
    L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
    L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
    L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
    L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
    L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
    L.push('   else return f(' + UNP + '(a)) end');
    L.push('  end');
    L.push('  local _fn=' + HAND + '[' + OP + ']');
    L.push('  if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end');
    L.push(' end');"""
new = """    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');
    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   if ' + FP + '>0 then');
    L.push('     if ' + VMM + '._instr then print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
    L.push('     local retVals={}');
    L.push('     if n==0 then local _=0');
    L.push('     elseif n==1 then retVals[1]=' + S + '[' + SP + ']; ' + SP + '=' + SP + '-1');
    L.push('     else for j=1,n do retVals[j]=' + S + '[' + SP + '-n+j] end; ' + SP + '=' + SP + '-n end');
    L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');
    L.push('     if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=retVals[1]');
    L.push('     elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(retVals)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r');
    L.push('     else for j=1,#retVals do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=retVals[j] end end');
    L.push('   else');
    L.push('     if n==0 then return end');
    L.push('     if n==1 then return ' + S + '[' + SP + '] end');
    L.push('     local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end; return ' + UNP + '(a)');
    L.push('   end');
    L.push('  elseif ' + OP + '==' + OPCODES['RETP'] + ' then');
    L.push('   if ' + VMM + '._instr and ' + FP + '>0 then print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
    L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
    L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
    L.push('   for j=1,p.n do a[k+j]=p[j] end');
    L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');
    L.push('  elseif ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local f=' + S + '[' + SP + '-n]');
    L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
    L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
    L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
    L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
    L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
    L.push('   else return f(' + UNP + '(a)) end');
    L.push('  else');
    L.push('   local _fn=' + HAND + '[' + OP + ']');
    L.push('   if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end');
    L.push('  end');
    L.push(' end');"""
# Need to handle the initial while true do and first OP fetch
old2 = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');"""
new2 = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');"""
# The old dispatch we have is already with separate ifs, but we want to replace the whole block from while true do to end
# Simpler: find the old block as defined in patch_emit and replace with new
if old in t:
    t = t.replace(old, new)
    print("fixed dispatch to elseif chain")
else:
    print("dispatch old not found for fix")
    # try to find while true do block
    idx = t.find("L.push(' while true do');")
    print(t[idx:3000])

p.write_text(t, encoding='utf-8')
print("saved dispatch fix")
