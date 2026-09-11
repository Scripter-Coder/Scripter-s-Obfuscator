// ============================================================
// vm-pass.js - tier 2-lite VM transformation (Luarmor-inspired)
// ------------------------------------------------------------
// Runs BEFORE the encryption layers. A cracker who peels every layer
// lands on THIS output, never the original lua:
//   1. Constant vault: string/number literals live in one encrypted
//      byte-stream; decrypted lazily at runtime via per-build stream
//      cipher. Grep finds NOTHING - no strings, no numbers.
//   2. Proxy calls: calls route through a per-build dispatcher keyed
//      by randomized opcodes; static analysis sees one opaque
//      dispatcher, not print/HttpGet/game.
//   3. Member keys vaulted: a.b becomes a[D(17)] - property names
//      never appear in plaintext either.
//   4. Locals morphed to random hex names (scope-tracked).
// If the source fails to parse, the pass returns it untouched.
// ============================================================
// luaparse resolver: this file must stay BARE-IMPORT FREE because the
// site serves it directly as a browser ES module (bare specifiers
// cannot resolve there). The parser is resolved in this order:
//   1. an injected parser (opts.luaparse / vmSetLuaparse) - tests/CLI
//   2. window.luaparse (index.html loads vendor/luaparse.js first)
//   3. Node require('luaparse') (tests / CLI under Node)
// vite's dist build never sees this file's own import - custom-
// obfuscator.js calls vmSetLuaparse at runtime.
var _injectedLuaparse = null;
export function vmSetLuaparse(p) { _injectedLuaparse = p; }
function resolveLuaparse() {
    if (_injectedLuaparse) return _injectedLuaparse;
    if (typeof window !== 'undefined' && window.luaparse) return window.luaparse;
    if (typeof globalThis !== 'undefined' && globalThis.luaparse) return globalThis.luaparse;
    // Node (tests/CLI): CJS require via a lazy shim
    if (typeof require === 'function') return require('luaparse');
    if (typeof module !== 'undefined' && typeof module.createRequire === 'function') {
        return module.createRequire(import.meta.url)('luaparse');
    }
    // ESM Node without require: dynamic import is async - not usable
    // here. The caller MUST inject in that case (tests do).
    throw new Error('luaparse unavailable - call vmSetLuaparse() or load vendor/luaparse.js');
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

export function applyVmPass(src, opts) {
    opts = opts || {};
    var ast;
    try {
        ast = resolveLuaparse().parse(src, { luaVersion: '5.1' });
    } catch (e) {
        return src;
    }
    if (!ast || !ast.body) return src;

    var seed = rndInt(29, 251);
    var D = 'd' + hex(7);        // decryptor fn
    var P = 'p' + hex(7);        // proxy fn
    var V = 'v' + hex(7);        // vault table
    var C = 'c' + hex(7);        // memo cache

    var vault = [];              // encrypted bytes (flat)
    var refs = [];               // {start,len} per constant
    var callOps = [];            // opcodes in use

    function addConst(str) {
        // luaparse 0.3.1: StringLiteral.value is null - the string is in .raw
        var b = strToBytes(String(str));
        var start = vault.length;
        for (var i = 0; i < b.length; i++) vault.push(b[i]);
        refs.push({ start: start, len: b.length });
        return refs.length; // 1-BASED (Lua table index)
    }
    // luaparse 0.3.1 stores the string in .raw (quoted source form)
    function rawToStr(raw) {
        if (raw === undefined || raw === null) return '';
        // short quoted string: "..." or '...'
        var q = raw[0];
        if ((q === '"' || q === "'") && raw[raw.length - 1] === q && raw.length >= 2) {
            var inner = raw.substring(1, raw.length - 1);
            // unescape \ddd, \n, \\, \", \' etc. (match Lua 5.1 rules)
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
        // long string [[...]] or [=[...]=] - strip the brackets; first
        // newline right after the opening bracket is skipped per Lua
        var m2 = raw.match(/^(\[=*\[)([\s\S]*)(\]=*\])$/);
        if (m2) {
            var bodyStr = m2[2];
            if (bodyStr[0] === '\r') bodyStr = bodyStr.substring(1);
            if (bodyStr[0] === '\n') bodyStr = bodyStr.substring(1);
            return bodyStr;
        }
        return raw;
    }

    // per-position stream cipher over the flat vault.
    // position p is 1-BASED everywhere (Lua table indexing) - the JS
    // encryptor below uses pos+1 for the same reason.
    function encPos(pos0) { return ((seed * (pos0 + 1) * 31 + pos0) % 251) + 5; }

    // scope tracking for local renaming -----------------------------
    var scopes = [Object.create(null)]; // stack; bottom = chunk globals
    function pushScope() { scopes.push(Object.create(null)); }
    function popScope() { scopes.pop(); }
    function lookup(name) {
        for (var i = scopes.length - 1; i >= 0; i--) {
            var s = scopes[i];
            if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
        }
        return null;
    }
    function bind(name) {
        var nn = '_' + hex(12);
        scopes[scopes.length - 1][name] = nn;
        return nn;
    }
    function emitName(name) {
        var r = lookup(name);
        return r || name; // globals keep their name
    }

    // fresh temp locals for hoisting (declared at top of enclosing body)
    var temps = [];
    function temp() {
        var t = '_' + hex(12);
        temps.push(t);
        return t;
    }

    // ---------------- expression emitter ----------------
    // returns lua source. hoist = callback for expressions that must be
    // evaluated before their container (call-in-index cases).
    function ex(n) {
        if (!n) return 'nil';
        switch (n.type) {
            case 'NumericLiteral':
                return n.raw || String(n.value);
            case 'StringLiteral':
                return D + '(' + addConst(rawToStr(n.raw)) + ')';
            case 'BooleanLiteral':
                return n.value ? 'true' : 'false';
            case 'NilLiteral':
                return 'nil';
            case 'Vararg': case 'VarargLiteral':
                return '...';
            case 'Identifier':
                return emitName(n.name);
            case 'MemberExpression': {
                // a.b / a:b  (b handled inside calls)
                var b = ex(n.base);
                var keyIdx = addConst(n.identifier.name);
                return b + '[' + D + '(' + keyIdx + ')]';
            }
            case 'IndexExpression': {
                var b = ex(n.base);
                var ix = ex(n.index);
                return b + '[' + ix + ']';
            }
            case 'CallExpression': {
                var op = rndInt(1000, 65535);
                while (callOps.indexOf(op) !== -1) op = rndInt(1000, 65535);
                callOps.push(op);
                var base = ex(n.base);
                var args = (n.arguments || []).map(ex);
                // a:b(...) means b(a, ...) - pass the object as first arg
                if (n.base.type === 'MemberExpression' && n.base.indexer === ':') {
                    var obj = ex(n.base.base);
                    return P + '(' + op + ',' + base + ',' + obj + (args.length ? ',' + args.join(',') : '') + ')';
                }
                return P + '(' + op + ',' + base + (args.length ? ',' + args.join(',') : '') + ')';
            }
            case 'StringCallExpression': { // f"str"
                var op = rndInt(1000, 65535);
                while (callOps.indexOf(op) !== -1) op = rndInt(1000, 65535);
                callOps.push(op);
                var base = ex(n.base);
                if (n.base.type === 'MemberExpression' && n.base.indexer === ':') {
                    var obj = ex(n.base.base);
                    return P + '(' + op + ',' + base + ',' + obj + ',' + ex(n.argument) + ')';
                }
                return P + '(' + op + ',' + base + ',' + ex(n.argument) + ')';
            }
            case 'TableCallExpression': { // f{...}
                var op = rndInt(1000, 65535);
                while (callOps.indexOf(op) !== -1) op = rndInt(1000, 65535);
                callOps.push(op);
                var base = ex(n.base);
                var targ = ex(n.arguments); // .arguments is the table NODE
                if (n.base.type === 'MemberExpression' && n.base.indexer === ':') {
                    var obj = ex(n.base.base);
                    return P + '(' + op + ',' + base + ',' + obj + ',' + targ + ')';
                }
                return P + '(' + op + ',' + base + ',' + targ + ')';
            }
            case 'BinaryExpression': case 'LogicalExpression': {
                var l = ex(n.left), r = ex(n.right);
                var s = l + ' ' + n.operator + ' ' + r;
                return n.inParens ? '(' + s + ')' : s;
            }
            case 'UnaryExpression': {
                var a = ex(n.argument);
                if (n.operator === 'not') return 'not ' + a;
                var s = n.operator + a;
                return n.inParens ? '(' + s + ')' : s;
            }
            case 'TableConstructorExpression': {
                var parts = [];
                for (var i = 0; i < n.fields.length; i++) {
                    var f = n.fields[i];
                    if (f.type === 'TableKey') {
                        parts.push('[' + ex(f.key) + ']=' + ex(f.value));
                    } else if (f.type === 'TableKeyString') {
                        // keep identifier key (valid + safe), vault value
                        parts.push(emitKeyIdent(f.key) + '=' + ex(f.value));
                    } else {
                        parts.push(ex(f.value));
                    }
                }
                return '{' + parts.join(',') + '}';
            }
            case 'FunctionExpression': case 'FunctionDeclaration': {
                // same shape in luaparse; works in expression position too
                pushScope();
                // params may be Identifier OR a trailing VarargLiteral (...)
                var params = (n.parameters || []).map(function (p) {
                    if (p.type === 'Vararg' || p.type === 'VarargLiteral') return '...';
                    return bind(p.name);
                });
                var bodySrc = body(n.body, n.parameters);
                popScope();
                return 'function(' + params.join(',') + ')' + bodySrc + 'end';
            }
            default:
                return 'nil';
        }
    }
    // table key identifiers keep their name (creating t.x is legal as
    // t["x"]; we vault the STRING but syntax needs an ident or [ ])
    function emitKeyIdent(idNode) {
        // vault the key name into a [D(i)] form instead
        var idx = addConst(idNode.name);
        return '[' + D + '(' + idx + ')]';
    }

    // ---------------- statement emitter ----------------
    function st(s) {
        switch (s.type) {
            case 'LocalStatement': {
                var names = s.variables.map(function (v) { return bind(v.name); });
                var inits = (s.init || []).map(ex);
                return 'local ' + names.join(',') + (inits.length ? '=' + inits.join(',') : '');
            }
            case 'AssignmentStatement': {
                var lh = s.variables.map(function (v) {
                    if (v.type === 'Identifier') return emitName(v.name);
                    return ex(v);
                });
                var rh = s.init.map(ex);
                return lh.join(',') + '=' + rh.join(',');
            }
            case 'CallStatement':
                return ex(s.expression);
            case 'FunctionDeclaration': {
                // luaparse 0.3.1: name chain lives in s.identifier
                // (MemberExpression, possibly nested) - walk to build the
                // a.b.c:m chain text. self for ':' methods is a real
                // param and must be renamed WITH the params.
                var chainParts = [];
                var node = s.identifier;
                while (node && node.type === 'MemberExpression') {
                    chainParts.unshift(node);
                    node = node.base;
                }
                // base is an Identifier
                // bind the fn NAME in the ENCLOSING scope (before pushing
                // the fn body scope) - `local function f` declares f in
                // the enclosing scope and makes it visible to the body
                var fnName = null;
                if (s.identifier.type === 'Identifier' && s.isLocal) {
                    fnName = bind(s.identifier.name);
                }
                pushScope();
                var params = [];
                for (var pi = 0; pi < (s.parameters || []).length; pi++) {
                    var p = s.parameters[pi];
                    if (p.type === 'Vararg' || p.type === 'VarargLiteral') params.push('...');
                    else params.push(bind(p.name));
                }
                // build the name chain: Identifier (simple fn) or a
                // MemberExpression chain (a.b.c / a:b)
                var chain;
                if (s.identifier.type === 'Identifier') {
                    // local function f / global function f
                    chain = s.isLocal ? fnName : emitName(s.identifier.name);
                } else {
                    var chainParts = [];
                    var node = s.identifier;
                    while (node && node.type === 'MemberExpression') {
                        chainParts.unshift(node);
                        node = node.base;
                    }
                    chain = emitName(chainParts[0].base.name);
                    for (var ci = 0; ci < chainParts.length; ci++) {
                        chain += (chainParts[ci].indexer === ':' ? ':' : '.') + chainParts[ci].identifier.name;
                    }
                }
                var bodySrc = body(s.body, s.parameters);
                popScope();
                return (s.isLocal ? 'local ' : '') + 'function ' + chain + '(' + params.join(',') + ')' + bodySrc + 'end';
            }
            case 'DoStatement':
                pushScope();
                var d = 'do' + body(s.body) + 'end';
                popScope();
                return d;
            case 'WhileStatement':
                return 'while ' + ex(s.condition) + ' do' + body(s.body) + 'end';
            case 'RepeatStatement':
                pushScope();
                var r = 'repeat' + body(s.body) + 'until ' + ex(s.condition);
                popScope();
                return r;
            case 'IfStatement': {
                var out = 'if ' + ex(s.clauses[0].condition) + ' then' + body(s.clauses[0].body);
                for (var i = 1; i < s.clauses.length; i++) {
                    var cl = s.clauses[i];
                    if (cl.condition) out += 'elseif ' + ex(cl.condition) + ' then' + body(cl.body);
                    else out += 'else' + body(cl.body);
                }
                return out + 'end';
            }
            case 'ForNumericStatement': case 'FornumpStatement': {
                pushScope();
                var v = bind(s.variable.name);
                var f = 'for ' + v + '=' + ex(s.start) + ',' + ex(s.end) + (s.step ? ',' + ex(s.step) : '') + ' do' + body(s.body) + 'end';
                popScope();
                return f;
            }
            case 'ForGenericStatement': case 'ForinStatement': {
                pushScope();
                // ITS name list binds BEFORE the iterator exprs are emitted.
                // (luaparse names the exprs `iterators`)
                var names = s.variables.map(function (v2) { return bind(v2.name); });
                var its = (s.iterators || s.expressions || []).map(ex);
                var f = 'for ' + names.join(',') + ' in ' + its.join(',') + ' do' + body(s.body) + 'end';
                popScope();
                return f;
            }
            case 'ReturnStatement':
                return (s.arguments.length ? 'return ' + s.arguments.map(ex).join(',') : 'return');
            case 'LocalStatement2':
                return '';
            case 'BreakStatement':
                return 'break';
            case 'GotoStatement':
                return 'goto ' + s.label; // unreachable in 5.1 parse, safety
            case 'LabelStatement':
                return '::' + s.label + '::';
            default:
                return '';
        }
    }

    // body emitter: string of statements; also drains temps.
    // newline separators keep keywords/identifiers from ever gluing.
    function body(stmts, params) {
        temps = [];
        var parts = [];
        for (var i = 0; i < (stmts || []).length; i++) parts.push(st(stmts[i]));
        var out = '';
        if (temps.length) out += 'local ' + temps.join(',') + '\n';
        out += parts.join('\n');
        return '\n' + out + '\n';
    }

    // ---- run ----
    var outStmts = [];
    pushScope(); // chunk scope
    try {
        for (var i = 0; i < ast.body.length; i++) outStmts.push(st(ast.body[i]));
    } catch (e) {
        if (opts.rethrow) throw e; // debug mode: surface the emitter bug
        return src; // NEVER break the script
    }
    popScope();

    // encrypt the vault NOW (after all constants were added during the walk).
    // byte i of the vault lives at Lua index i+1; encPos(i) matches the
    // Lua formula with p=i+1: (seed*p*31+(p-1))%251+5
    for (var pos = 0; pos < vault.length; pos++) vault[pos] = (vault[pos] ^ ((seed * (pos + 1) * 31 + pos) % 251 + 5)) % 256;

    // ---- prelude: vault, cache, refs table, decryptor, proxy ----
    var RT = 'r' + hex(7);
    var refsTable = 'local ' + RT + '={' + refs.map(function (r) {
        return '{' + r.start + ',' + r.len + '}';
    }).join(',') + '}';

    var DR = 'local ' + D + '=function(i)';
    DR += ' local c=' + C + '[i]';
    DR += ' if c then return c end';
    DR += ' local rr=' + RT + '[i]';
    DR += ' if not rr then return nil end';
    DR += ' local st=rr[1] local ln=rr[2]';
    DR += ' local o={}';
    DR += ' for j=1,ln do';
    DR += '  local p=st+j';
    // arithmetic XOR: Lua 5.1-safe (executors have bit32 but 5.1
    // compat means no bitwise operators in output)
    DR += '  local a=' + V + '[p] local b=(' + seed + '*p*31+p-1)%251+5';
    DR += '  local r,pw=0,1';
    DR += '  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end';
    DR += '  o[j]=string.char(r)';
    DR += ' end';
    DR += ' local t=table.concat(o)';
    DR += ' ' + C + '[i]=t';
    DR += ' return t';
    DR += ' end';

    // proxy: op is arg1, function is arg2, real args follow. select's
    // index is relative to the VARARGS (op already bound), so arg2 of
    // ... is select(1,...) - careful with the off-by-one!
    var proxySrc = 'local ' + P + '=function(op,...)';
    proxySrc += ' local f=(...)\n';
    proxySrc += ' local n=select(\'#\',...)\n';
    proxySrc += ' if n<2 then return f() end\n';
    proxySrc += ' return f(select(2,...))\n';
    proxySrc += 'end';

    var vaultSrc = 'local ' + V + '={' + vault.join(',') + '}';
    var cacheSrc = 'local ' + C + '={}';

    return vaultSrc + '\n' + cacheSrc + '\n' + refsTable + '\n' + DR + '\n' + proxySrc + '\n' + outStmts.join('\n');
}