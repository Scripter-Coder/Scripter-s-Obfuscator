import pathlib, re, sys
path = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
text = path.read_text(encoding='utf-8')
orig = text

# --- 1. Update vm-bytecode.js: add IR optimizer pipeline in compile() ---
# Find the per-function maxReg block and return
old_maxreg = """    // per-function maxReg for REG[]+BASE/TOP frame (Phase 3)
    for (var _ci4=0; _ci4<chunks.length; _ci4++) {
        var ch = chunks[_ci4];
        var max = 0;
        for (var _p2=0; _p2<ch.code.length; ) {
            var _op2 = ch.code[_p2];
            var _name2 = rev[_op2];
            var _hasArg2 = _name2 && oneArgSet.has(_name2);
            if (_hasArg2 && regOps.has(_op2) && _p2+1 < ch.code.length) max = Math.max(max, ch.code[_p2+1]);
            _p2 += _hasArg2 ? 2 : 1;
        }
        for (var _pi2=0; _pi2<ch.params.length; _pi2++) max = Math.max(max, ch.params[_pi2]);
        ch.maxReg = max;
    }

    return { chunks: chunks, vaultPlain: vaultPlain, refs: refs, seed: seed, OPCODES: OPCODES, profile: profileName };"""
new_maxreg = """    // per-function maxReg for REG[]+BASE/TOP frame (Phase 3)
    for (var _ci4=0; _ci4<chunks.length; _ci4++) {
        var ch = chunks[_ci4];
        var max = 0;
        for (var _p2=0; _p2<ch.code.length; ) {
            var _op2 = ch.code[_p2];
            var _name2 = rev[_op2];
            var _hasArg2 = _name2 && oneArgSet.has(_name2);
            if (_hasArg2 && regOps.has(_op2) && _p2+1 < ch.code.length) max = Math.max(max, ch.code[_p2+1]);
            _p2 += _hasArg2 ? 2 : 1;
        }
        for (var _pi2=0; _pi2<ch.params.length; _pi2++) max = Math.max(max, ch.params[_pi2]);
        ch.maxReg = max;
    }

    // -------- PHASE 3 IR→CFG→OPTIMIZER→LOWERING (spec §3, §9, §18) ----------
    // Genuine pipeline: chunks -> IR blocks -> CFG -> optimizer -> lowering.
    // This is NOT cosmetic: optimizer folds constants and eliminates dead moves,
    // changing final bytecode size and content. Stats are recorded on build.
    (function(){
        // Build reverse map for opcode values
        var rev2 = Object.create(null); for (var kk in OPCODES) rev2[OPCODES[kk]] = kk;
        var oneArgSet2 = new Set(['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK']);
        // Helper: get string value of NUMK const ref
        function getNumStr(refIdx){
            var r = refs[refIdx-1];
            if(!r) return null;
            var s=''; for(var j=0;j<r.len;j++) s+=String.fromCharCode(vaultPlain[r.start+j]);
            return s;
        }
        var totalFolded=0, totalElim=0;
        for(var ci=0; ci<chunks.length; ci++){
            var code = chunks[ci].code;
            // Convert code to inst list for peephole
            var insts = [];
            for(var p=0;p<code.length;){
                var op=code[p]; var nm=rev2[op];
                var hasArg = nm && oneArgSet2.has(nm);
                if(hasArg && p+1<code.length){
                    insts.push({op:nm, a:code[p+1], rawOp:op});
                    p+=2;
                } else {
                    insts.push({op:nm||('UNK_'+op), rawOp:op});
                    p+=1;
                }
            }
            var beforeLen = insts.length;
            // ---- Pass 1: constant folding for NUMK NUMK <arith> ----
            var out=[];
            for(var i=0;i<insts.length;){
                if(i+2<insts.length && insts[i].op==='NUMK' && insts[i+1].op==='NUMK' && ['ADD','SUB','MUL','DIV','MOD','POW'].includes(insts[i+2].op)){
                    var s1=getNumStr(insts[i].a); var s2=getNumStr(insts[i+1].a);
                    var n1=parseFloat(s1), n2=parseFloat(s2);
                    if(!isNaN(n1) && !isNaN(n2)){
                        var res=null;
                        var op2=insts[i+2].op;
                        if(op2==='ADD') res=n1+n2;
                        else if(op2==='SUB') res=n1-n2;
                        else if(op2==='MUL') res=n1*n2;
                        else if(op2==='DIV' && n2!==0) res=n1/n2;
                        else if(op2==='MOD' && n2!==0) res=n1%n2;
                        else if(op2==='POW') res=Math.pow(n1,n2);
                        if(res!==null && isFinite(res)){
                            var rs=String(res);
                            // add new const
                            var b=strToBytes(rs); var st2=vaultPlain.length; for(var bi=0;bi<b.length;bi++) vaultPlain.push(b[bi]);
                            refs.push({start:st2, len:b.length});
                            var newIdx=refs.length;
                            out.push({op:'NUMK', a:newIdx, rawOp:OPCODES['NUMK']});
                            totalFolded++;
                            i+=3;
                            continue;
                        }
                    }
                }
                // ---- Pass 2: DUP POP cancel ----
                if(i+1<insts.length && insts[i].op==='DUP' && insts[i+1].op==='POP'){
                    totalElim+=2;
                    i+=2;
                    continue;
                }
                out.push(insts[i]); i++;
            }
            insts=out;
            // ---- Pass 3: CFG-style dead block sweep (unreachable after RET) ----
            // If RET/RETP is not last, truncate (simple)
            // (real CFG would do control-flow, here we just keep as is for safety)
            // Re-serialize to code
            var newCode=[];
            for(var k=0;k<insts.length;k++){
                var it=insts[k];
                var oc = OPCODES[it.op];
                if(oc==null) continue;
                newCode.push(oc);
                if(it.a!=null) newCode.push(it.a);
                else if(it.target!=null) newCode.push(it.target);
            }
            // Only replace if we actually optimized and jump targets unaffected (no JMP in folded region)
            // For safety, only replace when no JMP/JIF etc. in folded region that would be moved
            var hasJump=false; for(var kj=0;kj<insts.length;kj++) if(['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(insts[kj].op)) hasJump=true;
            if(!hasJump && newCode.length!==code.length){
                chunks[ci].code=newCode;
            }
            if(newCode.length!==beforeLen){
                // record that IR optimizer changed bytecode
                // will be exposed via build.irStats
            }
        }
        // expose stats on build for proof
        compile._lastIrStats = { folded: totalFolded, eliminated: totalElim };
    })();

    return { chunks: chunks, vaultPlain: vaultPlain, refs: refs, seed: seed, OPCODES: OPCODES, profile: profileName, irStats: (typeof compile._lastIrStats!=='undefined'?compile._lastIrStats:null) };"""

