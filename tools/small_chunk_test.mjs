// Small scripts are chunked too.
//
// The bytecode blob is cut into keyed segments by byte count, not by source
// line, so a one-line script still gets several segments. Each segment's key
// depends on the plaintext of the one before it, so no segment decodes alone.
// The VM output must still run and produce exactly what the script produces.
//
// Run: node tools/small_chunk_test.mjs

import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const req = createRequire(path.join(ROOT, 'package.json'));
const luaparse = req('luaparse');
const fengari = req('fengari');
const vmb = await import(pathToFileURL(path.join(ROOT, 'vm-bytecode.js')).href);
vmb.vmBCSetLuaparse(luaparse);

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  ok   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

const CASES = [
    { name: 'one-line script', src: 'local x="secret_123"; print(x)', expect: ['secret_123'] },
    { name: 'five-line script', src: 'local a = 2\nlocal b = 3\nlocal c = a * b\nprint(c)\nprint(a + b)', expect: ['6', '5'] },
];

console.log('[SC] a small script is split into keyed segments and still runs');
for (const c of CASES) {
    const out = vmb.applyBytecodeVm(c.src);
    check(c.name + ': the VM applies', !!out);
    if (!out) continue;

    const m = out.match(/local segs=\{([\d,]+)\}/);
    const segs = m ? m[1].split(',').map(Number) : [];
    check(c.name + ': split into at least 3 keyed segments', segs.length >= 3, 'got ' + segs.length);

    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const printed = [];
    lua.lua_pushcfunction(L, (s) => {
        const n = lua.lua_gettop(s);
        const parts = [];
        for (let i = 1; i <= n; i++) parts.push(to_jsstring(lua.lua_tostring(s, i)));
        printed.push(parts.join('\t'));
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('print'));
    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(out));
    const runStatus = loadStatus === 0 ? lua.lua_pcall(L, 0, 0, 0) : -1;
    const err = loadStatus !== 0 || runStatus !== 0 ? to_jsstring(lua.lua_tostring(L, -1)) : '';
    check(c.name + ': loads and runs', !err, err.slice(0, 120));
    check(c.name + ': prints what the script prints', JSON.stringify(printed) === JSON.stringify(c.expect),
        'got ' + JSON.stringify(printed) + ', want ' + JSON.stringify(c.expect));
}

console.log('');
console.log('SMALL CHUNK   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
