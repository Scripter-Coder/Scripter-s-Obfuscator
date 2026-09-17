// ============================================================
// vm-bytecode.js - tier 2 FULL: Lua -> custom bytecode VM
// (the actual Luraph/Luarmor architecture, homegrown)
// ------------------------------------------------------------
// Never ship source in ANY form. This pass COMPILES the user's script
// to a custom instruction set and emits a small interpreter (the VM).
// What ships after the cipher layers are peeled:
//     [ vault ]  [ bytecode blob (pure numbers) ] [ dispatcher loop ]
// There is no lua source under the blob. Recovering the script means
// rebuilding the compiler in reverse, per build, because:
//   - opcode values are randomized PER BUILD (unique map each file)
//   - handler order in the dispatcher is shuffled per build
//   - all strings/numbers live in the encrypted vault
//   - locals become opaque integer ids; no names survive
// ============================================================

var _bcLuaparse = null;
export function vmBCSetLuaparse(p) { _bcLuaparse = p; }
function resolveLuaparse() {
    if (_bcLuaparse) return _bcLuaparse;
    if (typeof window !== 'undefined' && window.luaparse) return window.luaparse;
    if (typeof globalThis !== 'undefined' && globalThis.luaparse) return globalThis.luaparse;
    if (typeof require === 'function') return require('luaparse');
    throw new Error('luaparse unavailable - call vmBCSetLuaparse() first');
}

function rnd(n) { return Math.floor(Math.random() * n); }
function rndInt(min, max) { return min + rnd(max - min + 1); }
function hex(len) {
    var c = '0123456789abcdef', s = '';
    for (var i = 0; i < len; i++) s += c[rnd(16)];
    return s;
}
function strToBytes(s) {
    var esc = unescape(encodeURIComponent(s));
    var out = [];
    for (var i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i));
    return out;
}

// denylist: constructs whose semantics we cannot promise (word-boundary checked)
// ChestFarm fix: ensure task.spawn / task.wait and shared upvalues (ChestFarmEnabled) are not
// incorrectly flagged; task.spawn/task.wait are globals that must be GLOB+TGET, never locals
var DENY = ['getfenv', 'setfenv'];

// opcode names (values assigned randomly per build)
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
];

// luaparse 0.3.1 keeps string content in .raw
function rawToStr(raw) {
    if (raw === undefined || raw === null) return '';
    var q = raw[0];
    if ((q === '"' || q === "'") && raw[raw.length - 1] === q && raw.length >= 2) {
        var inner = raw.substring(1, raw.length - 1);
        var out = '', i = 0;
        while (i < inner.length) {
            var ch = inner[i];
            if (ch === '\\') {
                var nxt = inner[i + 1];
                var md = inner.substring(i + 1).match(/^(\d{1,3})/);
                if (nxt >= '0' && nxt <= '9' && md) {
                    out += String.fromCharCode(parseInt(md[1], 10));
                    i += 1 + md[1].length;
                    continue;
                }
                switch (nxt) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'a': out += '\x07'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'v': out += '\v'; break;
                    case '\\': out += '\\'; break;
                    case '"': out += '"'; break;
                    case "'": out += "'"; break;
                    default: out += nxt; break;
                }
                i += 2;
            } else { out += ch; i += 1; }
        }
        return out;
    }
    var m2 = raw.match(/^(\[=*\[)([\s\S]*)(\]=*\])$/);
    if (m2) {
        var bodyStr = m2[2];
        if (bodyStr[0] === '\r') bodyStr = bodyStr.substring(1);
        if (bodyStr[0] === '\n') bodyStr = bodyStr.substring(1);
        return bodyStr;
    }
    return raw;
}

function isCallNode(n) {
    return n && (n.type === 'CallExpression' || n.type === 'StringCallExpression' || n.type === 'TableCallExpression');
}
function isVarargNode(n) {
    return n && (n.type === 'VarargLiteral' || n.type === 'Vararg');
}

