import pathlib, re, sys
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')

# Add new variables in emitVM after var declarations for V, C, R, D etc.
old_vars = """    function nm(p) { return p + hex(6); }
    var V = nm('v'), C = nm('c'), R = nm('r'), D = nm('d'), NC = nm('m');
    var RUN = nm('R'), CH = nm('K'), PK = nm('P'), E = nm('g');
    var S = nm('s'), SP = nm('t'), SC = nm('y'), PC = nm('i'), CODE = nm('w');
    var OP = nm('o'), LK = nm('L'), VA = nm('a');
    var X = nm('x'), Y = nm('z');"""
new_vars = """    function nm(p) { return p + hex(6); }
    var V = nm('v'), C = nm('c'), R = nm('r'), D = nm('d'), NC = nm('m');
    var RUN = nm('R'), CH = nm('K'), PK = nm('P'), E = nm('g');
    var S = nm('s'), SP = nm('t'), SC = nm('y'), PC = nm('i'), CODE = nm('w');
    var OP = nm('o'), LK = nm('L'), VA = nm('a');
    var X = nm('x'), Y = nm('z'), FR = nm('F');
    var REG = nm('e'), BASE = nm('b'), TOP = nm('k'), FRAMES = nm('G'), FP = nm('f'), VMM = nm('j');"""
if old_vars in t:
    t = t.replace(old_vars, new_vars)
    print("patched emitVM vars")
else:
    print("emitVM vars not found")
    sys.exit(1)

# Patch blob encoding to include maxReg
old_blob = """        blob.push(ch.vararg ? 1 : 0);
        var nCode = ch.code.length;"""
new_blob = """        blob.push(ch.vararg ? 1 : 0);
        blob.push((ch.maxReg||0) % 256, Math.floor((ch.maxReg||0) / 256) % 256);
        var nCode = ch.code.length;"""
if old_blob in t:
    t = t.replace(old_blob, new_blob)
    print("patched blob maxReg")
else:
    print("blob maxReg not found")

# Patch blob decode to read maxReg
old_decode = """        L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
        L.push('  local nc=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216 rp=rp+4');"""
new_decode = """        L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
        L.push('  local mr=' + BL + '[rp] + ' + BL + '[rp+1]*256 rp=rp+2');
        L.push('  local nc=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216 rp=rp+4');"""
if old_decode in t:
    t = t.replace(old_decode, new_decode)
    print("patched decode va")
else:
    print("decode va not found")

old_decode2 = """        L.push('  ' + CH + '[#' + CH + '+1]={c=cd,p=ps,v=va}');"""
new_decode2 = """        L.push('  ' + CH + '[#' + CH + '+1]={c=cd,p=ps,v=va,maxReg=mr}');"""
if old_decode2 in t:
    t = t.replace(old_decode2, new_decode2)
    print("patched decode2 maxReg")

# Patch decoy chunk generation to include maxReg
old_decoy = """        blob.push(Math.random() < 0.5 ? 1 : 0);
        var dnc = rndInt(30, 80); // ULTRA bloat"""
new_decoy = """        blob.push(Math.random() < 0.5 ? 1 : 0);
        var dmr = rndInt(0, 30);
        blob.push(dmr % 256, Math.floor(dmr / 256) % 256);
        var dnc = rndInt(30, 80); // ULTRA bloat"""
if old_decoy in t:
    t = t.replace(old_decoy, new_decoy)
    print("patched decoy maxReg")
else:
    print("decoy not found")
    # try alternative without random line
    if "var dnc = rndInt(30, 80);" in t:
        t = t.replace("var dnc = rndInt(30, 80);", "var dmr = rndInt(0, 30);\n        blob.push(dmr % 256, Math.floor(dmr / 256) % 256);\n        var dnc = rndInt(30, 80);")
        print("patched decoy alt")

# Patch interpreter RUN initialization to include REG/BASE/TOP/FRAMES/FP/VMM
old_interp = """    L.push(RUN + '=function(' + X + ',' + LK + ',...)');
    L.push(' local ' + CODE + '=' + CH + '[' + X + ']');
    L.push(' local ' + S + '={} local ' + SP + '=0');
    L.push(' local ' + SC + '={{}}');
    L.push(' local ' + VA + '=nil');
    L.push(' local ' + PC + '=1');
    L.push(' local ps=' + CODE + '.p');
    L.push(' for i=1,#ps do ' + SC + '[1][ps[i]]={select(i,...)} end');
    L.push(' if ' + CODE + '.v then ' + VA + '=' + PK + '(select(#ps+1,...)) end');"""
