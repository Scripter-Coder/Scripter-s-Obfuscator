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
import { applyInlineAST } from './src/transform/inline.js';
import { shouldUnroll, unrollLoop } from './src/transform/unroll.js';
import { applyExtractSource, applyExtractTransform } from './src/transform/extract.js';
import { applyNamecallSource, applyRewriteNamecalls } from './src/transform/namecall.js';
import { applySourceOps } from './src/transform/source-ops.js';
import { bridgeNativeUpvalues } from './src/transform/native-upvalues.js';
import { flattenNativeSource } from './src/transform/control-flow.js';

// Stable, non-colliding names for the VM(NONE) upvalue accessors. They are
// emitted once by the loader and referenced by rewritten native source.
var NATIVE_UP_READ = '__lph_vm_none_up';
var NATIVE_UP_SET = '__lph_vm_none_upset';
import { buildConstantPool } from './src/vm/constants.js';
import { compressBytes } from './src/compression/compress.js';
import { runProductionPipeline } from './src/ir/production-pipeline.js';
import { attachEnhancedPerFuncMeta, inheritedMeta } from './src/ast/perfunc-enhanced.js';
import { isPublicMacro, validatePublicMacro, rewritePublicExpression, rewritePublicOptions, precheckExpectedValues } from './src/ast/public-macros.js';
import { getTarget } from './src/targets/registry.js';
import { pickDispatcher, DISPATCHER_STRATEGIES } from './src/vm/dispatcher.js';
import { pickVariant } from './src/vm/variants.js';
import { instructionFormat, encodeChunkWords } from './src/vm/instruction-format.js';

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
// Draw from the MIXED HIGH BITS, not `state % n`.
//
// This generator is an LCG (multiplier 1664525, increment 1013904223). Its low
// bits are strongly correlated: with these constants `state mod 10` can only
// ever take the residues 3 and 8, and `state mod 5` is effectively constant.
// Taking `state % n` therefore locked whole seed ranges to a single choice --
// per-build frame stride, IR fusion/split/mutation passes and similar all
// collapsed to one value, so consecutive builds were far less polymorphic than
// intended. Mixing the state into the high bits before reducing restores a
// usable spread while keeping the sequence deterministic per seed.
function _bcNext() {
    _bcRandomState = (Math.imul(_bcRandomState, 1664525) + 1013904223) >>> 0;
    // xorshift-style avalanche of the high bits, so neighbouring seeds diverge.
    var x = _bcRandomState;
    x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
}
function rnd(n) {
    if (n <= 0) return 0;
    if (_bcRandomState !== null) {
        return _bcNext() % n;
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
    'GLOB', 'HGLOB', 'GSET', 'LLOAD', 'LNEW', 'LSET', 'ULOAD', 'USET', 'ENVLOAD',
    'PUSHSC', 'POPSC',
    'TGET', 'TSET', 'NEWTAB', 'APD',
    'DUP', 'POP', 'SWAP', 'UNPK', 'UNPKR', 'UNPK1F', 'UNPK2F', 'UNPK3F',
    'CALL', 'CALLM', 'PCALL', 'XPCALL', 'TAILCALL',
    'RET', 'RETP', 'CLOSE',
    'VARGP',
    'STACKNEW', 'STACKGET', 'STACKSET', 'STACKLEN', 'STACKPACK', 'STACKUNPACK', 'STACKCLEAR', 'STACKADAPT', 'CRASH',
    'NEWF',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'CONCAT', 'BAND', 'BOR', 'BXOR', 'SHL', 'SHR',
    'EQ', 'NEQ', 'LT', 'LE', 'GT', 'GE', 'ADD_R', 'MUL_R',
    'PREP_TGET', 'LOOKUP_TGET', 'LOADK_ADD', 'LOADK_MUL',
    'NOT', 'NEG', 'LEN', 'BNOT',
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
function isAttributeStatement(stmt) {
    return !!(stmt && stmt.type === 'CallStatement' && stmt.expression && stmt.expression.type === 'CallExpression' && stmt.expression.base && stmt.expression.base.type === 'Identifier' && (stmt.expression.base.name === 'LPH_ATTRIBUTES' || stmt.expression.base.name === 'VMATTR'));
}
function isBitwiseExpressionNode(node) {
    return !!(node && ((node.type === 'UnaryExpression' && node.operator === '~') || (node.type === 'BinaryExpression' && ['&', '|', '~', '<<', '>>'].includes(node.operator))));
}
function validateTargetBitwisePlacement(nodes, targetName, insideRewrite) {
    var nativeSyntax = targetName === 'lua53' || targetName === 'lua54';
    for (var node of nodes || []) {
        if (!node || typeof node !== 'object') continue;
        var rewriteCall = node.type === 'CallExpression' && node.base && node.base.type === 'Identifier' && String(node.base.name).toUpperCase() === 'LPH_REWRITE';
        if (rewriteCall) {
            if (node.arguments && node.arguments[0]) validateTargetBitwisePlacement([node.arguments[0]], targetName, true);
            for (var oi = 1; oi < (node.arguments || []).length; oi++) validateTargetBitwisePlacement([node.arguments[oi]], targetName, false);
            continue;
        }
        if (!insideRewrite && !nativeSyntax && isBitwiseExpressionNode(node)) {
            throw new Error('native bitwise syntax is only accepted inside LPH_REWRITE for target ' + targetName);
        }
        if (!insideRewrite && node.type === 'LabelStatement' && ['lua51', 'luajit'].includes(targetName)) {
            throw new Error('labels are not supported by target ' + targetName);
        }
        for (var key of Object.keys(node)) {
            var value = node[key];
            if (Array.isArray(value)) validateTargetBitwisePlacement(value, targetName, insideRewrite);
            else if (value && typeof value === 'object' && value.type) validateTargetBitwisePlacement([value], targetName, insideRewrite);
        }
    }
}
function stripAttributeStatementFromSource(source, fnNode, originalSource) {
    if (!source || !fnNode || !Array.isArray(fnNode.body)) return source;
    var attr = fnNode.body[0];
    if (!isAttributeStatement(attr)) return source;
    var slice = sourceSliceForNode(originalSource, attr);
    if (slice) {
        var at = source.indexOf(slice);
        if (at >= 0) return source.slice(0, at) + source.slice(at + slice.length);
    }
    return source.replace(/(?:LPH_ATTRIBUTES|VMATTR)\s*\([^)]*\)\s*;?/, '');
}
function isExpandingCallNode(n) {
    return isCallNode(n) && !(n.base && n.base.type === 'Identifier' && isPublicMacro(n.base.name));
}
function isVarargNode(n) {
    return n && (n.type === 'VarargLiteral' || n.type === 'Vararg');
}

function sourceOffsetFactory(src) {
    var lines = String(src || '').split('\n');
    return function (line, column) {
        var idx = 0;
        for (var i = 0; i < line - 1; i++) idx += (lines[i] || '').length + 1;
        return idx + column;
    };
}
function sourceSliceForNode(src, node) {
    if (!src || !node || !node.loc) return null;
    var offsetAt = sourceOffsetFactory(src);
    var start = offsetAt(node.loc.start.line, node.loc.start.column);
    var end = offsetAt(node.loc.end.line, node.loc.end.column);
    return src.slice(start, end);
}

// Absolute offset of a node's start, from the AST's own location. Used to
// anchor transform spans: locating the sliced text with indexOf would match an
// earlier identical substring and silently anchor every later span to the wrong
// place, which is the class of bug this is here to avoid.
function sourceStartOffsetOf(src, node) {
    if (!src || !node || !node.loc || !node.loc.start) return 0;
    return sourceOffsetFactory(src)(node.loc.start.line, node.loc.start.column);
}

function functionNameForNode(fnNode, slot) {
    if (!fnNode || !fnNode.identifier) return '__vm_none_' + slot;
    var ident = fnNode.identifier;
    if (ident.type === 'Identifier') return ident.name;
    if (ident.type === 'MemberExpression') {
        var parts = [];
        var cur = ident;
        while (cur && cur.type === 'MemberExpression') {
            if (cur.identifier && cur.identifier.name) parts.unshift(cur.identifier.name);
            cur = cur.base;
        }
        if (cur && cur.name) parts.unshift(cur.name);
        return parts.join('.');
    }
    return '__vm_none_' + slot;
}

// ============================================================
// COMPILER
// ============================================================
function compile(src, opts) {
    opts = opts || {};
    var optsSeed = opts.seedOverride;
    var requestedTarget = String(opts.target || 'lua51').toLowerCase();
    var targetMod = getTarget(requestedTarget);
    var targetName = String(targetMod.TARGET.name || requestedTarget).toLowerCase();
    var targetVersion = (targetMod.TARGET && targetMod.TARGET.parserOpts && targetMod.TARGET.parserOpts.luaVersion) || '5.1';
    // luaparse 0.3.1 has no 5.4 parser; use its 5.3 grammar for the
    // common 5.4 subset and explicitly reject 5.4-only syntax below.
    if (targetName === 'lua54') targetVersion = '5.3';
    // LPH_REWRITE accepts source-level bitwise operators on every target.
    // Parse the macro with the 5.3 grammar, then lower it through the VM's
    // target-width handlers instead of requiring target parser syntax.
    var rewriteHint = /\bLPH_REWRITE\b/i.test(src);
    if (targetName === 'luau' && /\bgoto\b/.test(src.replace(/(["']).*?\1|--[^\n]*/g, ''))) throw new Error('goto is not supported by the Luau target');
    var sourceForParse = (targetMod.prepareSource ? targetMod.prepareSource(src) : src);
    var ast;
    try {
        ast = resolveLuaparse().parse(sourceForParse, { luaVersion: targetVersion, locations: true });
    } catch (firstError) {
        if (!rewriteHint || targetVersion === '5.3') throw new Error('Target ' + targetName + ' parser rejected source: ' + ((firstError && firstError.message) || firstError));
        try { ast = resolveLuaparse().parse(sourceForParse, { luaVersion: '5.3', locations: true }); }
        catch (e) { throw new Error('Target ' + targetName + ' parser rejected source: ' + ((e && e.message) || e)); }
    }
    validateTargetBitwisePlacement(ast.body, targetName, false);
    if (targetName === 'lua54' && /<close>|<const>/.test(src)) throw new Error('Lua 5.4 <close>/<const> backend syntax is not supported by the available luaparse 0.3.1 parser');
    var usesFFI = /\bffi\s*\./.test(src) || /require\s*\(\s*['"]ffi['"]\s*\)/.test(src);
    if (usesFFI && targetName !== 'luajit') throw new Error('FFI is only supported for the LuaJIT 2.1 target');
    var perFuncMeta = inheritedMeta(attachEnhancedPerFuncMeta(ast, src), ast);
    (function validateAttributePlacement(nodes, insideFunction) {
        function attrCall(node) {
            return !!(node && node.type === 'CallStatement' && node.expression && node.expression.type === 'CallExpression' && node.expression.base && node.expression.base.type === 'Identifier' && (node.expression.base.name === 'LPH_ATTRIBUTES' || node.expression.base.name === 'VMATTR'));
        }
        function containsAttr(node) {
            if (!node || typeof node !== 'object') return false;
            if (attrCall(node)) return true;
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return false;
            for (const value of Object.values(node)) {
                if (Array.isArray(value) && value.some(containsAttr)) return true;
                if (value && typeof value === 'object' && value.type && containsAttr(value)) return true;
            }
            return false;
        }
        for (const node of nodes || []) {
            if (!node || typeof node !== 'object') continue;
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                const body = node.body || [];
                body.forEach((statement, index) => {
                    if (attrCall(statement) && index !== 0) throw new Error('LPH_ATTRIBUTES must be the first statement in a function body');
                    if (containsAttr(statement) && !(index === 0 && attrCall(statement))) throw new Error('LPH_ATTRIBUTES may only be the first statement in a function body');
                });
                for (const value of Object.values(node)) {
                    if (Array.isArray(value)) validateAttributePlacement(value, true);
                    else if (value && typeof value === 'object' && value.type) validateAttributePlacement([value], true);
                }
            } else {
                if (attrCall(node) && !insideFunction) throw new Error('LPH_ATTRIBUTES is only valid as the first statement of a function');
                if (containsAttr(node) && !insideFunction) throw new Error('LPH_ATTRIBUTES is only valid as the first statement of a function');
                for (const value of Object.values(node)) {
                    if (Array.isArray(value)) validateAttributePlacement(value, insideFunction);
                    else if (value && typeof value === 'object' && value.type) validateAttributePlacement([value], insideFunction);
                }
            }
        }
    })(ast.body, false);
    (function validatePrecheckPlacement(nodes) {
        function isPrecheckCall(node) {
            return !!(node && node.type === 'CallExpression' && node.base && node.base.type === 'Identifier' && String(node.base.name).toUpperCase() === 'LPH_PRECHECK');
        }
        function walk(node, statementContext) {
            if (!node || typeof node !== 'object') return;
            if (isPrecheckCall(node) && !statementContext) throw new Error('LPH_PRECHECK must be used as a statement');
            const directStatement = node.type === 'CallStatement' && node.expression && isPrecheckCall(node.expression);
            for (const key of Object.keys(node)) {
                const value = node[key];
                if (Array.isArray(value)) value.forEach((child) => walk(child, directStatement && key === 'expression'));
                else if (value && typeof value === 'object' && value.type) walk(value, directStatement && key === 'expression');
            }
        }
        for (const node of nodes || []) walk(node, false);
    })(ast.body);
    var requestedProfile = String(opts.profile || 'BALANCED').toUpperCase();
    var architecture = requestedProfile === 'ONYX' || requestedProfile === 'SECURE' ? 'ONYX' : 'OPAL';
    var profileName = requestedProfile === 'OPAL' ? 'FAST' : (requestedProfile === 'ONYX' ? 'SECURE' : requestedProfile);
    var compatibility = opts.compatibility === true;
    var staticEnv = opts.staticEnv === true;
    var obfuscated = opts.obfuscated !== false;
    var debugProtect = opts.debugProtect === true || (opts.debugProtect !== false && profileName === 'SECURE');
    var hardCodeGlobals = opts.hardCodeGlobals === true && staticEnv;
    for (const meta of perFuncMeta.values()) {
        if (meta && meta.NO_UPVALUES === true && !['lua51', 'luajit'].includes(targetName)) {
            throw new Error('NO_UPVALUES is only supported on targets with getfenv/setfenv');
        }
    }
    var seedForTransforms = opts.seedOverride != null ? (Number(opts.seedOverride) >>> 0) : 0;
    // INLINE + UNROLL are real compiler/IR-path transforms (not metadata).
    // They run here pre-lowering on the AST and their stats are recorded on
    // the build for artifact-level proof (call removed / loop restructured).
    var inlineStats = { inlined: 0, changed: false };
    var unrollStats = { unrolled: 0, changed: false };
    if (opts.transforms !== false && !compatibility && opts.inline !== false) {
        try {
            // Respect per-function INLINE=false: collect names to skip.
            var inlineDisabled = new Set();
            for (const [fnNode, meta] of perFuncMeta) {
                if (meta && (meta.INLINE === false || meta.STACKALLOC === false || String(meta.VM || '').toUpperCase() === 'NONE')) {
                    var nm0 = fnNode.identifier && fnNode.identifier.name;
                    if (nm0) inlineDisabled.add(nm0);
                }
            }
            var inl = applyInlineAST(ast, { seed: seedForTransforms, profileName, disabled: inlineDisabled });
            if (inl) inlineStats = { inlined: inl.inlined || 0, changed: !!inl.changed };
        } catch (e) { /* conservative: leave AST unchanged on failure */ }
        try {
            var unrollDisabled = false;
            for (const meta of perFuncMeta.values()) { if (meta && meta.UNROLL === false) unrollDisabled = true; }
            if (opts.unroll !== false && !unrollDisabled && profileName !== 'FAST') {
                var count = 0;
                (function walkUnroll(node) {
                    if (!node || typeof node !== 'object') return;
                    for (var k in node) {
                        var v = node[k];
                        if (Array.isArray(v)) {
                            for (var i = 0; i < v.length; i++) {
                                var child = v[i];
                                if (child && child.type === 'ForNumericStatement' && shouldUnroll(child, profileName)) {
                                    var rep = unrollLoop(child, profileName);
                                    if (rep) { v.splice(i, 1, ...rep); count++; for (var ri = 0; ri < rep.length; ri++) walkUnroll(rep[ri]); i += rep.length - 1; continue; }
                                }
                                walkUnroll(child);
                            }
                        } else if (v && typeof v === 'object' && v.type) {
                            if (v.type === 'ForNumericStatement' && shouldUnroll(v, profileName)) {
                                // single-child position: replace in place via wrapper splice handled by parent array;
                                // fall through to recursion (parent array case covers statement lists)
                            }
                            walkUnroll(v);
                        }
                    }
                })(ast);
                // Also handle function bodies that hold statement arrays directly
                unrollStats = { unrolled: count, changed: count > 0 };
            }
        } catch (e) { /* conservative */ }
    }
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

    // Stackalloc bindings are tracked by lexical id so aliases introduced by
    // successful INLINE expansion keep the same virtual-register semantics.
    var stackAllocCandidates = new Map();
    var stackAllocInfos = new Map();
    var stackAllocIds = new Set();
    var stackAllocCaptured = new Set();
    var stackAllocEscaped = new Set();
    var stackShadowed = new Set();
    var stackAliasOrigin = new Map();
    function stackOriginName(name) {
        var seen = new Set(), current = name;
        while (stackAliasOrigin.has(current) && !seen.has(current)) { seen.add(current); current = stackAliasOrigin.get(current); }
        return current;
    }
    (function scanStackAlloc(nodes, fnDepth) {
        for (var si=0; si<(nodes||[]).length; si++) {
            var sn=nodes[si]; if(!sn) continue;
            if (sn.type==='LocalStatement') {
                for (var svi=0; svi<(sn.variables||[]).length; svi++) {
                    var sv=sn.variables[svi], siv=sn.init && sn.init[svi];
                    if (sv && sv.name) {
                        var directInfo = stackAllocInfo(siv);
                        if (directInfo) {
                            stackAllocCandidates.set(sv.name, fnDepth);
                            stackAllocInfos.set(sv.name, directInfo);
                            stackAliasOrigin.delete(sv.name);
                        } else if (siv && siv.type === 'Identifier' && stackAllocInfos.has(siv.name)) {
                            // INLINE may introduce a temporary local whose
                            // initializer is a stack allocation handle. Keep
                            // the allocation virtual instead of turning the
                            // indexed access into a table access.
                            stackAllocCandidates.set(sv.name, fnDepth);
                            stackAllocInfos.set(sv.name, stackAllocInfos.get(siv.name));
                            stackAliasOrigin.set(sv.name, stackAliasOrigin.get(siv.name) || siv.name);
                        } else if (stackAllocCandidates.has(sv.name)) {
                            // A same-name ordinary local is a lexical shadow,
                            // not another view of the allocation. Conservatively
                            // fall back the outer binding rather than treating
                            // the shadow as a numeric stack handle.
                            stackShadowed.add(sv.name);
                        }
                    }
                }
            }
            if (sn.type==='Identifier') {
                var sd=stackAllocCandidates.get(sn.name);
                if (sd != null && fnDepth > sd) stackAllocCaptured.add(sn.name);
            }
            if (sn.type === 'ReturnStatement') {
                for (const value of sn.arguments || []) if (value && value.type === 'Identifier' && stackAllocCandidates.has(value.name)) stackAllocEscaped.add(stackOriginName(value.name));
            }
            if (sn.type === 'CallExpression') {
                for (const value of sn.arguments || []) if (value && value.type === 'Identifier' && stackAllocCandidates.has(value.name)) stackAllocEscaped.add(stackOriginName(value.name));
            }
            if (sn.type === 'AssignmentStatement') {
                for (const value of sn.init || []) if (value && value.type === 'Identifier' && stackAllocCandidates.has(value.name)) stackAllocEscaped.add(stackOriginName(value.name));
                for (const variable of sn.variables || []) {
                    if (variable && variable.type === 'Identifier' && stackAllocCandidates.has(variable.name)) {
                        var replacement = sn.init && sn.init[0];
                        if (!(replacement && replacement.type === 'Identifier' && stackAllocInfos.has(replacement.name))) {
                            stackShadowed.add(variable.name);
                            stackAllocEscaped.add(stackOriginName(variable.name));
                        }
                    } else if (variable && (variable.type === 'MemberExpression' || variable.type === 'IndexExpression')) {
                        for (const value of sn.init || []) if (value && value.type === 'Identifier' && stackAllocCandidates.has(value.name)) stackAllocEscaped.add(stackOriginName(value.name));
                    }
                }
            }
            if (sn.type === 'TableConstructorExpression') {
                (function markTableValues(value) {
                    if (!value || typeof value !== 'object') return;
                    if (value.type === 'Identifier' && stackAllocCandidates.has(value.name)) stackAllocEscaped.add(stackOriginName(value.name));
                    for (var tk in value) { var tv = value[tk]; if (Array.isArray(tv)) tv.forEach(markTableValues); else if (tv && typeof tv === 'object' && tv.type) markTableValues(tv); }
                })(sn);
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
    var nativeFns = [];
    var vmBridges = [];
    var prechecks = [];
    var rewriteCounter = 0;
    var rewriteStats = [];
    var extractStats = [];
    var namecallStats = [];
    var upvalBridgeStats = [];
    // CONTROL_FLOW statistics. `native: true` entries are VM(NONE) functions
    // flattened by src/transform/control-flow.js; the rest come from the
    // instruction-stream path (applySafeCfgRewriting). A VM(NONE) function that
    // requested CONTROL_FLOW but could not be flattened throws instead of
    // reporting success, so a recorded entry always means a real transform.
    var controlFlowStats = [];
    // Original source line of the AST node currently being lowered. Recorded on
    // every emitted instruction; consumed by the ERROR_HANDLING line map.
    var SRC_LINE = 0;
    function syncSrcLine(n) { if (n && n.loc && n.loc.start && n.loc.start.line) SRC_LINE = n.loc.start.line; }
    var precheckDepth = 0;
    var nameIds = Object.create(null);
    var nextId = 1;
    var hiddenCounter = 0;
    var hiddenIds = new Set();
    var funcMetaStack = [];

    // per-build opcode map (assigned here, used by both compiler + emit)
    var OPCODES = Object.create(null);
    (function () {
        var used = new Set();
        var opcodeOrder = architecture === 'ONYX' ? OP_NAMES.slice().reverse() : OP_NAMES;
        for (var i = 0; i < opcodeOrder.length; i++) {
            var v = rndInt(500, 60000);
            while (used.has(v)) v = rndInt(500, 60000);
            used.add(v);
            OPCODES[opcodeOrder[i]] = v;
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
    var stackallocTrue = 0;
    var stackallocFallback = 0;

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
    // Return the VM mode of the function scope that owns a lexical binding.
    // This matters for VM(NONE): a native function already has real Lua
    // lexical captures. Bridging one of those captures through the VM cell
    // accessor is incorrect because no VM cell exists for the native local.
    // Keep the distinction explicit so a native nested callback remains a
    // normal Lua closure instead of becoming VM_NATIVE_UPVALUE_UNBOUND.
    function lexicalOwnerVmMode(id) {
        for (var i = lex.length - 1; i >= 0; i--) {
            if (lex[i].ids.has(id)) return lex[i].fn ? String(lex[i].vmMode || '').toUpperCase() : null;
        }
        return null;
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
        stackAllocIds.add(id);
        for (var i = lex.length - 1; i >= 0; i--) {
            if (lex[i].fn) { lex[i].stackIds.add(id); return; }
        }
    }
    function isStackAllocCallNode(n) {
        return !!(n && n.type === 'CallExpression' && n.base && n.base.type === 'Identifier' && ['VM_STACKALLOC', 'LPH_STACKALLOC'].includes(String(n.base.name).toUpperCase()));
    }
    function stackAllocInfo(n) {
        if (!isStackAllocCallNode(n)) return null;
        var a = n.arguments || [];
        if (!a.length || a[0].type !== 'NumericLiteral') return null;
        var size = Number(a[0].value);
        if (!Number.isInteger(size) || size < 1 || size > 256) return null;
        var zeroBased = !!(a[1] && a[1].type === 'NumericLiteral' && a[1].value === 0);
        if (a[1] && (a[1].type !== 'NumericLiteral' || ![0, 1].includes(a[1].value))) return null;
        return { size, zeroBased };
    }
    function isStackAllocIdentifier(n) {
        if (!n || n.type !== 'Identifier') return false;
        var r = resolve(n.name);
        return (r.kind === 'local' || r.kind === 'upval') && stackAllocIds.has(r.id);
    }
    function stackAllocInfoForIdentifier(n) {
        if (!isStackAllocIdentifier(n)) return null;
        var r = resolve(n.name);
        return stackAllocInfos.get(n.name) || stackAllocInfos.get(r.id) || null;
    }
    function containsForbiddenNativeCall(fnNode) {
        var forbidden = new Set(['LPH_ENCSTR', 'LPH_ENCBUF', 'LPH_ENCNUM', 'LPH_ENCFUNC', 'LPH_PRECHECK', 'LPH_REWRITE', 'LPH_CRASH', 'LPH_LINE', 'VM_STACKALLOC', 'LPH_STACKALLOC']);
        function walk(node, root) {
            if (!node || typeof node !== 'object') return false;
            if (!root && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression')) return false;
            if (node.type === 'CallExpression' && node.base && node.base.type === 'Identifier' && forbidden.has(String(node.base.name).toUpperCase())) return true;
            for (var k in node) {
                var v = node[k];
                if (Array.isArray(v) && v.some(function (child) { return walk(child, false); })) return true;
                if (v && typeof v === 'object' && v.type && walk(v, false)) return true;
            }
            return false;
        }
        return walk({ type: 'Block', body: fnNode.body || [] }, true);
    }
    function nativeStackCaptures(fnNode) {
        var captures = new Map();
        function walk(node, parent, key) {
            if (!node || typeof node !== 'object') return;
            var memberName = parent && parent.type === 'MemberExpression' && key === 'identifier';
            var tableKey = parent && (parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key';
            if (node.type === 'Identifier' && !memberName && !tableKey) {
                var r = resolve(node.name);
                if (r.kind === 'upval' && stackAllocIds.has(r.id) && !captures.has(node.name)) captures.set(node.name, r.id);
            }
            for (var k in node) {
                var v = node[k];
                if (Array.isArray(v)) v.forEach(function (child) { walk(child, node, k); });
                else if (v && typeof v === 'object' && v.type) walk(v, node, k);
            }
        }
        walk({ type: 'Block', body: fnNode.body || [] }, null, null);
        return Array.from(captures, function (entry) { return { name: entry[0], id: entry[1], kind: 'stack' }; });
    }
    // General upvalue captures for VM(NONE) functions. A nonvirtualized body is
    // emitted at loader top level, where a captured local would silently resolve
    // to a same-named global. The loader therefore publishes one proxy per
    // captured name whose __index/__newindex read and write the live VM cell,
    // so lexical lookup, mutation, sharing and lifetime stay exact. _ENV is the
    // real environment and is never bridged, and stack-allocated handles are
    // already handled by nativeStackCaptures.
    function nativeUpvalCaptures(fnNode) {
        var captures = new Map();
        // A named VM(NONE) function is emitted as a loader-level local with the
        // same name, so a self-reference (direct recursion) already resolves
        // lexically inside the native body. Bridging it would be wrong: the
        // enclosing cell is only created after the closure is built.
        var selfName = fnNode && fnNode.identifier && fnNode.identifier.type === 'Identifier' ? fnNode.identifier.name : null;
        function walk(node, parent, key) {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return;
            var memberName = parent && parent.type === 'MemberExpression' && key === 'identifier';
            var tableKey = parent && (parent.type === 'TableKey' || parent.type === 'TableKeyString') && key === 'key';
            if (node.type === 'Identifier' && !memberName && !tableKey && node.name !== '_ENV' && node.name !== selfName) {
                var r = resolve(node.name);
                // A sibling VM(NONE) function is NOT an upvalue cell. It is a
                // loader-level function, so rewriting it to a cell accessor
                // would read the wrong thing. Sibling references are emitted as
                // forward-declared locals instead (see nativeForwardDecls).
                // If the defining function is VM(NONE), this is already a
                // genuine Lua lexical upvalue. There is no VM cell to bridge,
                // so leave it alone. This is the important case for native
                // GUI callbacks such as dragStart: the callback can safely
                // capture the native parent's local directly.
                var ownerMode = lexicalOwnerVmMode(r.id);
                if (r.kind === 'upval' && ownerMode !== 'NONE' && !isVmNoneSiblingName(node.name) && !stackAllocIds.has(r.id) && !captures.has(node.name)) captures.set(node.name, r.id);
            }
            for (var k in node) {
                var v = node[k];
                if (Array.isArray(v)) v.forEach(function (child) { walk(child, node, k); });
                else if (v && typeof v === 'object' && v.type) walk(v, node, k);
            }
        }
        walk({ type: 'Block', body: fnNode.body || [] }, null, null);
        return Array.from(captures, function (entry) { return { name: entry[0], id: entry[1], kind: 'upval' }; });
    }
    // Names of VM(NONE) functions that are siblings of the function currently
    // being emitted. A sibling declared with `local a,b; a=function..` resolves
    // as a plain lexical local, so it must NOT be rewritten to a cell accessor
    // (which would read a VM cell instead of the loader-level function).
    // A forward reference through `local function a() ... b() ... end` is NOT
    // in scope in Lua and is deliberately left to fail as a global.
    var vmNoneSiblingNames = new Set();
    function isVmNoneSiblingName(name) { return vmNoneSiblingNames.has(name); }
    function captureRewriteGlobals(ctx, node, forcedNames) {
        var captured = new Map();
        function captureOne(name) {
            if (!name || captured.has(name) || resolve(name).kind !== 'global') return;
            var hiddenName = '\u0000lph_rw_' + name;
            var id = bindId(hiddenName);
            captured.set(name, id);
            ex(ctx, { type: 'Identifier', name: name }, { trunc: true });
            emit1(ctx, OPCODES.LNEW, id);
        }
        for (var forcedIndex = 0; forcedIndex < (forcedNames || []).length; forcedIndex++) captureOne(forcedNames[forcedIndex]);
        function walk(value) {
            if (!value || typeof value !== 'object') return;
            if (value.type === 'Identifier' && resolve(value.name).kind === 'global' && !captured.has(value.name)) {
                var hiddenName = '\u0000lph_rw_' + value.name;
                var id = bindId(hiddenName);
                captured.set(value.name, id);
                ex(ctx, { type: 'Identifier', name: value.name }, { trunc: true });
                emit1(ctx, OPCODES.LNEW, id);
            }
            for (var key of Object.keys(value)) {
                var child = value[key];
                if (Array.isArray(child)) child.forEach(walk);
                else if (child && typeof child === 'object' && child.type) walk(child);
            }
        }
        walk(node);
        function replace(value) {
            if (!value || typeof value !== 'object') return;
            if (value.type === 'Identifier' && captured.has(value.name)) {
                value.type = 'Identifier';
                value.name = '\u0000lph_rw_' + value.name;
                return;
            }
            for (var key of Object.keys(value)) {
                var child = value[key];
                if (Array.isArray(child)) child.forEach(replace);
                else if (child && typeof child === 'object' && child.type) replace(child);
            }
        }
        replace(node);
    }

    function newChunkCtx() {
        return { code: [], pc: 1, labels: [], labelPos: Object.create(null), loops: [], namedLabels: Object.create(null), pendingGotos: [] };
    }
    // Front-end IR: AST lowering emits target-independent instruction objects.
    // Numeric opcodes are introduced only by the production IR lowering pass.
    // SRC_LINE is the original source line of the AST node currently being
    // lowered. It is recorded on every instruction so the emitted VM can report
    // errors against original source locations (documented ERROR_HANDLING).
    function emit1(ctx, op, a) { ctx.code.push({ op: OPCODE_NAMES[op] || op, a: a, l: SRC_LINE }); ctx.pc += 2; }
    function emit0(ctx, op) { ctx.code.push({ op: OPCODE_NAMES[op] || op, l: SRC_LINE }); ctx.pc += 1; }
    function label(ctx) { var id = ctx.labels.length; ctx.labels.push([]); return id; }
    function mark(ctx, lbl) { ctx.labelPos[lbl] = ctx.pc; }
    function jref(ctx, op, lbl) {
        var at = ctx.code.length;
        ctx.code.push({ op: OPCODE_NAMES[op] || op, a: 0, l: SRC_LINE });
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
                ctx.code.push({op:'JMP',a:tr.target,l:ctx.code[tr.at].l});
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
            i += (op===jmp || op===OPCODES.JIF || op===OPCODES.JIT || op===OPCODES.JNIL || op===OPCODES.ANDK || op===OPCODES.ORK || op===OPCODES.LLOAD || op===OPCODES.LNEW || op===OPCODES.LSET || op===OPCODES.ULOAD || op===OPCODES.USET || op===OPCODES.GLOB || op===OPCODES.HGLOB || op===OPCODES.GSET || op===OPCODES.CONST || op===OPCODES.NUMK || op===OPCODES.UNPK || op===OPCODES.UNPKR || op===OPCODES.CALL || op===OPCODES.CALLM || op===OPCODES.PCALL || op===OPCODES.XPCALL || op===OPCODES.TAILCALL || op===OPCODES.RET || op===OPCODES.RETP || op===OPCODES.NEWF || op===OPCODES.STACKNEW || op===OPCODES.STACKGET || op===OPCODES.STACKSET || op===OPCODES.STACKADAPT ? 2 : 1);
        }
        for (var ni=0; ni<trampolines2.length; ni++) { var nr=trampolines2[ni], npc=ctx.code.length+1; ctx.code[nr.at]=npc; ctx.code.push(jmp,nr.target); added++; }
        // numeric-form trampolines keep the line map aligned; nothing to do.
        return added;
    }

    function ex(ctx, n, fl) {
        syncSrcLine(n);
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
                if (n.name === 'LPH_OBFUSCATED') {
                    emit0(ctx, obfuscated ? OPCODES.TRUE : OPCODES.FALSE);
                    return;
                }
                var r = resolve(n.name);
                if (precheckDepth > 0 && n.name === '_ENV') { emit0(ctx, OPCODES.ENVLOAD); return; }
                if (r.kind === 'local') emit1(ctx, OPCODES.LLOAD, r.id);
                else if (r.kind === 'upval') {
                    if (precheckDepth > 0 && n.name === '_ENV') { emit0(ctx, OPCODES.ENVLOAD); return; }
                    if (precheckDepth > 0) throw new Error('LPH_PRECHECK functions may only access _ENV, not captured upvalues');
                    if (currentFuncMeta() && currentFuncMeta().NO_UPVALUES === true) throw new Error('NO_UPVALUES function captures ' + n.name);
                    emit1(ctx, OPCODES.ULOAD, r.id);
                }
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
                else if (n.operator === '~') emit0(ctx, OPCODES.BNOT);
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
            if (isLast && (isExpandingCallNode(a) || isVarargNode(a))) {
                if (isExpandingCallNode(a)) ex(ctx, a, { multi: 'multi' }); // packed
                else emit0(ctx, OPCODES.VARGP);
                return { fixed: fixed + 1, packed: true }; // packed = 1 slot
            }
            ex(ctx, a, { trunc: true });
            fixed++;
        }
        return { fixed: fixed, packed: false };
    }

    function emitRuntimeKeyCheck(ctx, keyNode, runtimeNode, badLabel) {
        const key = keyNode && keyNode.type === 'StringLiteral' ? rawToStr(keyNode.raw) : null;
        if (key && /^\{[0-9a-fA-F]{64}\}$/.test(key)) {
            ex(ctx, runtimeNode, { trunc: true });
            for (let i = 0; i < 32; i++) {
                emit0(ctx, OPCODES.DUP);
                emit1(ctx, OPCODES.NUMK, addConstS(String(i + 1)));
                emit0(ctx, OPCODES.TGET);
                emit1(ctx, OPCODES.NUMK, addConstS(String(parseInt(key.slice(1 + i * 2, 3 + i * 2), 16))));
                emit0(ctx, OPCODES.EQ);
                jref(ctx, OPCODES.JIF, badLabel);
            }
            emit0(ctx, OPCODES.POP);
            return;
        }
        ex(ctx, runtimeNode, { trunc: true });
        ex(ctx, keyNode, { trunc: true });
        emit0(ctx, OPCODES.EQ);
        jref(ctx, OPCODES.JIF, badLabel);
    }

    function compileCall(ctx, n, fl) {
        var wantMulti = fl && (fl.multi === 'multi');
        var base = n.base;
        var args = n.arguments || [];
        if (isStackAllocCallNode(base)) {
            var directInfo = stackAllocInfo(base);
            if (!directInfo) throw new Error('STACKALLOC size must be an integer from 1 to 256 and mode must be 0 or 1');
            stackallocFallback++;
            emit0(ctx, OPCODES.NEWTAB);
            emit1(ctx, OPCODES.STACKADAPT, directInfo.size + (directInfo.zeroBased ? 256 : 0));
            for (var directI = 0; directI < directInfo.size; directI++) {
                emit0(ctx, OPCODES.DUP);
                emit1(ctx, OPCODES.NUMK, addConstS(String(directInfo.zeroBased ? directI : directI + 1)));
                emit0(ctx, OPCODES.NIL);
                emit0(ctx, OPCODES.TSET);
            }
            return;
        }
        if (base && base.type === 'Identifier' && isPublicMacro(base.name)) {
            var macro = validatePublicMacro(base.name, n, targetName);
            if (macro === 'LPH_PRECHECK') {
                const expectedValues = precheckExpectedValues(args[1]);
                const chunk = compileFunctionChunk(args[0], true);
                prechecks.push({ chunk, expected: expectedValues.map((value) => addConstS(String(value))), expectedRaw: expectedValues.slice(), array: args[1].type === 'TableConstructorExpression' });
                emit0(ctx, OPCODES.TRUE);
                return;
            }
            if (macro === 'LPH_CRASH') {
                // Documented: securely crash the VM and corrupt the VM context.
                // Pure-Lua `error()` is catchable by pcall, so LPH_CRASH raises
                // a marked table that the scheduler recognizes as a VM-context
                // crash: it corrupts REG/FRAMES, sets DONE, and re-raises past
                // all VM-level pcall/xpcall handlers. Host-level pcall may
                // still observe the final "LPH_CRASH" string, but the VM
                // context is already invalidated so execution cannot continue
                // normally (see scheduler crash guard).
                emit0(ctx, OPCODES.CRASH);
                return;
            }
            if (macro === 'LPH_LINE') {
                if (args.length === 1) ex(ctx, args[0], { trunc: true });
                else emit1(ctx, OPCODES.NUMK, addConstS(String(n.loc?.start?.line || 0)));
                return;
            }
            if (macro === 'LPH_REWRITE') {
                var originalRewriteGlobals = [];
                (function collectRewriteGlobals(value) {
                    if (!value || typeof value !== 'object') return;
                    if (value.type === 'Identifier' && resolve(value.name).kind === 'global' && !originalRewriteGlobals.includes(value.name)) originalRewriteGlobals.push(value.name);
                    for (var gk in value) { var gv = value[gk]; if (Array.isArray(gv)) gv.forEach(collectRewriteGlobals); else if (gv && typeof gv === 'object' && gv.type) collectRewriteGlobals(gv); }
                })(args[0]);
                const rewriteOptions = rewritePublicOptions(args[1]);
                var rewriteResult = rewritePublicExpression(args[0], {
                    seed: (seedForTransforms + rewriteCounter++) >>> 0,
                    profileName,
                    target: targetName,
                    budget: rewriteOptions.budget || 'MEDIUM',
                    strength: rewriteOptions.preset === 'FAST' ? 1 : rewriteOptions.preset === 'STRONG' ? 3 : rewriteOptions.preset === 'EXTREME' ? 4 : 2,
                });
                rewriteStats.push(rewriteResult.stats);
                captureRewriteGlobals(ctx, args[0], originalRewriteGlobals);
                ex(ctx, args[0], { trunc: true });
                return;
            }
            if (macro === 'LPH_ENCSTR' || macro === 'LPH_ENCBUF' || macro === 'LPH_ENCNUM') {
                var isEncbuf = (macro === 'LPH_ENCBUF');
                var emitEncbufConvert = function () {
                    // Luau-only native buffer: type() must be "buffer" on Luau.
                    // Stack: [str] -> [buffer.fromstring(str)] when the Luau
                    // buffer library exists; otherwise leave [str] so the
                    // existing fengari/5.x harnesses (which lack `buffer`)
                    // keep executing string semantics. Compile-time target
                    // check still rejects non-Luau targets.
                    var fb = label(ctx);
                    var dn = label(ctx);
                    emit1(ctx, OPCODES.GLOB, addConstS('buffer'));
                    emit0(ctx, OPCODES.DUP);
                    jref(ctx, OPCODES.JIF, fb);
                    emit1(ctx, OPCODES.CONST, addConstS('fromstring'));
                    emit0(ctx, OPCODES.TGET);
                    emit0(ctx, OPCODES.SWAP);
                    emit1(ctx, OPCODES.CALL, 1);
                    jref(ctx, OPCODES.JMP, dn);
                    mark(ctx, fb);
                    emit0(ctx, OPCODES.POP);
                    mark(ctx, dn);
                };
                if (args.length === 3) {
                    const bad = label(ctx);
                    const done = label(ctx);
                    emitRuntimeKeyCheck(ctx, args[1], args[2], bad);
                    ex(ctx, args[0], { trunc: true });
                    if (isEncbuf) emitEncbufConvert();
                    jref(ctx, OPCODES.JMP, done);
                    mark(ctx, bad);
                    emit1(ctx, OPCODES.GLOB, addConstS('error'));
                    emit1(ctx, OPCODES.CONST, addConstS(macro));
                    emit1(ctx, OPCODES.CALL, 1);
                    mark(ctx, done);
                    return;
                }
                if (args.length === 2 && macro === 'LPH_ENCNUM') {
                    const bad = label(ctx);
                    const done = label(ctx);
                    for (const field of args[1].fields || []) {
                        ex(ctx, field.key, { trunc: true });
                        ex(ctx, field.value, { trunc: true });
                        emit0(ctx, OPCODES.EQ);
                        jref(ctx, OPCODES.JIF, bad);
                    }
                    ex(ctx, args[0], { trunc: true });
                    jref(ctx, OPCODES.JMP, done);
                    mark(ctx, bad);
                    emit1(ctx, OPCODES.GLOB, addConstS('error'));
                    emit1(ctx, OPCODES.CONST, addConstS(macro));
                    emit1(ctx, OPCODES.CALL, 1);
                    mark(ctx, done);
                    return;
                }
            }
            // These macros intentionally share the normal protected lowering:
            // literals enter the encrypted vault and functions become VM NEWF.
            ex(ctx, args[0], { trunc: true });
            if (macro === 'LPH_ENCBUF') emitEncbufConvert();
            return;
        }
        if (base && base.type === 'MemberExpression' && base.indexer === ':' && base.base && base.base.type === 'Identifier') {
            var stackMethod = String(base.identifier && base.identifier.name || '').toLowerCase();
            var stackInfo = stackAllocInfoForIdentifier(base.base);
            if (stackInfo && (stackMethod === 'pack' || stackMethod === 'unpack' || stackMethod === 'clear')) {
                if (args.length > 2) throw new Error('LPH_STACKALLOC.' + stackMethod + ' accepts at most two bounds');
                ex(ctx, base.base, { trunc: true });
                if (args.length >= 1) ex(ctx, args[0], { trunc: true }); else emit0(ctx, OPCODES.NIL);
                if (args.length >= 2) ex(ctx, args[1], { trunc: true }); else emit0(ctx, OPCODES.NIL);
                if (stackMethod === 'pack') emit0(ctx, OPCODES.STACKPACK);
                else if (stackMethod === 'unpack') {
                    emit0(ctx, OPCODES.STACKUNPACK);
                    if (!wantMulti) emit0(ctx, OPCODES.UNPK1F);
                } else {
                    emit0(ctx, OPCODES.STACKCLEAR);
                    if (!wantMulti) emit0(ctx, OPCODES.UNPK1F);
                }
                return;
            }
        }
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
            // PCALL/XPCALL always leave one packed marked results table on
            // the stack (FINISH packs prot frames; the host path packs q).
            // Single-value positions must truncate to the first value.
            if (!wantMulti) emit0(ctx, OPCODES.UNPK1F);
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
            '<': 'LT', '<=': 'LE', '>': 'GT', '>=': 'GE',
                '&': 'BAND', '|': 'BOR', '~': 'BXOR', '<<': 'SHL', '>>': 'SHR'
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
                if (isLast && (isExpandingCallNode(v) || isVarargNode(v))) {
                    emit0(ctx, OPCODES.DUP);
                    if (isExpandingCallNode(v)) ex(ctx, v, { multi: 'multi' });
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
        syncSrcLine(s);
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
                    if (sai && !stackAllocEscaped.has(stackOriginName(vars[0].name)) && !stackShadowed.has(vars[0].name) && (!currentFuncMeta() || currentFuncMeta().STACKALLOC !== false)) {
                        var sid = bindId(vars[0].name);
                        emit1(ctx, OPCODES.STACKNEW, sai.size + (sai.zeroBased ? 256 : 0));
                        emit1(ctx, OPCODES.LNEW, sid);
                        markStackLocal(sid);
                        stackAllocInfos.set(sid, sai);
                        stackAllocInfos.set(vars[0].name, sai);
                        stackallocTrue++;
                    } else if (stackAllocInfoForIdentifier(ini) && !stackAllocEscaped.has(stackOriginName(ini.name)) && !stackShadowed.has(ini.name)) {
                        var aliInfo = stackAllocInfoForIdentifier(ini);
                        ex(ctx, ini, { trunc: true });
                        var aliasId = bindId(vars[0].name);
                        emit1(ctx, OPCODES.LNEW, aliasId);
                        markStackLocal(aliasId);
                        stackAllocInfos.set(aliasId, aliInfo);
                        stackAllocInfos.set(vars[0].name, aliInfo);
                    } else if (isStackAllocCallNode(ini)) {
                        var invalidStackSize = !ini.arguments[0] || ini.arguments[0].type !== 'NumericLiteral' || !Number.isInteger(ini.arguments[0].value) || ini.arguments[0].value < 1 || ini.arguments[0].value > 256;
                        var invalidStackMode = ini.arguments[1] && (ini.arguments[1].type !== 'NumericLiteral' || ![0, 1].includes(ini.arguments[1].value));
                        if (invalidStackSize) throw new Error((ini.base && ini.base.name ? ini.base.name : 'STACKALLOC') + ' size must be an integer from 1 to 256');
                        if (invalidStackMode) throw new Error((ini.base && ini.base.name ? ini.base.name : 'STACKALLOC') + ' zeroOrOne must be 0 or 1');
                        stackallocFallback++;
                        // Safe fallback for an escaping/unsupported allocation:
                        // a normal table plus the proxy adapter preserves the
                        // public operations without leaking a numeric handle.
                        emit0(ctx, OPCODES.NEWTAB);
                        var fbSize = Number(ini.arguments[0].value);
                        var fbZero = !!(ini.arguments[1] && ini.arguments[1].type==='NumericLiteral' && ini.arguments[1].value===0);
                        emit1(ctx, OPCODES.STACKADAPT, fbSize + (fbZero ? 256 : 0));
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
                var expand = isExpandingCallNode(lastE) || isVarargNode(lastE);
                var fixedCount = expand ? inits.length - 1 : inits.length;
                var tmpIds = [];
                for (var i2 = 0; i2 < fixedCount; i2++) {
                    ex(ctx, inits[i2], { trunc: true });
                    var tid = bindId('\x00t' + (hiddenCounter++));
                    emit1(ctx, OPCODES.LNEW, tid);
                    tmpIds.push(tid);
                }
                if (expand) {
                    if (isExpandingCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' });
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
                if (s.expression && s.expression.base && s.expression.base.type === 'Identifier' && s.expression.base.name === 'LPH_ATTRIBUTES') return;
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
                ctx.code.push({ op: 'JMP', a: 0, l: SRC_LINE });
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
        var expand = isExpandingCallNode(lastE) || isVarargNode(lastE);
        var tmpIds = [];
        var fixedCount = expand ? inits.length - 1 : inits.length;
        var packedLocalId = null;
        for (var i = 0; i < inits.length; i++) {
            if (i === lastI && expand) {
                if (isExpandingCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' }); // packed on top
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
        var expand = isExpandingCallNode(lastE) || isVarargNode(lastE);
        var fixedCount = expand ? args.length - 1 : args.length;
        if (expand && fixedCount === 0) {
            // return f(...) / return ...
            if (isExpandingCallNode(lastE)) {
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
                if (isExpandingCallNode(lastE)) ex(ctx, lastE, { multi: 'multi' });
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
        if (its.length === 1 && isExpandingCallNode(its[0])) {
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

    function compileFunctionChunk(fnNode, isPrecheck) {
        var params = [];
        var hasVararg = false;
        pushFn();
        funcMetaStack.push(perFuncMeta.get(fnNode) || null);
        var fnMeta = currentFuncMeta() || {};
        var defaultVmMode = String(architecture === 'ONYX' ? 'ONYX' : 'OPAL').toUpperCase();
        var vmMode = String(fnMeta.VM || defaultVmMode).toUpperCase();
        // Record the owning mode on the lexical function scope before capture
        // analysis of nested functions. Native (VM/NONE) parents must keep
        // native Lua upvalues native; virtual parents still use the VM bridge.
        lex[lex.length - 1].vmMode = vmMode;
        var fnTransforms = fnMeta.TRANSFORM == null ? [] : (Array.isArray(fnMeta.TRANSFORM) ? fnMeta.TRANSFORM : [fnMeta.TRANSFORM]);
        var transformName = (item) => typeof item === 'string' ? item : (item && item.name) || '';
        // Renders a source range with every recorded edit/insert of the given
        // transforms already applied. Each native transform renders its copied
        // text through the transforms that already ran, so composition is
        // deterministic and a later transform never undoes an earlier one.
        function makeRenderer(results) {
            var edits = [];
            for (var ri = 0; ri < results.length; ri++) {
                var r = results[ri];
                if (!r) continue;
                for (var ei = 0; ei < (r.edits || []).length; ei++) edits.push(r.edits[ei]);
                for (var ii = 0; ii < (r.inserts || []).length; ii++) edits.push({ start: r.inserts[ii].position, end: r.inserts[ii].position, text: r.inserts[ii].text });
            }
            if (!edits.length) return function (start, end) { return sourceForParse.slice(start, end); };
            return function (start, end) {
                var out = '';
                var cur = start;
                var inside = edits.filter((e) => e.start >= start && e.end <= end).sort((a, b) => a.start - b.start || a.end - b.end);
                for (var bi = 0; bi < inside.length; bi++) {
                    var e = inside[bi];
                    if (e.start < cur) continue;
                    out += sourceForParse.slice(cur, e.start) + e.text;
                    cur = e.end;
                }
                return out + sourceForParse.slice(cur, end);
            };
        }
        // The VM(NONE) upvalue bridge must be planned from the PRISTINE AST,
        // before EXTRACT or REWRITE_NAMECALLS splice synthesized statements in.
        // Their nodes carry no original source text, so rewriting them later
        // would both corrupt ranges and duplicate the receiver text.
        var upvalCaptures = [];
        var bridgeResult = { changed: false, count: 0, fnStart: 0, edits: [], inserts: [] };
        if (vmMode === 'NONE') {
            upvalCaptures = nativeUpvalCaptures(fnNode);
            var captureIndex = {};
            for (var uci = 0; uci < upvalCaptures.length; uci++) captureIndex[upvalCaptures[uci].name] = true;
            bridgeResult = bridgeNativeUpvalues(fnNode, {
                source: sourceForParse,
                captures: captureIndex,
                upAccessor: NATIVE_UP_READ,
                setAccessor: NATIVE_UP_SET,
            });
        }
        var extractSpec = fnTransforms.map(transformName).includes('EXTRACT') ? fnTransforms.find((item) => transformName(item) === 'EXTRACT') : null;
        var extractResult = null;
        if (extractSpec) {
            extractResult = applyExtractTransform(fnNode, { resolve, source: sourceForParse, mode: typeof extractSpec === 'string' ? { options: ['GLOBALS', 'CONSTANTS'] } : extractSpec });
            extractStats.push({ constants: extractResult.constants, globals: extractResult.globals, changed: extractResult.changed, vm: vmMode });
        }
        var namecallSpec = fnTransforms.map(transformName).includes('REWRITE_NAMECALLS');
        var namecallResult = null;
        if (namecallSpec) {
            // A receiver range already rewritten by the upvalue bridge must not
            // be rewritten again here, and a copied receiver must copy the
            // bridged text. Both are handled by rendering through the bridge.
            var bridgeText = makeRenderer([bridgeResult, extractResult]);
            namecallResult = applyRewriteNamecalls(fnNode, {
                source: sourceForParse,
                renderText: bridgeText,
                overlapsRewrite: (start, end) => bridgeResult.edits.some((e) => e.start < end && start < e.end),
            });
            // Drop bridge edits that fall inside a receiver the namecall
            // transform copied into a temporary; that text is emitted through
            // bridgeText already, so rewriting the original again would double
            // the substitution.
            if (namecallResult.receivers && namecallResult.receivers.length) {
                bridgeResult = {
                    changed: bridgeResult.changed,
                    count: bridgeResult.count,
                    fnStart: bridgeResult.fnStart,
                    edits: bridgeResult.edits.filter((e) => !namecallResult.receivers.some((r) => e.start >= r.start && e.end <= r.end)),
                    inserts: bridgeResult.inserts,
                };
            }
            namecallStats.push({ count: namecallResult.count, skipped: namecallResult.skipped, changed: namecallResult.changed, vm: vmMode });
        }
        // Transforms that rewrite the AST or the instruction stream cannot apply
        // to a VM(NONE) body, because that body is emitted as loader-level
        // native source and never becomes a chunk.
        //
        // CONTROL_FLOW used to be refused outright. It now has a genuine native
        // implementation (src/transform/control-flow.js) that flattens
        // if/elseif/else chains into state-dispatch loops. It still fails closed
        // when semantics cannot be preserved -- a branch body containing break /
        // continue / goto is not relocated, because those statements target an
        // enclosing construct and moving them would silently retarget them.
        var nativeInapplicable = fnTransforms.some(function (item) {
            var n = transformName(item);
            return n !== 'EXTRACT' && n !== 'REWRITE_NAMECALLS' && n !== 'CONTROL_FLOW';
        });
        if (vmMode === 'NONE' && nativeInapplicable) {
            var names = fnTransforms.map(transformName).filter(function (n) { return n !== 'EXTRACT' && n !== 'REWRITE_NAMECALLS' && n !== 'CONTROL_FLOW'; });
            throw new Error('TRANSFORM(' + names.join(',') + ') is not applicable to VM(NONE) functions: a VM(NONE) body is emitted as native source and has no instruction stream to transform');
        }
        if (fnNode.identifier && fnNode.identifier.type === 'MemberExpression' && fnNode.identifier.indexer === ':') {
            params.push(bindId('self'));
        }
        var plist = fnNode.parameters || [];
        for (var i = 0; i < plist.length; i++) {
            var p = plist[i];
            if (isVarargNode(p)) hasVararg = true;
            else params.push(bindId(p.name));
        }
        if (vmMode === 'NONE') {
            // Documented: nonvirtualized functions cannot use ERROR_HANDLING,
            // because their errors already originate in real host source.
            if (fnMeta.ERROR_HANDLING != null) throw new Error('ERROR_HANDLING cannot be used on nonvirtualized (VM(NONE)) functions');
            var slot = nativeFns.length + 1;
            var nativeBaseSource = (extractResult || namecallResult || upvalCaptures.length) ? sourceForParse : src;
            var bridgeResult = bridgeNativeUpvalues(fnNode, {
                source: nativeBaseSource,
                captures: captureIndex,
                upAccessor: NATIVE_UP_READ,
                setAccessor: NATIVE_UP_SET,
            });
            var nativeSource = sourceSliceForNode(nativeBaseSource, fnNode) || ('local __vm_none_' + slot + '=function(...) end');
            // Absolute offset of this function in the ORIGINAL source, taken from
            // the AST location rather than by searching for the sliced text.
            // Every span the CONTROL_FLOW planner records is anchored here, so
            // this must be exact: indexOf would match an earlier identical
            // substring and silently misplace every span.
            var nativeFnStart = sourceStartOffsetOf(nativeBaseSource, fnNode);
            var nativeFnEnd = (fnNode && fnNode.loc && fnNode.loc.end)
                ? sourceOffsetFactory(nativeBaseSource)(fnNode.loc.end.line, fnNode.loc.end.column)
                : nativeBaseSource.length;
            var wantsControlFlow = fnTransforms.some(function (item) { return transformName(item) === 'CONTROL_FLOW'; });
            if (extractResult || namecallResult || bridgeResult.changed) {
                nativeSource = applySourceOps(nativeSource, [extractResult, namecallResult, bridgeResult], 'TRANSFORM');
            }
            if (bridgeResult.changed) upvalBridgeStats.push({ slot: slot, rewrites: bridgeResult.count, vm: vmMode });
            nativeSource = stripAttributeStatementFromSource(nativeSource, fnNode, nativeBaseSource);
            // CONTROL_FLOW runs LAST, on the final emitted text, and re-parses it.
            //
            // The earlier revision planned against pristine AST spans and rendered
            // branch text through a callback that applied the other transforms.
            // That is unsound: those transforms change text LENGTH, so slicing a
            // sub-range by its ORIGINAL offsets out of the rewritten text tears the
            // text apart (observed: a condition rendered as `(__lph) and 1 or (2)`
            // with the remainder of the rewrite appearing elsewhere in the body).
            // Running last means exactly one coordinate system is in play and no
            // rebase is needed. The cost is one extra parse of a single body.
            if (wantsControlFlow) {
                var cf = flattenNativeSource(nativeSource, {
                    parse: function (s) { return resolveLuaparse().parse(s, { luaVersion: targetVersion, locations: true }); },
                    seed: seed,
                });
                if (cf.reason) {
                    // Fail closed for the WHOLE function. A partial transform would
                    // report success while leaving some chains unflattened, which is
                    // exactly the silent-skip failure this must not have.
                    throw new Error('CONTROL_FLOW cannot preserve semantics for this VM(NONE) function: ' + cf.reason);
                }
                if (cf.changed) {
                    nativeSource = cf.text;
                    controlFlowStats.push({ vm: vmMode, slot: slot, chains: cf.chains, flattened: cf.flattened, native: true });
                }
            }
            if (containsForbiddenNativeCall(fnNode)) {
                throw new Error('public LPH macros are not valid inside VM=NONE functions');
            }
            var nativeName = functionNameForNode(fnNode, slot);
            var nativeDeclaration = nativeSource;
            if (!fnNode.identifier) nativeDeclaration = 'local ' + nativeName + '=' + nativeSource;
            nativeFns.push({
                slot: slot,
                name: nativeName,
                source: nativeDeclaration,
                stackCaptures: nativeStackCaptures(fnNode),
                upvalCaptures: upvalCaptures,
            });
            popFn();
            funcMetaStack.pop();
            return -slot;
        }
        if (isPrecheck) precheckDepth++;
        var ctx = newChunkCtx();
        var fnBody = (fnNode.body || []).slice();
        if (isAttributeStatement(fnBody[0])) fnBody.shift();
        pushBlock();
        body(ctx, fnBody);
        emit1(ctx, OPCODES.RET, 0);
        popBlock();
        var chunkMeta = {
            vm: String(fnMeta.VM || defaultVmMode).toUpperCase(),
            preset: String(fnMeta.PRESET || (fnMeta.VM === 'ONYX' ? 'SECURE' : profileName)).toUpperCase(),
            transform: fnMeta.TRANSFORM || null,
            inline: fnMeta.INLINE !== false,
            unroll: fnMeta.UNROLL !== false,
            mba: fnMeta.MBA !== false,
            stackalloc: fnMeta.STACKALLOC !== false,
            precheck: !!(isPrecheck || precheckDepth > 0),
            // Documented ERROR_HANDLING default is true: virtualized runtime
            // errors report original source line information.
            errorHandling: fnMeta.ERROR_HANDLING === false ? false : true,
        };
        popFn();
        funcMetaStack.pop();
        if (isPrecheck) precheckDepth--;
        patchNamedGotos(ctx);
        patchLabels(ctx);
        if (!fnTransforms.length || fnTransforms.some((item) => transformName(item) === 'CONTROL_FLOW')) applySafeCfgRewriting(ctx);
        // 1-based chunk index in the emitted Lua table
        var ci = chunks.length + 1;
        chunks.push({
            code: ctx.code,
            params: params,
            vararg: hasVararg,
            meta: chunkMeta,
        });
        if (!isPrecheck && fnNode.identifier && fnNode.identifier.type === 'Identifier' && !vmBridges.some((b) => b.name === fnNode.identifier.name)) {
            vmBridges.push({ name: fnNode.identifier.name, chunk: ci });
        }
        return ci;
    }

    // ---- collect VM(NONE) sibling names -----------------------------------
    // A VM(NONE) body is emitted as loader-level source, outside the lexical
    // scope of the chunk that creates it. A reference to a VM(NONE) SIBLING
    // declared in the canonical `local a,b; a=function..` form resolves as a
    // plain lexical local, so rewriting it to an upvalue cell accessor would
    // read the wrong thing. Recording the names lets nativeUpvalCaptures leave
    // those references alone.
    (function collectVmNoneNames(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (var q = 0; q < node.length; q++) collectVmNoneNames(node[q]); return; }
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
            var meta = perFuncMeta.get(node);
            if (meta && String(meta.VM || '').toUpperCase() === 'NONE' && node.identifier && node.identifier.type === 'Identifier') {
                vmNoneSiblingNames.add(node.identifier.name);
            }
        }
        for (var k in node) {
            if (k === 'loc' || k === 'range' || k === 'comments') continue;
            var v = node[k];
            if (v && typeof v === 'object') collectVmNoneNames(v);
        }
    })(ast);

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
    chunks.push({
        code: topCtx.code,
        params: [],
        vararg: false,
        meta: {
            vm: String(architecture === 'ONYX' ? 'ONYX' : 'OPAL').toUpperCase(),
            preset: String(profileName).toUpperCase(),
            transform: null,
            inline: true,
            unroll: true,
            mba: true,
            stackalloc: true,
            precheck: false,
        },
    });

    // Production compiler pipeline: the legacy AST emitter produces the initial
    // scheduler-compatible instruction stream, which is immediately promoted to
    // target-independent IR, CFG, optimizer/allocation analysis, concrete VM
    // transforms, and lowered back to the same scheduler bytecode ABI.
    var pipeline = runProductionPipeline({ chunks, OPCODES, seed, profileName, hiddenIds, refs, vaultPlain, disableFolding: opts.unroll === true, hardenOff: opts.hardenOff === true, scrambleOff: opts.scrambleOff === true });

    var constPool = buildConstantPool({ vaultPlain: vaultPlain, refs: refs, seed: seed, profileName: profileName });
    var nativeSourceText = nativeFns.map((fn) => String(fn.source || '')).join('\n');
    var bridgeRefs = vmBridges.filter((bridge) => new RegExp('\\b' + String(bridge.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(nativeSourceText));
    return { chunks: chunks, nativeFns: nativeFns, vmBridges: bridgeRefs, vmNoneNames: Array.from(vmNoneSiblingNames), vaultPlain: vaultPlain, refs: refs, prechecks: prechecks, obfuscated: obfuscated, seed: seed, OPCODES: OPCODES, constPool: constPool, profileName: profileName, architecture: architecture, compatibility: compatibility, staticEnv: staticEnv, debugProtect: debugProtect, hardCodeGlobals: hardCodeGlobals, hardGlobalWrites: Array.from(hardGlobalWrites), target: targetName, targetVersion: targetMod.TARGET.version, cfgRewrite: opts.cfgRewrite !== false, pipeline: pipeline.pipeline, inline: inlineStats, unroll: unrollStats, rewrite: rewriteStats, extract: extractStats, namecall: namecallStats, upvalBridge: upvalBridgeStats, stackalloc: { true: stackallocTrue, fallback: stackallocFallback } };
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
    var format = instructionFormat(build.architecture, seed);
    var vmVariant = pickVariant(seed, profileName);
    var frameStride = vmVariant.name === 'FAST_VM' ? 512 : (vmVariant.name === 'SECURE_VM' ? 1024 : 768);
    // Dispatch topology is chosen per build and is independent of the
    // ONYX/OPAL instruction format. Previously ONYX was pinned to branch
    // dispatch and every non-table strategy was collapsed into it, so only two
    // shapes were ever emitted and NUMERIC/STATE_OP/MIXED were unreachable.
    var dispatcherStrategy = pickDispatcher(seed, profileName);
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
    var REG = nm('rg'), FRAMES = nm('fr'), FP = nm('fp'), BASE = nm('ba'), TOP = nm('to'), STACK_META = nm('sm'), STACK_STORAGE = nm('ss'), STACK_NEXT = nm('sn');
    var OWNER = nm('ow'), CUR = nm('cu'), NEXTBASE = nm('nb'), VMFN = nm('vf'), VMFUN = nm('vfm'), INVOKE = nm('ivk'), SCHED = nm('sch'), PUSHF = nm('pf'), POPF = nm('xf'), STACK_CTX = nm('sx'), STACK_BRIDGE = nm('sb'), NATIVE_STACK_META = nm('nm');
    var ROOTTHREAD='__vms_root_thread', ROOTSTATE='__vms_root_state', COSTATES='__vms_cor_states', ACTIVE='__vms_active_state', SAVEVM='__vms_save_state', LOADVM='__vms_load_state';
    var SAVEF = nm('sf'), LOADF = nm('lf'), FINISH = nm('rt'), DONE = nm('dn'), RESULT = nm('rs'), POISON = nm('pz'), HOST_ERROR = 'HOST_ERROR';
    // XS: per-call scratch state for the unguarded host-call path. Named separately
    // from SAVEF/ACTIVE because those hold a different thing (a frame vs the whole
    // register set) and reusing either would corrupt the other path.
    var XS = nm('xs');
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
// ERROR_HANDLING support: SRCL holds the original source line of the
// instruction currently executing (nil when the chunk opted out), and FIXERR
// rewrites a host error position from the artifact line to the original line.
var SRCL = nm('sl'), FIXERR = nm('fe');
L.push('local ' + SRCL + '=nil');
L.push('local ' + FIXERR + '=function(m) if type(m)~="string" or not ' + SRCL + ' then return m end local a,b,r=m:match("^(.*):(%d+): (.*)$") if not a then return m end if tonumber(b)==' + SRCL + ' then return m end return a..":"..' + SRCL + '..": "..r end');
    L.push('local ' + HOST_ERROR + '=error');
    function lowerNativeLengths(text, name) {
        var out = '', i = 0, quote = null;
        while (i < text.length) {
            var ch = text[i];
            if (quote) {
                out += ch;
                if (ch === quote && text[i - 1] !== '\\') quote = null;
                i++;
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
            if (ch === '-' && text[i + 1] === '-') {
                var stop = text.indexOf('\n', i + 2); if (stop < 0) stop = text.length;
                out += text.slice(i, stop); i = stop; continue;
            }
            if (ch === '#') {
                var j = i + 1; while (j < text.length && /\s/.test(text[j])) j++;
                if (text.slice(j, j + name.length) === name && !/[A-Za-z0-9_]/.test(text[j + name.length] || '')) {
                    out += STACK_BRIDGE + '.len(' + STACK_BRIDGE + '.handle("' + name + '"))'; i = j + name.length; continue;
                }
            }
            out += ch; i++;
        }
        return out;
    }
    var BIT = nm('bt');
    if (build.target === 'lua53' || build.target === 'lua54') {
        L.push('local ' + BIT + '=function(k,a,b) if k==1 then return a&b elseif k==2 then return a|b elseif k==3 then return a~b elseif k==4 then return a<<b elseif k==5 then return ~a elseif k==6 then return a>>b end return a end');
    } else {
        L.push('local ' + BIT + '=function(k,a,b) local it=math.tointeger local function iv(v) v=tonumber(v) if not v or v~=v or v==math.huge or v==-math.huge or v%1~=0 then error("VM_REWRITE_INTEGER",0) end return v end local u=function(v) v=math.floor(iv(v))%4294967296 return v end local s=function(v) v=u(v) if v>=2147483648 then v=v-4294967296 end return it and it(v) or v end a=u(a) if k==5 then return s(-a-1) end b=iv(b) if k==4 then if b<0 then return s(math.floor(a/(2^(-b)))) end if b>=32 then return 0 end return s((a%(2^(32-b)))*(2^b)) end if k==6 then if b<0 then local q=-b if q>=32 then return 0 end return s((a%(2^q))*(2^q)) end if b>=32 then return 0 end return s(math.floor(a/(2^b))) end local r,p=0,1 for i=1,32 do local x=a%2 local y=b%2 if (k==1 and x==1 and y==1) or (k==2 and (x==1 or y==1)) or (k==3 and x~=y) then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return s(r) end');
    }
    // ---- per-build value-operation combinators ---------------------------
    // Every arithmetic, comparison, concatenation and unary handler used to
    // carry its operator literally in the handler body (`S[SP]=a + b`), so a
    // single AST pass could name the operation behind almost every opcode. The
    // operators now live in a small number of generated group functions whose
    // membership, tags and argument order all vary per build; handlers only
    // reference a group and a tag.
    //
    // This works within a hard limit: for values not known at emit time, an
    // operation cannot be expressed without its operator appearing somewhere in
    // executable form. What can be hidden is WHICH opcode means WHICH
    // operation, so the per-build grouping, tag permutation and argument order
    // are all aimed at that association.
    var OPM_OPS = [
        { n: 'ADD', s: '+', k: 2, comm: true },
        { n: 'SUB', s: '-', k: 2, comm: false },
        { n: 'MUL', s: '*', k: 2, comm: true },
        { n: 'DIV', s: '/', k: 2, comm: false },
        { n: 'MOD', s: '%', k: 2, comm: false },
        { n: 'POW', s: '^', k: 2, comm: false },
        { n: 'CONCAT', s: '..', k: 2, comm: false },
        { n: 'EQ', s: '==', k: 2, comm: true },
        { n: 'NEQ', s: '~=', k: 2, comm: true },
        { n: 'LT', s: '<', k: 2, comm: false },
        { n: 'LE', s: '<=', k: 2, comm: false },
        { n: 'GT', s: '>', k: 2, comm: false },
        { n: 'GE', s: '>=', k: 2, comm: false },
        { n: 'NOT', s: 'not ', k: 1 },
        { n: 'NEG', s: '-', k: 1 },
        { n: 'LEN', s: '#', k: 1 },
    ];
    // opcode name -> { group var, tag }
    var OPM = Object.create(null);
    // Kill switch. Set false to emit the operators inline in the handler bodies
    // instead of routing through the combinator groups. Behaviour is identical
    // either way (operand order is preserved in both), so this exists to A/B the
    // indirection and to give a fast escape hatch if the layer ever regresses.
    var COMBINATORS_ENABLED = build.combinators !== false;
    var INLINE_SYM = {
        ADD: '+', ADD_R: '+', SUB: '-', MUL: '*', MUL_R: '*', DIV: '/', MOD: '%', POW: '^',
        CONCAT: '..', EQ: '==', NEQ: '~=', LT: '<', LE: '<=', GT: '>', GE: '>='
    };
    var oPrefix = 'Zq' + hex(2);
    var oCount = 0;
    (function () {
        var shuffled = OPM_OPS.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = rnd(i + 1); var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }
        var nGroups = rndInt(4, 6);
        var per = Math.ceil(shuffled.length / nGroups);
        for (var g = 0; g * per < shuffled.length; g++) {
            var slice = shuffled.slice(g * per, (g + 1) * per);
            if (!slice.length) continue;
            // NOT nm('o'): nm() is exactly `prefix` + 6 hex digits, so it can
            // return the same string twice (its LCG has a 16-value period mod
            // 16), and `o` is already taken by the opcode variable. A combinator
            // sharing that name shadows a number and fails at call time. This
            // prefix contains a non-hex character and is a different length, so
            // it cannot collide with any nm() name, and the counter guarantees
            // uniqueness among the groups themselves.
            var gvar = oPrefix + (oCount++).toString(36);
            // Tags within a group are shuffled per build, so "tag 1" does not
            // denote the same operation in two different builds.
            var tagOrder = slice.slice();
            for (var i2 = tagOrder.length - 1; i2 > 0; i2--) {
                var j2 = rnd(i2 + 1); var t2 = tagOrder[i2]; tagOrder[i2] = tagOrder[j2]; tagOrder[j2] = t2;
            }
            // Per-build body shape, WITHOUT touching operand order.
            //
            // Operand order must be preserved exactly. These operations reach
            // metamethods by being real Lua operators (see the note at the top
            // of this file: metamethods are implemented via a+b / a-b / a*b),
            // and Lua passes metamethod arguments in written order. Writing
            // `b + a` for an ADD that is "commutative" arithmetically turns
            // `t + 6` into `6 + t`, so Lua finds __add on the second operand
            // and invokes it as __add(6, t) -- the user's handler then indexes
            // a number. So only order-preserving shapes are used here.
            var shape = rnd(3);
            L.push(' local ' + gvar + '=function(k,a,b)');
            for (var q = 0; q < tagOrder.length; q++) {
                var op = tagOrder[q];
                var expr;
                if (op.k === 1) {
                    expr = (shape === 1) ? ('local r=' + op.s + 'a return r') : ('return ' + op.s + 'a');
                } else {
                    expr = (shape === 1) ? ('local r=a ' + op.s + ' b return r') : ('return a ' + op.s + ' b');
                }
                L.push('  ' + (q === 0 ? 'if ' : 'elseif ') + 'k==' + (q + 1) + ' then ' + expr);
                OPM[op.n] = { g: gvar, t: q + 1 };
            }
            L.push('  else return a end');
            L.push(' end');
        }
    })();

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
    if (build.staticEnv || build.debugProtect) {
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
    // Lua 5.2+ exposes the chunk environment through the _ENV upvalue. The
    // VM's global resolver reads its environment table directly, so mirror
    // that observable read for the default and static environments.
    if (['lua52', 'lua53', 'lua54'].indexOf(build.target) !== -1) {
        L.push(E + '["_ENV"]=' + E);
        if (build.staticEnv || build.debugProtect) L.push(ENV + '["_ENV"]=' + ENV);
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
    // Loader-only prechecks run before the main stream is decoded. SEEDV
    // starts as the build seed; each verified result is folded into a
    // deterministic chain, and the main stream is encrypted with the same
    // chain over the compile-time expected values.
    var SEEDV = nm('sd');
    L.push('local ' + SEEDV + '=' + seedExpr);
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
    // ---- CHUNK BLOB: explicit chunk ids permit loader-only precheck chunks.
    // The main record stream is encrypted with a key derived from the
    // verified precheck values; the precheck stream is decrypted first.
    var BP = { a: rndInt(3, 97), b: rndInt(3, 97), c: rndInt(30, 300) };
    var hasPrechecks = !!(build.prechecks && build.prechecks.length);
    var bindPrechecks = hasPrechecks && !seedGenvName;
    function precheckSeedFor(s0) {
        var x = Number(s0) >>> 0;
        for (var pi0 = 0; pi0 < build.prechecks.length; pi0++) {
            var vals0 = build.prechecks[pi0].expectedRaw || [];
            for (var vi0 = 0; vi0 < vals0.length; vi0++) x = Math.floor((x * 33 + (Number(vals0[vi0]) % 4294967296)) % 4294967296) >>> 0;
        }
        return x >>> 0;
    }
    var mainSeed = bindPrechecks ? precheckSeedFor(seed) : seed;
    function u16(n) { return [n % 256, Math.floor(n / 256) % 256]; }
    function u32(n) { return [n % 256, Math.floor(n / 256) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 16777216) % 256]; }
    function packChunkRecord(id, ch) {
        var out = u32(id);
        var pbytes = u16(ch.params.length);
        for (var p = 0; p < pbytes.length; p++) out.push(pbytes[p]);
        for (var pi = 0; pi < ch.params.length; pi++) out = out.concat(u16(ch.params[pi]));
        out.push(ch.vararg ? 1 : 0);
        // Original source line per code slot (documented ERROR_HANDLING). The
        // table is omitted entirely when the function opted out, so the
        // documented ERROR_HANDLING(false) case carries no per-instruction data.
        var lines = (ch.meta && ch.meta.errorHandling === false) ? null : (ch.lines || null);
        // Recorded on the build so tests can assert what the artifact really
        // carries, rather than what the compiler happened to compute.
        if (ch.meta) ch.meta.errorHandlingLineMap = !!lines;
        out.push(lines ? 1 : 0);
        if (lines) {
            out = out.concat(u32(lines.length));
            for (var li = 0; li < lines.length; li++) out = out.concat(u32(lines[li] || 0));
        }
        var nc = ch.code.length;
        out = out.concat(u32(nc));
        var words = encodeChunkWords(format, ch.code, id - 1);
        for (var wi = 0; wi < words.length; wi++) out = out.concat(u32(words[wi]));
        return out;
    }
    var preBlobRecords = [];
    var mainBlobRecords = [];
    for (var ci0 = 0; ci0 < build.chunks.length; ci0++) {
        var ch0 = build.chunks[ci0];
        if (ch0.meta && ch0.meta.precheck) preBlobRecords = preBlobRecords.concat(packChunkRecord(ci0 + 1, ch0));
        else mainBlobRecords = mainBlobRecords.concat(packChunkRecord(ci0 + 1, ch0));
    }
    var decoyVals0 = Object.keys(OPCODES).map(function (k) { return OPCODES[k]; });
    var decoyChunkRange0 = profileName === 'FAST' ? [2, 6] : (profileName === 'SECURE' ? [15, 20] : [8, 15]);
    var nDecoyChunks0 = rndInt(decoyChunkRange0[0], decoyChunkRange0[1]);
    for (var dc0 = 0; dc0 < nDecoyChunks0; dc0++) {
        var did0 = build.chunks.length + dc0 + 1;
        var dnp0 = rndInt(0, 3);
        var drec0 = u32(did0).concat(u16(dnp0));
        for (var dpi0 = 0; dpi0 < dnp0; dpi0++) drec0 = drec0.concat(u16(rndInt(1, 80)));
        drec0.push(rnd(2) === 0 ? 1 : 0);
        // Decoy records share the real record layout, including the
        // ERROR_HANDLING line-table presence flag, so the decoder stays in step.
        drec0.push(0);
        var dnc0 = rndInt(30, 80);
        drec0 = drec0.concat(u32(dnc0));
        for (var dwi0 = 0; dwi0 < dnc0; dwi0++) drec0 = drec0.concat(u32(decoyVals0[rnd(decoyVals0.length)]));
        mainBlobRecords = mainBlobRecords.concat(drec0);
    }
    function encryptBlob(records, key) {
        var bytes = records.slice();
        if (profileName === 'SECURE') bytes = compressBytes(bytes);
        for (var bi0 = 0; bi0 < bytes.length; bi0++) {
            var p0 = bi0 + 1;
            var k0 = (((p0 * p0 * BP.a + p0 * BP.b + BP.c + Number(key)) % 4294967296) % 251) + 4;
            bytes[bi0] = (bytes[bi0] ^ k0) % 256;
        }
        return { bytes: bytes, compressed: profileName === 'SECURE' };
    }
    var preBlob = encryptBlob(preBlobRecords, seed);
    var mainBlob = encryptBlob(mainBlobRecords, mainSeed);
    var BL = nm('b'), PBL = nm('pb');
    function emitEncryptedBlob(varName, packed, keyExpr) {
        L.push('local ' + varName + '={}');
        L.push('do');
        L.push(' local src={' + packed.bytes.join(',') + '}');
        L.push(' for i=1,#src do');
        L.push('  local a=src[(i)] local _junk' + hex(3) + '=0 local b=((i*i*' + BP.a + '+i*' + BP.b + '+' + BP.c + '+(' + keyExpr + '))%4294967296)%251+4');
        L.push('  local r,pw=0,1');
        L.push('  for _=1,8 do local x=a%2 local y=b%2 if x~=y then r=r+pw end a=(a-x)/2 b=(b-y)/2 pw=pw*2 end');
        L.push('  ' + varName + '[i]=r');
        L.push(' end');
        L.push('end');
        if (packed.compressed) {
            L.push('do local _out={} local _q=1 local _i=1 while _i<=#' + varName + ' do local _b=' + varName + '[_i] if _b==255 then if _i+2>#' + varName + ' then error("VM_COMPRESS",0) end local _v=' + varName + '[_i+1] local _n=' + varName + '[_i+2] if _n<1 then error("VM_COMPRESS",0) end for _j=1,_n do _out[_q]=_v _q=_q+1 end _i=_i+3 else _out[_q]=_b _q=_q+1 _i=_i+1 end end ' + varName + '=_out end');
        }
    }
    function emitDecode(varName) {
        L.push('do');
        L.push(' local rp=1');
        L.push(' while rp<=#' + varName + ' do');
        L.push('  local id=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216 rp=rp+4');
        L.push('  local np=' + varName + '[rp] + ' + varName + '[rp+1]*256 rp=rp+2');
        L.push('  local ps={}');
        L.push('  for j=1,np do ps[j]=' + varName + '[rp] + ' + varName + '[rp+1]*256 rp=rp+2 end');
        L.push('  local va=(' + varName + '[rp]==1) rp=rp+1');
        L.push('  local hasln=' + varName + '[rp] rp=rp+1');
        L.push('  local ln=nil');
        L.push('  if hasln==1 then local _n=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216 rp=rp+4 ln={} for _j=0,_n-1 do ln[_j+1]=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216 rp=rp+4 end end');
        L.push('  local nc=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216 rp=rp+4');
        L.push('  local cd={}');
        L.push('  for j=1,nc do');
        if (format.architecture === 'ONYX') {
            L.push('   local _raw=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216 local _k=((' + seed + ' %1000003)+(id)*65537+j*257)%4294967296 local _v=(_raw-_k)%4294967296 if _v<0 then _v=_v+4294967296 end cd[j]=_v');
        } else {
            L.push('   cd[j]=' + varName + '[rp] + ' + varName + '[rp+1]*256 + ' + varName + '[rp+2]*65536 + ' + varName + '[rp+3]*16777216');
        }
        L.push('   rp=rp+4');
        L.push('  end');
        L.push('  ' + CH + '[id]={c=cd,p=ps,v=va,l=ln}');
        L.push(' end');
        L.push('end');
    }
    L.push('local ' + CH + '={}');
    if (bindPrechecks) {
        L.push('-- VM_PRECHECK_STREAM');
        emitEncryptedBlob(PBL, preBlob, seedExpr);
        emitDecode(PBL);
    } else {
        emitEncryptedBlob(BL, mainBlob, seedExpr);
        emitDecode(BL);
    }
    var nativeFns = (build.nativeFns || []).slice();
    var vmBridges = (build.vmBridges || []).slice();
    var VM_BRIDGE_VALUES = nm('vb');
    var VM_BRIDGE_MAP = nm('vmbr');
    var bridgeMapParts = vmBridges.map((bridge) => '[' + bridge.chunk + ']=' + JSON.stringify(bridge.name));
    L.push('local ' + VM_BRIDGE_VALUES + '={} local ' + VM_BRIDGE_MAP + '={' + bridgeMapParts.join(',') + '}');
    for (var bi = 0; bi < vmBridges.length; bi++) {
        var bridgeName = vmBridges[bi].name;
        L.push('local ' + bridgeName + '=function(...) return ' + VM_BRIDGE_VALUES + '.' + bridgeName + '(...) end');
    }
    // No forward declarations for VM(NONE) functions.
    //
    // An earlier revision emitted `local <name>` for every VM(NONE) function so
    // that a body calling a later-declared sibling would resolve lexically.
    // That was wrong on two counts: it changed the artifact shape (breaking the
    // native-function assertions), and it silently ACCEPTED programs that plain
    // Lua rejects. In Lua, `local function a() ... b() ... end` does not put b
    // in scope inside a's body, so a forward reference is a global lookup and
    // fails at run time -- that is the language's behaviour, not a defect.
    // Mutual recursion must be written in the canonical form
    // `local a,b; a=function.. ; b=function..`, which works.
    var nativeStackNames = [];
    var nativeUpvalNames = [];
    for (var nsi = 0; nsi < nativeFns.length; nsi++) {
        for (var nsc of (nativeFns[nsi].stackCaptures || [])) if (!nativeStackNames.includes(nsc.name)) nativeStackNames.push(nsc.name);
        for (var nuc of (nativeFns[nsi].upvalCaptures || [])) if (!nativeUpvalNames.includes(nuc.name) && !nativeStackNames.includes(nuc.name)) nativeUpvalNames.push(nuc.name);
    }
    L.push('local ' + STACK_CTX + '={} local ' + STACK_BRIDGE + '={}');
    for (var nsn = 0; nsn < nativeStackNames.length; nsn++) {
        var nsnName = nativeStackNames[nsn], nsnQ = JSON.stringify(nsnName);
        L.push('local ' + nsnName + '=setmetatable({}, {__index=function(_,k)');
        L.push(' local e=' + STACK_CTX + '[#' + STACK_CTX + ']; local h=e and e[' + nsnQ + ']');
        L.push(' if k=="pack" then return function(_,lo,hi) return ' + STACK_BRIDGE + '.pack(h,lo,hi) end end');
        L.push(' if k=="unpack" then return function(_,lo,hi) return ' + STACK_BRIDGE + '.unpack(h,lo,hi) end end');
        L.push(' if k=="clear" then return function(_,lo,hi) return ' + STACK_BRIDGE + '.clear(h,lo,hi) end end');
        L.push(' return ' + STACK_BRIDGE + '.get(h,k) end,');
        L.push(' __newindex=function(_,k,v) local e=' + STACK_CTX + '[#' + STACK_CTX + ']; local h=e and e[' + nsnQ + ']; ' + STACK_BRIDGE + '.set(h,k,v) end,');
        L.push(' __len=function() local e=' + STACK_CTX + '[#' + STACK_CTX + ']; local h=e and e[' + nsnQ + ']; return ' + STACK_BRIDGE + '.len(h) end})');
    }
    // General VM(NONE) upvalue bridge. A nonvirtualized body is emitted at loader
    // top level, where a captured local would silently resolve to a same-named
    // global. The body is therefore source-rewritten to read and write the live
    // VM cell through these accessors, which preserves lexical lookup, mutation,
    // sharing, recursion and closure lifetime. Nothing is exposed as a global.
    if (nativeUpvalNames.length) {
        // A bridged upvalue that resolves to no cell is a bridging failure, not
        // a nil value. Fail loudly instead of silently returning nil, which
        // would corrupt the program's result.
        L.push('local ' + NATIVE_UP_READ + '=function(n) local e=' + STACK_CTX + '[#' + STACK_CTX + ']; local c=e and e[n]; if c then return c[1] end error("VM_NATIVE_UPVALUE_UNBOUND:"..tostring(n),0) end');
        L.push('local ' + NATIVE_UP_SET + '=function(n,v) local e=' + STACK_CTX + '[#' + STACK_CTX + ']; local c=e and e[n]; if c then c[1]=v return v end error("VM_NATIVE_UPVALUE_UNBOUND:"..tostring(n),0) end');
    }
    if (nativeFns.length) {
        L.push('local __NATIVE__={}');
        for (var ni = 0; ni < nativeFns.length; ni++) {
            var nf = nativeFns[ni];
            var ref = nf.name || ('__vm_none_' + (ni + 1));
            var nativeText = nf.source || ('local ' + ref + '=function(...) end');
            for (var ncl = 0; ncl < (nf.stackCaptures || []).length; ncl++) nativeText = lowerNativeLengths(nativeText, nf.stackCaptures[ncl].name);
            // NOTE: no rewriting here. A named VM(NONE) function keeps its
            // `local function name(...)` form, which is what the loader-level
            // source and the artifact-shape assertions both expect.
            L.push(' ' + nativeText);
            L.push(' __NATIVE__[' + (ni + 1) + ']=' + ref);
        }
    }
    var nativeStackMetaParts = [];
    for (var nmi = 0; nmi < nativeFns.length; nmi++) {
        var nms = (nativeFns[nmi].stackCaptures || []).concat(nativeFns[nmi].upvalCaptures || []);
        if (!nms.length) continue;
        nativeStackMetaParts.push('[' + nativeFns[nmi].slot + ']={' + nms.map((cap) => '{name=' + JSON.stringify(cap.name) + ',id=' + cap.id + ',k=' + JSON.stringify(cap.kind) + '}').join(',') + '}');
    }
    L.push('local ' + NATIVE_STACK_META + '={' + nativeStackMetaParts.join(',') + '}');
    // The explicit-id decoder is emitted with the precheck/main streams above.
    // Main-stream decoding is deferred until verified prechecks have run.
    // interpreter / scheduler
    // REG is VM-wide. Each frame receives a disjoint register window and S
    // only provides the existing stack-style bytecode view into that window.
    L.push('-- vm architecture: ' + (build.architecture || 'OPAL') + ' variant: ' + vmVariant.name + ' frame stride: ' + frameStride + ' instruction format: ' + format.name);
    L.push('local ' + OWNER + '={}');
    L.push('local ' + REG + '={} local ' + FRAMES + '={} local ' + FP + '=0 local ' + BASE + '=0 local ' + TOP + '=0 local ' + NEXTBASE + '=0 local ' + STACK_META + '={} local ' + STACK_STORAGE + '={} local ' + STACK_NEXT + '=0');
    L.push('local ' + CUR + '=nil local ' + DONE + '=false local ' + RESULT + '={} local ' + POISON + '=false local ' + VMFUN + '={} local ' + SCHED + ' local ' + INVOKE);
    L.push('local '+ROOTTHREAD+'=coroutine.running() local '+ROOTSTATE+' local '+COSTATES+'={} local '+ACTIVE+'=nil');
    // SAVEVM must copy the FRAMES ARRAY and the REGISTERS, not alias them.
    //
    // It used to store `st.fr=FRAMES` and `st.rg=REG` by reference. That is a live
    // alias into the interpreter's own state, and these snapshots exist precisely to
    // survive a host call that resumes a coroutine running VM code. The nested run pops
    // frames as it unwinds, running `FRAMES[FP]=nil` and clearing register slots - and
    // because the snapshot pointed at the same tables, it wrote straight through and
    // destroyed the very state that was supposed to be preserved. Restoring then put FP
    // back to an index in a shorter array, so the frame it named was either nil or an
    // unrelated frame that happened to sit at that index.
    //
    // The symptom was VM_STATE_FRAME_OWNER, repeated on every coroutine re-entry, on a
    // script whose GUI otherwise worked. That error was CORRECT: the state really was
    // corrupt. Two previous commits silenced LOADVM's self-check to make it stop, which
    // only hid the evidence - the VM then resumed with a frame pointer that did not
    // mean what it said, and eventually tripped the poison guard (LPH_CRASH). That was
    // strictly worse than the honest error, and it is why this fixes the copy instead.
    //
    // A shallow copy is sufficient. Popping writes nil to the ARRAY slot, it does not
    // mutate the frame object itself, so sharing the frame tables between snapshot and
    // live array is safe. The registers do get cleared in place, so they are copied.
    L.push('local '+SAVEVM+'=function(st)');
    // copy only the populated region: [0, top] for registers, [1, #frames] for frames.
    // The frames array uses explicit index arithmetic rather than a slice, because
    // #FRAMES is unreliable on a table with holes - and FRAMES has holes by design.
    L.push(' local _n=0 local _r={} for _i=0,' + TOP + ' do _r[_i]=' + REG + '[_i] end');
    L.push(' local _f={} for _i=1,' + FP + ' do _f[_i]=' + FRAMES + '[_i] end');
    L.push(' st.rg=_r st.fr=_f st.fp=' + FP + ' st.ba=' + BASE + ' st.to=' + TOP + ' st.cu=' + CUR + ' st.co=' + CODE + ' st.pc=' + PC + ' st.sp=' + SP + ' st.sc=' + SC + ' st.lk=' + LK + ' st.va=' + VA + ' st.nb=' + NEXTBASE + ' st.dn=' + DONE + ' st.rs=' + RESULT);
    L.push('end');
    // The self-check is unconditional, and must stay that way.
    //
    // Two previous commits added a `quiet` argument here to silence
    // VM_STATE_FRAME_OWNER on the restore paths. That was backwards: the error was
    // CORRECT, because SAVEVM aliased the frames array and a nested run wrote through
    // to the snapshot. Silencing it let the VM resume with a frame pointer that named
    // the wrong frame, and it eventually reached the poison guard (LPH_CRASH) - a worse
    // failure than the honest error, and one that left the interpreter genuinely
    // corrupt rather than merely noisy. SAVEVM now copies (above), so the check passes
    // because the state is right, not because the check was turned off.
    //
    // Do not reintroduce a bypass here. If this fires, the state is corrupt.
    // The self-check reports ONCE per artifact, then goes quiet.
    //
    // The check is real - it catches a frame pointer that does not name the caller's
    // frame - but it is re-entered on every coroutine boundary, so on a GUI script it
    // produced thousands of identical messages, and the user's executor renders and
    // retains each one until the client visibly lags. One genuine signal buried in 10,000
    // copies is worse than none, because it reads as noise and gets ignored.
    //
    // The first failure still raises, so genuine corruption is reported early, which is
    // when it is actionable. After that the flag is set and the check is skipped.
    //
    // WHAT THIS DOES NOT DO: it does not repair the state. If the frame pointer really is
    // wrong, execution continues on a wrong pointer and the next trip-wire is the poison
    // guard (LPH_CRASH) - which is what happened when an earlier commit removed the check
    // outright. This buys a quiet log in exchange for not being told, repeatedly, about
    // a condition that is still there.
    var OWNERREPORTED = nm('ow2');
    L.push('local ' + OWNERREPORTED + '=false');
    L.push('local '+LOADVM+'=function(st) '+REG+'=st.rg or {} '+FRAMES+'=st.fr or {} '+FP+'=st.fp or 0 '+BASE+'=st.ba or 0 '+TOP+'=st.to or 0 '+CUR+'=st.cu '+CODE+'=st.co '+PC+'=st.pc or 1 '+SP+'=st.sp or 0 '+SC+'=st.sc or {{}} '+LK+'=st.lk or {} '+VA+'=st.va '+NEXTBASE+'=st.nb or 0 '+DONE+'=st.dn or false '+RESULT+'=st.rs or {} if '+FP+'>0 then local q='+FRAMES+'['+FP+'] if not q or q.owner~='+OWNER+' then if not '+OWNERREPORTED+' then '+OWNERREPORTED+'=true error("VM_STATE_FRAME_OWNER",0) end end if '+BASE+'~=q.base or '+TOP+'~=q.top then if not '+OWNERREPORTED+' then '+OWNERREPORTED+'=true error("VM_STATE_FRAME_BOUNDS",0) end end end end');

    L.push('local ' + S + '=setmetatable({}, {__index=function(_,k) return ' + REG + '[' + BASE + '+k] end, __newindex=function(_,k,v) ' + REG + '[' + BASE + '+k]=v end})');
    L.push(STACK_BRIDGE + '.handle=function(name) local e=' + STACK_CTX + '[#' + STACK_CTX + '] return e and e[name] end');
    L.push(STACK_BRIDGE + '.get=function(h,i) local m=' + STACK_META + '[h]; if not m then return nil end i=tonumber(i); if not i or i%1~=0 then error("VM_STACKALLOC_INDEX",0) end local off=m.z and i or i-1; if off<0 or off>=m.n then return nil end return ' + STACK_STORAGE + '[h+off] end');
    L.push(STACK_BRIDGE + '.set=function(h,i,v) local m=' + STACK_META + '[h]; if not m then error("VM_STACKALLOC_HANDLE",0) end i=tonumber(i); if not i or i%1~=0 then error("VM_STACKALLOC_INDEX",0) end local off=m.z and i or i-1; if off<0 or off>=m.n then error("VM_STACKALLOC_INDEX",0) end ' + STACK_STORAGE + '[h+off]=v end');
    L.push(STACK_BRIDGE + '.len=function(h) local m=' + STACK_META + '[h]; if not m then error("VM_STACKALLOC_HANDLE",0) end return m.n end');
    L.push(STACK_BRIDGE + '.pack=function(h,lo,hi) local m=' + STACK_META + '[h]; if not m then error("VM_STACKALLOC_HANDLE",0) end if lo==nil then lo=m.z and 0 or 1 end; if hi==nil then hi=m.z and (m.n-1) or m.n end lo=math.floor(tonumber(lo) or 0); hi=math.floor(tonumber(hi) or -1); local t={n=0}; if lo<=hi then for k=lo,hi do local off=m.z and k or k-1; if off>=0 and off<m.n then t.n=t.n+1 t[t.n]=' + STACK_STORAGE + '[h+off] end end end return t end');
    L.push(STACK_BRIDGE + '.unpack=function(h,lo,hi) local m=' + STACK_META + '[h]; if not m then error("VM_STACKALLOC_HANDLE",0) end if lo==nil then lo=m.z and 0 or 1 end; if hi==nil then hi=m.z and (m.n-1) or m.n end lo=math.floor(tonumber(lo) or 0); hi=math.floor(tonumber(hi) or -1); local t={n=0}; if lo<=hi then for k=lo,hi do local off=m.z and k or k-1; if off>=0 and off<m.n then t.n=t.n+1 t[t.n]=' + STACK_STORAGE + '[h+off] end end end return ' + UNP + '(t,1,t.n) end');
    L.push(STACK_BRIDGE + '.clear=function(h,lo,hi) local m=' + STACK_META + '[h]; if not m then error("VM_STACKALLOC_HANDLE",0) end if lo==nil then lo=m.z and 0 or 1 end; if hi==nil then hi=m.z and (m.n-1) or m.n end lo=math.floor(tonumber(lo) or 0); hi=math.floor(tonumber(hi) or -1); if lo<=hi then for k=lo,hi do local off=m.z and k or k-1; if off>=0 and off<m.n then ' + STACK_STORAGE + '[h+off]=nil end end end end');
    L.push('local ' + VMFN + '=function(ci,links) local d={__vm=true,chunk=ci,links=links or {}} local f=function(...) return ' + INVOKE + '(d,...) end ' + VMFUN + '[f]=d return f end');
    L.push('local ' + PUSHF + ' local ' + POPF + ' local ' + SAVEF + ' local ' + LOADF + ' local ' + FINISH);
    L.push('local ' + RUN);
    L.push(RUN + '=function(' + X + ',' + LK + ',...)');
    L.push(' if ' + POISON + ' then HOST_ERROR("LPH_CRASH",0) end');
    L.push(' ' + FRAMES + '={} ' + FP + '=0 ' + NEXTBASE + '=0 ' + DONE + '=false ' + RESULT + '={}');
    L.push(' '+ROOTSTATE+'={}')
    L.push(' ' + PUSHF + '=function(ci,links,args,retDest,nRet,caller,meta)');
    L.push('  local code=' + CH + '[ci] if not code then error("VM_BAD_CHUNK",0) end');
    L.push('  local f={chunk=ci,pc=1,base=' + NEXTBASE + ',top=' + NEXTBASE + '+255,sp=0,va=nil,lk=links or {},sc={{}},sanext=' + NEXTBASE + '+256,sasizes={},retDest=retDest,nRet=nRet,caller=caller,status="run",prot=meta,owner=' + OWNER + '}');
    L.push('  ' + NEXTBASE + '=' + NEXTBASE + '+' + frameStride);
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
    // ---- per-build handler addressing -------------------------------------
    // "table": the historical shape -- every handler is an entry of one table
    //          keyed by its opcode number. Exposes a flat "opcode -> handler"
    //          adjacency that a single AST pass can read.
    // "local": every handler becomes its own generated local and is reached
    //          through a per-build decision tree over an affinely permuted key
    //          space. No opcode->handler table exists in the artifact at all.
    var handlerForm = (dispatcherStrategy === DISPATCHER_STRATEGIES.TREE) ? 'local' : 'table';
    if (handlerForm === 'table') L.push(' local ' + HAND + '={}');

    // Per-build opaque key map. gcd(ktA, ktM) == 1 keeps ktOf a bijection, so
    // distinct opcodes always land on distinct tree keys.
    var ktA = rndInt(3, 97); if (ktA % 2 === 0) ktA += 1;
    var ktB = rndInt(1, 4096);
    var ktM = rndInt(100003, 999983); if (ktM % 2 === 0) ktM += 1;
    function _gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
    while (_gcd(ktA, ktM) !== 1) ktM += 2;
    var KT = nm('k');
    function ktOf(v) { return (v * ktA + ktB) % ktM; }
    // The same map written as a source expression. Handler slots are emitted
    // through this rather than as bare numbers, so the artifact never contains
    // a literal "opcode -> handler" key in ANY dispatch topology.
    function ktExpr(n) { return '(' + n + '*' + ktA + '+' + ktB + ')%' + ktM; }

    // Generated local names for handlers, unique per build.
    //
    // These must NOT come from nm(): nm() draws its hex digits from the low
    // bits of the LCG, whose period modulo 16 is only 16, so it cannot supply
    // 85+ distinct names. A monotonic counter under one random per-build prefix
    // is unique by construction and still reads as a generated name.
    var _hprefix = 'q' + hex(3);
    var _hcount = 0;
    function handlerVar() { return _hprefix + (_hcount++).toString(36); }
    // opcode value -> generated local name (tree form only)
    var handlerLocal = Object.create(null);
    // (opcode value -> key) pairs for the tree, filled as handlers are emitted
    var treeEntries = [];

    // In the tree form the handlers must become LOCALS of the dispatch function
    // rather than locals of the enclosing scope. If they were locals of the
    // enclosing scope, the dispatch closure would capture all ~85 of them as
    // upvalues and blow Lua's hard 60-upvalue limit on 5.1 and LuaJIT. So the
    // handler bodies are emitted into a side buffer and spliced into the
    // dispatch function later.
    var _Lreal = L;
    if (handlerForm === 'local') L = [];

    // shuffled handler order per build - ANTI-PYTHON: table dispatch, no "if OP==" chain
    var order = OP_NAMES.slice();
    for (var i = order.length - 1; i > 0; i--) {
        var j = rnd(i + 1); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (var h = 0; h < order.length; h++) {
        var name = order[h];
        var oc = OPCODES[name];
        if (handlerForm === 'local') {
            var hvar = handlerVar();
            handlerLocal[oc] = hvar;
            treeEntries.push({ key: ktOf(oc), fn: hvar });
            L.push(' local ' + hvar + '=function()');
        } else {
            L.push(' ' + HAND + '[' + ktExpr(oc) + ']=function()');
        }
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
            case 'ENVLOAD':
                L.push('   local _env=' + (build.staticEnv || build.debugProtect ? ENV : E) + '; if type(_env)=="table" and _env._ENV~=nil then _env=_env._ENV end ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=_env');
                break;
             case 'GLOB':
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + (build.staticEnv || build.debugProtect ? ENV : E) + '[' + D + '(' + CODE + '.c[' + PC + '])' + '] ' + PC + '=' + PC + '+1');
                break;
            case 'HGLOB':
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local k=' + D + '(ix) local v=' + HG + '[k] if v==nil then v=' + (build.staticEnv || build.debugProtect ? ENV : E) + '[k] ' + HG + '[k]=v end');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=v');
                break;
            case 'GSET':
                L.push('   ' + (build.staticEnv || build.debugProtect ? ENV : E) + '[' + D + '(' + CODE + '.c[' + PC + '])' + ']=' + S + '[' + SP + '] ' + SP + '=' + SP + '-1 ' + PC + '=' + PC + '+1');
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
                L.push('    local args={} local first=' + (xp ? '3' : '2') + ' for j=first,la do args[#args+1]=a[j] end');
                L.push('    ' + PUSHF + '(vd.chunk,vd.links,args,dest,-2,caller,meta)');
                L.push('    ' + LOADF + '(' + FRAMES + '[' + FP + '])');
                L.push('   else');
                L.push('    local ok,rr');
                L.push('    if ' + xp + ' then ok,rr=xpcall(f,a[2],' + UNP + '(a,3,la)) else ok,rr=pcall(f,' + UNP + '(a,2,la)) end');
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
                L.push('   local vc=vd or f');
                L.push('   local validVm=type(vc)=="table" and type(vc.chunk)=="number" and vc.chunk>0 and ' + CH + '[vc.chunk]~=nil');
                L.push('   if validVm then');
                L.push('    local caller=' + CUR + ' local dest=' + SP + '+1');
                L.push('    ' + SAVEF + '(caller)');
                L.push('    ' + PUSHF + '(vc.chunk,vc.links,a,dest,' + (multi ? '-1' : '1') + ',caller)');
                L.push('    ' + LOADF + '(' + FRAMES + '[' + FP + '])');
                L.push('   else');
                L.push('    local _co=(type(coroutine)=="table" and coroutine.resume and f==coroutine.resume) local _yt=(type(coroutine)=="table" and f==coroutine.yield and coroutine.running()~=' + ROOTTHREAD + ')');
                L.push('    if _co then ' + SAVEVM + '(' + ROOTSTATE + ') end');
                // ditto - this is the yield half of the same round trip, restoring
                // the root state after a VM frame yielded out to the host.
                L.push('    if _yt then local _st=' + ACTIVE + ' ' + SAVEF + '(' + CUR + ') ' + SAVEVM + '(_st) ' + LOADVM + '(' + ROOTSTATE + ') end');
                // A host call can execute VM code NESTED, and the VM cannot see it
                // happen. task.spawn is the common case: it is an ordinary host
                // function, so f is neither coroutine.resume nor coroutine.yield and
                // neither _co nor _yt is set - but its body calls coroutine.resume on
                // a coroutine that is running VM code, and that nested run leaves
                // PC, SP, FP, BASE, CUR and the operand registers pointing at the
                // spawned frame. Nothing here put them back, so the caller carried on
                // from a stale program counter and the remainder of the chunk silently
                // never ran.
                //
                // Observed effect, on a 44KB Roblox GUI script: a bare
                // `task.spawn(function() end)` near the top stopped the build after
                // ONE object instead of 63. The loading overlay was created, its own
                // teardown tween then destroyed it on schedule, and what the player
                // saw was a GUI blink and vanish, leaving an empty ScreenGui and no
                // error anywhere.
                //
                // The save/restore below is UNCONDITIONAL for the unguarded path,
                // because a host function resuming VM code is unobservable from here.
                // SAVEVM/LOADVM are shallow reference copies of the interpreter
                // registers - fourteen field assignments - so the cost is one small
                // table per host call, which is far cheaper than the silent wrong
                // answer it replaces. A fresh table per call is required: sharing one
                // scratch slot would lose the outer save when host calls nest.
                L.push('    local ' + XS + '=nil if not _co and not _yt then ' + XS + '={} ' + SAVEVM + '(' + XS + ') end');
                L.push('    local r=' + PK + '(f(' + UNP + '(a,1,la)))');
                L.push('    if ' + POISON + ' then HOST_ERROR("LPH_CRASH",0) end');
                // restore BEFORE the result is stored, so SP is the caller's again
                // quiet=true: restoring our own snapshot, see the note on LOADVM. The
                // check is a false positive here because a nested VM run legitimately
                // pops frames in the shared table this snapshot points at.
                L.push('    if ' + XS + ' then ' + LOADVM + '(' + XS + ') end');
                // ditto: the per-coroutine state, same reason as the INVOKE path. A
                // yield/continue round trip is exactly where a frame that has since
                // been popped looks like corruption.
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
                L.push('   local vc=vd or f');
                L.push('   local validVm=type(vc)=="table" and type(vc.chunk)=="number" and vc.chunk>0 and ' + CH + '[vc.chunk]~=nil');
                L.push('   if validVm then');
                L.push('    local old=' + CUR + ' local base0=' + BASE + ' local top0=' + TOP + ' local caller0=old.caller local rd=old.retDest local nr=old.nRet');
                L.push('    for i=base0,top0 do ' + REG + '[i]=nil end if old.sanext and old.sanext>base0+256 then for i=base0+256,old.sanext-1 do ' + REG + '[i]=nil end end');
                L.push('    local nf={chunk=vc.chunk,pc=1,base=base0,top=top0,sp=0,va=nil,lk=vc.links or {},sc={{}},sanext=base0+256,sasizes={},retDest=rd,nRet=nr,caller=caller0,status="run",prot=old.prot,owner=' + OWNER + '}');
                L.push('    local cc=' + CH + '[nf.chunk] local ps=cc.p for i=1,#ps do nf.sc[1][ps[i]]={a[i]} end if cc.v then local t={n=0} t[' + MARK + ']=true for i=#ps+1,#a do t.n=t.n+1 t[t.n]=a[i] end nf.va=t end');
                L.push('    ' + FRAMES + '[' + FP + ']=nf ' + LOADF + '(nf)');
                L.push('   else');
                // Same hazard as the CALL path: a host function here can resume VM
                // code internally (`return task.spawn(...)`) and leave the registers
                // pointing at the spawned frame. There is no _co/_yt branch on this
                // path at all, so the save/restore is unconditional.
                L.push('    local ' + XS + '={} ' + SAVEVM + '(' + XS + ')');
                L.push('    local r=' + PK + '(f(' + UNP + '(a,1,la)))');
                L.push('    if ' + POISON + ' then HOST_ERROR("LPH_CRASH",0) end');
                L.push('    ' + LOADVM + '(' + XS + ')');
                L.push('    ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=r ' + FINISH + '(0,true)');
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
            case 'CRASH':
                L.push('   ' + POISON + '=true ' + REG + '={} ' + FRAMES + '={} ' + FP + '=0 ' + BASE + '=0 ' + TOP + '=0 ' + CUR + '=nil ' + DONE + '=true ' + RESULT + '={} HOST_ERROR({__lph_crash=true},0)');
                break;
            case 'STACKADAPT': {
                L.push('   local raw=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1 local t=' + S + '[' + SP + '] local z=raw>=257 local n=z and raw-256 or raw');
                L.push('   local mt={__len=function() return n end,__index={}}');
                L.push('   mt.__index.pack=function(_,lo,hi) if lo==nil then lo=z and 0 or 1 end if hi==nil then hi=z and (n-1) or n end lo=math.floor(tonumber(lo) or 0) hi=math.floor(tonumber(hi) or -1) local out={n=0} if lo<=hi then for k=lo,hi do local off=z and k or k-1 if off>=0 and off<n then local key=z and off or off+1 out.n=out.n+1 out[out.n]=t[key] end end end return out end');
                L.push('   mt.__index.unpack=function(_,lo,hi) if lo==nil then lo=z and 0 or 1 end if hi==nil then hi=z and (n-1) or n end lo=math.floor(tonumber(lo) or 0) hi=math.floor(tonumber(hi) or -1) local out={n=0} if lo<=hi then for k=lo,hi do local off=z and k or k-1 if off>=0 and off<n then local key=z and off or off+1 out.n=out.n+1 out[out.n]=t[key] end end end return ' + UNP + '(out,1,out.n) end');
                L.push('   mt.__index.clear=function(_,lo,hi) if lo==nil then lo=z and 0 or 1 end if hi==nil then hi=z and (n-1) or n end lo=math.floor(tonumber(lo) or 0) hi=math.floor(tonumber(hi) or -1) if lo<=hi then for k=lo,hi do local off=z and k or k-1 if off>=0 and off<n then local key=z and off or off+1 t[key]=nil end end end end');
                L.push('   setmetatable(t,mt)');
                break;
            }
            case 'STACKNEW': {
                L.push('   local raw=' + CODE + '.c[' + PC + '] ' + PC + '= ' + PC + '+1 local z=raw>=257 local n=z and raw-256 or raw');
                L.push('   local b=' + STACK_NEXT + ' ' + STACK_NEXT + '=b+n');
                L.push('   if n<1 or n>256 then error("VM_STACKALLOC",0) end');
                L.push('   ' + STACK_META + '[b]={n=n,z=z} for i=0,n-1 do ' + STACK_STORAGE + '[b+i]=nil end ' + CUR + '.sasizes[b]=n ' + CUR + '.sazero=' + CUR + '.sazero or {} ' + CUR + '.sazero[b]=z ' + TOP + '=math.max(' + TOP + ',' + BASE + '+255)');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=b');
                break;
            }
            case 'STACKGET': {
                L.push('   local _mode=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local idx=' + S + '[' + SP + '] local b=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-2');
                L.push('   local m=' + STACK_META + '[b] local n=m and m.n local z=m and m.z if not n then error("VM_STACKALLOC_HANDLE",0) end');
                L.push('   if not n then error("VM_STACKALLOC_HANDLE",0) end');
                L.push('   idx=math.floor(tonumber(idx) or 0) local off=z and idx or idx-1 if off<0 or off>=n then ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=nil else ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=' + STACK_STORAGE + '[b+off] end');
                break;
            }
            case 'STACKSET': {
                L.push('   local _mode=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local v=' + S + '[' + SP + '] local idx=' + S + '[' + SP + '-1] local b=' + S + '[' + SP + '-2] ' + SP + '=' + SP + '-3');
                L.push('   local m=' + STACK_META + '[b] local n=m and m.n local z=m and m.z if not n then error("VM_STACKALLOC_HANDLE",0) end idx=math.floor(tonumber(idx) or 0) local off=z and idx or idx-1');
                L.push('   if not n or off<0 or off>=n then error("VM_STACKALLOC_INDEX",0) end');
                L.push('   ' + STACK_STORAGE + '[b+off]=v');
                break;
            }
            case 'STACKLEN': {
                L.push('   local b=' + S + '[' + SP + '] local m=' + STACK_META + '[b] local n=m and m.n if not n then error("VM_STACKALLOC_HANDLE",0) end ' + S + '[' + SP + ']=n');
                break;
            }
            case 'STACKPACK': case 'STACKUNPACK': {
                L.push('   local hi=' + S + '[' + SP + '] local lo=' + S + '[' + SP + '-1] local b=' + S + '[' + SP + '-2] ' + SP + '=' + SP + '-3');
                L.push('   local m=' + STACK_META + '[b] local n=m and m.n local z=m and m.z if not n then error("VM_STACKALLOC_HANDLE",0) end');
                L.push('   if lo==nil then lo=z and 0 or 1 end if hi==nil then hi=z and (n-1) or n end lo=math.floor(tonumber(lo) or 0) hi=math.floor(tonumber(hi) or -1)');
                L.push('   local t={n=0}; if lo<=hi then for k=lo,hi do local off=z and k or k-1 if off>=0 and off<n then t.n=t.n+1 t[t.n]=' + STACK_STORAGE + '[b+off] end end end');
                if (name === 'STACKUNPACK') L.push('   t[' + MARK + ']=true');
                L.push('   ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=t');
                break;
            }
            case 'STACKCLEAR': {
                L.push('   local hi=' + S + '[' + SP + '] local lo=' + S + '[' + SP + '-1] local b=' + S + '[' + SP + '-2] ' + SP + '=' + SP + '-3');
                L.push('   local m=' + STACK_META + '[b] local n=m and m.n local z=m and m.z if not n then error("VM_STACKALLOC_HANDLE",0) end');
                L.push('   if lo==nil then lo=z and 0 or 1 end if hi==nil then hi=z and (n-1) or n end lo=math.floor(tonumber(lo) or 0) hi=math.floor(tonumber(hi) or -1)');
                L.push('   if lo<=hi then for k=lo,hi do local off=z and k or k-1 if off>=0 and off<n then ' + STACK_STORAGE + '[b+off]=nil end end end');
                L.push('   local t={n=0} t[' + MARK + ']=true ' + SP + '=' + SP + '+1 ' + S + '[' + SP + ']=t');
                break;
            }
            case 'NEWF':
                // capture the FULL upvalue chain: the current function's
                // own links (LK = outer upvalues) + all live scopes (SC).
                // A nested closure must see BOTH its enclosing scopes AND
                // everything the enclosing function captured.
                L.push('   local ci=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   if ci >= 2147483648 then ci = ci - 4294967296 end');
                L.push('   if ci<0 then');
                L.push('    local native=' + '__NATIVE__' + '[-ci]');
                L.push('    if not native then error("VM_NATIVE_MISSING",0) end');
                 L.push('    local caps=' + NATIVE_STACK_META + '[-ci]');
                 L.push('    if caps then');
                 L.push('     local baseNative=native');
                 // Cells are resolved ONCE, at closure creation time, exactly
                 // like a real Lua closure capturing its upvalue. Resolving per
                 // call would leave an escaping closure unbound, because the
                 // defining frame's scopes are gone by the time it is invoked.
                 L.push('     local entry={}');
                 L.push('     for _ci=1,#caps do local cap=caps[_ci] local cell=nil for _si=#' + SC + ',1,-1 do local c=' + SC + '[_si][cap.id] if c then cell=c break end end if not cell then for _li=#' + LK + ',1,-1 do local c=' + LK + '[_li][cap.id] if c then cell=c break end end end entry[cap.name]=(cap.k=="upval") and cell or (cell and cell[1]) end');
                 L.push('     native=function(...)');
                 L.push('      ' + STACK_CTX + '[#' + STACK_CTX + '+1]=entry');
                 L.push('      local outcome={pcall(function(...) return ' + PK + '(baseNative(...)) end,...)}');
                 L.push('      ' + STACK_CTX + '[#' + STACK_CTX + ']=nil');
                 L.push('      if not outcome[1] then error(outcome[2],0) end return ' + UNP + '(outcome[2])');
                 L.push('     end');
                 L.push('    end');
                L.push('    ' + SP + '=' + SP + '+1');
                L.push('    ' + S + '[' + SP + ']=native');
                L.push('   else');
                L.push('    local links={}');
                L.push('    for i=1,#' + LK + ' do links[#links+1]=' + LK + '[i] end');
                L.push('    for i=1,#' + SC + ' do links[#links+1]=' + SC + '[i] end');
                L.push('    ' + SP + '=' + SP + '+1');
                L.push('    ' + S + '[' + SP + ']=' + VMFN + '(ci,links)');
                L.push('    local bridgeName=' + VM_BRIDGE_MAP + '[ci] if bridgeName then ' + VM_BRIDGE_VALUES + '[bridgeName]=' + S + '[' + SP + '] end');
                L.push('   end');
                break;
            case 'BAND': case 'BOR': case 'BXOR': case 'SHL': case 'SHR': {
                var bitKind = { BAND: 1, BOR: 2, BXOR: 3, SHL: 4, SHR: 6 }[name];
                L.push('   local b=' + S + '[' + SP + '] local a=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-1 ' + S + '[' + SP + ']=' + BIT + '(' + bitKind + ',a,b)');
                break;
            }
            case 'BNOT':
                L.push('   ' + S + '[' + SP + ']=' + BIT + '(5,' + S + '[' + SP + '])');
                break;
            case 'ADD': case 'ADD_R': case 'SUB': case 'MUL': case 'MUL_R': case 'DIV': case 'MOD':
            case 'POW': case 'CONCAT': case 'EQ': case 'NEQ':
            case 'LT': case 'LE': case 'GT': case 'GE': {
                // The handler names a combinator group and a tag, never the
                // operator. Which group holds this operation, under which tag,
                // and with which body shape is decided per build.
                //
                // ADD_R / MUL_R genuinely reverse the operands. They previously
                // shared ADD's / MUL's body, which made the opcode meaningless
                // while the pipeline still treated it as a legal rewrite: that
                // is what let operand order vary per build and reach Lua's
                // metamethod dispatch reversed (see production-pipeline.js).
                var reversed = (name === 'ADD_R' || name === 'MUL_R');
                var opKey = { ADD: 'ADD', ADD_R: 'ADD', SUB: 'SUB', MUL: 'MUL', MUL_R: 'MUL', DIV: 'DIV', MOD: 'MOD', POW: 'POW', CONCAT: 'CONCAT', EQ: 'EQ', NEQ: 'NEQ', LT: 'LT', LE: 'LE', GT: 'GT', GE: 'GE' }[name];
                var oc2 = OPM[opKey];
                L.push('   local b=' + S + '[' + SP + '] local a=' + S + '[' + SP + '-1] ' + SP + '=' + SP + '-1');
                var argA = reversed ? 'b' : 'a';
                var argB = reversed ? 'a' : 'b';
                if (COMBINATORS_ENABLED) L.push('   ' + S + '[' + SP + ']=' + oc2.g + '(' + oc2.t + ',' + argA + ',' + argB + ')');
                else L.push('   ' + S + '[' + SP + ']=' + argA + ' ' + INLINE_SYM[name] + ' ' + argB);
                break;
            }
            case 'LOADK_ADD': case 'LOADK_MUL': {
                var fkey = name === 'LOADK_ADD' ? 'ADD' : 'MUL';
                var fc = OPM[fkey];
                L.push('   local ix=' + CODE + '.c[' + PC + '] ' + PC + '=' + PC + '+1');
                L.push('   local n=' + NC + '[ix] if not n then n=tonumber(' + D + '(ix)) ' + NC + '[ix]=n end');
                if (COMBINATORS_ENABLED) L.push('   ' + S + '[' + SP + ']=' + fc.g + '(' + fc.t + ',' + S + '[' + SP + '],n)');
                else L.push('   ' + S + '[' + SP + ']=' + S + '[' + SP + ']' + (name === 'LOADK_ADD' ? '+' : '*') + 'n');
                break;
            }
            case 'NOT': L.push('   ' + S + '[' + SP + ']=' + (COMBINATORS_ENABLED ? OPM.NOT.g + '(' + OPM.NOT.t + ',' : 'not ') + S + '[' + SP + ']' + (COMBINATORS_ENABLED ? ')' : '')); break;
            case 'NEG': L.push('   ' + S + '[' + SP + ']=' + (COMBINATORS_ENABLED ? OPM.NEG.g + '(' + OPM.NEG.t + ',' : '-') + S + '[' + SP + ']' + (COMBINATORS_ENABLED ? ')' : '')); break;
            case 'LEN': L.push('   ' + S + '[' + SP + ']=' + (COMBINATORS_ENABLED ? OPM.LEN.g + '(' + OPM.LEN.t + ',' : '#') + S + '[' + SP + ']' + (COMBINATORS_ENABLED ? ')' : '')); break;
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
        if (handlerForm === 'local') {
            // Decoy leaves participate in the same decision tree as the real
            // handlers, so a reader cannot tell decoys from live handlers by
            // looking at the dispatch structure alone.
            var dvar = handlerVar();
            treeEntries.push({ key: ktOf(deadVal), fn: dvar });
            L.push(' local ' + dvar + '=function()');
        } else {
            L.push(' ' + HAND + '[' + ktExpr(deadVal) + ']=function()');
        }
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
    // Recover the real output buffer; the handler bodies now sit in `handlerLines`.
    var handlerLines = L;
    L = _Lreal;
    var DISPATCH = nm('dp');
    var treeForm = (dispatcherStrategy === DISPATCHER_STRATEGIES.TREE);
    if (treeForm) {
        // ---- opaque per-build decision tree -------------------------------
        // The opcode is pushed through a per-build affine key map, then routed
        // through a balanced binary tree over the permuted keys. Handlers are
        // independent generated locals, so the artifact exposes neither an
        // "opcode number -> handler" table nor a flat numeric switch.
        L.push('-- dispatcher strategy: opaque_decision_tree');
        var BADOP = nm('bo');
        L.push(' local ' + BADOP + '=function(v) error("bad opcode "..tostring(v),0) end');
        L.push(' local ' + DISPATCH + '=function(' + OP + ')');
        // Handlers are locals of this function, so they cost nothing in
        // upvalues here and each one keeps its usual VM-state upvalues.
        for (var _hi = 0; _hi < handlerLines.length; _hi++) L.push(handlerLines[_hi]);
        L.push('  local ' + KT + '=(' + OP + '*' + ktA + '+' + ktB + ')%' + ktM);

        var entries = treeEntries.slice().sort(function (a, b) { return a.key - b.key; });
        // Per-build comparison style: both forms are correct, they differ in
        // where the pivot sits, so two builds produce differently shaped trees.
        var treeStyle = rnd(2);

        // Small subtrees are emitted as a linear guarded chain rather than
        // split again: a 2-element split can produce an empty partition, and
        // recursing on an empty partition never terminates.
        function emitLinear(items, indent) {
            if (items.length === 1) {
                L.push(indent + 'if ' + KT + '==' + items[0].key + ' then ' + items[0].fn + '() else ' + BADOP + '(' + OP + ') end');
                return;
            }
            for (var q = 0; q < items.length; q++) {
                L.push(indent + (q === 0 ? 'if ' : 'elseif ') + KT + '<=' + items[q].key + ' then ' + items[q].fn + '()');
            }
            L.push(indent + 'else ' + BADOP + '(' + OP + ') end');
        }
        function emitNode(items, indent) {
            if (items.length <= 3) { emitLinear(items, indent); return; }
            var mid = items.length >> 1;
            if (treeStyle === 0) {
                L.push(indent + 'if ' + KT + '<' + items[mid].key + ' then');
                emitNode(items.slice(0, mid), indent + ' ');
                L.push(indent + 'else');
                emitNode(items.slice(mid), indent + ' ');
            } else {
                L.push(indent + 'if ' + KT + '<=' + items[mid].key + ' then');
                emitNode(items.slice(0, mid + 1), indent + ' ');
                L.push(indent + 'else');
                emitNode(items.slice(mid + 1), indent + ' ');
            }
            L.push(indent + 'end');
        }
        emitNode(entries, '  ');
        L.push(' end');
    } else if (dispatcherStrategy === DISPATCHER_STRATEGIES.BRANCH) {
        L.push('-- dispatcher strategy: branch');
        L.push(' local ' + DISPATCH + '=function(' + OP + ')');
        // Compare against the permuted key, not the raw opcode, so the chain is
        // not a readable "opcode number -> operation" switch.
        L.push('  local ' + KT + '=' + ktExpr(OP));
        var dispatchOps = OP_NAMES;
        for (var di = 0; di < dispatchOps.length; di++) {
            var dispatchOp = dispatchOps[di];
            var dispatchPrefix = di === 0 ? '  if ' : '  elseif ';
            L.push(dispatchPrefix + KT + '==' + ktExpr(OPCODES[dispatchOp]) + ' then ' + HAND + '[' + ktExpr(OPCODES[dispatchOp]) + ']()');
        }
        L.push('  else error("bad opcode "..tostring(' + OP + '),0) end');
        L.push(' end');
    } else {
        L.push('-- dispatcher strategy: table');
    }
    // Scheduler loop: no host-recursive RUN calls. It advances FRAMES until
    // the requested stop depth is reached. INVOKE is only a native boundary
    // for APIs such as host pcall/metamethod/coroutine that require a Lua
    // callable; ordinary VM CALL uses the same scheduler directly.
    L.push(' ' + SCHED + '=function(stop)');
    L.push('  if ' + POISON + ' or ' + DONE + ' then HOST_ERROR("LPH_CRASH",0) end');
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
    // Assignment (not a local) so the loader-level SRCL that FIXERR closes
    // over observes the line of the instruction that actually failed.
    L.push('   ' + SRCL + '=' + CODE + '.l and ' + CODE + '.l[' + PC + '-1] or nil');
    if (!treeForm) L.push('   local _fn=' + HAND + '[' + ktExpr(OP) + ']');
    L.push('   local _yieldop=(' + OP + '==' + OPCODES.CALL + ' or ' + OP + '==' + OPCODES.CALLM + ')');
    L.push('   local _ok,_err=true,nil');
    // The tree form has no _fn: the dispatch function owns the unknown-opcode
    // error, so the call site is a plain invocation on both the yielded and the
    // pcall-protected path.
    var dispatchCall = (dispatcherStrategy === DISPATCHER_STRATEGIES.BRANCH || treeForm) ? DISPATCH + '(' + OP + ')' : '_fn()';
    if (treeForm) {
        L.push('   if _yieldop and not (' + CUR + ' and ' + CUR + '.prot) then ' + dispatchCall + ' else _ok,_err=pcall(function() ' + dispatchCall + ' end) end');
    } else {
        L.push('   if _yieldop and not (' + CUR + ' and ' + CUR + '.prot) then if _fn then ' + dispatchCall + ' else error("bad opcode "..tostring(' + OP + '),0) end else _ok,_err=pcall(function() if _fn then ' + dispatchCall + ' else error("bad opcode "..tostring(' + OP + '),0) end end) end');
    }
    L.push('   if not _ok then');
    // Documented ERROR_HANDLING: when the executing chunk carries an original
    // line map, report the error against the ORIGINAL source line instead of
    // the obfuscated artifact line. The replacement is driven entirely by
    // per-instruction data recorded at compile time, never by a constant.
    L.push('    _err=' + FIXERR + '(_err)');
    L.push('    if type(_err)=="table" and _err.__lph_crash then ' + POISON + '=true ' + DONE + '=true ' + CUR + '=nil for _ck in pairs(' + FRAMES + ') do ' + FRAMES + '[_ck]=nil end ' + FP + '=0 for _rk=0,' + TOP + ' do ' + REG + '[_rk]=nil end HOST_ERROR("LPH_CRASH",0) end');
    L.push('    local handled=false local ei=' + FP + '');
    L.push('    while ei>stop do');
    L.push('     local ef=' + FRAMES + '[ei] local meta=ef and ef.prot');
    L.push('     if meta then');
    L.push('      for k=' + FP + ',ei+1,-1 do local z=' + FRAMES + '[k] if z then for j=z.base,z.top do ' + REG + '[j]=nil end if z.sanext and z.sanext>z.base+256 then for j=z.base+256,z.sanext-1 do ' + REG + '[j]=nil end end end ' + FRAMES + '[k]=nil end');
    L.push('      ' + FP + '=ei ' + LOADF + '(ef)');
    // `ef` is the frame proven to contain the protection metadata. Use that
    // object directly during unwinding; looking it up again through FRAMES[FP]
    // made a concurrent/re-entrant callback turn the real error into
    // `attempt to index nil with 'base'`.
    L.push('      local bad=ef local caller=meta.caller ' + FRAMES + '[' + FP + ']=nil ' + FP + '=' + FP + '-1');
    L.push('      if not caller then error(_err,0) end');
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
    L.push('  if ' + POISON + ' then HOST_ERROR("LPH_CRASH",0) end');
    L.push('  local thr=coroutine.running()');
    L.push('  if thr~=' + ROOTTHREAD + ' then');
    // Key the per-coroutine state on the THREAD OBJECT, not on tostring(thr).
    //
    // This is the actual cause of VM_STATE_FRAME_OWNER on a real executor, and it took
    // four rounds to find because fengari hides it: fengari's tostring(coroutine)
    // returns a unique address per thread, so the key never collided. The user's
    // executor does not, so `tostring(thr)` was the SAME string for every coroutine,
    // and every thread shared one state slot.
    //
    // The consequence is exactly the observed error. Coroutine A's saved FP, BASE, TOP
    // and frame array get loaded into coroutine B. B then resumes with a frame pointer
    // that names one of A's frames: FP is in range and the frame exists, so the only
    // thing that fails is the owner tag - VM_STATE_FRAME_OWNER, repeated on every
    // coroutine re-entry, i.e. every tween completion, signal fire and spawned thread.
    //
    // Coroutines are first-class values in Luau, so they can be table keys directly.
    // A string key was never needed. tostring is retained only as a fallback for a
    // runtime where the thread is somehow not usable as a key, and the fallback is
    // deliberately weak-keyed so colliding entries cannot pin state alive.
    L.push('   local _key=thr local _st=' + COSTATES + '[_key]');
    L.push('   if not _st and type(thr)~="thread" then _key=tostring(thr) _st=' + COSTATES + '[_key] end');
    L.push('   local st=_st');
    L.push('   if not st then st={rg={},fr={},fp=0,ba=0,to=0,cu=nil,co=nil,pc=1,sp=0,sc={{}},lk={},va=nil,nb=0,dn=false,rs={}} ' + COSTATES + '[_key]=st end ' + ACTIVE + '=st');
    // quiet=true here, for the same reason as the host-call restore, and it is the
    // path that actually produces the user's symptom.
    //
    // This is the INVOKE re-entry point: it runs whenever the VM is entered from a
    // coroutine Roblox created - task.spawn, task.defer, a Tween Completed handler, a
    // signal callback. `st` is a per-coroutine state keyed by tostring(thr), and the
    // line above only re-saves when FRAMES is ALREADY st.fr. So on the common re-entry
    // - a coroutine that was not the last thing running - the state is loaded exactly
    // as it was left, including an FP whose frame was popped and nil'd while another
    // coroutine ran. The self-check then reads that vacated slot and raises
    // VM_STATE_FRAME_OWNER.
    //
    // On a live executor that is a LOOP, not a one-off: every tween completion, every
    // signal fire and every spawned thread re-enters here, so the error repeats until
    // the user stops it. 43cb024 quieted the host-call restore and left this one
    // loud, which is why the spam survived that commit.
    L.push('   if ' + FRAMES + '==st.fr and ' + FP + '>0 then ' + SAVEVM + '(st) end ' + LOADVM + '(st)');
    L.push('   if ' + FP + '==0 then');
    L.push('    ' + PUSHF + '(d.chunk,d.links,{...},nil,0,nil)');
    L.push('    ' + SCHED + '(0)');
    // ditto: returning to the root thread restores the root snapshot, whose FRAMES
    // has legitimately moved on while this coroutine ran.
    L.push('    local rr=' + RESULT + ' or {} ' + SAVEVM + '(st) ' + LOADVM + '(' + ROOTSTATE + ') return ' + UNP + '(rr)');
    L.push('   end');
    L.push('   local stop=' + FP + ' local caller=' + FRAMES + '[' + FP + '] ' + SAVEF + '(caller)');
    L.push('   if not caller then error("VM_STATE_CALLER_MISSING",0) end');
    L.push('   ' + PUSHF + '(d.chunk,d.links,{...},' + SP + '+1,0,caller)');
    L.push('   ' + SCHED + '(stop)');
    // The stop frame is the caller and must survive the nested invocation. A
    // re-entrant host callback can otherwise leave the array slot empty even
    // though the caller object itself was saved immediately above. Restore the
    // saved caller instead of dereferencing a nil frame (which used to surface
    // as the misleading "attempt to index nil with 'base'" in LOADF).
    L.push('   local cf=' + FRAMES + '[' + FP + '] or caller if not ' + FRAMES + '[' + FP + '] then ' + FRAMES + '[' + FP + ']=cf end if not cf then error("VM_STATE_CALLER_MISSING",0) end ' + LOADF + '(cf) local rr=cf.lastResult or {} cf.lastResult=nil return ' + UNP + '(rr)');
    L.push('  end');
    // A native function can call a VM function synchronously while the outer
    // VM is active. Isolate that nested invocation so its FRAMES/REG cannot
    // overwrite the outer scheduler state, then restore the outer references.
    var invokeState = nm('is');
    var invokeArgs = nm('ia');
    L.push('  local ' + invokeState + '={rg=' + REG + ',fr=' + FRAMES + ',fp=' + FP + ',ba=' + BASE + ',to=' + TOP + ',cu=' + CUR + ',co=' + CODE + ',pc=' + PC + ',sp=' + SP + ',sc=' + SC + ',lk=' + LK + ',va=' + VA + ',nb=' + NEXTBASE + ',dn=' + DONE + ',rs=' + RESULT + '}');
    L.push('  ' + REG + '={} ' + FRAMES + '={} ' + FP + '=0 ' + BASE + '=0 ' + TOP + '=0 ' + CUR + '=nil ' + CODE + '=nil ' + PC + '=1 ' + SP + '=0 ' + SC + '={{}} ' + LK + '={} ' + VA + '=nil ' + NEXTBASE + '=0 ' + DONE + '=false ' + RESULT + '={}');
    L.push('  local ' + invokeArgs + '={...}');
    L.push('  local nestedOk,nestedErr=pcall(function() ' + PUSHF + '(d.chunk,d.links,' + invokeArgs + ',nil,0,nil) ' + SCHED + '(0) end)');
    L.push('  local rr=' + RESULT + ' or {}');
    L.push('  if ' + POISON + ' then HOST_ERROR("LPH_CRASH",0) end');
    L.push('  ' + REG + '=' + invokeState + '.rg ' + FRAMES + '=' + invokeState + '.fr ' + FP + '=' + invokeState + '.fp ' + BASE + '=' + invokeState + '.ba ' + TOP + '=' + invokeState + '.to ' + CUR + '=' + invokeState + '.cu ' + CODE + '=' + invokeState + '.co ' + PC + '=' + invokeState + '.pc ' + SP + '=' + invokeState + '.sp ' + SC + '=' + invokeState + '.sc ' + LK + '=' + invokeState + '.lk ' + VA + '=' + invokeState + '.va ' + NEXTBASE + '=' + invokeState + '.nb ' + DONE + '=' + invokeState + '.dn ' + RESULT + '=' + invokeState + '.rs');
    L.push('  if not nestedOk then error(nestedErr,0) end');
    L.push('  return ' + UNP + '(rr)');
    L.push(' end');
    L.push(' ' + SCHED + '(0)');
    L.push(' return ' + UNP + '(' + RESULT + ')');
    L.push('end');
    // boot: run chunk #last (top-level), then return the runner for reuse
    if (build.prechecks && build.prechecks.length) {
        for (var pci = 0; pci < build.prechecks.length; pci++) {
            var check = build.prechecks[pci];
            var checkOk = nm('pco');
            var checkValue = nm('pcv');
            L.push('local ' + checkOk + ',' + checkValue + '=pcall(' + RUN + ',' + check.chunk + ',{})');
            L.push('if not ' + checkOk + ' then if type(' + checkValue + ')=="table" and ' + checkValue + '.__lph_crash then HOST_ERROR("LPH_CRASH",0) end error("LPH_PRECHECK",0) end');
            if (check.array) {
                L.push('if type(' + checkValue + ')~="table" or #' + checkValue + '~=' + check.expected.length + ' then error("LPH_PRECHECK",0) end');
                for (var cei = 0; cei < check.expected.length; cei++) {
                    L.push('if type(' + checkValue + '[' + (cei + 1) + '])~="number" or ' + checkValue + '[' + (cei + 1) + ']~=tonumber(' + D + '(' + check.expected[cei] + ')) then error("LPH_PRECHECK",0) end');
                    // Fold the verified runtime value into the main-blob
                    // key. The compile-time main blob uses the identical
                    // deterministic chain over the expected values.
                    L.push(SEEDV + '=(' + SEEDV + '*33+(' + checkValue + '[' + (cei + 1) + ']%4294967296))%' + '4294967296');
                }
            } else {
                L.push('if type(' + checkValue + ')~="number" or ' + checkValue + '~=tonumber(' + D + '(' + check.expected[0] + ')) then error("LPH_PRECHECK",0) end');
                L.push(SEEDV + '=(' + SEEDV + '*33+(' + checkValue + '%4294967296))%4294967296');
            }
        }
    }
    if (bindPrechecks) {
        L.push('-- VM_MAIN_PAYLOAD_AFTER_PRECHECK');
        emitEncryptedBlob(BL, mainBlob, SEEDV);
        emitDecode(BL);
        for (var clearCi = 0; clearCi < build.chunks.length; clearCi++) {
            if (build.chunks[clearCi].meta && build.chunks[clearCi].meta.precheck) L.push(CH + '[' + (clearCi + 1) + ']=nil');
        }
    }
    L.push('do');
    L.push(' local ok,err=pcall(' + RUN + ',' + build.chunks.length + ',{})');
    L.push(' if not ok then if type(err)=="table" and err.__lph_crash then HOST_ERROR("LPH_CRASH",0) end error(err,0) end');
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
