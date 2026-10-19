// tools/clipboard_guard_test.mjs
//
// THE CLIPBOARD GUARD, AND THE FALSE POSITIVE IT USED TO HAVE.
//
// The loader used to read the user's clipboard and ABORT if it already had
// more than ten characters in it. That is a false-positive machine: most of
// the time a user has copied something, and the script they ran then did
// absolutely nothing - silently. Their own setclipboard() call never ran,
// because the payload was never delivered.
//
// So there are two properties, and they pull in opposite directions:
//
//   1. A clipboard that already has content is NOT an attack. The script
//      must run.
//   2. A clipboard that is HOOKED is an attack. The script must not run.
//
// Property 1 is a false-positive guard and property 2 is the real one. This
// runs the ACTUAL artifact the obfuscator emits, on a real Lua VM, with four
// executor shapes.
//
// Run: node tools/clipboard_guard_test.mjs
import luaparse from 'luaparse';
import fengari from 'fengari';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';

vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

const SRC = 'MARKER="REAL_RAN"\nCLIP=setclipboard and setclipboard("payload")\n';

const opts = { intensity: 5, antiTamper: true, antiSkid: false, antiLogger: false };
const obf = applyCustomObfuscator(SRC, opts);
luaparse.parse(obf);
ok('the artifact compiles (' + obf.length + ' bytes)');

// Run it with a mocked executor. `prelude` is what the executor provides.
function run(prelude) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_dostring(L, to_luastring(
        'SHUTDOWN=false\n' +
        'game={Shutdown=function() SHUTDOWN=true end,GetService=function() return {} end}\n' +
        'getgenv=function() return _G end\n' +
        prelude
    ));
    const st = lauxlib.luaL_dostring(L, to_luastring(obf));
    let err = null;
    if (st !== lua.LUA_OK) err = to_jsstring(lua.lua_tostring(L, -1));
    const marker = (() => {
        lua.lua_getglobal(L, to_luastring('MARKER'));
        const v = lua.lua_tostring(L, -1);
        return v ? to_jsstring(v) : null;
    })();
    const clip = (() => {
        lua.lua_getglobal(L, to_luastring('CLIPBOARD'));
        const v = lua.lua_tostring(L, -1);
        return v ? to_jsstring(v) : null;
    })();
    lauxlib.luaL_close ? lauxlib.luaL_close(L) : null;
    return { marker, clip, err };
}

console.log('\n[C1] a NORMAL executor: no clipboard at all -> the script runs...');
{
    const r = run('setclipboard=function(s) CLIPBOARD=s end\ngetclipboard=function() return "" end\n');
    if (r.err) no('threw: ' + r.err);
    else if (r.marker === 'REAL_RAN') ok('the payload ran');
    else no('the payload did not run (marker=' + r.marker + ')');
}

console.log('\n[C2] a user whose clipboard ALREADY HAS CONTENT -> the script STILL runs...');
{
    // This is the case that used to kill the script. A user copies a link,
    // then runs the script, and nothing happens.
    const r = run(
        'setclipboard=function(s) CLIPBOARD=s end\n' +
        'getclipboard=function() return "https://example.com/a-long-link-the-user-copied" end\n'
    );
    if (r.err) no('threw: ' + r.err);
    else if (r.marker === 'REAL_RAN') ok('the payload ran even with a full clipboard');
    else no('THE SCRIPT DIED BECAUSE THE CLIPBOARD WAS NOT EMPTY - that is the bug');
    if (r.clip === 'payload') ok('and setclipboard() reached the executor');
    else no('setclipboard() did not run (clip=' + r.clip + ')');
}

console.log('\n[C3] an executor with NO clipboard functions -> the script runs...');
{
    // getclipboard is not present on every executor, and it can error.
    const r = run('setclipboard=function(s) CLIPBOARD=s end\n');
    if (r.err) no('threw: ' + r.err);
    else if (r.marker === 'REAL_RAN') ok('the payload ran without a getclipboard');
    else no('the payload did not run without a getclipboard');
}

console.log('\n[C4] a getclipboard that ERRORS -> the script still runs...');
{
    const r = run(
        'setclipboard=function(s) CLIPBOARD=s end\n' +
        'getclipboard=function() error("not supported here") end\n'
    );
    if (r.err) no('threw: ' + r.err);
    else if (r.marker === 'REAL_RAN') ok('the payload ran even though getclipboard errored');
    else no('the payload did not run when getclipboard errored');
}

console.log('\n[C5] a HOOKED clipboard that installs a setclipboard hook -> the script does NOT run...');
{
    // The real attack this guard is for: the hook installs itself WHILE the
    // clipboard is read, so the reference the loader captured is not the
    // reference that is in place a line later.
    const r = run(
        'setclipboard=function(s) CLIPBOARD=s end\n' +
        'getclipboard=function() setclipboard=function(s) STEAL=s end return "" end\n'
    );
    if (r.marker === 'REAL_RAN') no('the hook was NOT detected - the payload ran');
    else ok('the hook was detected and the payload was not delivered');
}

console.log('\n[C6] a pre-hooked loadstring (the classic capture) -> the script does NOT run...');
{
    const r = run(
        'setclipboard=function(s) CLIPBOARD=s end\n' +
        'getclipboard=function() return "" end\n' +
        'loadstring=function(s) STOLEN=s return function() end end\n'
    );
    if (r.marker === 'REAL_RAN') no('the loadstring hook was NOT detected - the payload ran');
    else ok('the loadstring hook was detected and the payload was not delivered');
}

console.log('\n' + '='.repeat(72));
console.log('CLIPBOARD GUARD   ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(72));
process.exit(fail ? 1 : 0);
