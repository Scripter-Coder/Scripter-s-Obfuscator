import pathlib
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')
old = """    L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
    L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
    L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
    L.push('   else return f(' + UNP + '(a)) end');"""
new = """    L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
    L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
    L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
    L.push('   else');
    L.push('     if ' + FP + '>0 then');
    L.push('       local ret_P = ' + PK + '(f(' + UNP + '(a)))');
    L.push('       local caller_T = ' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller_T.code; ' + PC + '=caller_T.pc; ' + BASE + '=caller_T.base; ' + TOP + '=caller_T.top; ' + S + '=caller_T.s; ' + SP + '=caller_T.sp; ' + SC + '=caller_T.sc; ' + VA + '=caller_T.va; ' + LK + '=caller_T.lk; ' + FR + '=caller_T');
    L.push('       if caller_T.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=ret_P[1]');
    L.push('       elseif caller_T.nRet==-1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=ret_P');
    L.push('       else for j_T=1,ret_P.n do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=ret_P[j_T] end end');
    L.push('     else return f(' + UNP + '(a)) end');
    L.push('   end');"""
if old in t:
    t = t.replace(old, new)
    print("fixed tail native")
else:
    print("not found tail native")
    # debug
    import re
    idx = t.find("if f and (")
    print(t[idx-500:idx+1000])

p.write_text(t, encoding='utf-8')