new_interp = """    L.push(RUN + '=function(' + X + ',' + LK + ',...)');
    L.push(' local ' + CODE + '=' + CH + '[' + X + ']');
    L.push(' local ' + S + '={} local ' + SP + '=0');
    L.push(' local ' + SC + '={{}}');
    L.push(' local ' + VA + '=nil');
    L.push(' local ' + PC + '=1');
    L.push(' local ps=' + CODE + '.p');
    L.push(' local ' + REG + '={} local ' + BASE + '=0 local ' + TOP + '=' + CODE + '.maxReg or 32');
    L.push(' local ' + FRAMES + '={} local ' + FP + '=0');
    L.push(' for i=1,#ps do local cell={select(i,...)} ' + REG + '[' + BASE + '+ps[i]]=cell ' + SC + '[1][ps[i]]=cell end');
    L.push(' if ' + CODE + '.v then ' + VA + '=' + PK + '(select(#ps+1,...)) end');
    L.push(' local ' + FR + '={chunk=' + X + ',pc=' + PC + ',base=' + BASE + ',top=' + TOP + ',ret=nil,nRet=0,vararg=' + VA + ',upenv=' + LK + ',caller=nil,build=' + (build.buildId||0) + ',reg=' + REG + '}');
    L.push(' -- frame pc is alias of ' + PC + ', base=' + BASE + ' top=' + TOP + ' reg window ' + REG + '[' + BASE + '..' + TOP + ']');
    L.push(' local ' + VMM + '={}');
    L.push(' ' + VMM + '._instr=' + (build.instrument ? 'true' : 'false') + '');"""
if old_interp in t:
    t = t.replace(old_interp, new_interp)
    print("patched interp RUN")
else:
    print("interp not found")
    idx = t.find("L.push(RUN + '=function")
    print(t[idx-100:idx+800])

# Patch LLOAD/LSET/LNEW to use REG[BASE+id]
old_lload = """            case 'LLOAD':
                L.push('   local id=' + CODE + '.c[' + PC + '] local b=nil ' + PC + '=' + PC + '+1');
                L.push('   for i=#' + SC + ',1,-1 do b=' + SC + '[i][id] if b then break end end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=b and b[1]');
                break;
            case 'LSET':
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   local b=nil for i=#' + SC + ',1,-1 do b=' + SC + '[i][id] if b then break end end');
                L.push('   if b then b[1]=v end');
                break;
            case 'LNEW':
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   ' + SC + '[#' + SC + '][id]={v}');
                break;"""
new_lload = """            case 'LLOAD':
                L.push('   local id=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local cell=' + REG + '[' + BASE + '+id]');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=cell and cell[1]');
                break;
            case 'LSET':
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   local cell=' + REG + '[' + BASE + '+id]');
                L.push('   if cell then cell[1]=v else ' + REG + '[' + BASE + '+id]={v} end');
                L.push('   -- keep SC in sync for upvalue capture (live cell)');
                L.push('   local top=' + SC + '[#' + SC + '] if top then top[id]=' + REG + '[' + BASE + '+id] end');
                break;
            case 'LNEW':
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   local cell={v}');
                L.push('   ' + REG + '[' + BASE + '+id]=cell');
                L.push('   ' + SC + '[#' + SC + '][id]=cell');
                break;"""
if old_lload in t:
    t = t.replace(old_lload, new_lload)
    print("patched LLOAD etc to REG")
else:
    print("LLOAD patch not found")

# Patch VP/BP etc. to add profile-aware decoy and frame layout variability etc. - we need to add after VP definition
# Find VP block and add profile handling after it
old_vp_end = """    // SEED expression: literal (in-file) or genv lookup (server-bound)
    var seedExpr = seedInFile ? String(seed) : (E + '[' + JSON.stringify(seedGenvName) + ']');"""