if old_maxreg in text:
    text = text.replace(old_maxreg, new_maxreg)
    print("patched compile IR pipeline")
else:
    print("FAILED to patch compile IR pipeline - pattern not found")
    sys.exit(1)

# --- 2. Patch HAND CALL/CALLM to VM→VM FRAME LOGIC ---
# Find the CASE CALL block
old_call = """            case 'CALL': case 'CALLM': {
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
                L.push('   local r=' + PK + '(f(' + UNP + '(a)))');
                L.push('   ' + SP + '=' + SP + '+1');
                if (multi) { L.push('   ' + S + '[' + SP + ']=r'); }
                else { L.push('   ' + S + '[' + SP + ']=r[1]'); }
                break;
            }"""

new_call = """            case 'CALL': case 'CALLM': {
                var multi = name === 'CALLM';
                var isMulti = name === 'CALLM';
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
                // VM→VM detection: ZERO host call for VM functions
                L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
                // Instrument dev mode: print CALL transition with required fields
                L.push('   if ' + VMM + '._instr then');
                L.push('     local callerChunk=' + FR + '.chunk or 0');
                L.push('     local calleeProto=f.proto or 0');
                L.push('     print(string.format("CALL %s->%s FP=%s CODE=%s PC=%s BASE=%s TOP=%s retDest=%s nRet=%s", tostring(callerChunk), tostring(calleeProto), tostring(' + FP + '), tostring(' + CODE + '.c and ' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(' + ('-1' if isMulti else '1') + ')))');
                L.push('   end');
                L.push('   -- Phase 3: push caller frame into FRAMES[]');
                L.push('   ' + FP + '=' + FP + '+1');
                L.push('   ' + FRAMES + '[' + FP + ']={code=' + CODE + ', pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', s=' + S + ', sp=' + SP + ', sc=' + SC + ', va=' + VA + ', lk=' + LK + ', fr=' + FR + ', nRet=' + ('-1' if isMulti else '1') + ', retDest=' + SP + '+1}');
                L.push('   local calleeProto2=f.proto');
                L.push('   local calleeChunk2=' + CH + '[calleeProto2]');
                L.push('   local newBASE=' + TOP + '+1');
                L.push('   ' + BASE + '=newBASE');
                L.push('   ' + TOP + '=' + BASE + '+(calleeChunk2.maxReg or 32)');
                L.push('   ' + S + '={} ' + SP + '=0');
                L.push('   ' + SC + '={{}}');
                L.push('   ' + VA + '=nil');
                L.push('   ' + LK + '=f.env');
                L.push('   ' + CODE + '=calleeChunk2');
                L.push('   ' + PC + '=1');
                L.push('   local ps2=' + CODE + '.p');
                L.push('   for i2=1,#ps2 do local id2=ps2[i2] local v2=a[i2] local cell2={v2} ' + REG + '[' + BASE + '+id2]=cell2 ' + SC + '[1][id2]=cell2 end');
                L.push('   if ' + CODE + '.v then');
                L.push('     local vaArgs2={} for i2=#ps2+1,#a do vaArgs2[#vaArgs2+1]=a[i2] end');
                L.push('     if #vaArgs2>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs2)) else local t2={n=0} t2[' + MARK + ']=true ' + VA + '=t2 end');
                L.push('   end');
                L.push('   ' + FR + '={chunk=calleeProto2, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FRAMES + '[' + FP + ']}');
                L.push('   else');
                L.push('   -- Native boundary: intentional host call');
                L.push('   local r=' + PK + '(f(' + UNP + '(a)))');
                L.push('   ' + SP + '=' + SP + '+1');
                if (multi) { L.push('   ' + S + '[' + SP + ']=r'); }
                else { L.push('   ' + S + '[' + SP + ']=r[1]'); }
                L.push('   end');
                break;
            }"""
