// Delta-debug the smallest failing prefix down to something a human can read.
//
// A statement-by-statement prefix search finds where the defect becomes VISIBLE, not
// what causes it. In this script, adding `notifContainer.Parent = screenGui` - a
// statement with nothing unusual in it - was enough to turn a passing run into a
// failing one, because perturbing the statement list reshuffles the VM's register
// allocation and lets a latent operand-stack desync reach a fatal point. Treating
// that statement as "the bug" would be exactly the wrong conclusion.
//
// So: greedily delete statements for as long as the failure survives AND the
// unobfuscated file still runs clean. What is left is the smallest input that still
// separates plain Lua from the VM, which is the thing worth fixing.
import luaparse from 'luaparse';
import fs from 'node:fs';
import fengari from 'fengari';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';
import { vmSetLuaparse } from '../vm-pass.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

// applyBytecodeVm directly: vmPass:false means `vmCode = code`, so going through
// applyCustomObfuscator can only ever test the identity function. Both the bytecode
// and lite tiers land here (vm-pass.js routes to this module), so this is the compiler
// under test in every configuration that obfuscates anything.
const generate = (text) => applyBytecodeVm(text, { profile: 'FAST' });

const STUB = fs.readFileSync(new URL('./roblox_stub.lua', import.meta.url), 'utf8');
const IN = process.argv[2];
if (!IN) { console.log('usage: node tools/vm_delta.mjs <file.lua>'); process.exit(2); }
let src = fs.readFileSync(IN, 'utf8');

function run(code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(STUB)) !== lua.LUA_OK) return { ok: false, err: 'STUB' };
    const st = lauxlib.luaL_dostring(L, to_luastring(code));
    const e = lua.lua_tostring(L, -1);
    const call0 = (name) => {
        lua.lua_getglobal(L, to_luastring(name));
        if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) return { err: name + ' missing' };
        if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) return { err: to_jsstring(lua.lua_tostring(L, -1)) };
        const t = lua.lua_type(L, -1);
        if (t === lua.LUA_TNUMBER) return { n: lua.lua_tointeger(L, -1) };
        if (t === lua.LUA_TSTRING) return { s: to_jsstring(lua.lua_tostring(L, -1)) };
        return { err: 'type ' + t };
    };
    return { ok: st === lua.LUA_OK, err: e ? to_jsstring(e) : '', count: call0('COUNT').n, visible: call0('VISIBLES').s, tree: call0('TREE').s || '', spawn: call0('SPAWNERRORS').s || '' };
}
function canary(obf) {
    const cm = String(obf).match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    return cm ? '_G.' + cm[1] + '=' + cm[2] + '\n' : '';
}

function parse(text) {
    try { return luaparse.parse(text, { ranges: true, comments: false }); } catch (e) { return null; }
}

// returns 'match' | 'differs' | 'error' | 'harness' | 'unparseable'
function verdict(text) {
    if (!parse(text)) return 'unparseable';
    const base = run(text);
    // A baseline that faulted inside a spawned thread has not proven anything, so it
    // disqualifies the candidate rather than being scored as a pass.
    if (!base.ok || base.spawn) return 'harness';
    let obf;
    try { obf = generate(text); } catch (e) { return 'generator'; }
    if (!obf) return 'generator';
    const r = run(canary(obf) + obf);
    if (!r.ok || r.spawn) return 'error';
    return (r.count + '|' + r.visible) === (base.count + '|' + base.visible) ? 'match' : 'differs';
}

const bad = (v) => v === 'differs' || v === 'error';
console.log('input: ' + IN + '  (' + src.length + ' bytes)');
console.log('initial verdict: ' + verdict(src) + '\n');

function statements(text) {
    const ast = parse(text);
    if (!ast) return null;
    return ast.body.map(s => text.slice(s.range[0], s.range[1]));
}

let guard = 0;
let changed = true;
while (changed && guard++ < 400) {
    changed = false;
    const st = statements(src);
    if (!st) break;
    for (let i = 0; i < st.length; i++) {
        const trial = st.slice(0, i).concat(st.slice(i + 1)).join('\n') + '\n';
        if (bad(verdict(trial))) {
            src = trial;
            changed = true;
            process.stdout.write('\r  removed a statement, now ' + src.length + ' bytes / ' + statements(src).length + ' statements   ');
            break;
        }
    }
}
console.log('\n\nMINIMAL:\n');
console.log(src);
fs.mkdirSync('tools/_cases', { recursive: true });
fs.writeFileSync('tools/_cases/delta_minimal.lua', src, 'utf8');
const b = run(src);
const v = run(canary(generate(src)) + generate(src));
console.log('verdict: ' + verdict(src));
console.log('plain  : instances=' + b.count + ' visible=' + JSON.stringify(b.visible) + ' spawnErrors=' + JSON.stringify(b.spawn));
console.log('compiled: instances=' + v.count + ' visible=' + JSON.stringify(v.visible) + ' spawnErrors=' + JSON.stringify(v.spawn));
console.log('written to tools/_cases/delta_minimal.lua');