new_vp_end = """    // SEED expression: literal (in-file) or genv lookup (server-bound)
    var seedExpr = seedInFile ? String(seed) : (E + '[' + JSON.stringify(seedGenvName) + ']');
    // ---- PROFILE-AWARE DECOY VAULT + FRAME LAYOUT VARIABILITY (requirement #6, §11) ----
    var _prof = ({FAST: {cipherRounds:1, decoyVaultRuns:[2,4], decoyChunks:[2,6], useRegShuffle:false}, BALANCED:{cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true}, SECURE:{cipherRounds:2, decoyVaultRuns:[8,12], decoyChunks:[15,20], useRegShuffle:true}})[build.profile||'BALANCED'] || {cipherRounds:1, decoyVaultRuns:[4,8], decoyChunks:[8,15], useRegShuffle:true});
    var _stateFields = ['S','SP','SC','LK','PC','CODE','VA','CH','HAND','FR'];
    for (var _si=_stateFields.length-1; _si>0; _si--) { var _sj=rnd(_si+1); var _tmp=_stateFields[_si]; _stateFields[_si]=_stateFields[_sj]; _stateFields[_sj]=_tmp; }
    var _permuteFields = rnd(2)===0;
    var _splitCall = _prof.useRegShuffle && rnd(2)===0;
    var _useIfChain = rnd(3)===0;
    var _frameLayout = { stride: 8 + rnd(25), useRetField: rnd(2)===0, fields: _stateFields.slice() };"""
if old_vp_end in t:
    t = t.replace(old_vp_end, new_vp_end)
    print("patched profile")

# Patch decoyRuns variable to use profile
old_decoyRuns = """    var decoyRuns = rndInt(12, 20); // ULTRA: 3x more decoy vault runs"""
new_decoyRuns = """    var decoyRuns = rndInt(_prof.decoyVaultRuns[0], _prof.decoyVaultRuns[1]);"""
if old_decoyRuns in t:
    t = t.replace(old_decoyRuns, new_decoyRuns)
    print("patched decoyRuns profile")
# Similarly nDecoyChunks already patched earlier via previous script, but now after profile patch we need to ensure it uses _prof
if "var nDecoyChunks = rndInt(8, 15);" in t:
    t = t.replace("var nDecoyChunks = rndInt(8, 15); // ULTRA: 3x more decoy chunks", "var nDecoyChunks = rndInt(_prof.decoyChunks[0], _prof.decoyChunks[1]);")
    print("patched nDecoyChunks profile")

# Patch HAND generation to use polyNum
old_hand = """        L.push(' ' + HAND + '[' + oc + ']=function()');"""
new_hand = """        L.push(' ' + HAND + '[' + polyNum(oc) + ']=function()');"""
if old_hand in t:
    t = t.replace(old_hand, new_hand)
    print("patched HAND polyNum")

# Patch CALL handler to add VM→VM frame logic
old_call = """            case 'CALL': case 'CALLM': {
                var multi = name === 'CALLM';
                // operand n = number of slots ABOVE the fn (a packed tail
                // counts as ONE slot; flattened at call time via .n marker)
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + S + '[' + SP + '-n]');
                L.push('   local a={}');
                L.push('   for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
                L.push('   ' + SP + '=' + SP + '-n-1');
                L.push('   local la=#a');
                L.push('   if la>0 and ' + UNPKM + '(a[la]) then');
                L.push('    local pt=a[la] local flat={} local fi=0');
                L.push('    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end');
                L.push('    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end');
                L.push('    a=flat');
                L.push('   end');
                L.push('   local r=' + PK + '(f(' + UNP + '(a)))');
                L.push('   ' + SP + '=' + SP + '+1');
                if (multi) { L.push('   ' + S + '[' + SP + ']=r'); }
                else { L.push('   ' + S + '[' + SP + ']=r[1]'); }
                break;
            }"""