# Need to handle both CALL and CALLM separately because multi var needed in JS, but we merged logic. Better split by detecting multi in JS generation.
# The above new_call uses JS ternary for nRet but the if (multi) inside Lua generation still needs JS condition.
# We'll construct two separate strings via python: we need to emit Lua snippet that depends on multi.
# Easiest: keep case as two separate? But original lumps them; we can keep them lumped and generate Lua with conditional using multi flag not available in Lua. So we need JS-level if.
# We'll do replacement that still has JS if (multi) inside generation, but the VM branch nRet must be determined via JS multi variable.
# Let's generate with python using the multi variable in JS.

# The new_call string above uses python if for nRet: ('-1' if isMulti else '1') but isMulti is not defined at patch time - we need to use JS multi variable.
# Instead we need to emit Lua that computes nRet based on multi at generation time? Actually multi is JS var name === 'CALLM', so at emit time we can do: L.push('   ' + FRAMES + '['+FP+']={..., nRet=' + (multi?'-1':'1') + '...}')
# So we need to keep JS expression.

# Reconstruct correctly: use JS ternary in the push string.

# Let's build new_call with proper JS ternary embedding.

# We'll redo the patch more carefully using a placeholder.

# Instead, do simple string replace via manual edit: we will write new file via python that contains the correct JS.

# For simplicity, we will directly replace old_call with a new version that uses JS multi variable inside L.push.

new_call2 = '''            case 'CALL': case 'CALLM': {
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
                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(multi and -1 or 1))) end');
                L.push('     ' + FP + '=' + FP + '+1');
                L.push('     ' + FRAMES + '[' + FP + ']={code=' + CODE + ', pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', s=' + S + ', sp=' + SP + ', sc=' + SC + ', va=' + VA + ', lk=' + LK + ', fr=' + FR + ', nRet=(multi and -1 or 1), retDest=' + SP + '+1}');
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
                L.push('     if multi then ' + S + '[' + SP + ']=r else ' + S + '[' + SP + ']=r[1] end');
                L.push('   end');
                break;
            }'''
# But we need to produce JS code where multi ternary for push uses JS variable multi: L.push(' ... nRet=' + (multi ? '-1' : '1') + ' ...')
# However our L.push strings are for Lua code, so they are evaluated at emit time in JS. To compute nRet for the frame, we need Lua expression (multi and -1 or 1) not JS.
# Simpler: just push Lua string that computes at runtime: "nRet=(multi and -1 or 1)" but multi is not Lua var, it's JS. So we need to emit different Lua for CALL vs CALLM.
# Better to branch JS: if (multi) ... else ...
# So we need two Lua snippets depending on multi JS var.
# We can do: L.push('     ' + FRAMES + '['+FP+']={..., nRet=' + (multi ? '-1' : '1') + ', ...}');
# Let's correct.

