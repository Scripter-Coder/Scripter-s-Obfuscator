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

import { applyAstTransforms } from './src/ast/transform.js';
import { applyMBA } from './src/transform/mba.js';
import { buildConstantPool } from './src/vm/constants.js';
import { compressBytes } from './src/compression/compress.js';
import { runProductionPipeline } from './src/ir/production-pipeline.js';
import { attachEnhancedPerFuncMeta, inheritedMeta } from './src/ast/perfunc-enhanced.js';
import { getTarget } from './src/targets/registry.js';

var _bcLuaparse = null;
export function vmBCSetLuaparse(p) { _bcLuaparse = p; }
function resolveLuaparse() {
    if (_bcLuaparse) return _bcLuaparse;
    if (typeof window !== 'undefined' && window.luaparse) return window.luaparse;
    if (typeof globalThis !== 'undefined' && globalThis.luaparse) return globalThis.luaparse;
    if (typeof require === 'function') return require('luaparse');
    throw new Error('luaparse unavailable - call vmBCSetLuaparse() first');
}

var _bcRandomState = null;
function rnd(n) {
    if (_bcRandomState !== null) {
        _bcRandomState = (_bcRandomState * 1664525 + 1013904223) >>> 0;
        return _bcRandomState % n;
    }
    return Math.floor(Math.random() * n);
}
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
// ChestFarm + CFrame/Tween fix: ensure task.spawn/task.wait, CFrame/Vector3/TweenService/Enum
// globals are correctly GLOB+TGET and that CFrame/Vector3 arithmetic (ADD/SUB/MUL) uses
// metamethods via a+b / a-b / a*b (not CONCAT), and that shared upvalues (ChestFarmEnabled)
// survive across task.spawn boundaries via SC links
var DENY = ['getfenv', 'setfenv'];

