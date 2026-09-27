// diagnose_loader.lua is the tool people run when the product is broken. It
// lied about the executor's HttpGet, and I built a design decision on the lie:
//
//     say("game.HttpGet", (type(game) == "table") and type(game.HttpGet)
//         or "NO game.HttpGet")
//
// typeof(game) is "Instance" in Roblox/Luau, so type(game) is "userdata". The
// `and` short-circuited and the `or` printed NO game.HttpGet without ever
// looking at game.HttpGet. The user tested with other loadstrings, it works,
// and they were right.
//
// The same test guarded both HttpGet FALLBACK branches, so the diagnostic never
// exercised HttpGet at all - every "transport: request" it ever reported was the
// first branch, with the fallback unreachable.
//
// This locks in the corrected shape. It is a source check rather than a
// behavioural one on purpose: the bug lived in a type test that no run can
// exercise outside the user's executor, and the fix is "stop testing the type
// of game to decide whether game.HttpGet exists".
import fs from 'node:fs';
import path from 'node:path';
import * as fengari from 'fengari';

const root = process.cwd();
const P = 'diagnose_loader.lua';
const src = fs.readFileSync(path.join(root, P), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[DX] the diagnostic cannot lie about the executor again');
console.log('-'.repeat(72));

// 1. it must compile
{
  const LUA = fengari.lua, AUX = fengari.lauxlib, LIB = fengari.lualib;
  const st = AUX.luaL_newstate();
  LIB.luaL_openlibs(st);
  if (AUX.luaL_loadbuffer(st, fengari.to_luastring(src), null, fengari.to_luastring('@' + P)) !== 0) {
    no('does not compile: ' + Buffer.from(LUA.lua_tostring(st, -1)).toString());
  } else {
    ok('compiles as valid Lua 5.1');
  }
  LUA.lua_close(st);
}

const lines = src.split(/\r?\n/);
const code = (l) => !/^\s*--/.test(l);   // ignore comment-only lines

// 2. the bug must be gone from CODE (a mention in a comment is documentation,
//    and the explanatory comment deliberately quotes the old line)
const bad = lines.map((l, i) => [i + 1, l]).filter(([, l]) => code(l) && l.includes('type(game) == "table"'));
if (bad.length === 0) ok('no line of code tests type(game) == "table" to decide anything');
else no('the bug remains in code at line(s) ' + bad.map(b => b[0]).join(', '));

// 3. the three questions must be answered separately
const wants = [
  ['typeof(game)', 'reports typeof(game)'],
  ['type(game)', 'reports type(game)'],
  ['game.HttpGet exists', 'reports whether HttpGet EXISTS'],
  ['game.HttpGet works', 'reports whether HttpGet WORKS']
];
for (const [needle, label] of wants) {
  const at = lines.findIndex(l => code(l) && l.includes('say("' + needle + '"'));
  if (at >= 0) ok(label + ' (line ' + (at + 1) + ')');
  else no(label + ' is missing');
}

// 4. existence and working must be SEPARATE - that conflation is the bug
const worksCall = lines.findIndex(l => code(l) && l.includes('pcall(function() return game:HttpGet('));
if (worksCall >= 0) ok('HttpGet is actually CALLED and its result reported (line ' + (worksCall + 1) + ')');
else no('HttpGet is never called, so "works" is still a guess');

// 5. both fallbacks must use truthiness
const fb = lines.filter(l => code(l) && /^\s*if (not body and )?HTTPGET then/.test(l));
if (fb.length >= 2) ok(fb.length + ' fallback branches use the HTTPGET truthiness check');
else no('expected 2 fallback branches using HTTPGET, found ' + fb.length);

// 6. the helper must exist and be derived by truthiness
const helper = lines.findIndex(l => code(l) && l.includes('local HTTPGET ='));
if (helper >= 0) {
  const decl = lines[helper];
  if (/HAS_GAME and game\.HttpGet or nil/.test(decl)) ok('HTTPGET is derived by truthiness, not by the type of game');
  else no('HTTPGET is derived wrongly: ' + decl.trim());
} else {
  no('the HTTPGET helper is missing');
}

console.log('-'.repeat(72));
console.log('DIAGNOSTIC   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