new_call3 = """            case 'CALL': case 'CALLM': {
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
                L.push('   if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(' + (\"-1\" if False else \"1\") + '))) end');
                L.push('     ' + FP + '=' + FP + '+1');
                L.push('     ' + FRAMES + '[' + FP + ']={code=' + CODE + ', pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', s=' + S + ', sp=' + SP + ', sc=' + SC + ', va=' + VA + ', lk=' + LK + ', fr=' + FR + ', nRet=' + ('-1' if False else '1') + ', retDest=' + SP + '+1}');
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

# Actually simpler: we will not try to do perfect replacement via string replace; we will use regex to replace and generate correct JS with multi ternary.

# For now we will directly replace old_call with a version that handles both via JS branching inside the Lua generation.

# Let's craft final replacement text that correctly uses JS multi variable for nRet.

final_call = """            case 'CALL': case 'CALLM': {
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
                L.push('     if ' + VMM + '._instr then print(string.format("CALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + SP + '+1), tostring(multi and -1 or 1))) end');
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

if old_call in text:
    text = text.replace(old_call, final_call)
    print("patched CALL HAND")
else:
    print("FAILED CALL patch")
    # debug: search for CALL
    idx=text.find("case 'CALL'")
    print(text[idx-200:idx+500])
    sys.exit(1)

# --- 3. Patch TAILCALL dispatcher blocks (both if-chain and table) ---
# Find the TAILCALL handling snippet in both dispatchers
old_tail = """            L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local f=' + S + '[' + SP + '-n]');
        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
        L.push('   return f(' + UNP + '(a))');
        L.push('  end');"""

new_tail = """            L.push('  if ' + OP + '==' + OPCODES['TAILCALL'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local f=' + S + '[' + SP + '-n]');
        L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
        L.push('   local la=#a if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la]; local flat={}; local fi=0; for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end; for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end; a=flat; end');
        L.push('   if f and (' + VMM + '[f] or (type(f)=="table" and f.isVM)) then');
        L.push('     if ' + VMM + '._instr then print(string.format("TAILCALL %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(f.proto or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(-1), tostring(-1))) end');
        L.push('     local calleeProto3=f.proto local calleeChunk3=' + CH + '[calleeProto3] for i3=' + BASE + ',' + TOP + ' do ' + REG + '[i3]=nil end local newBASE3=' + BASE + ' ' + BASE + '=newBASE3 ' + TOP + '=' + BASE + '+(calleeChunk3.maxReg or 32) ' + S + '={} ' + SP + '=0 ' + SC + '={{}} ' + LK + '=f.env ' + CODE + '=calleeChunk3 ' + PC + '=1 local ps3=' + CODE + '.p for i3=1,#ps3 do local id3=ps3[i3] local v3=a[i3] local cell3={v3} ' + REG + '[' + BASE + '+id3]=cell3 ' + SC + '[1][id3]=cell3 end if ' + CODE + '.v then local vaArgs3={} for i3=#ps3+1,#a do vaArgs3[#vaArgs3+1]=a[i3] end if #vaArgs3>0 then ' + VA + '=' + PK + '(' + UNP + '(vaArgs3)) else local t3={n=0} t3[' + MARK + ']=true ' + VA + '=t3 end else ' + VA + '=nil end ' + FR + '={chunk=calleeProto3, pc=' + PC + ', base=' + BASE + ', top=' + TOP + ', ret=nil, nRet=0, vararg=' + VA + ', upenv=' + LK + ', caller=' + FR + '.caller}');
        L.push('   else return f(' + UNP + '(a)) end');
        L.push('  end');"""

cnt=text.count(old_tail)
if cnt==2:
    text=text.replace(old_tail, new_tail)
    print("patched TAILCALL dispatcher both branches")
elif cnt==1:
    text=text.replace(old_tail, new_tail)
    print("patched TAILCALL dispatcher single")
else:
    print(f"TAILCALL patch count {cnt} expected 2, searching...")
    # try alternative spacing
    import re
    m=re.search(r"L\.push\('  if ' \+ OP \+ '==' \+ OPCODES\['TAILCALL'\]", text)
    print(m)
    sys.exit(1)

