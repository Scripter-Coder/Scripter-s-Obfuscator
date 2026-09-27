// The artifact must never touch the deprecated environment/debug APIs.
//
// Why this is asserted on the GENERATED OUTPUT rather than on the source: the
// bug this catches was invisible in the source's shape. The getfenv probe was
// one clean line inside a well-commented resolver, and it broke the user's
// ScreenGui scripts with a wall of "VS_STATE_FRAME_OWNER". Only the artifact -
// the thing that actually runs in their executor - shows what reaches Roblox.
//
// getfenv and setfenv are deprecated and absent from the Roblox/Luau sandbox.
// Calling them from a protected script reaches into Luau frame machinery and the
// internal state names surface in the console. The debug library and the hooking
// APIs are the same class of problem: they are the tools an anti-tamper system is
// supposed to make itself hard to use, and using them is how you trip over the
// sandbox.
//
// The nil-loader fix of the previous commit is deliberately still allowed: it
// probes _G and getgenv and falls back to a bare reference, and a reference to
// an undefined global is nil in Lua and never raises. That is the part that
// fixed the crash, and this test guards that it survives.
import fs from 'node:fs';
import path from 'node:path';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

const root = process.cwd();
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  OK   ' + m); };
const no = (m) => { fail++; console.log('  FAIL ' + m); };

console.log('[AE] the artifact touches no deprecated environment or debug API');
console.log('-'.repeat(72));

// generate a few shapes, since the wrapper is skipped for some targets and the
// loader is emitted for all of them
const base = {
  intensity: 5, ultra: true, antiTamper: true, antiSkid: true, antiLogger: true,
  envLogging: false, hwidLock: true, keyGate: null,
  statsEndpoint: 'https://scripterhub-stats.dubovikstanislav51.workers.dev/',
  scriptName: 't', scriptId: 's', owner: 'o'
};
const artifacts = {
  'minimal source': applyCustomObfuscator('print(1)', base, {}),
  'a ScreenGui-ish source': applyCustomObfuscator(
    'local g=Instance.new("ScreenGui")\ng.Parent=game:GetService("CoreGui")', base, {}),
  'a source with a key gate': applyCustomObfuscator('print(1)',
    Object.assign({}, base, { keyGate: { keys: ['ABC'], mode: 'default' } }), {})
};

const BANNED = [
  'getfenv', 'setfenv', 'newproxy', 'getupvalue', 'setupvalue', 'getregistry',
  'debug.getinfo', 'debug.getupvalue', 'debug.getlocal', 'debug.sethook',
  'hookfunction', 'hookmetamethod', 'hookerror', 'checkcaller'
];

for (const [label, art] of Object.entries(artifacts)) {
  const s = String(art);
  const found = BANNED.filter(b => s.includes(b));
  if (found.length === 0) ok(label + ' (' + s.length + ' bytes): clean');
  else no(label + ' contains ' + found.join(', '));
}

// the things that MUST still be there, or the nil-loader fix regresses
{
  const s = String(artifacts['minimal source']);
  if (/return\s+loadstring\s+or\s+load/.test(s)) ok('the bare-reference fallback survives');
  else no('the bare-reference fallback is gone - the nil-loader crash would return');

  if (/type\(\w+\)=='table'/.test(s)) ok('_G is type-checked before rawget');
  else no('_G is no longer type-checked');
}

// and the source must not reintroduce it either
{
  const src = fs.readFileSync(path.join(root, 'custom-obfuscator.js'), 'utf8');
  const emitted = src.split(/\r?\n/).filter(l =>
    !/^\s*(\/\/|\*)/.test(l) && /getfenv|setfenv/.test(l));
  if (emitted.length === 0) ok('custom-obfuscator.js emits no getfenv/setfenv');
  else no('custom-obfuscator.js still emits: ' + emitted.map(l => l.trim().slice(0, 70)).join(' | '));
}

console.log('-'.repeat(72));
console.log('ARTIFACT ENV    ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