new_call = """            case 'CALL': case 'CALLM': {
                var multi = name === 'CALLM';
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + S + '[' + SP + '-n]');
                L.push('   local a={}');
                L.push('   for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
                L.push('   ' + SP + '=' + SP + '-n-1');
                L.push('   local la=#a');
                L.push('   if la>0 and ' + UNPKM + '(a[la]) then');
                L.push('    local pt=a[la] local flat={} local fi=0');
                L.push('    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end');
                L.push('    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end');
                L.push('    a=flat');
                L.push('   end');
                L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(' + (1) + '))) end');
                # fix nRet string: use JS ternary via multi
                L.push('     ' + FP + '=' + FP + '+1');
                L.push('     ' + FRAMES + '[' + FP + ']={code=' + CODE + ', pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', s=' + S + ', sp=' + SP + ', sc=' + SC + ', va=' + VA + ', lk=' + LK + ', fr=' + FR + ', nRet=' + (multi ? '-1' : '1') + ', retDest=' + SP + '+1}');
                L.push('     local calleeProto2=f.proto');
                L.push('     local calleeChunk2=' + CH + '[calleeProto2]');
                L.push('     local newBASE=' + TOP + '+1');
                L.push('     ' + BASE + '=newBASE');
                L.push('     ' + TOP + '=' + BASE + '+(calleeChunk2.maxReg or 32)');
                L.push('     ' + S + '={} ' + SP + '=0');
                L.push('     ' + SC + '={{}}');
                L.push('     ' + VA + '=nil');
                L.push('     ' + LK + '=f.env');
                L.push('     ' + CODE + '=calleeChunk2');
                L.push('     ' + PC + '=1');
                L.push('     local ps2=' + CODE + '.p');
                L.push('     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} ' + REG + '[' + BASE + '+id2]=cell2 ' + SC + '[1][id2]=cell2 end');
                L.push('     if ' + CODE + '.v then');
                L.push('       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end');
                L.push('       if #vaArgs2>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs2)) else local t2={n=0} t2[' + MARK + ']=true ' + VA + '=t2 end');
                L.push('     end');
                L.push('     ' + FR + '={chunk=calleeProto2, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FRAMES + '[' + FP + ']}');
                L.push('   else');
                L.push('     local r=' + PK + '(f(' + UNP + '(a)))');
                L.push('     ' + SP + '=' + SP + '+1');
                if (multi) { L.push('     ' + S + '[' + SP + ']=r'); }
                else { L.push('     ' + S + '[' + SP + ']=r[1]'); }
                L.push('   end');
                break;
            }"""
# The above new_call has Python error due to (1) inside string: we need to use proper JS ternary for print nRet: should be (multi ? '-1' : '1') but for print we need to emit literal string, not JS variable. Simpler: handle print nRet via JS ternary as well.
# We'll construct new_call with correct JS
# For print nRet, we want: tostring(' + (multi ? '-1' : '1') + ') -> this is JS that evaluates at emit time to string "-1" or "1"
# So we need to generate Lua string: print(... tostring(-1) ...) for CALLM, tostring(1) for CALL
# We can just use JS ternary inside the L.push string construction: `+ (multi ? '-1' : '1') +`
# But our new_call currently has hard-coded `tostring(1)` for both. Let's fix: use JS expression.
if old_call in t:
    # Build correct new_call with JS ternary
    # We'll create two versions but our case lumps both, so we need JS that chooses at emit time: the L.push for print should use JS variable multi to decide
    # The print's last argument is nRet, which in Lua should be number 1 or -1. We can emit Lua code that is `tostring(1)` or `tostring(-1)` based on JS multi.
    # So we can do: `tostring(' + (multi ? '-1' : '1') + ')` -> this will be evaluated in JS to either `tostring(-1)` or `tostring(1)` at generation time, not runtime.
    # That's fine because CALL vs CALLM are separate handlers (even though they share case, the JS `multi` var will be false for CALL handler emission and true for CALLM handler emission). So during emit for CALL, multi is false, so it will emit `tostring(1)`; for CALLM, it will emit `tostring(-1)`. That's correct.
    # Our previous new_call had hard-coded 1 for both, need to fix.
    # Let's recreate new_call correctly
    new_call_correct = """            case 'CALL': case 'CALLM': {
                var multi = name === 'CALLM';
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + S + '[' + SP + '-n]');
                L.push('   local a={}');
                L.push('   for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
                L.push('   ' + SP + '=' + SP + '-n-1');
                L.push('   local la=#a');
                L.push('   if la>0 and ' + UNPKM + '(a[la]) then');
                L.push('    local pt=a[la] local flat={} local fi=0');
                L.push('    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end');
                L.push('    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end');
                L.push('    a=flat');
                L.push('   end');
                L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(' + (multi ? '-1' : '1') + '))) end');
                L.push('     ' + FP + '=' + FP + '+1');
                L.push('     ' + FRAMES + '[' + FP + ']={code=' + CODE + ', pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', s=' + S + ', sp=' + SP + ', sc=' + SC + ', va=' + VA + ', lk=' + LK + ', fr=' + FR + ', nRet=' + (multi ? '-1' : '1') + ', retDest=' + SP + '+1}');
                L.push('     local calleeProto2=f.proto');
                L.push('     local calleeChunk2=' + CH + '[calleeProto2]');
                L.push('     local newBASE=' + TOP + '+1');
                L.push('     ' + BASE + '=newBASE');
                L.push('     ' + TOP + '=' + BASE + '+(calleeChunk2.maxReg or 32)');
                L.push('     ' + S + '={} ' + SP + '=0');
                L.push('     ' + SC + '={{}}');
                L.push('     ' + VA + '=nil');
                L.push('     ' + LK + '=f.env');
                L.push('     ' + CODE + '=calleeChunk2');
                L.push('     ' + PC + '=1');
                L.push('     local ps2=' + CODE + '.p');
                L.push('     for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} ' + REG + '[' + BASE + '+id2]=cell2 ' + SC + '[1][id2]=cell2 end');
                L.push('     if ' + CODE + '.v then');
                L.push('       local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end');
                L.push('       if #vaArgs2>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs2)) else local t2={n=0} t2[' + MARK + ']=true ' + VA + '=t2 end');
                L.push('     end');
                L.push('     ' + FR + '={chunk=calleeProto2, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FRAMES + '[' + FP + ']}');
                L.push('   else');
                L.push('     local r=' + PK + '(f(' + UNP + '(a)))');
                L.push('     ' + SP + '=' + SP + '+1');
                if (multi) { L.push('     ' + S + '[' + SP + ']=r'); }
                else { L.push('     ' + S + '[' + SP + ']=r[1]'); }
                L.push('   end');
                break;
            }"""
    t = t.replace(old_call, new_call_correct)
    print("patched CALL VM")