// opcode names (values assigned randomly per build)
var OP_NAMES = [
    'CONST', 'NUMK', 'NIL', 'TRUE', 'FALSE',
    'GLOB', 'HGLOB', 'GSET', 'LLOAD', 'LNEW', 'LSET', 'ULOAD', 'USET',
    'PUSHSC', 'POPSC',
    'TGET', 'TSET', 'NEWTAB', 'APD',
    'DUP', 'POP', 'SWAP', 'UNPK', 'UNPKR', 'UNPK1F', 'UNPK2F', 'UNPK3F',
    'CALL', 'CALLM', 'PCALL', 'XPCALL', 'TAILCALL',
    'RET', 'RETP', 'CLOSE',
    'VARGP',
    'STACKNEW', 'STACKGET', 'STACKSET', 'STACKLEN',
    'NEWF',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'CONCAT',
    'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE', 'ADD_R', 'MUL_R',
    'PREP_TGET', 'LOOKUP_TGET', 'LOADK_ADD', 'LOADK_MUL',
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
function compile(src, opts) {
    opts = opts || {};
    var optsSeed = opts.seedOverride;
    var targetName = String(opts.target || 'lua51').toLowerCase();
    var targetMod = getTarget(targetName);
    var targetVersion = (targetMod.TARGET && targetMod.TARGET.parserOpts && targetMod.TARGET.parserOpts.luaVersion) || '5.1';
    // luaparse 0.3.1 has no 5.4 parser; use its 5.3 grammar for the
    // common 5.4 subset and explicitly reject 5.4-only syntax below.
    if (targetName === 'lua54') targetVersion = '5.3';
    var sourceForParse = (targetMod.prepareSource ? targetMod.prepareSource(src) : src);
    var ast;
    try { ast = resolveLuaparse().parse(sourceForParse, { luaVersion: targetVersion, locations: true }); }
    catch (e) { throw new Error('Target ' + targetName + ' parser rejected source: ' + ((e && e.message) || e)); }
    if (targetName === 'lua54' && /<close>|<const>/.test(src)) throw new Error('Lua 5.4 <close>/<const> backend syntax is not supported by the available luaparse 0.3.1 parser');
    var usesFFI = /\bffi\s*\./.test(src) || /require\s*\(\s*['"]ffi['"]\s*\)/.test(src);
    if (usesFFI && targetName !== 'luajit') throw new Error('FFI is only supported for the LuaJIT 2.1 target');
    var perFuncMeta = inheritedMeta(attachEnhancedPerFuncMeta(ast, src), ast);
    var profileName = String(opts.profile || 'BALANCED').toUpperCase();
    var compatibility = opts.compatibility === true;
    var staticEnv = opts.staticEnv === true;
    var debugProtect = opts.debugProtect === true || (opts.debugProtect !== false && profileName === 'SECURE');
    var hardCodeGlobals = opts.hardCodeGlobals === true && staticEnv;
    var seedForTransforms = opts.seedOverride != null ? (Number(opts.seedOverride) >>> 0) : 0;
    if (opts.transforms !== false && !compatibility && targetName === 'lua51') {
        applyAstTransforms(ast, { seed: seedForTransforms, profileName });
        if (opts.mba === true || (opts.mba == null && profileName === 'SECURE')) {
            applyMBA(ast, { seed: seedForTransforms, profileName, target: 'lua51' });
        }
    }
    if (!ast || !ast.body) throw new Error('no body');

    // Hard-coded globals are an explicit static-environment optimization.
    // Only globals that are never assigned in the source are eligible.
    var hardGlobalAllow = new Set(['print','tostring','tonumber','type','select','pairs','ipairs','next','pcall','xpcall','assert','error','math','string','table','coroutine']);
    var hardGlobalWrites = new Set();
    (function scanGlobalWrites(nodes) {
        for (var gi=0; gi<(nodes||[]).length; gi++) {
            var gn=nodes[gi]; if(!gn) continue;
            if (gn.type==='AssignmentStatement') for (var gv of (gn.variables||[])) if (gv && gv.type==='Identifier') hardGlobalWrites.add(gv.name);
            if (gn.type==='FunctionDeclaration' && gn.identifier && gn.identifier.type==='Identifier' && !gn.isLocal) hardGlobalWrites.add(gn.identifier.name);
            for (var gk in gn) { var gvv=gn[gk]; if(Array.isArray(gvv)) scanGlobalWrites(gvv); else if(gvv && typeof gvv==='object' && gvv.type) scanGlobalWrites([gvv]); }
        }
    })(ast.body);
    if (hardGlobalWrites.has('_ENV') || hardGlobalWrites.has('_G')) hardCodeGlobals=false;

    // Stackalloc is only specialized when its local never crosses a function
    // boundary. Track declaration depth and reject only references from a
    // deeper function. This keeps ordinary function-local stackalloc active
    // while conservatively disabling closure capture.
    var stackAllocCandidates = new Map();
    var stackAllocCaptured = new Set();
    (function scanStackAlloc(nodes, fnDepth) {
        for (var si=0; si<(nodes||[]).length; si++) {
            var sn=nodes[si]; if(!sn) continue;
            if (sn.type==='LocalStatement') {
                for (var svi=0; svi<(sn.variables||[]).length; svi++) {
                    var sv=sn.variables[svi], siv=sn.init && sn.init[svi];
                    if (sv && sv.name && stackAllocInfo(siv) && !stackAllocCandidates.has(sv.name)) stackAllocCandidates.set(sv.name, fnDepth);
                }
            }
            if (sn.type==='Identifier') {
                var sd=stackAllocCandidates.get(sn.name);
                if (sd != null && fnDepth > sd) stackAllocCaptured.add(sn.name);
            }
            if (sn.type==='FunctionDeclaration' || sn.type==='FunctionExpression') {
                scanStackAlloc(sn.body, fnDepth+1);
                continue;
            }
            for (var sk in sn) {
                var svv=sn[sk];
                if (Array.isArray(svv)) scanStackAlloc(svv, fnDepth);
                else if (svv && typeof svv==='object' && svv.type) scanStackAlloc([svv], fnDepth);
            }
        }
    })(ast.body, 0);

    var seed = optsSeed != null ? (Number(optsSeed) >>> 0) : Math.floor(Math.random() * 4294967296); // 32-bit build seed
    var vaultPlain = [];
    var refs = [];
    var chunks = [];
    var nameIds = Object.create(null);
    var nextId = 1;
    var hiddenCounter = 0;
    var hiddenIds = new Set();
    var funcMetaStack = [];

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
    var OPCODE_NAMES = Object.create(null);
    for (var _on in OPCODES) OPCODE_NAMES[OPCODES[_on]] = _on;

    function addConstS(str) {
        var b = strToBytes(String(str));
        var start = vaultPlain.length;
        for (var i = 0; i < b.length; i++) vaultPlain.push(b[i]);
        refs.push({ start: start, len: b.length });
        return refs.length; // 1-based
    }

    // lexical scopes: stack of {ids:Set, fn:boolean}
    var lex = [];
    function pushBlock() { lex.push({ ids: new Set(), fn: false, stackIds: new Set() }); }
    function popBlock() { lex.pop(); }
    function pushFn() { lex.push({ ids: new Set(), fn: true, stackIds: new Set() }); }
    function popFn() { lex.pop(); }
    function currentFuncMeta() { return funcMetaStack.length ? funcMetaStack[funcMetaStack.length - 1] : null; }
    function bindId(name) {
        if (!Object.prototype.hasOwnProperty.call(nameIds, name)) nameIds[name] = nextId++;
        var id = nameIds[name];
        lex[lex.length - 1].ids.add(id);
        if (String(name).charCodeAt(0) === 0) hiddenIds.add(id);
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
    function isStackLocalId(id) {
        for (var i = lex.length - 1; i >= 0; i--) {
            var sc = lex[i];
            if (sc.stackIds && sc.stackIds.has(id)) return true;
            if (sc.fn) break;
        }
        return false;
    }
    function markStackLocal(id) {
        for (var i = lex.length - 1; i >= 0; i--) {
            if (lex[i].fn) { lex[i].stackIds.add(id); return; }
        }
    }
    function isStackAllocCallNode(n) {
        return !!(n && n.type === 'CallExpression' && n.base && n.base.type === 'Identifier' && n.base.name === 'VM_STACKALLOC');
    }
    function stackAllocInfo(n) {
        if (!isStackAllocCallNode(n)) return null;
        var a = n.arguments || [];
        if (!a.length || a[0].type !== 'NumericLiteral') return null;
        var size = Number(a[0].value);
        if (!Number.isInteger(size) || size < 1 || size > 128) return null;
        var zeroBased = !!(a[1] && a[1].type === 'BooleanLiteral' && a[1].value === true);
        if (zeroBased) return null; // current production ABI is Lua-style 1-based only
        return { size, zeroBased: false };
    }
    function isStackAllocIdentifier(n) {
        if (!n || n.type !== 'Identifier') return false;
        var r = resolve(n.name);
        return r.kind === 'local' && isStackLocalId(r.id);
    }

    function newChunkCtx() {
        return { code: [], pc: 1, labels: [], labelPos: Object.create(null), loops: [], namedLabels: Object.create(null), pendingGotos: [] };
    }
    // Front-end IR: AST lowering emits target-independent instruction objects.
    // Numeric opcodes are introduced only by the production IR lowering pass.
    function emit1(ctx, op, a) { ctx.code.push({ op: OPCODE_NAMES[op] || op, a: a }); ctx.pc += 2; }
    function emit0(ctx, op) { ctx.code.push({ op: OPCODE_NAMES[op] || op }); ctx.pc += 1; }
    function label(ctx) { var id = ctx.labels.length; ctx.labels.push([]); return id; }
    function mark(ctx, lbl) { ctx.labelPos[lbl] = ctx.pc; }
    function jref(ctx, op, lbl) {
        var at = ctx.code.length;
        ctx.code.push({ op: OPCODE_NAMES[op] || op, a: 0 });
        ctx.pc += 2;
        ctx.labels[lbl].push(at);
    }
    function namedLabel(ctx, name) {
        if (ctx.namedLabels[name] != null) return ctx.namedLabels[name];
        var lbl = label(ctx); ctx.namedLabels[name] = lbl; return lbl;
    }
    function patchNamedGotos(ctx) {
        for (var gi=0; gi<ctx.pendingGotos.length; gi++) {
            var g=ctx.pendingGotos[gi];
            var lbl=ctx.namedLabels[g.name];
            if (lbl == null) throw new Error('unknown label ' + g.name);
            ctx.labels[lbl].push(g.at);
        }
    }
    function patchLabels(ctx) {
        for (var lbl = 0; lbl < ctx.labels.length; lbl++) {
            var pos = ctx.labelPos[lbl];
            if (pos === undefined) throw new Error('unmarked label');
            var lst = ctx.labels[lbl];
            for (var i = 0; i < lst.length; i++) ctx.code[lst[i]].a = pos;
        }
    }
    function applySafeCfgRewriting(ctx) {
        // Absolute-PC ABI makes arbitrary block reordering unsafe. A real,
        // semantics-preserving CFG rewrite we can prove here is jump
        // trampoline splitting. Accept the front-end IR object form used by
        // the production pipeline and the legacy numeric form.
        if (profileName === 'FAST' || compatibility || opts.cfgRewrite === false) return 0;
        var jmp = OPCODES.JMP, added = 0;
        if (ctx.code.length === 0 || typeof ctx.code[0] === 'object') {
            var originalLen = ctx.code.length, trampolines = [];
            for (var oi=0; oi<originalLen; oi++) {
                var ins=ctx.code[oi];
                if (ins && ins.op === 'JMP' && ins.a != null) trampolines.push({at:oi,target:ins.a});
            }
            for (var ti=0; ti<trampolines.length; ti++) {
                var tr=trampolines[ti], newPc=1;
                for (var wi=0; wi<ctx.code.length; wi++) newPc += ctx.code[wi].a != null ? 2 : 1;
                ctx.code[tr.at].a = newPc;
                ctx.code.push({op:'JMP',a:tr.target});
                added++;
            }
            ctx.pc = 1;
            for (var pi=0; pi<ctx.code.length; pi++) ctx.pc += ctx.code[pi].a != null ? 2 : 1;
            return added;
        }
        var originalLen2 = ctx.code.length, trampolines2 = [];
        for (var i=0; i<originalLen2;) {
            var op=ctx.code[i];
            if (op===jmp && i+1<originalLen2) trampolines2.push({at:i+1,target:ctx.code[i+1]});
            i += (op===jmp || op===OPCODES.JIF || op===OPCODES.JIT || op===OPCODES.JNIL || op===OPCODES.ANDK || op===OPCODES.ORK || op===OPCODES.LLOAD || op===OPCODES.LNEW || op===OPCODES.LSET || op===OPCODES.ULOAD || op===OPCODES.USET || op===OPCODES.GLOB || op===OPCODES.HGLOB || op===OPCODES.GSET || op===OPCODES.CONST || op===OPCODES.NUMK || op===OPCODES.UNPK || op===OPCODES.UNPKR || op===OPCODES.CALL || op===OPCODES.CALLM || op===OPCODES.PCALL || op===OPCODES.XPCALL || op===OPCODES.TAILCALL || op===OPCODES.RET || op===OPCODES.RETP || op===OPCODES.NEWF || op===OPCODES.STACKNEW || op===OPCODES.STACKGET || op===OPCODES.STACKSET ? 2 : 1);
        }
        for (var ni=0; ni<trampolines2.length; ni++) { var nr=trampolines2[ni], npc=ctx.code.length+1; ctx.code[nr.at]=npc; ctx.code.push(jmp,nr.target); added++; }
        return added;
    }

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
                else if (hardCodeGlobals && hardGlobalAllow.has(r.name) && !hardGlobalWrites.has(r.name)) emit1(ctx, OPCODES.HGLOB, addConstS(r.name));
                else emit1(ctx, OPCODES.GLOB, addConstS(r.name));
                return;
            }
            case 'MemberExpression':
                if (isStackAllocIdentifier(n.base) && n.identifier && n.identifier.name === 'length') {
                    ex(ctx, n.base);
                    emit0(ctx, OPCODES.STACKLEN);
                } else {
                    ex(ctx, n.base);
                    emit1(ctx, OPCODES.CONST, addConstS(n.identifier.name));
                    emit0(ctx, OPCODES.TGET);
                }
                return;
            case 'IndexExpression':
                if (isStackAllocIdentifier(n.base)) {
                    ex(ctx, n.base);
                    ex(ctx, n.index, { trunc: true });
                    emit1(ctx, OPCODES.STACKGET, 0);
                } else {
                    ex(ctx, n.base);
                    ex(ctx, n.index);
                    emit0(ctx, OPCODES.TGET);
                }
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
                else if (n.operator === '#') emit0(ctx, isStackAllocIdentifier(n.argument) ? OPCODES.STACKLEN : OPCODES.LEN);
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
        if (base.type === 'Identifier' && (base.name === 'pcall' || base.name === 'xpcall')) {
            emit1(ctx, base.name === 'pcall' ? OPCODES.PCALL : OPCODES.XPCALL, argn2.fixed);
        } else {
            emit1(ctx, wantMulti ? OPCODES.CALLM : OPCODES.CALL, argn2.fixed);
        }
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
                    var sai = stackAllocInfo(ini);
                    if (sai && !stackAllocCaptured.has(vars[0].name) && (!currentFuncMeta() || currentFuncMeta().STACKALLOC !== false)) {
                        var sid = bindId(vars[0].name);
                        emit1(ctx, OPCODES.STACKNEW, sai.size);
                        emit1(ctx, OPCODES.LNEW, sid);
                        markStackLocal(sid);
                    } else if (isStackAllocCallNode(ini)) {
                        // Safe fallback for captured/unsupported stackalloc: a
                        // normal Lua table preserves semantics rather than
                        // emitting a numeric handle that a closure cannot own.
                        emit0(ctx, OPCODES.NEWTAB);
                        var fbSize = Number(ini.arguments[0].value);
                        var fbZero = !!(ini.arguments[1] && ini.arguments[1].type==='BooleanLiteral' && ini.arguments[1].value===true);
                        if (Number.isInteger(fbSize) && fbSize > 0 && fbSize <= 256) {
                            for (var fi=0; fi<fbSize; fi++) {
                                emit0(ctx, OPCODES.DUP);
                                emit1(ctx, OPCODES.NUMK, addConstS(String(fbZero ? fi : fi + 1)));
                                emit0(ctx, OPCODES.NIL);
                                emit0(ctx, OPCODES.TSET);
                            }
                        }
                        emit1(ctx, OPCODES.LNEW, bindId(vars[0].name));
                    } else {
                        ex(ctx, ini, { trunc: true });
                        emit1(ctx, OPCODES.LNEW, bindId(vars[0].name));
                    }
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
                emit0(ctx, OPCODES.CLOSE);
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
                emit0(ctx, OPCODES.CLOSE);
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
                emit0(ctx, OPCODES.CLOSE);
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
                for (var p = 0; p < pops; p++) emit0(ctx, OPCODES.CLOSE);
                emit0(ctx, OPCODES.POPSC);
                jref(ctx, OPCODES.JMP, loop.endLabel);
                return;
            }
            case 'GotoStatement': {
                if (targetName === 'lua51' || targetName === 'luajit') throw new Error('goto unsupported for target ' + targetName);
                var gl = s.label && (s.label.name || s.label);
                if (!gl) throw new Error('goto missing label');
                var gat = ctx.code.length;
                ctx.code.push({ op: 'JMP', a: 0 });
                ctx.pc += 2;
                ctx.pendingGotos.push({ name: gl, at: gat });
                return;
            }
            case 'LabelStatement': {
                var ln = s.label && (s.label.name || s.label);
                if (!ln) throw new Error('label missing name');
                mark(ctx, namedLabel(ctx, ln));
                return;
            }
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
            if (isStackAllocIdentifier(lhs.base)) {
                var tmpStack = bindId('\x00t' + (hiddenCounter++));
                emit1(ctx, OPCODES.LNEW, tmpStack);
                ex(ctx, lhs.base);
                ex(ctx, lhs.index, { trunc: true });
                emit1(ctx, OPCODES.LLOAD, tmpStack);
                emit1(ctx, OPCODES.STACKSET, 0);
                return;
            }
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
                if (isStackAllocIdentifier(lhs.base)) {
                    ex(ctx, lhs.base);
                    ex(ctx, lhs.index, { trunc: true });
                    ex(ctx, rhs, { trunc: true });
                    emit1(ctx, OPCODES.STACKSET, 0);
                } else {
                    ex(ctx, lhs.base);
                    ex(ctx, lhs.index, { trunc: true });
                    ex(ctx, rhs, { trunc: true });
                    emit0(ctx, OPCODES.TSET);
                }
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

    function compileTailCall(ctx, n) {
        var base = n.base;
        var args = n.arguments || [];
        if (base.type === 'MemberExpression' && base.indexer === ':') {
            ex(ctx, base.base);
            emit0(ctx, OPCODES.DUP);
            emit1(ctx, OPCODES.CONST, addConstS(base.identifier.name));
            emit0(ctx, OPCODES.TGET);
            emit0(ctx, OPCODES.SWAP);
            var argn = compileArgs(ctx, args, true);
            emit1(ctx, OPCODES.TAILCALL, argn.fixed + 1);
            return;
        }
        ex(ctx, base);
        var argn = compileArgs(ctx, args, true);
        emit1(ctx, OPCODES.TAILCALL, argn.fixed);
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
                // genuine tailcall: the VM reuses the current frame instead
                // of pushing a CALL frame followed by RETURN.
                compileTailCall(ctx, lastE);
            } else {
                emit0(ctx, OPCODES.VARGP);
                emit1(ctx, OPCODES.RETP, 0);
            }
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
        emit0(ctx, OPCODES.CLOSE);
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
        emit0(ctx, OPCODES.CLOSE);
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
        funcMetaStack.push(perFuncMeta.get(fnNode) || null);
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
        funcMetaStack.pop();
        patchNamedGotos(ctx);
        patchLabels(ctx);
        applySafeCfgRewriting(ctx);
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
    patchNamedGotos(topCtx);
    patchLabels(topCtx);
    applySafeCfgRewriting(topCtx);
    chunks.push({ code: topCtx.code, params: [], vararg: false });

    // Production compiler pipeline: the legacy AST emitter produces the initial
    // scheduler-compatible instruction stream, which is immediately promoted to
    // target-independent IR, CFG, optimizer/allocation analysis, concrete VM
    // transforms, and lowered back to the same scheduler bytecode ABI.
    var pipeline = runProductionPipeline({ chunks, OPCODES, seed, profileName, hiddenIds, refs, vaultPlain, disableFolding: opts.unroll === true });

    var constPool = buildConstantPool({ vaultPlain: vaultPlain, refs: refs, seed: seed, profileName: profileName });
    return { chunks: chunks, vaultPlain: vaultPlain, refs: refs, seed: seed, OPCODES: OPCODES, constPool: constPool, profileName: profileName, compatibility: compatibility, staticEnv: staticEnv, debugProtect: debugProtect, hardCodeGlobals: hardCodeGlobals, hardGlobalWrites: Array.from(hardGlobalWrites), target: targetName, targetVersion: targetMod.TARGET.version, cfgRewrite: opts.cfgRewrite !== false, pipeline: pipeline.pipeline };
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
    var profileName = build.profileName || 'BALANCED';
    var OPCODES = build.OPCODES;
    var seedGenvName = build.seedFromGenv || null;
    var seedInFile = !seedGenvName;

    function nm(p) { return p + hex(6); }
    var V = nm('v'), C = nm('c'), R = nm('r'), D = nm('d'), NC = nm('m');
    var RUN = nm('R'), CH = nm('K'), PK = nm('P'), E = nm('g');
    var S = nm('s'), SP = nm('t'), SC = nm('y'), PC = nm('i'), CODE = nm('w');
    var ENV = nm('e');
    var OP = nm('o'), LK = nm('L'), VA = nm('a');
    // Scheduler state. REG is the only physical register storage; S is a
    // frame-relative accessor into REG[BASE+slot]. FRAMES owns live VM calls.
    var REG = nm('rg'), FRAMES = nm('fr'), FP = nm('fp'), BASE = nm('ba'), TOP = nm('to');
    var OWNER = nm('ow'), CUR = nm('cu'), NEXTBASE = nm('nb'), VMFN = nm('vf'), VMFUN = nm('vfm'), INVOKE = nm('ivk'), SCHED = nm('sch'), PUSHF = nm('pf'), POPF = nm('xf');
    var ROOTTHREAD='__vms_root_thread', ROOTSTATE='__vms_root_state', COSTATES='__vms_cor_states', ACTIVE='__vms_active_state', SAVEVM='__vms_save_state', LOADVM='__vms_load_state';
    var SAVEF = nm('sf'), LOADF = nm('lf'), FINISH = nm('rt'), DONE = nm('dn'), RESULT = nm('rs');
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
    var decoyRange = profileName === 'FAST' ? [2,4] : (profileName === 'SECURE' ? [15,20] : [8,15]);
    var decoyRuns = rndInt(decoyRange[0], decoyRange[1]);
    var decoyRefSpans = []; // {start,len} into the FULL vault (1-based refs semantics: refs use start as 0-based offset; D reads V[p] with p=st+j, i.e. st is 0-based)
    for (var dr = 0; dr < decoyRuns; dr++) {
        var dlen = rndInt(20, 60); // ULTRA bloat
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
    if (build.target === 'luau') { L.push('if getfenv then local _le=getfenv(0) if _le then ' + E + '=_le end end'); }
    var HG = nm('hg');
    L.push('local ' + HG + '={}');
    L.push('if getgenv then ' + E + '=getgenv() end');
    L.push('if not ' + E + ' then ' + E + '=_G end');
    if (build.staticEnv || build.debugProtect || build.target === 'luau') {
        L.push('local ' + ENV + '={}');
        L.push('for _k,_v in pairs(' + E + ') do ' + ENV + '[_k]=_v end');
        if (build.target === 'luau') {
            L.push('setmetatable(' + ENV + ',{__index=' + E + '})');
        } else {
            L.push('setmetatable(' + ENV + ',{__index=' + E + ',__newindex=' + E + '})');
        }
        if (build.debugProtect) {
            L.push('do local _od=' + E + '["debug"] local _nd={} if type(_od)=="table" then for _k,_v in pairs(_od) do _nd[_k]=_v end end');
            L.push('local function _blk(_n) return function() error("debug "..tostring(_n).." protected",0) end end');
            L.push('for _,_n in ipairs({"getinfo","getlocal","getupvalue","setupvalue","gethook","sethook","traceback","getfenv","setfenv"}) do _nd[_n]=_blk(_n) end');
            L.push(ENV + '["debug"]=_nd end');
        }
    }
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
    var decoyChunkRange = profileName === 'FAST' ? [2,6] : (profileName === 'SECURE' ? [15,20] : [8,15]);
    var nDecoyChunks = rndInt(decoyChunkRange[0], decoyChunkRange[1]);
    for (var dc = 0; dc < nDecoyChunks; dc++) {
        var dnp = rndInt(0, 3);
        blob.push(dnp % 256, Math.floor(dnp / 256) % 256);
        for (var dpi = 0; dpi < dnp; dpi++) blob.push(rndInt(1, 80) % 256, 0);
        blob.push(rnd(2) === 0 ? 1 : 0);
        var dnc = rndInt(30, 80); // ULTRA bloat
        blob.push(dnc % 256, Math.floor(dnc / 256) % 256, Math.floor(dnc / 65536) % 256, Math.floor(dnc / 16777216) % 256);
        for (var dwi = 0; dwi < dnc; dwi++) {
            var dw = decoyVals[rnd(decoyVals.length)];
            blob.push(dw % 256, Math.floor(dw / 256) % 256, Math.floor(dw / 65536) % 256, Math.floor(dw / 16777216) % 256);
        }
    }
    // Production compression is enabled by the SECURE profile. Compress the
    // plaintext byte stream before encryption; the generated loader reverses
    // this after decrypting it.
    var compressedBlob = profileName === 'SECURE';
    if (compressedBlob) blob = compressBytes(blob);

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
    if (compressedBlob) {
        L.push('do local _out={} local _q=1 local _i=1 while _i<=#' + BL + ' do local _b=' + BL + '[_i] if _b==255 then if _i+2>#' + BL + ' then error(\"VM_COMPRESS\",0) end local _v=' + BL + '[_i+1] local _n=' + BL + '[_i+2] if _n<1 then error(\"VM_COMPRESS\",0) end for _j=1,_n do _out[_q]=_v _q=_q+1 end _i=_i+3 else _out[_q]=_b _q=_q+1 _i=_i+1 end end ' + BL + '=_out end');
    }
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
    // interpreter / scheduler
    // REG is VM-wide. Each frame receives a disjoint register window and S
    // only provides the existing stack-style bytecode view into that window.
    L.push('local ' + OWNER + '={}');
    L.push('local ' + REG + '={} local ' + FRAMES + '={} local ' + FP + '=0 local ' + BASE + '=0 local ' + TOP + '=0 local ' + NEXTBASE + '=0');
    L.push('local ' + CUR + '=nil local ' + DONE + '=false local ' + RESULT + '={} local ' + VMFUN + '={} local ' + SCHED + ' local ' + INVOKE);
    L.push('local '+ROOTTHREAD+'=coroutine.running() local '+ROOTSTATE+' local '+COSTATES+'={} local '+ACTIVE+'=nil');
    L.push('local '+SAVEVM+'=function(st) st.rg='+REG+' st.fr='+FRAMES+' st.fp='+FP+' st.ba='+BASE+' st.to='+TOP+' st.cu='+CUR+' st.co='+CODE+' st.pc='+PC+' st.sp='+SP+' st.sc='+SC+' st.lk='+LK+' st.va='+VA+' st.nb='+NEXTBASE+' st.dn='+DONE+' st.rs='+RESULT+' end');
    L.push('local '+LOADVM+'=function(st) '+REG+'=st.rg or {} '+FRAMES+'=st.fr or {} '+FP+'=st.fp or 0 '+BASE+'=st.ba or 0 '+TOP+'=st.to or 0 '+CUR+'=st.cu '+CODE+'=st.co '+PC+'=st.pc or 1 '+SP+'=st.sp or 0 '+SC+'=st.sc or {{}} '+LK+'=st.lk or {} '+VA+'=st.va '+NEXTBASE+'=st.nb or 0 '+DONE+'=st.dn or false '+RESULT+'=st.rs or {} if '+FP+'>0 then local q='+FRAMES+'['+FP+'] if not q or q.owner~='+OWNER+' then error("VM_STATE_FRAME_OWNER",0) end if '+BASE+'~=q.base or '+TOP+'~=q.top then error("VM_STATE_FRAME_BOUNDS",0) end end end');

    L.push('local ' + S + '=setmetatable({}, {__index=function(_,k) return ' + REG + '[' + BASE + '+k] end, __newindex=function(_,k,v) ' + REG + '[' + BASE + '+k]=v end})');
    L.push('local ' + VMFN + '=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ' + INVOKE + '(d,...) end ' + VMFUN + '[f]=d return f end');
    L.push('local ' + PUSHF + ' local ' + POPF + ' local ' + SAVEF + ' local ' + LOADF + ' local ' + FINISH);
    L.push('local ' + RUN);
    L.push(RUN + '=function(' + X + ',' + LK + ',...)');
    L.push(' ' + FRAMES + '={} ' + FP + '=0 ' + NEXTBASE + '=0 ' + DONE + '=false ' + RESULT + '={}');
    L.push(' '+ROOTSTATE+'={}')
    L.push(' ' + PUSHF + '=function(ci,links,args,retDest,nRet,caller,meta)');
    L.push('  local code=' + CH + '[ci] if not code then error("VM_BAD_CHUNK",0) end');
    L.push('  local f={chunk=ci,pc=1,base=' + NEXTBASE + ',top=' + NEXTBASE + '+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=' + NEXTBASE + '+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=' + OWNER + '}');
    L.push('  ' + NEXTBASE + '=' + NEXTBASE + '+512');
    L.push('  ' + FP + '=' + FP + '+1 ' + FRAMES + '[' + FP + ']=f');
    L.push('  local ps=code.p local av=args or {}');
    L.push('  for i=1,#ps do f.sc[1][ps[i]]={av[i]} end');
    L.push('  if code.v then local t={n=0} t[' + MARK + ']=true for i=#ps+1,#av do t.n=t.n+1 t[t.n]=av[i] end f.va=t end');
    L.push(' end');
    L.push(' ' + SAVEF + '=function(f) if not f then return end f.pc=' + PC + ' f.base=' + BASE + ' f.top=' + TOP + ' f.sp=' + SP + ' f.sc=' + SC + ' f.lk=' + LK + ' f.va=' + VA + ' f.sanext=' + CUR + '.sanext f.sasizes=' + CUR + '.sasizes end');
    L.push(' ' + LOADF + '=function(f) ' + CUR + '=f ' + CODE + '=' + CH + '[f.chunk] ' + PC + '=f.pc ' + BASE + '=f.base ' + TOP + '=f.top ' + SP + '=f.sp ' + SC + '=f.sc ' + LK + '=f.lk ' + VA + '=f.va end');
    L.push(' ' + FINISH + '=function(n,packed)');
    L.push('  local f=' + FRAMES + '[' + FP + '] local vals={}');
    L.push('  if packed then local p=' + S + '[' + SP + '] local pn=(p and p.n) or 0 for i=1,n do vals[i]=' + S + '[' + SP + '-1-n+i] end for i=1,pn do vals[n+i]=p[i] end else for i=1,n do vals[i]=' + S + '[' + SP + '-n+i] end end');
    L.push('  if f.prot then');
    L.push('   local meta=f.prot local caller=meta.caller');
    L.push('   ' + SAVEF + '(f)');
    L.push('   for i=f.base,f.top do ' + REG + '[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do ' + REG + '[i]=nil end end');
    L.push('   ' + FRAMES + '[' + FP + ']=nil ' + FP + '=' + FP + '-1');
    L.push('   ' + LOADF + '(caller)');
    L.push('   local q={n=0} q[' + MARK + ']=true');
    L.push('   if meta.kind=="xhandler" then q.n=2 q[1]=false q[2]=vals[1] else q.n=1 q[1]=true for i=1,#vals do q.n=q.n+1 q[q.n]=vals[i] end end');
    L.push('   ' + SP + '=meta.dest ' + S + '[' + SP + ']=q');
    L.push('   return');
    L.push('  end');
    L.push('  ' + SAVEF + '(f)');
    L.push('  ' + REG + '[f.base]=' + REG + '[f.base]');
    L.push('  for i=f.base,f.top do ' + REG + '[i]=nil end if f.sanext and f.sanext>f.base+256 then for i=f.base+256,f.sanext-1 do ' + REG + '[i]=nil end end');
    L.push('  ' + FRAMES + '[' + FP + ']=nil');
    L.push('  local caller=f.caller');
    L.push('  if caller then caller.lastResult=vals end');
    L.push('  if not caller then ' + RESULT + '=vals ' + DONE + '=true return end');
    L.push('  ' + FP + '=' + FP + '-1 local cf=' + FRAMES + '[' + FP + ']');
    L.push('  if not cf then error("VM_FRAME_UNDERFLOW",0) end');
    L.push('  ' + LOADF + '(cf)');
    L.push('  local d=f.retDest or (' + SP + '+1)');
    L.push('  if f.nRet==0 then return end');
    L.push('  ' + SP + '=d-1');
    L.push('  if f.nRet==1 then ' + SP + '=d ' + S + '[' + SP + ']=vals[1] else local q={n=#vals} q[' + MARK + ']=true for i=1,#vals do q[i]=vals[i] end ' + SP + '=d ' + S + '[' + SP + ']=q end');
    L.push(' end');
    L.push(' ' + PUSHF + '(' + X + ',' + LK + ',{...},nil,0,nil)');
    L.push('  local f=' + FRAMES + '[' + FP + ']');
    L.push('  if not f then error("VM_FRAME_MISSING",0) end');
    L.push('  ' + LOADF + '(f)');
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
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + (build.target === 'luau' || build.staticEnv || build.debugProtect ? ENV : E) + '[' + D + '(' + CODE + '.c[' + PC + '])' + '] ' + PC + '=' + PC + '+1');
                break;
            case 'HGLOB':
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local k=' + D + '(ix) local v=' + HG + '[k] if v==nil then v=' + (build.target === 'luau' || build.staticEnv || build.debugProtect ? ENV : E) + '[k] ' + HG + '[k]=v end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=v');
                break;
            case 'GSET':
                L.push('   ' + (build.target === 'luau' || build.staticEnv || build.debugProtect ? ENV : E) + '[' + D + '(' + CODE + '.c[' + PC + '])' + ']=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
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
            case 'CLOSE': L.push('   -- captured locals are heap cells; CLOSE marks the lexical boundary before POPSC'); break;
            case 'POPSC': L.push('   ' + SC + '[#' + SC + ']=nil'); break;
            case 'TGET':
            case 'LOOKUP_TGET':
                L.push('   local k=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 local t=' + S + '[' + SP + '] ' + S + '[' + SP + ']=t[k]');
                break;
            case 'PREP_TGET':
                // Split form: preparation is intentionally stack-neutral; the
                // following LOOKUP_TGET performs the original TGET atomically.
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
            case 'PCALL': case 'XPCALL': {
                var xp = name === 'XPCALL';
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
                L.push('   local la=n if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end');
                L.push('   local f=a[1]');
                L.push('   local vd=' + VMFUN + '[f]');
                L.push('   if vd then');
                L.push('    local caller=' + CUR + ' local dest=' + SP + '+1 ' + SAVEF + '(caller)');
                L.push('    local meta={kind=' + (xp ? '"xpcall"' : '"pcall"') + ',caller=caller,dest=dest,handler=' + (xp ? 'a[2]' : 'nil') + '}');
                L.push('    local args={} local first=' + (xp ? '3' : '1') + ' for j=first,la do args[#args+1]=a[j] end');
                L.push('    ' + PUSHF + '(vd.chunk,vd.links,args,dest,-2,caller,meta)');
                L.push('    ' + LOADF + '(' + FRAMES + '[' + FP + '])');
                L.push('   else');
                L.push('    local ok,rr');
                L.push('    if ' + xp + ' then ok,rr=xpcall(f,a[2],' + UNP + '(a,3,la)) else ok,rr=pcall(f,' + UNP + '(a,1,la)) end');
                L.push('    if ' + xp + ' and not ok then rr=a[2](rr) end');
                L.push('    local q={n=2} q[' + MARK + ']=true q[1]=ok q[2]=rr ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=q');
                L.push('   end');
                break;
            }
            case 'CALL': case 'CALLM': {
                var multi = name === 'CALLM';
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + S + '[' + SP + '-n]');
                L.push('   local a={}');
                L.push('   for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end');
                L.push('   ' + SP + '=' + SP + '-n-1');
                L.push('   local la=n');
                L.push('   if la>0 and ' + UNPKM + '(a[la]) then');
                L.push('    local pt=a[la] local flat={} local fi=0');
                L.push('    for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end');
                L.push('    for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end');
                L.push('    a=flat la=fi');
                L.push('   end');
                L.push('   local vd=' + VMFUN + '[f]');
                L.push('   if vd or (type(f)=="table" and f.__vm) then');
                L.push('    local caller=' + CUR + ' local dest=' + SP + '+1');
                L.push('    ' + SAVEF + '(caller)');
                L.push('    local vc=vd or f ' + PUSHF + '(vc.chunk,vc.links,a,dest,' + (multi ? '-1' : '1') + ',caller)');
                L.push('    ' + LOADF + '(' + FRAMES + '[' + FP + '])');
                L.push('   else');
                L.push('    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=' + ROOTTHREAD + ')');
                L.push('    if _co then ' + SAVEVM + '(' + ROOTSTATE + ') end');
                L.push('    if _yt then local _st=' + ACTIVE + ' ' + SAVEF + '(' + CUR + ') ' + SAVEVM + '(_st) ' + LOADVM + '(' + ROOTSTATE + ') end');
                L.push('    local r=' + PK + '(f(' + UNP + '(a,1,la)))');
                L.push('    if _yt then local _st=' + ACTIVE + ' ' + LOADVM + '(_st) ' + LOADF + '(' + CUR + ') end');
                L.push('    ' + SP + '=' + SP + '+1');
                if (multi) { L.push('    ' + S + '[' + SP + ']=r'); }
                else { L.push('    ' + S + '[' + SP + ']=r[1]'); }
                L.push('   end');
                break;
            }
            case 'TAILCALL': {
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + S + '[' + SP + '-n] local a={} for j=1,n do a[j]=' + S + '[' + SP + '-n+j] end ' + SP + '=' + SP + '-n-1');
                L.push('   local la=n if la>0 and ' + UNPKM + '(a[la]) then local pt=a[la] local flat={} local fi=0 for j=1,la-1 do fi=fi+1 flat[fi]=a[j] end for j=1,pt.n do fi=fi+1 flat[fi]=pt[j] end a=flat la=fi end');
                L.push('   local vd=' + VMFUN + '[f]');
                L.push('   if vd or (type(f)=="table" and f.__vm) then');
                L.push('    local vc=vd or f local old=' + CUR + ' local base0=' + BASE + ' local top0=' + TOP + ' local caller0=old.caller local rd=old.retDest local nr=old.nRet');
                L.push('    for i=base0,top0 do ' + REG + '[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do ' + REG + '[i]=nil end end');
                L.push('    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=' + OWNER + '}');
                L.push('    local cc=' + CH + '[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t[' + MARK + ']=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end');
                L.push('    ' + FRAMES + '[' + FP + ']=nf ' + LOADF + '(nf)');
                L.push('   else');
                L.push('    local r=' + PK + '(f(' + UNP + '(a,1,la))) ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=r ' + FINISH + '(0,true)');
                L.push('   end');
                break;
            }
            case 'RET':
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   ' + FINISH + '(n,false)');
                break;
            case 'RETP':
                L.push('   local k=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   ' + FINISH + '(k,true)');
                break;
            case 'VARGP':
                // push packed varargs (marker-tagged so the CALL flatten
                // check can identify it - never a plain user table)
                L.push('   if not ' + VA + ' then local t={n=0} t[' + MARK + ']=true ' + VA + '=t end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + VA);
                break;
            case 'STACKNEW': {
                L.push('   local n=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local f=' + CUR + ' local b=f.sanext or (' + BASE + '+256) local lim=' + BASE + '+512');
                L.push('   if n<1 or n>128 or b+n-1>lim-1 then error("VM_STACKALLOC",0) end');
                L.push('   f.sanext=b+n f.sasizes[b]=n ' + TOP + '=math.max(' + TOP + ',' + BASE + '+255)');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=b');
                break;
            }
            case 'STACKGET': {
                L.push('   local _mode=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local idx=' + S + '[' + SP + '] local b=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-2');
                L.push('   local f=' + CUR + ' local n=f.sasizes and f.sasizes[b]');
                L.push('   if not n then error("VM_STACKALLOC_HANDLE",0) end');
                L.push('   idx=math.floor(tonumber(idx) or 0) if idx<1 or idx>n then ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=nil else ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + REG + '[b+idx-1] end');
                break;
            }
            case 'STACKSET': {
                L.push('   local _mode=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local v=' + S + '[' + SP + '] local idx=' + S + '[' + SP + '-1] local b=' + S + '[' + SP + '-2] ' + SP + '=' + SP + '-3');
                L.push('   local f=' + CUR + ' local n=f.sasizes and f.sasizes[b] idx=math.floor(tonumber(idx) or 0)');
                L.push('   if not n or idx<1 or idx>n then error("VM_STACKALLOC_INDEX",0) end');
                L.push('   ' + REG + '[b+idx-1]=v');
                break;
            }
            case 'STACKLEN': {
                L.push('   local b=' + S + '[' + SP + '] local n=' + CUR + '.sasizes and ' + CUR + '.sasizes[b] if not n then error("VM_STACKALLOC_HANDLE",0) end ' + S + '[' + SP + ']=n');
                break;
            }
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
                L.push('   ' + S + '[' + SP + ']=' + VMFN + '(ci,links)');
                break;
            case 'ADD': case 'ADD_R': case 'SUB': case 'MUL': case 'MUL_R': case 'DIV': case 'MOD':
            case 'POW': case 'CONCAT': case 'EQ': case 'NEQ':
            case 'LT': case 'LE': case 'GT': case 'GE': {
                var sym = {
                    ADD: '+', ADD_R: '+', LOADK_ADD: '+', SUB: '-', MUL: '*', MUL_R: '*', LOADK_MUL: '*', DIV: '/', MOD: '%',
                    POW: '^', CONCAT: '..', EQ: '==', NEQ: '~=',
                    LT: '<', LE: '<=', GT: '>', GE: '>='
                }[name];
                L.push('   local b=' + S + '[' + SP + '] local a=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-1');
                L.push('   ' + S + '[' + SP + ']=a ' + sym + ' b');
                break;
            }
            case 'LOADK_ADD': case 'LOADK_MUL': {
                var fsym = name === 'LOADK_ADD' ? '+' : '*';
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local n=' + NC + '[ix] if not n then n=tonumber(' + D + '(ix)) ' + NC + '[ix]=n end');
                L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + ']' + fsym + 'n');
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
    // Scheduler loop: no host-recursive RUN calls. It advances FRAMES until
    // the requested stop depth is reached. INVOKE is only a native boundary
    // for APIs such as host pcall/metamethod/coroutine that require a Lua
    // callable; ordinary VM CALL uses the same scheduler directly.
    L.push(' ' + SCHED + '=function(stop)');
    L.push('  while ' + FP + '>stop and not ' + DONE + ' do');
    L.push('   local f=' + FRAMES + '[' + FP + '] if not f then error("VM_FRAME_MISSING",0) end');
    L.push('   ' + LOADF + '(f)');
    L.push('   if ' + FP + '<1 or ' + FP + '>#' + FRAMES + ' or ' + FRAMES + '[' + FP + ']~=' + CUR + ' then error("VM_STATE_FP",0) end');
    L.push('   if ' + CUR + '.owner~=' + OWNER + ' then error("VM_STATE_FRAME_OWNER",0) end');
    L.push('   if ' + CODE + '~=' + CH + '[' + CUR + '.chunk] then error("VM_STATE_CODE",0) end');
    L.push('   if ' + PC + '%1~=0 or ' + PC + '<1 or ' + PC + '>#' + CODE + '.c then error("VM_STATE_PC",0) end');
    L.push('   if ' + BASE + '%1~=0 or ' + TOP + '%1~=0 or ' + BASE + '<0 or ' + TOP + '<' + BASE + ' or ' + TOP + '>' + BASE + '+255 then error("VM_STATE_BOUNDS",0) end');
    L.push('   if ' + SP + '%1~=0 or ' + SP + '<0 or ' + SP + '>' + TOP + '-' + BASE + ' then error("VM_STATE_SP",0) end');
    L.push('   local ' + OP + '=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
    L.push('   local _fn=' + HAND + '[' + OP + ']');
    L.push('   local _yieldop=(' + OP + '==' + OPCODES.CALL + ' or ' + OP + '==' + OPCODES.CALLM + ')');
    L.push('   local _ok,_err=true,nil');
    L.push('   if _yieldop and not (' + CUR + ' and ' + CUR + '.prot) then if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end else _ok,_err=pcall(function() if _fn then _fn() else error("bad opcode "..tostring(' + OP + '),0) end end) end');
    L.push('   if not _ok then');
    L.push('    local handled=false local ei=' + FP + '');
    L.push('    while ei>stop do');
    L.push('     local ef=' + FRAMES + '[ei] local meta=ef and ef.prot');
    L.push('     if meta then');
    L.push('      for k=' + FP + ',ei+1,-1 do local z=' + FRAMES + '[k] if z then for j=z.base,z.top do ' + REG + '[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do ' + REG + '[j]=nil end end end ' + FRAMES + '[k]=nil end');
    L.push('      ' + FP + '=ei ' + LOADF + '(' + FRAMES + '[' + FP + '])');
    L.push('      local bad=' + FRAMES + '[' + FP + '] local caller=meta.caller ' + FRAMES + '[' + FP + ']=nil ' + FP + '=' + FP + '-1');
    L.push('      for j=bad.base,bad.top do ' + REG + '[j]=nil end if bad.sanext and bad.sanext>bad.base+256 then for j=bad.base+256,bad.sanext-1 do ' + REG + '[j]=nil end end');
    L.push('      if meta.kind=="xpcall" then ' + LOADF + '(caller) local hf=' + VMFUN + '[meta.handler] if hf then local hm={kind="xhandler",caller=caller,dest=meta.dest} ' + PUSHF + '(hf.chunk,hf.links,{_err},meta.dest,-3,caller,hm) else local okh,hr=pcall(meta.handler,_err); if not okh then error(hr,0) end local q={n=2} q[' + MARK + ']=true q[1]=false q[2]=hr ' + SP + '=meta.dest ' + S + '[' + SP + ']=q end else ' + LOADF + '(caller) local q={n=2} q[' + MARK + ']=true q[1]=false q[2]=_err ' + SP + '=meta.dest ' + S + '[' + SP + ']=q end');
    L.push('      handled=true break');
    L.push('     end');
    L.push('     ei=ei-1');
    L.push('    end');
    L.push('    if not handled then error(_err,0) end');
    L.push('   end');
    L.push('   if not ' + DONE + ' then ' + SAVEF + '(' + CUR + ') end');
    L.push('  end');
    L.push(' end');
    L.push(' ' + INVOKE + '=function(d,...)');
    L.push('  local thr=coroutine.running()');
    L.push('  if thr~=' + ROOTTHREAD + ' then');
    L.push('   local st=' + COSTATES + '[tostring(thr)]');
    L.push('   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} ' + COSTATES + '[tostring(thr)]=st end ' + ACTIVE + '=st');
    L.push('   if ' + FRAMES + '==st.fr and ' + FP + '>0 then ' + SAVEVM + '(st) end ' + LOADVM + '(st)');
    L.push('   if ' + FP + '==0 then');
    L.push('    ' + PUSHF + '(d.chunk,d.links,{...},nil,0,nil)');
    L.push('    ' + SCHED + '(0)');
    L.push('    local rr=' + RESULT + ' or {} ' + SAVEVM + '(st) ' + LOADVM + '(' + ROOTSTATE + ') return ' + UNP + '(rr)');
    L.push('   end');
    L.push('   local stop=' + FP + ' local caller=' + FRAMES + '[' + FP + '] ' + SAVEF + '(caller)');
    L.push('   ' + PUSHF + '(d.chunk,d.links,{...},' + SP + '+1,0,caller)');
    L.push('   ' + SCHED + '(stop)');
    L.push('   local cf=' + FRAMES + '[' + FP + '] ' + LOADF + '(cf) local rr=cf.lastResult or {} cf.lastResult=nil return ' + UNP + '(rr)');
    L.push('  end');
    L.push('  ' + SAVEVM + '(' + ROOTSTATE + ')');
    L.push('  local stop=' + FP + ' local caller=' + FRAMES + '[' + FP + ']');
    L.push('  ' + SAVEF + '(caller)');
    L.push('  ' + PUSHF + '(d.chunk,d.links,{...},0,0,caller)');
    L.push('  ' + SCHED + '(stop)');
    L.push('  local cf=' + FRAMES + '[' + FP + '] ' + LOADF + '(cf)');
    L.push('  local rr=cf.lastResult or {} cf.lastResult=nil return ' + UNP + '(rr)');
    L.push(' end');
    L.push(' ' + SCHED + '(0)');
    L.push(' return ' + UNP + '(' + RESULT + ')');
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
    var prevRandomState = _bcRandomState;
    _bcRandomState = (opts.seedOverride !== undefined && opts.seedOverride !== null)
        ? (Number(opts.seedOverride) >>> 0) : null;
    try {
        build = compile(src, opts);
        if (opts.seedOverride !== undefined && opts.seedOverride !== null) build.seed = opts.seedOverride;
        if (opts.seedFromGenv) build.seedFromGenv = opts.seedFromGenv;
        var vmSrc = emitVM(build);
        if (opts.onBuild) opts.onBuild(build);
        return vmSrc;
    } catch (e) {
        if (opts.rethrow) throw e;
        return null;
    } finally {
        _bcRandomState = prevRandomState;
    }
}
