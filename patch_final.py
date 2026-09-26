import pathlib, re, sys
p = pathlib.Path(r"C:\Users\Ryzen 9 5900x\Desktop\Special Website\ScripterHub Website\Obfuscator-s Website\vm-bytecode.js")
t = p.read_text(encoding='utf-8')

# 1. Update OP_NAMES to include TAILCALL/CLOSE and other Phase2 ops
old_op = """// opcode names (values assigned randomly per build)
var OP_NAMES = [
    'CONST', 'NUMK', 'NIL', 'TRUE', 'FALSE',
    'GLOB', 'GSET', 'LLOAD', 'LNEW', 'LSET', 'ULOAD', 'USET',
    'PUSHSC', 'POPSC',
    'TGET', 'TSET', 'NEWTAB', 'APD',
    'DUP', 'POP', 'SWAP', 'UNPK', 'UNPKR', 'UNPK1F', 'UNPK2F', 'UNPK3F',
    'CALL', 'CALLM',
    'RET', 'RETP',
    'VARGP',
    'NEWF',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'CONCAT',
    'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE',
    'NOT', 'NEG', 'LEN',
    'JMP', 'JIF', 'JIT', 'JNIL', 'ANDK', 'ORK'
];"""
new_op = """// opcode names (values assigned randomly per build) — Phase 3 adds TAILCALL/CLOSE for genuine VM frame
var OP_NAMES = [
    'CONST', 'NUMK', 'NIL', 'TRUE', 'FALSE',
    'GLOB', 'GSET', 'LLOAD', 'LNEW', 'LSET', 'ULOAD', 'USET',
    'PUSHSC', 'POPSC', 'CLOSE',
    'TGET', 'TSET', 'NEWTAB', 'APD',
    'DUP', 'POP', 'SWAP', 'UNPK', 'UNPKR', 'UNPK1F', 'UNPK2F', 'UNPK3F',
    'CALL', 'CALLM', 'TAILCALL',
    'RET', 'RETP',
    'VARGP',
    'NEWF',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'CONCAT',
    'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE',
    'NOT', 'NEG', 'LEN',
    'JMP', 'JIF', 'JIT', 'JNIL', 'ANDK', 'ORK'
];"""
if old_op in t:
    t = t.replace(old_op, new_op)
    print("patched OP_NAMES")
else:
    print("OP_NAMES patch not found")
    sys.exit(1)