else:
    print("CALL not found")
    sys.exit(1)

# Patch RET etc. to have frame handling with instrumentation
old_ret = """            case 'RET':
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   if n==0 then return end');
                L.push('   if n==1 then return ' + S + '[' + SP + '] end');
                L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
                L.push('   return ' + UNP + '(a)');
                break;
            case 'RETP':
                L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
                L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
                L.push('   for j=1,p.n do a[k+j]=p[j] end');
                L.push('   return ' + UNP + '(a)');
                break;"""
new_ret = """            case 'RET':
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
                break;
            case 'RETP':
                L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
                L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
                L.push('   for j=1,p.n do a[k+j]=p[j] end');
                L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');
                break;"""
if old_ret in t:
    t = t.replace(old_ret, new_ret)
    print("patched RET with frames")
else:
    print("RET not found")
    sys.exit(1)

# Patch CLOSE and TAILCALL handlers
old_close_tail = """            case 'CLOSE':
                // Close open upvalues for current scope — preserve live cells via LK chain
                // No-op in current SC-dict model because POPSC keeps cells via LK refs, but emit for future register file
                L.push('   -- CLOSE ' + FR + ' (no-op, cells live via ' + LK + ')');
                break;
            case 'TAILCALL': {
                // Handled directly in dispatcher (return from RUN), HAND is fallback
                L.push('   error("TAILCALL via HAND")');
                break;
            }"""
# In current 1431 file, there is no CLOSE/TAILCALL handlers, so we need to add them if not present
if "case 'CLOSE'" not in t:
    # Find where to insert: after RETP case
    old_retp_end = """                L.push('   if ' + FP + '>0 then local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller; if caller.nRet==1 then ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[1] elseif caller.nRet==-1 then local r=' + PK + '(' + UNP + '(a)); ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=r else for j=1,#a do ' + SP + '=' + SP + '+1; ' + S + '[' + SP + ']=a[j] end end else return ' + UNP + '(a) end');
                break;"""
    new_close = old_retp_end + """
            case 'CLOSE':
                L.push('   -- CLOSE ' + FR + ' (no-op, cells live via ' + LK + ')');
                break;
            case 'TAILCALL': {
                L.push('   error("TAILCALL via HAND")');
                break;
            }"""
    if old_retp_end in t:
        t = t.replace(old_retp_end, new_close)
        print("added CLOSE/TAILCALL handlers")
else:
    if old_close_tail in t:
        # replace with same (already)
        print("CLOSE exists")
    else:
        print("CLOSE not found to patch")

# Patch NEWF to use VM table with isVM and VMM
old_newf = """            case 'NEWF':
                // capture the FULL upvalue chain: the current function's
                // own links (LK = outer upvalues) + all live scopes (SC).
                // A nested closure must see BOTH its enclosing scopes AND
                // everything the enclosing function captured.
                L.push('   local ci=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local links={}');
                L.push('   for i=1,#' + LK + ' do links[#links+1]=' + LK + '[i] end');
                L.push('   for i=1,#' + SC + ' do links[#links+1]=' + SC + '[i] end');
                L.push('   ' + SP + '=' + SP + '+1');
                L.push('   ' + S + '[' + SP + ']=function(...) return ' + RUN + '(ci,links,...) end');
                break;"""