// ============================================================
// COMPILER
// ============================================================
function compile(src) {
    var ast = resolveLuaparse().parse(src, { luaVersion: '5.1' });
    if (!ast || !ast.body) throw new Error('no body');

    var seed = Math.floor(Math.random() * 4294967296); // 32-bit: brute-force infeasible (python tried 0..512)
    var vaultPlain = [];
    var refs = [];
    var chunks = [];
    var nameIds = Object.create(null);
    var nextId = 1;
    var hiddenCounter = 0;

    // per-build opcode map (assigned here, used by both compiler + emit)
    var OPCODES = Object.create(null);
    (function () {
        var used = new Set();
        for (var i = 0; i < OP_NAMES.length; i++) {
            var v = rndInt(500, 60000);
            while (used.has(v)) v = rndInt(500, 60000);
            used.add(v);
            OPCODES[OP_NAMES[i]] = v;
        }
    })();

    function addConstS(str) {
        var b = strToBytes(String(str));
        var start = vaultPlain.length;
        for (var i = 0; i < b.length; i++) vaultPlain.push(b[i]);
        refs.push({ start: start, len: b.length });
        return refs.length; // 1-based
    }

    // lexical scopes: stack of {ids:Set, fn:boolean}
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
    }

    function newChunkCtx() {
        return { code: [], labels: [], labelPos: Object.create(null), loops: [] };
    }
    function emit1(ctx, op, a) { ctx.code.push(op, a); }
    function emit0(ctx, op) { ctx.code.push(op); }
    function label(ctx) { var id = ctx.labels.length; ctx.labels.push([]); return id; }
    function mark(ctx, lbl) { ctx.labelPos[lbl] = ctx.code.length + 1; }
    function jref(ctx, op, lbl) {
        ctx.code.push(op, 0);
        ctx.labels[lbl].push(ctx.code.length - 1);
    }
    function patchLabels(ctx) {
        for (var lbl = 0; lbl < ctx.labels.length; lbl++) {
            var pos = ctx.labelPos[lbl];
            if (pos === undefined) throw new Error('unmarked label');
            var lst = ctx.labels[lbl];
            for (var i = 0; i < lst.length; i++) ctx.code[lst[i]] = pos;
        }
    }

    // ---- expressions ----
    function ex(ctx, n, fl) {
        fl = fl || {};
        // PARENTHESIZED call in single-value context: truncate (Lua rule:
        // (f()) is exactly ONE value). Last-arg expansion in calls is
        // handled by compileArgs, which ignores trunc for the last slot.
        var truncHere = fl.trunc === true && n.inParens === true;
        switch (n.type) {
            case 'StringLiteral':
                emit1(ctx, OPCODES.CONST, addConstS(rawToStr(n.raw)));
                return;
            case 'NumericLiteral':
                emit1(ctx, OPCODES.NUMK, addConstS(n.raw !== undefined ? n.raw : String(n.value)));
                return;
            case 'BooleanLiteral':
                emit0(ctx, n.value ? OPCODES.TRUE : OPCODES.FALSE);
                return;
            case 'NilLiteral':
                emit0(ctx, OPCODES.NIL);
                return;
            case 'VarargLiteral': case 'Vararg':
                emit0(ctx, OPCODES.VARGP);
                return;
            case 'Identifier': {
                var r = resolve(n.name);
                if (r.kind === 'local') emit1(ctx, OPCODES.LLOAD, r.id);
                else if (r.kind === 'upval') emit1(ctx, OPCODES.ULOAD, r.id);
                else emit1(ctx, OPCODES.GLOB, addConstS(r.name));
                return;
            }
            case 'MemberExpression':
                ex(ctx, n.base);
                emit1(ctx, OPCODES.CONST, addConstS(n.identifier.name));
                emit0(ctx, OPCODES.TGET);
                return;
            case 'IndexExpression':
                ex(ctx, n.base);
                ex(ctx, n.index);
                emit0(ctx, OPCODES.TGET);
                return;
            case 'CallExpression':
                compileCall(ctx, n, { multi: truncHere ? 'single' : fl.multi });
                return;
            case 'StringCallExpression': case 'TableCallExpression':
                compileCall(ctx, { base: n.base, arguments: [n.argument || n.arguments] }, { multi: truncHere ? 'single' : fl.multi });
                return;
            case 'BinaryExpression': case 'LogicalExpression':
                compileBinary(ctx, n);
                return;
            case 'UnaryExpression':
                ex(ctx, n.argument);
                if (n.operator === 'not') emit0(ctx, OPCODES.NOT);
                else if (n.operator === '-') emit0(ctx, OPCODES.NEG);
                else if (n.operator === '#') emit0(ctx, OPCODES.LEN);
                else throw new Error('unary ' + n.operator);
                return;
            case 'TableConstructorExpression':
                compileTable(ctx, n);
                return;
            case 'FunctionExpression': case 'FunctionDeclaration':
                emit1(ctx, OPCODES.NEWF, compileFunctionChunk(n));
                return;
            default:
                throw new Error('expr ' + n.type);
        }
    }

    // returns {fixed, packed}
    // LUA RULE: the LAST argument of a call ALWAYS expands its multiple
    // results (f(g()) passes ALL of g's returns). Non-last args truncate
    // to one value. The packed tail counts as ONE slot; the CALL handler
    // flattens it via its .n marker.
    function compileArgs(ctx, args, wantExpand) {
        var fixed = 0;
        var last = args.length - 1;
        for (var i = 0; i < args.length; i++) {
            var a = args[i];
            var isLast = i === last;
            if (isLast && (isCallNode(a) || isVarargNode(a))) {
                if (isCallNode(a)) ex(ctx, a, { multi: 'multi' }); // packed
                else emit0(ctx, OPCODES.VARGP);
                return { fixed: fixed + 1, packed: true }; // packed = 1 slot
            }
            ex(ctx, a, { trunc: true });
            fixed++;
        }
        return { fixed: fixed, packed: false };
    }

    function compileCall(ctx, n, fl) {
        var wantMulti = fl && (fl.multi === 'multi');
        var base = n.base;
        var args = n.arguments || [];
        if (base.type === 'MemberExpression' && base.indexer === ':') {
            // [o, o.m] -> SWAP -> [fn, self]; args; CALL (n includes self)
            ex(ctx, base.base);
            emit0(ctx, OPCODES.DUP);
            emit1(ctx, OPCODES.CONST, addConstS(base.identifier.name));
            emit0(ctx, OPCODES.TGET);
            emit0(ctx, OPCODES.SWAP);
            var argn = compileArgs(ctx, args, wantMulti);
            var nargs = argn.fixed + 1; // + self
            // compileArgs already spilled fixed args above the packed
            // tail; n counts slots above fn (packed = 1 slot)
            emit1(ctx, wantMulti ? OPCODES.CALLM : OPCODES.CALL, argn.packed ? nargs : nargs);
            return;
        }
        ex(ctx, base);
        var argn2 = compileArgs(ctx, args, wantMulti);
        emit1(ctx, wantMulti ? OPCODES.CALLM : OPCODES.CALL, argn2.fixed);
    }

    function compileBinary(ctx, n) {
        var op = n.operator;
        if (op === 'and') {
            ex(ctx, n.left);
            var lend = label(ctx);
            jref(ctx, OPCODES.ANDK, lend);
            ex(ctx, n.right);
            mark(ctx, lend);
            return;
        }
        if (op === 'or') {
            ex(ctx, n.left);
            var lend2 = label(ctx);
            jref(ctx, OPCODES.ORK, lend2);
            ex(ctx, n.right);
            mark(ctx, lend2);
            return;
        }
        ex(ctx, n.left);
        ex(ctx, n.right);
        var m = {
            '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
            '^': 'POW', '..': 'CONCAT', '==': 'EQ', '~=': 'NEQ',
            '<': 'LT', '<=': 'LE', '>': 'GT', '>=': 'GE'
        };
        if (!m[op]) throw new Error('binop ' + op);
        emit0(ctx, OPCODES[m[op]]);
    }

    function compileTable(ctx, n) {
        emit0(ctx, OPCODES.NEWTAB);
        var arrIdx = 0;
        var fields = n.fields || [];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var isLast = i === fields.length - 1;
            if (f.type === 'TableKey') {
                emit0(ctx, OPCODES.DUP);
                ex(ctx, f.key);
                ex(ctx, f.value);
                emit0(ctx, OPCODES.TSET);
            } else if (f.type === 'TableKeyString') {
                emit0(ctx, OPCODES.DUP);
                emit1(ctx, OPCODES.CONST, addConstS(f.key.name));
                ex(ctx, f.value);
                emit0(ctx, OPCODES.TSET);
            } else {
                arrIdx++;
                var v = f.value;
                if (isLast && (isCallNode(v) || isVarargNode(v))) {
                    emit0(ctx, OPCODES.DUP);
                    if (isCallNode(v)) ex(ctx, v, { multi: 'multi' });
                    else emit0(ctx, OPCODES.VARGP);
                    emit0(ctx, OPCODES.APD);
                } else {
                    emit0(ctx, OPCODES.DUP);
                    emit1(ctx, OPCODES.NUMK, addConstS(String(arrIdx)));
                    ex(ctx, v);
                    emit0(ctx, OPCODES.TSET);
                }
            }
        }
    }

    // ---- statements ----
    function st(ctx, s) {
        switch (s.type) {
            case 'LocalStatement': {
                var vars = s.variables || [];
                var inits = s.init || [];
                if (inits.length === 0) {
                    for (var i = 0; i < vars.length; i++) {
                        emit0(ctx, OPCODES.NIL);
                        emit1(ctx, OPCODES.LNEW, bindId(vars[i].name));
                    }
                    return;
                }
                if (inits.length === 1 && vars.length === 1) {
                    var ini = inits[0];
                    ex(ctx, ini, { trunc: true });
                    emit1(ctx, OPCODES.LNEW, bindId(vars[0].name));
                    return;
                }
                // multi-value local: [v1..vk, packed?] -> values for each
                // name in order, nil-filled. Strategy:
                //   1. eval fixed RHS exprs into temp boxes (in order)
                //   2. eval expanding tail (if any) -> packed on stack
                //   3. DUP+UNPK j (j = 1..need) pushes p[1]..p[need] so
                //      the TOP is p[need]... we need vars consumed from
                //      the TOP downward = vars[last] first -> values for
                //      the TOP must be the LAST value -> push p[1] FIRST
                //      ... simplest correct: push unpacked values in
                //      REVERSE (k = need..1), then LNEW binds from the top
                //      in REVERSE var order. Both loops below are
                //      reversed consistently.
                var lastI = inits.length - 1;
                var lastE = inits[lastI];
                var expand = isCallNode(lastE) || isVarargNode(lastE);
                var fixedCount = expand ? inits.length - 1 : inits.length;
                var tmpIds = [];
                for (var i2 = 0; i2 < fixedCount; i2++) {
                    ex(ctx, inits[i2], { trunc: true });
                    var tid = bindId('\x00t' + (hiddenCounter++));
                    emit1(ctx, OPCODES.LNEW, tid);
                    tmpIds.push(tid);
                }
                if (expand) {
                    if (isCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' });
                    else emit0(ctx, OPCODES.VARGP);
                    var need = vars.length - fixedCount; // >= 1
                    if (need < 1) need = 1;
                    // UNPKR n: POP the packed, PUSH p[1]..p[n] (nil-filled)
                    // so the stack top = p[n] = value for vars[last]
                    emit1(ctx, OPCODES.UNPKR, need);
                } else {
                    // more vars than exprs: pad with nils (top = nil for
                    // the last vars)
                    for (var pad = vars.length - fixedCount; pad > 0; pad--) {
                        emit0(ctx, OPCODES.NIL);
                    }
                }
                // bind in REVERSE: vars[last] takes the top value
                for (var v2 = vars.length - 1; v2 >= 0; v2--) {
                    if (v2 >= fixedCount) {
                        // value already on stack (unpack/pad above)
                    } else {
                        emit1(ctx, OPCODES.LLOAD, tmpIds[v2]);
                    }
                    emit1(ctx, OPCODES.LNEW, bindId(vars[v2].name));
                }
                return;
            }
            case 'AssignmentStatement': {
                compileAssign(ctx, s);
                return;
            }
            case 'CallStatement':
                ex(ctx, s.expression, { trunc: true });
                emit0(ctx, OPCODES.POP);
                return;
            case 'FunctionDeclaration': {
                compileFunctionDecl(ctx, s);
                return;
            }
            case 'ReturnStatement': {
                compileReturn(ctx, s);
                return;
            }
            case 'DoStatement':
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                body(ctx, s.body);
                emit0(ctx, OPCODES.POPSC);
                popBlock();
                return;
            case 'IfStatement': {
                var clauses = s.clauses || [];
                var endLbl = label(ctx);
                for (var c = 0; c < clauses.length; c++) {
                    var cl = clauses[c];
                    if (cl.condition) {
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
                    }
                }
                mark(ctx, endLbl);
                return;
            }
            case 'WhileStatement': {
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
            }
            case 'RepeatStatement': {
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
            }
            case 'ForNumericStatement': case 'FornumpStatement':
                compileNumericFor(ctx, s);
                return;
            case 'ForGenericStatement': case 'ForinStatement':
                compileGenericFor(ctx, s);
                return;
            case 'BreakStatement': {
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
            }
            case 'GotoStatement': case 'LabelStatement':
                throw new Error('goto unsupported');
            default:
                throw new Error('stmt ' + s.type);
        }
    }

    function body(ctx, stmts) {
        for (var i = 0; i < (stmts || []).length; i++) st(ctx, stmts[i]);
    }

    function compileStoreTop(ctx, lhs) {
        if (lhs.type === 'Identifier') {
            var r = resolve(lhs.name);
            if (r.kind === 'local') emit1(ctx, OPCODES.LSET, r.id);
            else if (r.kind === 'upval') emit1(ctx, OPCODES.USET, r.id);
            else emit1(ctx, OPCODES.GSET, addConstS(r.name));
            return;
        }
        if (lhs.type === 'MemberExpression') {
            var tmp = bindId('\x00t' + (hiddenCounter++));
            emit1(ctx, OPCODES.LNEW, tmp);
            ex(ctx, lhs.base);
            emit1(ctx, OPCODES.CONST, addConstS(lhs.identifier.name));
            emit1(ctx, OPCODES.LLOAD, tmp);
            emit0(ctx, OPCODES.TSET);
            return;
        }
        if (lhs.type === 'IndexExpression') {
            var tmp2 = bindId('\x00t' + (hiddenCounter++));
            emit1(ctx, OPCODES.LNEW, tmp2);
            ex(ctx, lhs.base);
            ex(ctx, lhs.index, { trunc: true });
            emit1(ctx, OPCODES.LLOAD, tmp2);
            emit0(ctx, OPCODES.TSET);
            return;
        }
        throw new Error('store-top ' + lhs.type);
    }

    function compileAssign(ctx, s) {
        var vars = s.variables || [];
        var inits = s.init || [];
        if (vars.length === 1 && inits.length === 1) {
            var lhs = vars[0];
            var rhs = inits[0];
            if (lhs.type === 'Identifier') {
                var r = resolve(lhs.name);
                ex(ctx, rhs, { trunc: true });
                if (r.kind === 'local') emit1(ctx, OPCODES.LSET, r.id);
                else if (r.kind === 'upval') emit1(ctx, OPCODES.USET, r.id);
                else emit1(ctx, OPCODES.GSET, addConstS(r.name));
                return;
            }
            if (lhs.type === 'MemberExpression') {
                ex(ctx, lhs.base);
                emit1(ctx, OPCODES.CONST, addConstS(lhs.identifier.name));
                ex(ctx, rhs, { trunc: true });
                emit0(ctx, OPCODES.TSET);
                return;
            }
            if (lhs.type === 'IndexExpression') {
                ex(ctx, lhs.base);
                ex(ctx, lhs.index, { trunc: true });
                ex(ctx, rhs, { trunc: true });
                emit0(ctx, OPCODES.TSET);
                return;
            }
            throw new Error('assign lhs ' + lhs.type);
        }
        // multi-assign: eval all RHS (last expands), spill to temps,
        // then store in order
        var lastI = inits.length - 1;
        var lastE = inits[lastI];
        var expand = isCallNode(lastE) || isVarargNode(lastE);
        var tmpIds = [];
        var fixedCount = expand ? inits.length - 1 : inits.length;
        var packedLocalId = null;
        for (var i = 0; i < inits.length; i++) {
            if (i === lastI && expand) {
                if (isCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' }); // packed on top
                else emit0(ctx, OPCODES.VARGP);
                // spill the packed table to a hidden local. The old code
                // peeked it with DUP+UNPK chains, which (a) leaked the
                // packed on the stack and (b) indexed the PREVIOUS peeked
                // value instead of the packed for need >= 2 ("attempt to
                // index a number/boolean value"). Peeking via LLOAD+UNPK
                // is balanced per-peek and always indexes the real table.
                packedLocalId = bindId('\x00t' + (hiddenCounter++));
                emit1(ctx, OPCODES.LNEW, packedLocalId);
            } else {
                ex(ctx, inits[i], { trunc: true });
                var tid = bindId('\x00t' + (hiddenCounter++));
                emit1(ctx, OPCODES.LNEW, tid);
                tmpIds.push(tid);
            }
        }
        var needX = vars.length - fixedCount;
        if (!expand && needX > 0) {
            // more vars than values: pad nils for the tail vars (they
            // sit UNDER the fixed stores' pushed temps, consumed in order)
            for (var pad2 = 0; pad2 < needX; pad2++) emit0(ctx, OPCODES.NIL);
        } else {
            // peek p[need]..p[1]; each LLOAD+UNPK pair is stack-balanced
            // and leaves [p[need],...,p[1]] with p[1] on TOP so the store
            // loop consumes them in the right order
            for (var k = needX; k >= 1; k--) {
                emit1(ctx, OPCODES.LLOAD, packedLocalId);
                emit1(ctx, OPCODES.UNPK, k);
            }
        }
        // store in order: fixed temps first, then peeked tail values
        for (var v = 0; v < vars.length; v++) {
            if (v < fixedCount && tmpIds[v] !== undefined) {
                emit1(ctx, OPCODES.LLOAD, tmpIds[v]);
            }
            compileStoreTop(ctx, vars[v]);
        }
        return;
    }

    function compileReturn(ctx, s) {
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
        }
        for (var i = 0; i < args.length; i++) {
            if (i === lastI && expand) {
                if (isCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' });
                else emit0(ctx, OPCODES.VARGP);
            } else {
                ex(ctx, args[i], { trunc: true });
            }
        }
        if (expand) emit1(ctx, OPCODES.RETP, fixedCount);
        else emit1(ctx, OPCODES.RET, args.length);
    }

    function compileNumericFor(ctx, s) {
        var vs = bindId('\x00s' + (hiddenCounter++));
        var ve = bindId('\x00e' + (hiddenCounter++));
        var vst = bindId('\x00p' + (hiddenCounter++));
        ex(ctx, s.start);
        emit1(ctx, OPCODES.LNEW, vs);
        ex(ctx, s.end);
        emit1(ctx, OPCODES.LNEW, ve);
        if (s.step) ex(ctx, s.step);
        else emit1(ctx, OPCODES.NUMK, addConstS('1'));
        emit1(ctx, OPCODES.LNEW, vst);
        var startL = label(ctx);
        var endL = label(ctx);
        mark(ctx, startL);
        // if st>0: loop while s<=e; else (st<0): loop while s>=e.
        // NOTE: must compare st>0 as a NUMBER (truthiness is not enough)
        emit1(ctx, OPCODES.LLOAD, vst);
        emit1(ctx, OPCODES.NUMK, addConstS('0'));
        emit0(ctx, OPCODES.GT);
        var posL = label(ctx);
        var chkL = label(ctx);
        jref(ctx, OPCODES.JIT, posL);
        // st<=0 path: check s >= e
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LLOAD, ve);
        emit0(ctx, OPCODES.GE);
        jref(ctx, OPCODES.JMP, chkL);
        mark(ctx, posL);
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LLOAD, ve);
        emit0(ctx, OPCODES.LE);
        mark(ctx, chkL);
        jref(ctx, OPCODES.JIF, endL);
        var bodyDepth3 = lex.length; // BEFORE pushBlock: break pops the body scope too
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LNEW, bindId(s.variable.name));
        ctx.loops.push({ endLabel: endL, depth: bodyDepth3, isGenericFor: false });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.POPSC);
        popBlock();
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LLOAD, vst);
        emit0(ctx, OPCODES.ADD);
        emit1(ctx, OPCODES.LSET, vs);
        jref(ctx, OPCODES.JMP, startL);
        mark(ctx, endL);
    }

    function compileGenericFor(ctx, s) {
        var vf = bindId('\x00f' + (hiddenCounter++));
        var vsn = bindId('\x00S' + (hiddenCounter++));
        var vc = bindId('\x00c' + (hiddenCounter++));
        var its = s.iterators || s.expressions || [];
        if (its.length === 1 && isCallNode(its[0])) {
            ex(ctx, its[0], { multi: 'multi' }); // packed {f,s,c}
            emit0(ctx, OPCODES.DUP); emit0(ctx, OPCODES.UNPK1F); emit1(ctx, OPCODES.LNEW, vf);
            emit0(ctx, OPCODES.DUP); emit0(ctx, OPCODES.UNPK2F); emit1(ctx, OPCODES.LNEW, vsn);
            emit0(ctx, OPCODES.DUP); emit0(ctx, OPCODES.UNPK3F); emit1(ctx, OPCODES.LNEW, vc);
            emit0(ctx, OPCODES.POP);
        } else {
            for (var i = 0; i < 3; i++) {
                if (i < its.length) ex(ctx, its[i], { trunc: true });
                else emit0(ctx, OPCODES.NIL);
                emit1(ctx, OPCODES.LNEW, i === 0 ? vf : (i === 1 ? vsn : vc));
            }
        }
        var startL = label(ctx);
        var endL = label(ctx);
        mark(ctx, startL);
        // r = f(s, c) packed  (r stays on the stack for the whole loop)
        emit1(ctx, OPCODES.LLOAD, vf);
        emit1(ctx, OPCODES.LLOAD, vsn);
        emit1(ctx, OPCODES.LLOAD, vc);
        emit1(ctx, OPCODES.CALLM, 2);
        // if r[1]==nil -> end (DUP keeps the packed intact for cleanup)
        emit0(ctx, OPCODES.DUP);
        emit0(ctx, OPCODES.UNPK1F);
        jref(ctx, OPCODES.JNIL, endL);
        // bind loop vars from packed (each DUP+UNPK peeks, packed intact)
        var bodyDepth4 = lex.length; // BEFORE pushBlock: break must pop
                                    // the body scope + the packed residue
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        for (var v = 0; v < s.variables.length; v++) {
            emit0(ctx, OPCODES.DUP);
            emit1(ctx, OPCODES.UNPK, v + 1);
            emit1(ctx, OPCODES.LNEW, bindId(s.variables[v].name));
        }
        ctx.loops.push({ endLabel: endL, depth: bodyDepth4, isGenericFor: true });
        body(ctx, s.body);
        ctx.loops.pop();
        emit0(ctx, OPCODES.POPSC);
        popBlock();
        // c = r[1]  (DUP: peek without consuming the packed)
        emit0(ctx, OPCODES.DUP);
        emit0(ctx, OPCODES.UNPK1F);
        emit1(ctx, OPCODES.LSET, vc);
        emit0(ctx, OPCODES.POP); // pop the packed
        jref(ctx, OPCODES.JMP, startL);
        mark(ctx, endL);
        emit0(ctx, OPCODES.POP); // packed leftover at loop exit
    }

    function compileFunctionDecl(ctx, s) {
        var ident = s.identifier;
        if (ident.type === 'Identifier') {
            if (s.isLocal) {
                var id = bindId(ident.name); // declare first (recursion)
                emit1(ctx, OPCODES.NEWF, compileFunctionChunk(s));
                // LNEW (not LSET): the bind above only registered the id
                // at compile time; the runtime box must be CREATED here
                emit1(ctx, OPCODES.LNEW, id);
                return;
            }
            var r = resolve(ident.name);
            emit1(ctx, OPCODES.NEWF, compileFunctionChunk(s));
            if (r.kind === 'local') emit1(ctx, OPCODES.LSET, r.id);
            else if (r.kind === 'upval') emit1(ctx, OPCODES.USET, r.id);
            else emit1(ctx, OPCODES.GSET, addConstS(ident.name));
            return;
        }
        // a.b.c:m chain
        var node = ident;
        var parts = [];
        while (node && node.type === 'MemberExpression') {
            parts.unshift(node);
            node = node.base;
        }
        var baseR = resolve(node.name);
        if (baseR.kind === 'local') emit1(ctx, OPCODES.LLOAD, baseR.id);
        else if (baseR.kind === 'upval') emit1(ctx, OPCODES.ULOAD, baseR.id);
        else emit1(ctx, OPCODES.GLOB, addConstS(node.name));
        for (var i = 0; i < parts.length - 1; i++) {
            emit1(ctx, OPCODES.CONST, addConstS(parts[i].identifier.name));
            emit0(ctx, OPCODES.TGET);
        }
        emit1(ctx, OPCODES.CONST, addConstS(parts[parts.length - 1].identifier.name));
        emit1(ctx, OPCODES.NEWF, compileFunctionChunk(s));
        emit0(ctx, OPCODES.TSET);
    }

    function compileFunctionChunk(fnNode) {
        var params = [];
        var hasVararg = false;
        pushFn();
        if (fnNode.identifier && fnNode.identifier.type === 'MemberExpression' && fnNode.identifier.indexer === ':') {
            params.push(bindId('self'));
        }
        var plist = fnNode.parameters || [];
        for (var i = 0; i < plist.length; i++) {
            var p = plist[i];
            if (isVarargNode(p)) hasVararg = true;
            else params.push(bindId(p.name));
        }
        var ctx = newChunkCtx();
        pushBlock();
        body(ctx, fnNode.body);
        emit1(ctx, OPCODES.RET, 0);
        popBlock();
        popFn();
        patchLabels(ctx);
        // 1-based chunk index in the emitted Lua table
        var ci = chunks.length + 1;
        chunks.push({ code: ctx.code, params: params, vararg: hasVararg });
        return ci;
    }

    // ---- top-level chunk ----
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
}

