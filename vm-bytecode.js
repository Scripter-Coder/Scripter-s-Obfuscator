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

// denylist: constructs whose semantics we cannot promise
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

    var seed = rndInt(29, 251);
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
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL, depth: lex.length });
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
                pushBlock();
                emit0(ctx, OPCODES.PUSHSC);
                ctx.loops.push({ endLabel: endL2, depth: lex.length });
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
        for (var i = 0; i < inits.length; i++) {
            if (i === lastI && expand) {
                if (isCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' });
                else emit0(ctx, OPCODES.VARGP);
                // unpack needed count: vars.length - fixedCount (>=1)
                var need = vars.length - fixedCount;
                if (need < 1) need = 1;
                // values unpacked in order: DUP+UNPK k for k=need..1
                for (var k = need; k >= 1; k--) {
                    emit0(ctx, OPCODES.DUP);
                    emit1(ctx, OPCODES.UNPK, k);
                }
            } else {
                ex(ctx, inits[i], { trunc: true });
                var tid = bindId('\x00t' + (hiddenCounter++));
                emit1(ctx, OPCODES.LNEW, tid);
                tmpIds.push(tid);
            }
        }
        // store in order: fixed temps first, then unpacked stack values
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
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        emit1(ctx, OPCODES.LLOAD, vs);
        emit1(ctx, OPCODES.LNEW, bindId(s.variable.name));
        ctx.loops.push({ endLabel: endL, depth: lex.length });
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
        pushBlock();
        emit0(ctx, OPCODES.PUSHSC);
        for (var v = 0; v < s.variables.length; v++) {
            emit0(ctx, OPCODES.DUP);
            emit1(ctx, OPCODES.UNPK, v + 1);
            emit1(ctx, OPCODES.LNEW, bindId(s.variables[v].name));
        }
        ctx.loops.push({ endLabel: endL, depth: lex.length });
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
// CHUNK BLOB: bytecode is NOT shipped as plaintext number tables; it
// is packed (length-prefixed records) and stream-encrypted, then
// decoded at boot into the chunk table.
function emitVM(build) {
    var seed = build.seed;
    var OPCODES = build.OPCODES;
    var seedGenvName = build.seedFromGenv || null;
    var seedInFile = !seedGenvName;
    // encrypt vault (same stream cipher as vm-pass)
    var vault = build.vaultPlain.slice();
    for (var pos = 0; pos < vault.length; pos++) {
        vault[pos] = (vault[pos] ^ ((seed * (pos + 1) * 31 + pos) % 251 + 5)) % 256;
    }

    function nm(p) { return p + hex(6); }
    var V = nm('v'), C = nm('c'), R = nm('r'), D = nm('d'), NC = nm('m');
    var RUN = nm('R'), CH = nm('K'), PK = nm('P'), E = nm('g');
    var S = nm('s'), SP = nm('t'), SC = nm('y'), PC = nm('i'), CODE = nm('w');
    var OP = nm('o'), LK = nm('L'), VA = nm('a');
    var X = nm('x'), Y = nm('z');

    var L = [];
    L.push('local ' + E + '=(getgenv and getgenv()) or _G');
    // seed: embedded (self-contained) or fetched at runtime from genv
    // (server-bound; the loader writes it after the worker key fetch)
    var SEED;
    if (seedInFile) {
        SEED = String(seed);
    } else {
        SEED = E + '[' + JSON.stringify(seedGenvName) + ']';
    }
    L.push('local ' + V + '={' + vault.join(',') + '}');
    L.push('local ' + C + '={}');
    L.push('local ' + R + '={' + build.refs.map(function (r) { return '{' + r.start + ',' + r.len + '}'; }).join(',') + '}');
    L.push('local ' + NC + '={}');
    // decryptor + memo (arithmetic xor - 5.1 safe)
    L.push('local ' + D + '=function(i)');
    L.push(' local c=' + C + '[i] if c then return c end');
    L.push(' local rr=' + R + '[i] if not rr then return nil end');
    L.push(' local st=rr[1] local ln=rr[2]');
    L.push(' local o={}');
    L.push(' for j=1,ln do');
    L.push('  local p=st+j');
    L.push('  local a=' + V + '[p] local b=(' + SEED + '*p*31+p-1)%251+5');
    L.push('  local r,pw=0,1');
    L.push('  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end');
    L.push('  o[j]=string.char(r)');
    L.push(' end');
    L.push(' local t=table.concat(o) ' + C + '[i]=t return t');
    L.push('end');
    // safe unpack resolver (5.1: unpack; 5.2+: table.unpack) - resolved
    // ONCE, not inline (and/or would evaluate both branches and crash)
    var UNP = nm('u');
    L.push('local ' + UNP + '=table.unpack or unpack');
    // pack helper: {n=count,...} nil-safe
    L.push('local ' + PK + '=function(...)');
    L.push(' local t={n=select("#",...)}');
    L.push(' for i=1,t.n do t[i]=select(i,...) end');
    L.push(' return t');
    L.push('end');
    // ---- CHUNK BLOB: length-prefixed records, stream-encrypted ----
    // record per chunk: [nParams, params as 2 bytes LE each...,
    // vararg(0/1), nCode, code words as 4 bytes LITTLE-endian...].
    // Cipher: k(i) = (i*i*7 + i*3 + 90) % 251 + 4 over the flat blob.
    var blob = [];
    for (var ci = 0; ci < build.chunks.length; ci++) {
        var ch = build.chunks[ci];
        blob.push(ch.params.length);
        for (var pi = 0; pi < ch.params.length; pi++) {
            blob.push(ch.params[pi] % 256, Math.floor(ch.params[pi] / 256) % 256);
        }
        blob.push(ch.vararg ? 1 : 0);
        blob.push(ch.code.length);
        for (var wi = 0; wi < ch.code.length; wi++) {
            var w = ch.code[wi];
            blob.push(w % 256, Math.floor(w / 256) % 256, Math.floor(w / 65536) % 256, Math.floor(w / 16777216) % 256);
        }
    }
    // 1-BASED positions to match the Lua-side decrypt loop (i = 1..#src)
    for (var bi = 0; bi < blob.length; bi++) {
        var p1 = bi + 1;
        blob[bi] = (blob[bi] ^ (((p1 * p1 * 7 + p1 * 3 + 90) % 251) + 4)) % 256;
    }
    var BL = nm('b');
    // emit the blob as a DECRYPTING constructor: encrypted bytes inline,
    // stream XOR applied per index as they are stored (5.1-safe math)
    L.push('local ' + BL + '={}');
    L.push('do');
    L.push(' local src={' + blob.join(',') + '}');
    L.push(' for i=1,#src do');
    L.push('  local a=src[i] local b=(i*i*7+i*3+90)%251+4');
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
    L.push('  local np=' + BL + '[rp] rp=rp+1');
    L.push('  local ps={}');
    L.push('  for j=1,np do ps[j]=' + BL + '[rp] + ' + BL + '[rp+1]*256 rp=rp+2 end');
    L.push('  local va=(' + BL + '[rp]==1) rp=rp+1');
    L.push('  local nc=' + BL + '[rp] rp=rp+1');
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
    L.push(' while true do');
    L.push('  local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');

    // shuffled handler order per build
    var order = OP_NAMES.slice();
    for (var i = order.length - 1; i > 0; i--) {
        var j = rnd(i + 1); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var h = 0; h < order.length; h++) {
        var name = order[h];
        var oc = OPCODES[name];
        L.push('  if ' + OP + '==' + oc + ' then');
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
                L.push('   local id=' + CODE + '.c[' + PC + '] local b=nil ' + PC + '=' + PC + '+1');
                L.push('   for i=1,#' + LK + ' do b=' + LK + '[i][id] if b then break end end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=b and b[1]');
                break;
            case 'USET':
                L.push('   local id=' + CODE + '.c[' + PC + '] local v=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
                L.push('   local b=nil for i=1,#' + LK + ' do b=' + LK + '[i][id] if b then break end end');
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
                L.push('   local p=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + ']');
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
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local pt=' + S + '[' + SP + ']');
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
                L.push('   if la>0 and type(a[la])=="table" and a[la].n~=nil then');
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
                // push packed varargs
                L.push('   if not ' + VA + ' then ' + VA + '={n=0} end');
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
                L.push('   if not ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            case 'JIT':
                L.push('   if ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            case 'JNIL':
                // peek test: pop the copy; if nil -> jump (packed stays
                // under it on the stack for the loop-exit cleanup)
                L.push('   if ' + S + '[' + SP + ']==nil then ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 ' + PC + '=' + CODE + '.c[' + PC + '] else ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1 end');
                break;
            case 'ANDK':
                // falsy: keep+jump; truthy: pop+continue
                L.push('   if not ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            case 'ORK':
                L.push('   if ' + S + '[' + SP + '] then ' + PC + '=' + CODE + '.c[' + PC + '] else ' + PC + '=' + PC + '+1 ' + S + '[' + SP + ']=nil ' + SP + '=' + SP + '-1 end');
                break;
            default:
                throw new Error('emit ' + name);
        }
        L.push('  end');
    }
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
        if (src.indexOf(DENY[d]) !== -1) return null; // caller falls back
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
