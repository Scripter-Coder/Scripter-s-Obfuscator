// Two behaviour changes to the anti-logger, both pinned here.
//
// 1. The response is game:Shutdown(), NOT Kick().
//
//    Kick only disconnects the account. The client keeps running, the executor
//    stays attached, and anyone who has read the source knows exactly what
//    happened: ClearError, re-run the logger, carry on. From inside it looks
//    like ordinary server behaviour rather than like detection.
//    game:Shutdown() takes the client down, and it is the only response here that
//    cannot be cleared from inside the client it targeted.
//
//    error("x",0) stays. It is the ABORT, not the deterrent: game:Shutdown is a
//    no-op stub on some executors, so the payload must not rely on it having
//    worked.
//
// 2. The PlayerGui NAME SCAN is gone.
//
//    It lowercased every child of PlayerGui and substring-matched the tokens, so
//    a GUI with "logger" anywhere in its name was a spy tool. Two silent failures
//    came out of that, and both were reported as "the GUI appears and then
//    disappears, with no error":
//
//      a) it killed the script over another script's leftover GUI, with nothing
//         the user could correlate;
//      b) the 3-8s watcher re-ran it AFTER the script had parented its OWN
//         ScreenGui, so a GUI named "LoggerPanel" or "SpyMenu" made the script
//         destroy itself seconds in. The scan worked on names and held no
//         reference to the instance the script created.
//
//    This is asserted both structurally (the emitted payload must not mention
//    PlayerGui at all) and BEHAVIOURALLY, by building a PlayerGui containing a
//    child named "HttpLoggerPanel" and requiring that it does not trip anything.
//    The structural check alone would pass for a scan that was still there but
//    narrowed; the behavioural one is what actually pins the requirement.
import assert from 'assert';
import luaparse from 'luaparse';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;

const fengari = (await import('fengari')).default;
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  OK   ' + m); };
const no = m => { fail++; console.log('  FAIL ' + m); };

// ---- generate one payload with the anti-logger on ----
const dbg = {};
const src = 'MARKER="ok"\n';
const obf = applyCustomObfuscator(src, { intensity: 3, antiTamper: true, antiSkid: false, antiLogger: true }, dbg);
const payload = dbg.payload;
assert(payload, 'the generator must expose the payload via the debug object');
luaparse.parse(obf);

// ---- the harness: a PlayerGui that actually has children ----
//
// The prelude in obfuscator.test.mjs returns `{}` from GetService, so its
// anti-logger assertions never exercised a populated PlayerGui at all - which is
// how a scan over PlayerGui children could false-positive in the field while every
// existing test passed. This one builds a real child list.
//
// The first version of THIS harness got it wrong twice, and both failures were
// silent, so both are recorded.
//
//   1. _plrFindFirstChild returned a variable named _pg that was never assigned,
//      so FindFirstChild("PlayerGui") returned nil and the old scan skipped its
//      whole body - the behavioural test passed against the very code it was
//      written to catch.
//   2. `GetService=function(s)` was assigned with DOT syntax while the payload
//      calls `game:GetService("Players")` with COLON syntax. In Lua `game:Foo(x)`
//      passes the receiver as the first argument, so `s` bound to the `game` table
//      instead of "Players", the Players branch never ran, and FindFirstChild was
//      never reached. Still nil. Still passing.
//
// So the harness uses real `function obj:method()` definitions, and
// assertHarnessIsLive() walks the EXACT chain the payload walks - a separate probe
// would just be a second thing that can be wrong.
function makePrelude(opts = {}) {
    const kids = opts.kids || [];
    return [
        'SHUTDOWN=false',
        'KICKED=false',
        'MARKER=nil',
        'local _kids={}',
        ...kids.map((n, i) => `_kids[${i + 1}]={Name=${JSON.stringify(n)}}`),
        'local _pg={}',
        'function _pg:GetChildren() return _kids end',
        'local _plr={}',
        'function _plr:FindFirstChild(n) if n=="PlayerGui" then return _pg end return nil end',
        'local _players={}',
        '_players.LocalPlayer=_plr',
        'game={}',
        'function game:Shutdown() SHUTDOWN=true end',
        'function game:GetService(s) if s=="Players" then return _players end return {} end',
        'PG_CHILDREN=#_kids',
    ].join('\n');
}

// Walk the same chain the payload walks, and require that it reaches the children.
// Without this, "no GUI tripped the kill" is indistinguishable from "no GUI was ever
// looked at", which is exactly the failure this file exists to prevent.
function assertHarnessIsLive() {
    const L = run(makePrelude({ kids: ['Alpha', 'Beta', 'Gamma'] }), [
        'local plr = game:GetService("Players")',
        'local pg  = plr and plr.LocalPlayer and plr.LocalPlayer:FindFirstChild("PlayerGui") or nil',
        'SEEN_PG = pg and 1 or 0',
        'SEEN_KIDS = pg and #pg:GetChildren() or -1',
        'return nil'
    ].join('\n'));
    lua.lua_getglobal(L, to_luastring('SEEN_PG'));
    const pg = lua.lua_tointeger(L, -1);
    lua.lua_getglobal(L, to_luastring('SEEN_KIDS'));
    const kids = lua.lua_tointeger(L, -1);
    if (pg !== 1 || kids !== 3) {
        console.error('  FAIL the harness does not hand the payload a populated PlayerGui' +
            ' (pg found=' + pg + ', children=' + kids + ') - every behavioural check below is vacuous');
        process.exit(1);
    }
    return kids;
}