new_newf = """            case 'NEWF':
                L.push('   local ci=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local links={}');
                L.push('   for i=1,#' + LK + ' do links[#links+1]=' + LK + '[i] end');
                L.push('   for i=1,#' + SC + ' do links[#links+1]=' + SC + '[i] end');
                L.push('   local vmf={isVM=true, proto=ci, env=links, maxReg=' + CH + '[ci].maxReg}');
                L.push('   setmetatable(vmf,{__call=function(_, ...) return ' + RUN + '(vmf.proto, vmf.env, ...) end})');
                L.push('   ' + VMM + '[vmf]=true');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=vmf');
                break;"""
if old_newf in t:
    t = t.replace(old_newf, new_newf)
    print("patched NEWF to VM")
else:
    print("NEWF not found")
    # try alternative: search for S[SP]=function
    idx = t.find("S + '[' + SP + ']=function")
    print(t[idx-500:idx+500])

# Patch dispatcher to handle TAILCALL and RET with frames (non-HAND)
# Find the simple while true dispatcher and replace
old_dispatch = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');
    L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   if n==0 then return end');
    L.push('   if n==1 then return ' + S + '[' + SP + '] end');
    L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
    L.push('   return ' + UNP + '(a)');
    L.push('  end');
    L.push('  if ' + OP + '==' + OPCODES['RETP'] + ' then');
    L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
    L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
    L.push('   for j=1,p.n do a[k+j]=p[j] end');
    L.push('   return ' + UNP + '(a)');
    L.push('  end');
    L.push('  local _fn=' + HAND + '[' + OP + ']');
    L.push('  if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end');
    L.push(' end');"""
new_dispatch = """    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
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
if old_dispatch in t:
    t = t.replace(old_dispatch, new_dispatch)
    print("patched dispatcher")
else:
    print("dispatcher not found")
    idx = t.find("while true do")
    print(t[idx-500:idx+1500])

# Patch applyBytecodeVm to support opts and instrument
old_apply = """export function applyBytecodeVm(src, opts) {
    opts = opts || {};
    for (var d = 0; d < DENY.length; d++) {
        // word-boundary check so 'mygetfenv' doesn't trigger
        if (new RegExp('\\\\b' + DENY[d] + '\\\\b').test(src)) return null; // caller falls back
    }
    var build;
    try {
        build = compile(src);
    } catch (e) {
        if (opts.rethrow) throw e;
        return null;
    }
    if (opts.seedOverride !== undefined && opts.seedOverride !== null) {
        build.seed = opts.seedOverride;
    }
    if (opts.seedFromGenv) build.seedFromGenv = opts.seedFromGenv;
    var vmSrc = emitVM(build);
    if (opts.onBuild) opts.onBuild(build);
    return vmSrc;
}"""
new_apply = """export function applyBytecodeVm(src, opts) {
    opts = opts || {};
    for (var d = 0; d < DENY.length; d++) {
        if (new RegExp('\\\\b' + DENY[d] + '\\\\b').test(src)) return null;
    }
    var _origRnd = rnd, _origRndInt = rndInt;
    if (opts.seedOverride != null) {
        var _lcgSeed = opts.seedOverride >>> 0;
        rnd = function(n){ _lcgSeed = (_lcgSeed * 1664525 + 1013904223) >>> 0; return _lcgSeed % n; };
        rndInt = function(a,b){ return a + rnd(b - a + 1); };
    }
    var build;
    try {
        build = compile(src, opts);
    } catch (e) {
        if (_origRnd !== rnd) { rnd=_origRnd; rndInt=_origRndInt; }
        if (opts.rethrow) throw e;
        return null;
    }
    if (opts.seedFromGenv) build.seedFromGenv = opts.seedFromGenv;
    build.buildId = rndInt(0, 4294967295);
    build.vmId = rndInt(0, 4294967295);
    if (opts.instrument) build.instrument = true;
    if (opts.profile) build.profile = opts.profile;
    var vmSrc = emitVM(build);
    if (opts.seedOverride != null) { rnd=_origRnd; rndInt=_origRndInt; }
    if (opts.onBuild) opts.onBuild(build);
    return vmSrc;
}"""
if old_apply in t:
    t = t.replace(old_apply, new_apply)
    print("patched applyBytecodeVm")
else:
    print("apply not found")
    idx = t.find("export function applyBytecodeVm")
    print(t[idx-200:idx+800])

p.write_text(t, encoding='utf-8')
print("saved final vm-bytecode.js")