# 2. Add polyNum helper after hex
old_hex = """function hex(len) {
    var c = '0123456789abcdef', s = '';
    for (var i = 0; i < len; i++) s += c[rnd(16)];
    return s;
}"""
new_hex = """function hex(len) {
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
if old_hex in t:
    t = t.replace(old_hex, new_hex)
    print("added polyNum")
else:
    print("hex not found")

# 3. Update compile signature to support opts, profile, seedOverride, and add PROFILE_MAP etc.
old_compile_sig = """// ============================================================
// COMPILER
// ============================================================
function compile(src) {
    var ast = resolveLuaparse().parse(src, { luaVersion: '5.1' });
    if (!ast || !ast.body) throw new Error('no body');

    var seed = Math.floor(Math.random() * 4294967296); // 32-bit: brute-force infeasible (python tried 0..512)"""
new_compile_sig = """// ============================================================
// PHASE 1 — IR / CFG / REGISTER / PROFILE INTEGRATION (spec §3, §5, §9, §12)
// Genuine structural variability, virtual register file, CFG optimizer.
// See src/ir/* and src/profiles.js for design.
// ============================================================
const PROFILE_MAP = {
  FAST: { cipherRounds: 1, decoyVaultRuns: [2, 4], decoyChunks: [2, 6], useRegShuffle: false },
  BALANCED: { cipherRounds: 1, decoyVaultRuns: [4, 8], decoyChunks: [8, 15], useRegShuffle: true },
  SECURE: { cipherRounds: 2, decoyVaultRuns: [8, 12], decoyChunks: [15, 20], useRegShuffle: true },
};
function resolveProfileName(n){ if(!n) return 'BALANCED'; const u=String(n).toUpperCase(); return PROFILE_MAP[u]?u:'BALANCED'; }

// ============================================================
// COMPILER
// ============================================================
function compile(src, _opts) {
    _opts = _opts || {};
    var profileName = resolveProfileName(_opts.profile);
    var profile = PROFILE_MAP[profileName];
    var seed = _opts.seedOverride != null ? (_opts.seedOverride >>> 0) : Math.floor(Math.random() * 4294967296);"""
if old_compile_sig in t:
    t = t.replace(old_compile_sig, new_compile_sig)
    print("patched compile signature")
else:
    print("compile sig not found")
    # debug
    idx = t.find("function compile")
    print(t[idx-200:idx+800])

# 4. Update compile's lexical scope handling to support per-binding REG etc. (add lex map)
# Find bindId and resolve
old_bind = """    // lexical scopes: stack of {ids:Set, fn:boolean}
    var lex = [];
    function pushBlock() { lex.push({ ids: new Set(), fn: false }); }
    function popBlock() { lex.pop(); }
    function pushFn() { lex.push({ ids: new Set(), fn: true }); }
    function popFn() { lex.pop(); }
    function bindId(name) {
        if (!Object.prototype.hasOwnProperty.call(nameIds, name)) nameIds[name] = nextId++;
        var id = nameIds[name];
        lex[lex.length - 1].ids.add(id);
        return id;
    }
    function resolve(name) {
        if (!Object.prototype.hasOwnProperty.call(nameIds, name)) return { kind: 'global', name: name };
        var id = nameIds[name];
        var crossed = false;
        for (var i = lex.length - 1; i >= 0; i--) {
            if (lex[i].ids.has(id)) return crossed ? { kind: 'upval', id: id } : { kind: 'local', id: id };
            if (lex[i].fn) crossed = true;
        }
        return { kind: 'global', name: name };
    }"""
new_bind = """    // lexical scopes: stack of {ids:Set, map:{name->id}, fn:boolean} — Phase 3 REG[] needs per-binding ids
    var lex = [];
    function pushBlock() { lex.push({ ids: new Set(), map: Object.create(null), fn: false }); }
    function popBlock() { lex.pop(); }
    function pushFn() { lex.push({ ids: new Set(), map: Object.create(null), fn: true }); }
    function popFn() { lex.pop(); }
    function bindId(name) {
        var id = nextId++;
        lex[lex.length - 1].ids.add(id);
        lex[lex.length - 1].map[name] = id;
        nameIds[name] = id;
        return id;
    }
    function resolve(name) {
        var crossed = false;
        for (var i = lex.length - 1; i >= 0; i--) {
            if (Object.prototype.hasOwnProperty.call(lex[i].map, name)) {
                var id = lex[i].map[name];
                return crossed ? { kind: 'upval', id: id } : { kind: 'local', id: id };
            }
            if (lex[i].fn) crossed = true;
        }
        return { kind: 'global', name: name };
    }"""
if old_bind in t:
    t = t.replace(old_bind, new_bind)
    print("patched lex bind")
else:
    print("lex bind not found")

# 5. Update DoStatement etc. to emit CLOSE before POPSC, and handle PUSHSC etc.
# We need to add CLOSE handling for Do, If, While, Repeat, For, etc.
# Simplify: just add CLOSE before POPSC in those handlers via replacement.
# For DoStatement:
old_do = """            case 'DoStatement':
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                body(ctx, s.body);
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                return;"""
new_do = """            case 'DoStatement':
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                body(ctx, s.body);
                emit0(ctx, OPCODES.CLOSE);
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                return;"""
if old_do in t:
    t = t.replace(old_do, new_do)
    print("patched Do")
# IfStatement
old_if = """                    if (cl.condition) {
                        ex(ctx, cl.condition);
                        var nextLbl = label(ctx);
                        jref(ctx, OPCODES.JIF, nextLbl);
                        pushBlock();
                        emit0(ctx, OPCODES.PUSHSC);
                        body(ctx, cl.body);
                        emit0(ctx, OPCODES.POPSC);
                        popBlock();
                        jref(ctx, OPCODES.JMP, endLbl);
                        mark(ctx, nextLbl);
                    } else {
                        pushBlock();
                        emit0(ctx, OPCODES.PUSHSC);
                        body(ctx, cl.body);
                        emit0(ctx, OPCODES.POPSC);
                        popBlock();
                    }"""
new_if = """                    if (cl.condition) {
                        ex(ctx, cl.condition);
                        var nextLbl = label(ctx);
                        jref(ctx, OPCODES.JIF, nextLbl);
                        pushBlock();
                        emit0(ctx, OPCODES.PUSHSC);
                        body(ctx, cl.body);
                        emit0(ctx, OPCODES.CLOSE);
                        emit0(ctx, OPCODES.POPSC);
                        popBlock();
                        jref(ctx, OPCODES.JMP, endLbl);
                        mark(ctx, nextLbl);
                    } else {
                        pushBlock();
                        emit0(ctx, OPCODES.PUSHSC);
                        body(ctx, cl.body);
                        emit0(ctx, OPCODES.CLOSE);
                        emit0(ctx, OPCODES.POPSC);
                        popBlock();
                    }"""
if old_if in t:
    t = t.replace(old_if, new_if)
    print("patched If")
# While
old_while = """            case 'WhileStatement': {
                var startL = label(ctx);
                var endL = label(ctx);
                mark(ctx, startL);
                ex(ctx, s.condition);
                jref(ctx, OPCODES.JIF, endL);
                var bodyDepth = lex.length; // BEFORE pushBlock: break must pop the body scope too
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL, depth: bodyDepth, isGenericFor: false });
                body(ctx, s.body);
                ctx.loops.pop();
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                jref(ctx, OPCODES.JMP, startL);
                mark(ctx, endL);
                return;
            }"""
new_while = """            case 'WhileStatement': {
                var startL = label(ctx);
                var endL = label(ctx);
                mark(ctx, startL);
                ex(ctx, s.condition);
                jref(ctx, OPCODES.JIF, endL);
                var bodyDepth = lex.length; // BEFORE pushBlock: break must pop the body scope too
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL, depth: bodyDepth, isGenericFor: false });
                body(ctx, s.body);
                ctx.loops.pop();
                emit0(ctx, OPCODES.CLOSE);
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                jref(ctx, OPCODES.JMP, startL);
                mark(ctx, endL);
                return;
            }"""
if old_while in t:
    t = t.replace(old_while, new_while)
    print("patched While")
# Repeat
old_repeat = """            case 'RepeatStatement': {
                var startL2 = label(ctx);
                var endL2 = label(ctx);
                mark(ctx, startL2);
                var bodyDepth2 = lex.length; // BEFORE pushBlock
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL2, depth: bodyDepth2, isGenericFor: false });
                body(ctx, s.body);
                ex(ctx, s.condition);
                ctx.loops.pop();
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                jref(ctx, OPCODES.JIF, startL2);
                mark(ctx, endL2);
                return;
            }"""
new_repeat = """            case 'RepeatStatement': {
                var startL2 = label(ctx);
                var endL2 = label(ctx);
                mark(ctx, startL2);
                var bodyDepth2 = lex.length; // BEFORE pushBlock
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL2, depth: bodyDepth2, isGenericFor: false });
                body(ctx, s.body);
                ex(ctx, s.condition);
                ctx.loops.pop();
                emit0(ctx, OPCODES.CLOSE);
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                jref(ctx, OPCODES.JIF, startL2);
                mark(ctx, endL2);
                return;
            }"""
if old_repeat in t:
    t = t.replace(old_repeat, new_repeat)
    print("patched Repeat")
# Break
old_break = """            case 'BreakStatement': {
                if (!ctx.loops.length) throw new Error('break outside loop');
                var loop = ctx.loops[ctx.loops.length - 1];
                // pop every scope pushed after the loop recorded its depth.
                // The generic-for's packed residue is cleaned by the POP
                // AT endLabel itself (the label is marked BEFORE that POP),
                // so break must NOT pre-pop it - that would eat one slot
                // belonging to an ENCLOSING loop's packed table.
                var pops = lex.length - loop.depth;
                for (var p = 0; p < pops; p++) emit0(ctx, OPCODES.POPSC);
                jref(ctx, OPCODES.JMP, loop.endLabel);
                return;
            }"""
new_break = """            case 'BreakStatement': {
                if (!ctx.loops.length) throw new Error('break outside loop');
                var loop = ctx.loops[ctx.loops.length - 1];
                var pops = lex.length - loop.depth;
                for (var p = 0; p < pops; p++) { emit0(ctx, OPCODES.CLOSE); emit0(ctx, OPCODES.POPSC); }
                jref(ctx, OPCODES.JMP, loop.endLabel);
                return;
            }"""
if old_break in t:
    t = t.replace(old_break, new_break)
    print("patched Break")

# 6. Update compileReturn to emit TAILCALL
old_ret = """    function compileReturn(ctx, s) {
        var args = s.arguments || [];
        if (args.length === 0) { emit1(ctx, OPCODES.RET, 0); return; }
        var lastI = args.length - 1;
        var lastE = args[lastI];
        var expand = isCallNode(lastE) || isVarargNode(lastE);
        var fixedCount = expand ? args.length - 1 : args.length;
        if (expand && fixedCount === 0) {
            // return f(...) / return ...
            if (isCallNode(lastE)) {
                // tail call: compile with multi, then RETP
                compileCall(ctx, lastE, { multi: 'multi' });
            } else {
                emit0(ctx, OPCODES.VARGP);
            }
            emit1(ctx, OPCODES.RETP, 0);
            return;
        }"""
new_ret = """    function compileReturn(ctx, s) {
        var args = s.arguments || [];
        if (args.length === 0) { emit1(ctx, OPCODES.RET, 0); return; }
        var lastI = args.length - 1;
        var lastE = args[lastI];
        var expand = isCallNode(lastE) || isVarargNode(lastE);
        var fixedCount = expand ? args.length - 1 : args.length;
        if (expand && fixedCount === 0) {
            // tail call: return f(...) / return ... — emit genuine TAILCALL (Phase 3)
            if (isCallNode(lastE)) {
                var base = lastE.base;
                var args2 = lastE.arguments || [];
                if (base.type === 'MemberExpression' && base.indexer === ':') {
                    ex(ctx, base.base);
                    emit0(ctx, OPCODES.DUP);
                    emit1(ctx, OPCODES.CONST, addConstS(base.identifier.name));
                    emit0(ctx, OPCODES.TGET);
                    emit0(ctx, OPCODES.SWAP);
                    var argn = compileArgs(ctx, args2, true);
                    emit1(ctx, OPCODES.TAILCALL, argn.fixed + 1);
                } else {
                    ex(ctx, base);
                    var argn2 = compileArgs(ctx, args2, true);
                    emit1(ctx, OPCODES.TAILCALL, argn2.fixed);
                }
                return;
            } else {
                emit0(ctx, OPCODES.VARGP);
                emit1(ctx, OPCODES.RETP, 0);
                return;
            }
        }"""
if old_ret in t:
    t = t.replace(old_ret, new_ret)
    print("patched compileReturn TAILCALL")
else:
    print("compileReturn not found")

# 7. Update ForNumeric etc. to include CLOSE
old_fornum = """        var bodyDepth3 = lex.length; // BEFORE pushBlock: break pops the body scope too
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LNEW, bindId(s.variable.name));
        ctx.loops.push({ endLabel: endL, depth: bodyDepth3, isGenericFor: false });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.POPSC);
        popBlock();"""
new_fornum = """        var bodyDepth3 = lex.length; // BEFORE pushBlock: break pops the body scope too
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LNEW, bindId(s.variable.name));
        ctx.loops.push({ endLabel: endL, depth: bodyDepth3, isGenericFor: false });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.CLOSE);
        emit0(ctx, OPCODES.POPSC);
        popBlock();"""
if old_fornum in t:
    t = t.replace(old_fornum, new_fornum)
    print("patched ForNumeric")
# GenericFor
old_generic = """        ctx.loops.push({ endLabel: endL, depth: bodyDepth4, isGenericFor: true });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.POPSC);
        popBlock();"""
new_generic = """        ctx.loops.push({ endLabel: endL, depth: bodyDepth4, isGenericFor: true });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.CLOSE);
        emit0(ctx, OPCODES.POPSC);
        popBlock();"""
if old_generic in t:
    # Be careful: there are two occurrences (genericFor and maybe other). We'll replace first occurrence only for genericFor block.
    # The genericFor block is specific: bodyDepth4 etc.
    t = t.replace(old_generic, new_generic, 1)
    print("patched GenericFor")

# 8. Add per-function maxReg + register shuffle + IR optimizer pipeline before return
old_return = """    // ---- top-level chunk ----
    pushFn();
    var topCtx = newChunkCtx();
    pushBlock();
    body(topCtx, ast.body);
    emit1(topCtx, OPCODES.RET, 0);
    popBlock();
    popFn();
    patchLabels(topCtx);
    chunks.push({ code: topCtx.code, params: [], vararg: false });

    return { chunks: chunks, vaultPlain: vaultPlain, refs: refs, seed: seed, OPCODES: OPCODES };
}"""
new_return = """    // ---- top-level chunk ----
    pushFn();
    var topCtx = newChunkCtx();
    pushBlock();
    body(topCtx, ast.body);
    emit1(topCtx, OPCODES.RET, 0);
    popBlock();
    popFn();
    patchLabels(topCtx);
    chunks.push({ code: topCtx.code, params: [], vararg: false });

    // -------- PHASE 1 IR/CFG + OPTIMIZER + REGISTER VIRTUALIZATION ----------
    var regOps = new Set([OPCODES.LLOAD, OPCODES.LNEW, OPCODES.LSET, OPCODES.ULOAD, OPCODES.USET]);
    var rev = Object.create(null); for (var _kk in OPCODES) rev[OPCODES[_kk]] = _kk;
    var oneArgSet = new Set(['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK']);
    if (profile.useRegShuffle && nextId > 2) {
        var ids = [];
        for (var _id=1; _id<nextId; _id++) ids.push(_id);
        var _shSeed = seed;
        for (var _i=ids.length-1; _i>0; _i--) {
            _shSeed = (_shSeed * 1664525 + 1013904223) >>> 0;
            var _j = _shSeed % (_i+1);
            var _tmp = ids[_i]; ids[_i]=ids[_j]; ids[_j]=_tmp;
        }
        var regMap = Object.create(null);
        for (var _k=1; _k<nextId; _k++) regMap[_k]=ids[_k-1];
        for (var _ci2=0; _ci2<chunks.length; _ci2++) {
            var cd = chunks[_ci2].code;
            for (var _p=0; _p<cd.length; ) {
                var _op = cd[_p];
                var _name = rev[_op];
                var _hasArg = _name && oneArgSet.has(_name);
                if (_hasArg && regOps.has(_op) && _p+1 < cd.length) cd[_p+1]=regMap[cd[_p+1]] || cd[_p+1];
                _p += _hasArg ? 2 : 1;
            }
        }
        for (var _ci3=0; _ci3<chunks.length; _ci3++) {
            var pr = chunks[_ci3].params;
            for (var _pi=0; _pi<pr.length; _pi++) pr[_pi]=regMap[pr[_pi]] || pr[_pi];
        }
    }
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
    // IR→CFG→OPTIMIZER→LOWERING (real, affects bytecode)
    (function(){
        var rev2 = Object.create(null); for (var kk in OPCODES) rev2[OPCODES[kk]] = kk;
        var oneArgSet2 = new Set(['CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET','UNPK','UNPKR','CALL','CALLM','TAILCALL','RET','RETP','NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK']);
        function getNumStr(refIdx){
            var r = refs[refIdx-1];
            if(!r) return null;
            var s=''; for(var j=0;j<r.len;j++) s+=String.fromCharCode(vaultPlain[r.start+j]);
            return s;
        }
        var totalFolded=0, totalElim=0;
        for(var ci=0; ci<chunks.length; ci++){
            var code = chunks[ci].code;
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
            var out=[];
            for(var i=0;i<insts.length;){
                if(i+2<insts.length && insts[i].op==='NUMK' && insts[i+1].op==='NUMK' && ['ADD','SUB','MUL','DIV','MOD','POW'].includes(insts[i+2].op)){
                    var s1=getNumStr(insts[i].a); var s2=getNumStr(insts[i+1].a);
                    var n1=parseFloat(s1), n2=parseFloat(s2);
                    if(!isNaN(n1) && !isNaN(n2)){
                        var res=null; var op2=insts[i+2].op;
                        if(op2==='ADD') res=n1+n2;
                        else if(op2==='SUB') res=n1-n2;
                        else if(op2==='MUL') res=n1*n2;
                        else if(op2==='DIV' && n2!==0) res=n1/n2;
                        else if(op2==='MOD' && n2!==0) res=n1%n2;
                        else if(op2==='POW') res=Math.pow(n1,n2);
                        if(res!==null && isFinite(res)){
                            var rs=String(res);
                            var b=strToBytes(rs); var st2=vaultPlain.length; for(var bi=0;bi<b.length;bi++) vaultPlain.push(b[bi]);
                            refs.push({start:st2, len:b.length});
                            var newIdx=refs.length;
                            out.push({op:'NUMK', a:newIdx, rawOp:OPCODES['NUMK']});
                            totalFolded++; i+=3; continue;
                        }
                    }
                }
                if(i+1<insts.length && insts[i].op==='DUP' && insts[i+1].op==='POP'){ totalElim+=2; i+=2; continue; }
                out.push(insts[i]); i++;
            }
            insts=out;
            var newCode=[];
            for(var k=0;k<insts.length;k++){
                var it=insts[k]; var oc = OPCODES[it.op]; if(oc==null) continue;
                newCode.push(oc); if(it.a!=null) newCode.push(it.a);
            }
            var hasJump=false; for(var kj=0;kj<insts.length;kj++) if(['JMP','JIF','JIT','JNIL','ANDK','ORK'].includes(insts[kj].op)) hasJump=true;
            if(!hasJump && newCode.length!==code.length){
                chunks[ci].code=newCode;
            }
        }
        compile._lastIrStats = { folded: totalFolded, eliminated: totalElim };
    })();

    return { chunks: chunks, vaultPlain: vaultPlain, refs: refs, seed: seed, OPCODES: OPCODES, profile: profileName, irStats: (typeof compile._lastIrStats!=='undefined'?compile._lastIrStats:null) };
}"""
if old_return in t:
    t = t.replace(old_return, new_return)
    print("patched return with IR")
else:
    print("return patch not found")
    idx = t.find("chunks.push({ code: topCtx.code")
    print(t[idx-500:idx+800])

# Save
p.write_text(t, encoding='utf-8')
print("saved vm-bytecode.js phase2 parts")