function run(prelude, code) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const p = lauxlib.luaL_dostring(L, to_luastring(prelude));
    if (p !== lua.LUA_OK) throw new Error('prelude: ' + to_jsstring(lua.lua_tostring(L, -1)));
    lauxlib.luaL_dostring(L, to_luastring(code));
    return L;
}
const gBool = (L, n) => { lua.lua_getglobal(L, to_luastring(n)); const v = lua.lua_toboolean(L, -1); return !!v; };
const gStr = (L, n) => { lua.lua_getglobal(L, to_luastring(n)); const v = lua.lua_tostring(L, -1); return v ? to_jsstring(v) : null; };

// The anti-crack canary has to be registered or a genuine run lands on the decoy.
// Same extraction as obfuscator.test.mjs.
function canaryPrelude(obfText) {
    const m = obfText.match(/do local g=\(getgenv and getgenv\(\)\)[^\n]*?g\.(_shc[0-9a-f]+)=(\d+) end/);
    assert(m, 'loader must register the anti-crack canary');
    return '_G.' + m[1] + '=' + m[2] + '\n';
}
const CANARY = canaryPrelude(obf);

console.log('[AL0] the harness itself is live');
{
    const n = assertHarnessIsLive();
    ok('the payload really is handed a PlayerGui with ' + n + ' named children');
}

console.log('[AL1] the response is Shutdown, and there is no Kick');
{
    if (/game:Shutdown\(\)/.test(payload)) ok('the kill path calls game:Shutdown()');
    else no('game:Shutdown() is missing from the kill path');

    if (/:Kick\(/.test(payload)) {
        no('the kill path still calls Kick() - a kick can be cleared with ClearError and the logger re-run, which is the whole reason this changed');
    } else {
        ok('no Kick() anywhere in the payload - the client cannot clear this and keep going');
    }
}

console.log('[AL2] the PlayerGui name scan is gone');
{
    if (/PlayerGui/.test(payload)) {
        no('the payload still references PlayerGui - the name scan is still in the artifact');
    } else {
        ok('the payload contains no PlayerGui reference at all');
    }
    if (/GetChildren/.test(payload)) {
        no('the payload still enumerates children; the removed scan is the only thing that did that here');
    } else {
        ok('nothing enumerates PlayerGui children');
    }
}

console.log('[AL3] BEHAVIOUR: a PlayerGui full of token-named GUIs must NOT trip it');
{
    // Names chosen to hit the substring rule at every angle: an exact token, a
    // token as a prefix, a token in the middle, and a token with different case.
    const kids = ['HttpLoggerPanel', 'dumper', 'MySpyMenu', 'reqLOGGER', 'CoreGui', 'PlayerList', 'DualAutofarm'];
    const L = run(makePrelude({ kids }) + '\n' + CANARY, payload);
    if (gBool(L, 'SHUTDOWN')) no('a GUI named "HttpLoggerPanel" triggered game:Shutdown() - the name scan is still live');
    else ok('seven token-shaped GUIs in PlayerGui, and none of them trips the kill');
    if (gStr(L, 'MARKER') === 'ok') ok('the user script still runs to completion');
    else no('the user script did not run - something aborted it');
    if (gBool(L, 'KICKED')) no('something kicked the player');
    else ok('nothing kicked the player');
}

console.log('[AL4] a clean environment is still clean');
{
    const L = run(makePrelude({ kids: ['CoreGui', 'PlayerList', 'Chat'] }) + '\n' + CANARY, payload);
    if (!gBool(L, 'SHUTDOWN')) ok('a normal PlayerGui does not trip anything');
    else no('a normal PlayerGui tripped the kill');
    if (gStr(L, 'MARKER') === 'ok') ok('the user script runs');
    else no('the user script did not run');
}

console.log('[AL5] the FUNCTION scan still works - that is the detector that remains');
{
    for (const spy of ['oldrequest', 'dumper', 'unluac', 'httplog', 'reqspy']) {
        const L = run(makePrelude() + '\n' + CANARY + '\n' + spy + '=function() end', payload);
        if (gBool(L, 'SHUTDOWN')) ok('spy global "' + spy + '" -> game:Shutdown()');
        else no('spy global "' + spy + '" was NOT detected - removing the GUI scan must not have removed the real detector');
    }
}

console.log('[AL6] an executor built-in is still not a false positive');
{
    // The v3.0 bug: `decompile` is a legitimate executor global.
    const builtins = ['decompile', 'hookfunction', 'getgc', 'getconnections', 'loadstring', 'syn', 'request', 'gethui'];
    const L = run(makePrelude() + '\n' + CANARY + '\n' + builtins.map(b => b + '=function() end').join('\n'), payload);
    if (!gBool(L, 'SHUTDOWN')) ok(builtins.length + ' standard executor globals present, and none of them trips the kill');
    else no('a standard executor global tripped the kill - the whitelist regressed');
    if (gStr(L, 'MARKER') === 'ok') ok('the user script still runs on a real executor');
    else no('the user script did not run');
}

console.log('[AL7] the payload still aborts itself after the kill');
{
    // Shutdown is best-effort: game:Shutdown is a no-op on some executors, so the
    // abort must not depend on it.
    const L = run(makePrelude() + '\n' + CANARY + '\ndumper=function() end', payload);
    if (gStr(L, 'MARKER') !== 'ok') ok('after detection the user script never runs, even though Shutdown is a stub here');
    else no('the user script ran anyway - the abort after the kill is not working');
}

console.log('');
console.log('ANTI-LOGGER   ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