export { compile as _vmBcCompile, OP_NAMES as _vmBcOpNames, rawToStr as _vmBcRawToStr, DENY as _vmBcDeny };

// ============================================================
// VM EMITTER (per-build randomized)
// ============================================================
// Emits a self-contained Lua interpreter for the compiled bytecode.
// Handler order is shuffled per build; opcode values are the per-build
// map from compile(). Every name is random. Only 5.1-safe arithmetic.
//
// SERVER-BOUND SEED: when build.seedFromGenv is set, the vault seed is
// NOT embedded. The outer ScripterHub loader fetches the split key
// from the worker and drops the true seed into genv under a random
// name before compiling the VM stub - a peeled stub cannot decrypt a
// single constant without the runtime-only seed (same guarantee class
// as the split-key outer layer).
//
// PER-BUILD CIPHERS: the vault + blob cipher formulas are RANDOMIZED
// per build (coefficients, multipliers, direction, position mixing).
// Cracking one build teaches nothing about the next - there is no
// static signature to write a peeler against (the friend's tool died
// because its formulas were constants).
//
// CHUNK BLOB: bytecode is NOT shipped as plaintext number tables; it
// is packed (length-prefixed records) and stream-encrypted, then
// decoded at boot into the chunk table.
function emitVM(build) {
    var seed = build.seed;
    var OPCODES = build.OPCODES;
    var seedGenvName = build.seedFromGenv || null;
    var seedInFile = !seedGenvName;

    function nm(p) { return p + hex(6); }
    var V = nm('v'), C = nm('c'), R = nm('r'), D = nm('d'), NC = nm('m');
    var RUN = nm('R'), CH = nm('K'), PK = nm('P'), E = nm('g');
    var S = nm('s'), SP = nm('t'), SC = nm('y'), PC = nm('i'), CODE = nm('w');
    var OP = nm('o'), LK = nm('L'), VA = nm('a');
    var X = nm('x'), Y = nm('z');

    // ---- per-build VAULT cipher params ----
    // vault byte at 0-based pos: v ^ K(pos), p = pos+1 (1-based):
    //   K(p) = ((a*p + b + SEED*((p*p)%m)) % 251) + c
    // VP coefficients are RANDOM PER BUILD. In server-bound mode the
    // SEED comes from genv at RUNTIME (not in the file), so a peeled
    // stub cannot decrypt the vault even knowing the coefficients;
    // in self-contained mode the seed literal is baked (same math).
    var VP = {
        a: rndInt(29, 251),   // linear position multiplier
        b: rndInt(29, 251),   // additive offset
        c: rndInt(5, 251),    // final additive (range guard)
        m: rndInt(3, 31),      // quadratic modulus
        d: rndInt(1, 127),     // prev chaining mixer (anti-brute-force)
        iv: rndInt(0, 255)     // vault IV for chaining
    };
    // SEED expression: literal (in-file) or genv lookup (server-bound)
    var seedExpr = seedInFile ? String(seed) : (E + '[' + JSON.stringify(seedGenvName) + ']');

    // encrypt vault with per-build STRONG cipher + per-string prev chaining (anti-python brute-force)
    // K(p,prev) = ((a*p + b + (seed*((p*p)%m) %4294967296) + prev*d) %251)+c ; enc = plain ^ K
    var vault = build.vaultPlain.slice();
    for (var _ri = 0; _ri < build.refs.length; _ri++) {
        var _r = build.refs[_ri];
        var _prev = VP.iv;
        for (var _j = 0; _j < _r.len; _j++) {
            var _pos = _r.start + _j;
            var _p = _pos + 1;
            var _baseKey = ((VP.a * _p + VP.b + seed * ((_p * _p) % VP.m)) % 251) + VP.c;
            var _combined = (_baseKey + _prev * VP.d) % 256;
            var _plain = vault[_pos];
            vault[_pos] = (_plain ^ _combined) % 256;
            _prev = _plain;
        }
    }
    // ---- DECOY VAULT: append random runs encrypted with the SAME
    // formula. Indistinguishable from real vault bytes (same cipher,
    // same shape); only real refs ever read the real region. Decoy
    // refs below point into this space so a static analyst cannot
    // tell which constants are genuine.
    var realVaultLen = vault.length;
    var decoyRuns = rndInt(3, 8);
    var decoyRefSpans = []; // {start,len} into the FULL vault (1-based refs semantics: refs use start as 0-based offset; D reads V[p] with p=st+j, i.e. st is 0-based)
    for (var dr = 0; dr < decoyRuns; dr++) {
        var dlen = rndInt(4, 24);
        var dstart = vault.length;
        var dPrev = rndInt(0, 255);
        for (var dj = 0; dj < dlen; dj++) {
            var dpos = vault.length; // 0-based
            var dp = dpos + 1;
            var dbaseKey = ((VP.a * dp + VP.b + seed * ((dp * dp) % VP.m)) % 251) + VP.c;
            var dcombined = (dbaseKey + dPrev * VP.d) % 256;
            var dpb = rndInt(0, 255);
            vault.push((dpb ^ dcombined) % 256);
            dPrev = dpb;
        }
        decoyRefSpans.push({ start: dstart, len: dlen });
    }

    var L = [];
    // ANTI-PYTHON DECOY: old-style VM that matches python's regex but decodes to troll
    // This is the FIRST "while true do" candidate python finds, so it decodes the DECOY not the real VM
    (function(){
        var decoyFn = '_d' + hex(6);
        var decoyStack = '_s' + hex(4);
        var decoyTop = '_t' + hex(4);
        var decoyScopes = '_y' + hex(4);
        var decoyPc = '_i' + hex(4);
        var decoyChunk = '_w' + hex(4);
        var decoyBlob = '_b' + hex(4);
        var decoyRanges = '_r' + hex(4);
        var troll = "Goodluck Sonion decoded but this is decoy";
        var trollBytes = strToBytes(troll);
        var decoyVault = [];
        var decoySeed = 42;
        for(var _pi=0; _pi<trollBytes.length; _pi++){
            var _pp=_pi+1;
            var _kb=(217*_pp+210+decoySeed*((_pp*_pp)%23))%251+160;
            decoyVault.push((trollBytes[_pi] ^ (_kb &0xFF)) &0xFF);
        }
        var _da = nm('a'), _db = nm('b');
        var _do = nm('o');
        L.push('local ' + decoyFn + '=function(' + _da + ',' + _db + ',...)');
        L.push(' while true do');
        L.push('  local ' + decoyStack + '={} local ' + decoyTop + '=0');
        L.push('  local ' + decoyScopes + '={{}}');
        L.push('  local ' + decoyPc + '=1');
        L.push('  local ' + decoyChunk + '=' + _da + '[' + _db + ']');
        L.push('  local ' + _do + '=' + decoyChunk + '.c[' + decoyPc + ']');
        L.push('  if ' + _do + '==1 then ' + decoyStack + '[' + decoyTop + ']="x" end');
        L.push(' end');
        L.push('end');
        L.push('local ' + decoyBlob + '={' + decoyVault.join(',') + '}');
        L.push('local ' + decoyRanges + '={{1,' + trollBytes.length + '}}');
        L.push('local ' + nm('d') + '=function(i) local a=' + decoyBlob + '[1] local rr=' + decoyRanges + '[i] local b=(217*i+210+' + decoySeed + '*((i*i)%23))%251+160 local r=0 local pw=1 local aa=a local bb=b for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end return string.char(r) end');
        var decoyB=[0,1,0,1,2,3];
        for(var _bi=0; _bi<decoyB.length; _bi++){ var _p1=_bi+1; var _bk=((85*_p1*_p1+49*_p1+76)%4294967296)%251+4; decoyB[_bi]=(decoyB[_bi] ^ _bk)&0xFF; }
        L.push('if false then');
        L.push('local ' + decoyBlob + '2={' + decoyB.join(',') + '} do local rp=1 while rp<=#' + decoyBlob + '2 do local np=' + decoyBlob + '2[rp]+' + decoyBlob + '2[rp+1]*256 rp=rp+2 local ps={} for j=1,np do ps[j]=' + decoyBlob + '2[rp]+' + decoyBlob + '2[rp+1]*256 rp=rp+2 end local va=(' + decoyBlob + '2[rp]==1) rp=rp+1 local nc=' + decoyBlob + '2[rp]+' + decoyBlob + '2[rp+1]*256+' + decoyBlob + '2[rp+2]*65536+' + decoyBlob + '2[rp+3]*16777216 rp=rp+4 local cd={} for j=1,nc do cd[j]=' + decoyBlob + '2[rp]+' + decoyBlob + '2[rp+1]*256+' + decoyBlob + '2[rp+2]*65536+' + decoyBlob + '2[rp+3]*16777216 rp=rp+4 end end end');
        L.push('end');
    })();
    // ANTI-PYTHON: avoid "(getgenv and getgenv()) or _G" literal
    L.push('local ' + E + '=_G');
    L.push('if getgenv then ' + E + '=getgenv() end');
    L.push('if not ' + E + ' then ' + E + '=_G end');
    L.push('local ' + V + '={' + vault.join(',') + '}');
    L.push('local ' + C + '={}');
    // ---- refs: REAL refs first (their indices are baked into the
    // bytecode), then DECOY refs pointing into the decoy region. Same
    // shape {start,len}; only real ids are ever dereferenced.
    var refParts = build.refs.map(function (r) { return '{' + r.start + ',' + r.len + '}'; });
    for (var drr = 0; drr < decoyRefSpans.length; drr++) {
        refParts.push('{' + decoyRefSpans[drr].start + ',' + decoyRefSpans[drr].len + '}');
    }
    L.push('local ' + R + '={' + refParts.join(',') + '}');
    L.push('local ' + NC + '={}');
    // decryptor + memo - ANTI-PYTHON: chaining + no table.concat literal
    var IVAR = nm('iv');
    L.push('local ' + IVAR + '=' + VP.iv);
    L.push('local ' + D + '=function(i)');
    L.push(' local c=' + C + '[i] if c then return c end');
    L.push(' local rr=' + R + '[i] if not rr then return nil end');
    L.push(' local st=rr[1] local ln=rr[2]');
    L.push(' local t="" local prev=' + IVAR);
    L.push(' for j=1,ln do');
    L.push('  local p=st+j');
    L.push('  local a=' + V + '[p] local b=(' + VP.a + '*p+' + VP.b + '+' + seedExpr + '*1.0*((p*p)%' + VP.m + '))%251+' + VP.c);
    L.push('  local kb=(b + prev*' + VP.d + ')%256');
    L.push('  local r,pw=0,1 local aa=a local bb=kb');
    L.push('  for _=1,8 do local x=aa%2 local y=bb%2 if x~=y then r=r+pw end aa=(aa-x)/2 bb=(bb-y)/2 pw=pw*2 end');
    L.push('  t=t..string.char(r) prev=r');
    L.push(' end');
    L.push(' ' + C + '[i]=t return t');
    L.push('end');
    // safe unpack resolver (5.1: unpack; 5.2+: table.unpack) - resolved
    // ONCE, not inline (and/or would evaluate both branches and crash)
    var UNP = nm('u');
    // ANTI-PYTHON: avoid "table.unpack or unpack" literal
    L.push('local ' + UNP + '');
    L.push('if table.unpack then ' + UNP + '=table.unpack else ' + UNP + '=unpack end');
    L.push('if not ' + UNP + ' then ' + UNP + '=unpack end');
    // pack helper: {[marker]=true, n=count,...} nil-safe. The MARKER is a
    // random per-build key - a plain user table passed as the LAST call
    // argument (e.g. f({n=5}) or any {..}) can NEVER be mistaken for a
    // packed multi-result table, because the flatten check tests for the
    // marker, not for a guessable .n field.
    var MARK = JSON.stringify('m' + hex(10));
    var UNPKM = nm('q');
    L.push('local ' + PK + '=function(...)');
    L.push(' local t={n=select("#",...)}');
    L.push(' for i=1,t.n do t[i]=select(i,...) end');
    L.push(' t[' + MARK + ']=true');
    L.push(' return t');
    L.push('end');
    L.push('local ' + UNPKM + '=function(t) return type(t)=="table" and t[' + MARK + ']==true end');
    // ---- CHUNK BLOB: length-prefixed records, stream-encrypted ----
    // record per chunk: [nParams (2 bytes LE), params as 2 bytes LE
    // each..., vararg (0/1), nCode (4 bytes LE), code words as 4 bytes
    // LITTLE-endian...]. nCode MUST be 4 bytes: big scripts produce
    // chunks with >255 code words (a 1-byte length was mangled by the
    // XOR %256 step and the decoder ran off the blob end -> "attempt
    // to perform arithmetic on a nil value" / "(mul) on nil and number").
    // PER-BUILD cipher: k(i) = (i*i*qA + i*qB + qC) % 251 + 4 where
    // qA/qB/qC are RANDOM per build - no static signature to peeler.
    var BP = { a: rndInt(3, 97), b: rndInt(3, 97), c: rndInt(30, 300) };
    var blob = [];
    var realChunkCount = build.chunks.length;
    for (var ci = 0; ci < realChunkCount; ci++) {
        var ch = build.chunks[ci];
        blob.push(ch.params.length % 256, Math.floor(ch.params.length / 256) % 256);
        for (var pi = 0; pi < ch.params.length; pi++) {
            blob.push(ch.params[pi] % 256, Math.floor(ch.params[pi] / 256) % 256);
        }
        blob.push(ch.vararg ? 1 : 0);
        var nCode = ch.code.length;
        blob.push(nCode % 256, Math.floor(nCode / 256) % 256, Math.floor(nCode / 65536) % 256, Math.floor(nCode / 16777216) % 256);
        for (var wi = 0; wi < nCode; wi++) {
            var w = ch.code[wi];
            blob.push(w % 256, Math.floor(w / 256) % 256, Math.floor(w / 65536) % 256, Math.floor(w / 16777216) % 256);
        }
    }
    // ---- DECOY CHUNKS: appended AFTER the real ones (real chunk ids
    // and the top-level boot index stay valid). Plausible-looking
    // opcode streams - a disassembler cannot tell which chunks are
    // real. They are NEVER executed (NEWF/boot only reference the
    // real ids).
    var decoyVals = Object.keys(OPCODES).map(function (k) { return OPCODES[k]; });
    var nDecoyChunks = rndInt(2, 5);
    for (var dc = 0; dc < nDecoyChunks; dc++) {
        var dnp = rndInt(0, 3);
        blob.push(dnp % 256, Math.floor(dnp / 256) % 256);
        for (var dpi = 0; dpi < dnp; dpi++) blob.push(rndInt(1, 80) % 256, 0);
        blob.push(Math.random() < 0.5 ? 1 : 0);
        var dnc = rndInt(6, 40);
        blob.push(dnc % 256, Math.floor(dnc / 256) % 256, Math.floor(dnc / 65536) % 256, Math.floor(dnc / 16777216) % 256);
        for (var dwi = 0; dwi < dnc; dwi++) {
            var dw = decoyVals[rnd(decoyVals.length)];
            blob.push(dw % 256, Math.floor(dw / 256) % 256, Math.floor(dw / 65536) % 256, Math.floor(dw / 16777216) % 256);
        }
    }
    // 1-BASED positions to match the Lua-side decrypt loop (i = 1..#src).
    // The cipher arithmetic MUST be laundered with %4294967296 before the
    // %251: on 32-bit-integer runtimes (and our fengari test harness)
    // i*i*qA wraps past 2^31 for big blobs and the wrapped value mod
    // 251 differs from the double-precise value. Laundering first makes
    // JS, Lua 5.1/5.3 and Luau all compute the IDENTICAL stream.
    for (var bi = 0; bi < blob.length; bi++) {
        var p1 = bi + 1;
        var k = (((p1 * p1 * BP.a + p1 * BP.b + BP.c) % 4294967296) % 251) + 4;
        blob[bi] = (blob[bi] ^ k) % 256;
    }
    var BL = nm('b');
    // emit the blob as a DECRYPTING constructor: encrypted bytes inline,
    // stream XOR applied per index as they are stored (5.1-safe math)
    L.push('local ' + BL + '={}');
    L.push('do');
    // ANTI-PYTHON: break "locala=src[i]localb=((i*i*" regex with junk local and [(i)]
    L.push(' local src={' + blob.join(',') + '}');
    L.push(' for i=1,#src do');
    L.push('  local a=src[(i)] local _junk' + hex(3) + '=0 local b=((i*i*' + BP.a + '+i*' + BP.b + '+' + BP.c + ')%4294967296)%251+4');
    L.push('  local r,pw=0,1');
    L.push('  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end');
    L.push('  ' + BL + '[i]=r');
    L.push(' end');
    L.push('end');
    // boot decode: walk records -> chunk table
    L.push('local ' + CH + '={}');
    L.push('do');
    L.push(' local rp=1');
    L.push(' while rp<=#' + BL + ' do');
    L.push('  local np=' + BL + '[rp] + ' + BL + '[rp+1]*256 rp=rp+2');
    L.push('  local ps={}');
    L.push('  for j=1,np do ps[j]=' + BL + '[rp] + ' + BL + '[rp+1]*256 rp=rp+2 end');
    L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
    L.push('  local nc=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216 rp=rp+4');
    L.push('  local cd={}');
    L.push('  for j=1,nc do');
    L.push('   cd[j]=' + BL + '[rp] + ' + BL + '[rp+1]*256 + ' + BL + '[rp+2]*65536 + ' + BL + '[rp+3]*16777216');
    L.push('   rp=rp+4');
    L.push('  end');
    L.push('  ' + CH + '[#' + CH + '+1]={c=cd,p=ps,v=va}');
    L.push(' end');
    L.push('end');
    // interpreter
    L.push('local ' + RUN);
    L.push(RUN + '=function(' + X + ',' + LK + ',...)');
    L.push(' local ' + CODE + '=' + CH + '[' + X + ']');
    L.push(' local ' + S + '={} local ' + SP + '=0');
    L.push(' local ' + SC + '={{}}');
    L.push(' local ' + VA + '=nil');
    L.push(' local ' + PC + '=1');
    L.push(' local ps=' + CODE + '.p');
    L.push(' for i=1,#ps do ' + SC + '[1][ps[i]]={select(i,...)} end');
    L.push(' if ' + CODE + '.v then ' + VA + '=' + PK + '(select(#ps+1,...)) end');
    var HAND = nm('h');
    L.push(' local ' + HAND + '={}');
    // shuffled handler order per build - ANTI-PYTHON: table dispatch, no "if OP==" chain
    var order = OP_NAMES.slice();
    for (var i = order.length - 1; i > 0; i--) {
        var j = rnd(i + 1); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var h = 0; h < order.length; h++) {
        var name = order[h];
        var oc = OPCODES[name];
        L.push(' ' + HAND + '[' + oc + ']=function()');
        switch (name) {
            case 'CONST':
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + D + '(' + CODE + '.c[' + PC + ']) ' + PC + '=' + PC + '+1');
                break;
            case 'NUMK': {
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local n=' + NC + '[ix]');
                L.push('   if not n then n=tonumber(' + D + '(ix)) ' + NC + '[ix]=n end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=n');
                break;
            }
            case 'NIL': L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=nil'); break;
            case 'TRUE': L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=true'); break;
            case 'FALSE': L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=false'); break;
            case 'GLOB':
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + E + '[' + D + '(' + CODE + '.c[' + PC + '])' + '] ' + PC + '=' + PC + '+1');
                break;
            case 'GSET':
                L.push('   ' + E + '[' + D + '(' + CODE + '.c[' + PC + '])' + ']=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                break;
            case 'LLOAD':
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
                break;
            case 'ULOAD':
                // scan upvalue links INNERMOST-first (links[1] is the
                // nearest enclosing scope; shadowing must resolve to it)
                L.push('   local id=' + CODE + '.c[' + PC + '] local b=nil ' + PC + '=' + PC + '+1');
                L.push('   for i=#' + LK + ',1,-1 do b=' + LK + '[i][id] if b then break end end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=b and b[1]');
                break;
            case 'USET':
                // scan upvalue links INNERMOST-first (see ULOAD)
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   local b=nil for i=#' + LK + ',1,-1 do b=' + LK + '[i][id] if b then break end end');
                L.push('   if b then b[1]=v end');
                break;
            case 'PUSHSC': L.push('   ' + SC + '[#' + SC + '+1]={}'); break;
            case 'POPSC': L.push('   ' + SC + '[#' + SC + ']=nil'); break;
            case 'TGET':
                L.push('   local k=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t[k]');
                break;
            case 'TSET':
                L.push('   local v=' + S + '[' + SP + '] local k=' + S + '[' + SP + '-1] local t=' + S + '[' + SP + '-2] t[k]=v ' + SP + '=' + SP + '-3');
                break;
            case 'NEWTAB': L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']={}'); break;
            case 'APD':
                // pop packed, append to the table under it, drop the dup'd
                // table ref (net -1: DUP pushed +1, this pops 2 pushes 0)
                L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1');
                L.push('   for i=1,p.n do t[#t+1]=p[i] end');
                break;
            case 'DUP': L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + S + '[' + SP + '-1]'); break;
            case 'POP': L.push('   ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1'); break;
            case 'SWAP': L.push('   ' + S + '[' + SP + '],' + S + '[' + SP + '-1]=' + S + '[' + SP + '-1],' + S + '[' + SP + ']'); break;
            case 'UNPK':
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + '][ix]');
                break;
            case 'UNPKR': {
                // POP the packed table on top, PUSH p[1]..p[n] (nil-filled)
                // net stack: -1 (packed) + n (values); never leaves the
                // packed table behind (it used to leak a slot per call)
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local pt=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1');
                L.push('   for j=1,n do ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=pt[j] end');
                break;
            }
            case 'UNPK1F': L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + '][1]'); break;
            case 'UNPK2F': L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + '][2]'); break;
            case 'UNPK3F': L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + '][3]'); break;
            case 'CALL': case 'CALLM': {
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
            }
            case 'RET':
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
                break;
                break;
            case 'VARGP':
                // push packed varargs (marker-tagged so the CALL flatten
                // check can identify it - never a plain user table)
                L.push('   if not ' + VA + ' then local t={n=0} t[' + MARK + ']=true ' + VA + '=t end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + VA);
                break;
            case 'NEWF':
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
                break;
            case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
            case 'POW': case 'CONCAT': case 'EQ': case 'NEQ':
            case 'LT': case 'LE': case 'GT': case 'GE': {
                var sym = {
                    ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: '%',
                    POW: '^', CONCAT: '..', EQ: '==', NEQ: '~=',
                    LT: '<', LE: '<=', GT: '>', GE: '>='
                }[name];
                L.push('   local b=' + S + '[' + SP + '] local a=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-1');
                L.push('   ' + S + '[' + SP + ']=a ' + sym + ' b');
                break;
            }
            case 'NOT': L.push('   ' + S + '[' + SP + ']=not ' + S + '[' + SP + ']'); break;
            case 'NEG': L.push('   ' + S + '[' + SP + ']=-' + S + '[' + SP + ']'); break;
            case 'LEN': L.push('   ' + S + '[' + SP + ']=#' + S + '[' + SP + ']'); break;
            case 'JMP':
                L.push('   ' + PC + '=' + CODE + '.c[' + PC + ']');
                break;
            case 'JIF':
                // pop the tested condition on BOTH paths (jump + fall-through)
                L.push('   local _v=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 if not _v then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 end');
                break;
            case 'JIT':
                // pop the tested condition on BOTH paths (jump + fall-through)
                L.push('   local _v=' + S + '[' + SP + '] ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 if _v then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 end');
                break;
            case 'JNIL':
                // peek test: pop the copy on BOTH paths; the packed table
                // stays under it - the loop-exit POP at the endLabel (also
                // reached by break) cleans it on both exits
                L.push('   local _n=(' + S + '[' + SP + ']==nil) ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 if _n then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 end');
                break;
            case 'ANDK':
                // falsy: keep value+jump; truthy: pop+continue (stack neutral)
                L.push('   if not ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            case 'ORK':
                // truthy: keep value+jump; falsy: pop+continue (stack neutral)
                L.push('   if ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            default:
                throw new Error('emit ' + name);
        }
        L.push(' end');
    }
    // ---- DEAD HANDLER BLOCKS: table dispatch decoys
    var nDead = rndInt(3, 8);
    for (var dh = 0; dh < nDead; dh++) {
        var deadVal = rndInt(60001, 65000);
        var bodyKind = rnd(4);
        L.push(' ' + HAND + '[' + deadVal + ']=function()');
        if (bodyKind === 0) {
            L.push('  local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t');
        } else if (bodyKind === 1) {
            L.push('  ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + D + '(' + CODE + '.c[' + PC + ']) ' + PC + '=' + PC + '+1');
        } else if (bodyKind === 2) {
            L.push('  local k=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t[k]');
        } else {
            L.push('  ' + PC + '=' + CODE + '.c[' + PC + ']');
        }
        L.push(' end');
    }
    L.push(' while true do');
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
    L.push(' end');
    L.push('end');
    // boot: run chunk #last (top-level), then return the runner for reuse
    L.push('do');
    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');
    L.push(' if not ok then error(err,0) end');
    L.push('end');
    return L.join('\n');
}

// ============================================================
// PUBLIC API
// ============================================================
// opts.seedFromGenv: name of a genv field holding the true vault seed
// at runtime (server-bound mode - the seed never ships in the file).
export function applyBytecodeVm(src, opts) {
    opts = opts || {};
    for (var d = 0; d < DENY.length; d++) {
        // word-boundary check so 'mygetfenv' doesn't trigger
        if (new RegExp('\\b' + DENY[d] + '\\b').test(src)) return null; // caller falls back
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
}