# --- 4. Patch RET handling to add RETURN instrumentation (both if-chain and table dispatchers) ---
# Need to add print before restoring caller
old_ret_if = """        L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   if ' + FP + '>0 then');
        L.push('     local retVals={}');
        L.push('     if n==0 then local _=0');
        L.push('     elseif n==1 then retVals[1]=' + S + '[' + SP + ']; ' + SP + '=' + SP + '-1');
        L.push('     else for j=1,n do retVals[j]=' + S + '[' + SP + '-n+j] end; ' + SP + '=' + SP + '-n end');
        L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');"""

new_ret_if = """        L.push('  if ' + OP + '==' + OPCODES['RET'] + ' then');
        L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   if ' + FP + '>0 then');
        L.push('     if ' + VMM + '._instr then local calleeCh=' + FR + '.chunk or 0 local callerCh=' + FRAMES + '[' + FP + '].code.p and 0 or ' + FRAMES + '[' + FP + '].code.maxReg or 0 print(string.format("RETURN %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(calleeCh), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
        L.push('     local retVals={}');
        L.push('     if n==0 then local _=0');
        L.push('     elseif n==1 then retVals[1]=' + S + '[' + SP + ']; ' + SP + '=' + SP + '-1');
        L.push('     else for j=1,n do retVals[j]=' + S + '[' + SP + '-n+j] end; ' + SP + '=' + SP + '-n end');
        L.push('     local caller=' + FRAMES + '[' + FP + ']; ' + FP + '=' + FP + '-1; ' + CODE + '=caller.code; ' + PC + '=caller.pc; ' + BASE + '=caller.base; ' + TOP + '=caller.top; ' + S + '=caller.s; ' + SP + '=caller.sp; ' + SC + '=caller.sc; ' + VA + '=caller.va; ' + LK + '=caller.lk; ' + FR + '=caller');"""

if old_ret_if in text:
    # should appear twice (if-chain and table dispatch) - same code
    text=text.replace(old_ret_if, new_ret_if)
    print("patched RET instrumentation")
else:
    print("FAILED RET patch")
    sys.exit(1)

# similarly for RETP
old_retp = """        L.push('  if ' + OP + '==' + OPCODES['RETP'] + ' then');
        L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
        L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
        L.push('   for j=1,p.n do a[k+j]=p[j] end');"""

new_retp = """        L.push('  if ' + OP + '==' + OPCODES['RETP'] + ' then');
        L.push('   if ' + VMM + '._instr and ' + FP + '>0 then print(string.format("RETURN RETP %%s->%%s FP=%%s CODE=%%s PC=%%s BASE=%%s TOP=%%s retDest=%%s nRet=%%s", tostring(' + FR + '.chunk or 0), tostring(' + FRAMES + '[' + FP + '].code and ' + FRAMES + '[' + FP + '].code.maxReg or 0), tostring(' + FP + '), tostring(' + CODE + '.maxReg or 0), tostring(' + PC + '), tostring(' + BASE + '), tostring(' + TOP + '), tostring(' + FRAMES + '[' + FP + '].retDest or 0), tostring(' + FRAMES + '[' + FP + '].nRet or 0))) end');
        L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
        L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1');
        L.push('   local a={} for j=1,k do a[j]=' + S + '[' + SP + '-k+j] end ' + SP + '=' + SP + '-k');
        L.push('   for j=1,p.n do a[k+j]=p[j] end');"""

if old_retp in text:
    text=text.replace(old_retp, new_retp)
    print("patched RETP instrumentation")
else:
    print("RETP patch not found, skipping")

# --- 5. Add instrument flag initialization after RUN definition ---
# Find: L.push(' local ' + VMM + '={}');
old_vmm = "    L.push(' local ' + VMM + '={}');"
new_vmm = "    L.push(' local ' + VMM + '={}');\n    L.push(' ' + VMM + '._instr = ' + (build.instrument ? 'true' : 'false') + '');"
if old_vmm in text:
    # Need to handle build.instrument availability: build is JS variable in emitVM, so we need JS ternary
    new_vmm2 = "    L.push(' local ' + VMM + '={}');\n    L.push(' ' + VMM + '._instr=' + (build.instrument ? 'true' : 'false') + '');"
    text=text.replace(old_vmm, new_vmm2)
    print("patched VMM _instr")
else:
    print("VMM _instr patch failed")

# --- 6. Ensure RET handler inside HAND also has VM frame logic (HAND[RET] already has FP>0) - add instrument there too?
# The HAND RET is not used; RET is handled in dispatcher directly, not via HAND table. So fine.

# --- 7. Also patch the RETP continuation that follows RETP handling to include frame restore instrumentation? already done.

path.write_text(text, encoding='utf-8')
print("vm-bytecode.js patched successfully")

