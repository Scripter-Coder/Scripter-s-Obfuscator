// What a static attacker can read from the shipped artifact.
//
// An analyst who only reads the file (no run, no loader) looks for the
// original script's strings and identifiers. The score is the share of those
// secrets that appear verbatim in the artifact.
//
// Two controls keep the score honest:
//   positive  the original source itself must score 100%, or the matcher is blind
//   negative  random base64 of the same size must score about 0%, or it is guessing
//
// NOT measured here: a runtime dump. The loader decodes strings when it runs, so
// a running copy exposes them. Nor how long a human or a tool takes to rebuild
// the logic. Those need a runtime attacker, which this file does not include.
//
// Run: node tools/bench/attacker_static.mjs

import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const req = createRequire(path.join(ROOT, 'package.json'));
const luaparse = req('luaparse');
const co = await import(pathToFileURL(path.join(ROOT, 'custom-obfuscator.js')).href);
const vmp = await import(pathToFileURL(path.join(ROOT, 'vm-pass.js')).href);
const vmb = await import(pathToFileURL(path.join(ROOT, 'vm-bytecode.js')).href);
vmp.vmSetLuaparse(luaparse);
vmb.vmBCSetLuaparse(luaparse);

const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
    'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
// Standard names that appear in any Lua output. Finding them proves nothing.
const STDLIB = new Set(['print', 'pairs', 'ipairs', 'tostring', 'tonumber', 'type', 'select', 'pcall', 'xpcall',
    'error', 'assert', 'next', 'unpack', 'string', 'table', 'math', 'load', 'loadstring', 'require', 'getfenv',
    'setfenv', 'rawget', 'rawset', 'rawequal', 'setmetatable', 'getmetatable', 'coroutine', 'debug', 'bit32',
    'warn', 'game', 'workspace', 'script', 'wait', 'spawn', 'tick', 'char', 'byte', 'format', 'insert', 'remove',
    'concat', 'sort', 'floor', 'ceil', 'abs', 'sqrt', 'random', 'huge', 'find', 'match', 'gsub', 'gmatch', 'lower',
    'upper', 'sub', 'rep', 'len', 'self', 'getgenv', 'getfenv']);

function secretsOf(src) {
    const noComments = src.replace(/--[^\n]*/g, ' ');
    const strings = new Set();
    for (const m of noComments.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
        const s = m[1] ?? m[2];
        // Strings with escapes are skipped: their raw text is not what the artifact would hold.
        if (s.length >= 4 && !s.includes('\\')) strings.add(s);
    }
    const noStrings = noComments.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, ' ');
    const idents = new Set();
    for (const m of noStrings.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
        const w = m[0];
        if (w.length >= 4 && !KEYWORDS.has(w) && !STDLIB.has(w)) idents.add(w);
    }
    return { strings: [...strings], idents: [...idents] };
}

function hitsIn(artifact, sec) {
    let s = 0, i = 0;
    // A string counts only as a whole quoted literal. Bare substring matching
    // counted "big_label_1" as found inside "big_label_10".
    for (const x of sec.strings) {
        if (artifact.includes('"' + x + '"') || artifact.includes("'" + x + "'")) s++;
    }
    for (const w of sec.idents) {
        if (new RegExp('(?<![A-Za-z0-9_])' + w + '(?![A-Za-z0-9_])').test(artifact)) i++;
    }
    return { s, i, totS: sec.strings.length, totI: sec.idents.length };
}

function pctOf(h) {
    const tot = h.totS + h.totI;
    return tot ? (100 * (h.s + h.i)) / tot : 0;
}

const SMALL = `local playerName = "scripter_hub_player"
local rewardKey = "ALPHA_KEY_77"
local function greetPlayer(name)
  print("welcome " .. name .. " to the arena")
end
greetPlayer(playerName)
print(rewardKey)`;

function generated(target, tag) {
    const parts = [];
    let i = 0;
    while (parts.join('\n').length < target) {
        i++;
        parts.push(`
local function ${tag}_handler_${i}(player, amount)
  local ${tag}_total_${i} = 0
  for idx = 1, amount do ${tag}_total_${i} = ${tag}_total_${i} + idx * ${i} end
  if ${tag}_total_${i} > ${i * 7} then
    print("${tag} handler ${i} over", ${tag}_total_${i})
  else
    warn("${tag} handler ${i} under")
  end
  return { ok = ${tag}_total_${i} > 0, label = "${tag}_label_${i}" }
end`);
    }
    return parts.join('\n');
}

const SAMPLES = [
    { name: 'small', src: SMALL },
    { name: 'medium', src: generated(4000, 'mid') },
    { name: 'large', src: generated(30000, 'big') },
];
const PROFILES = ['FAST', 'BALANCED', 'SECURE'];

function shipped(src, profile) {
    const origWarn = console.warn;
    console.warn = () => {};
    try {
        return co.applyCustomObfuscator(src, {
            profile, intensity: 10, antiTamper: true, antiSkid: true, antiLogger: true,
            envLogging: false, scriptName: 'attacker', owner: 'attacker', _debug: false
        }, {});
    } finally {
        console.warn = origWarn;
    }
}

function randomBase64(n) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * 64)];
    return s;
}

let failures = 0;
console.log('[AS] static attacker: original strings and identifiers visible in the shipped file');
console.log('-'.repeat(86));

console.log('controls');
for (const sample of SAMPLES) {
    const sec = secretsOf(sample.src);
    const pct = pctOf(hitsIn(sample.src, sec));
    const ok = pct === 100;
    if (!ok) failures++;
    console.log('  positive  ' + sample.name.padEnd(7) + ' original source as artifact   -> ' + pct.toFixed(1) + '%   ' + (ok ? 'ok' : 'FAIL'));
}
{
    const worst = Math.max(...SAMPLES.map(s => pctOf(hitsIn(randomBase64(150000), secretsOf(s.src)))));
    const ok = worst <= 2;
    if (!ok) failures++;
    console.log('  negative  random base64, 150 KB          -> ' + worst.toFixed(1) + '%   ' + (ok ? 'ok' : 'FAIL'));
}

console.log('');
console.log('  proportional: half the secrets replaced, so the score must land on half');
for (const sample of SAMPLES) {
    const sec = secretsOf(sample.src);
    let out = sample.src;
    let kept = 0;
    sec.strings.forEach((s, i) => {
        if (i % 2 === 0) kept++;
        else out = out.split('"' + s + '"').join('"zqs' + i + 'zq"');
    });
    sec.idents.forEach((w, i) => {
        if (i % 2 === 0) kept++;
        else out = out.replace(new RegExp('\\b' + w + '\\b', 'g'), 'zqi' + i + 'zq');
    });
    const total = sec.strings.length + sec.idents.length;
    const expected = (100 * kept) / total;
    const pct = pctOf(hitsIn(out, sec));
    const ok = Math.abs(pct - expected) < 0.01;
    if (!ok) failures++;
    console.log('  proportional ' + sample.name.padEnd(7) + ' expected ' + expected.toFixed(1) + '%   measured ' + pct.toFixed(1) + '%   ' + (ok ? 'ok' : 'FAIL'));
}

console.log('');
console.log('sample   profile    artifact KB   strings      identifiers   recovered');
for (const sample of SAMPLES) {
    const sec = secretsOf(sample.src);
    for (const profile of PROFILES) {
        const art = shipped(sample.src, profile);
        const h = hitsIn(art, sec);
        console.log(
            sample.name.padEnd(8) + profile.padEnd(11) + String(Math.round(art.length / 1024)).padStart(8) + '     ' +
            (h.s + '/' + h.totS).padEnd(12) + (h.i + '/' + h.totI).padEnd(14) + pctOf(h).toFixed(1) + '%');
    }
}

console.log('');
console.log('');
console.log('sensitivity: a known-weaker build, so the measure has to be able to see a leak');
for (const sample of SAMPLES) {
    const sec = secretsOf(sample.src);
    const origWarn = console.warn;
    console.warn = () => {};
    let art;
    try {
        art = co.applyCustomObfuscator(sample.src, {
            profile: 'BALANCED', vmTier: 'lite', intensity: 10, antiTamper: true, antiSkid: true,
            antiLogger: true, envLogging: false, scriptName: 'attacker', owner: 'attacker', _debug: false,
            _budgetRetry: true
        }, {});
    } finally {
        console.warn = origWarn;
    }
    const h = hitsIn(art, sec);
    console.log(sample.name.padEnd(8) + 'lite VM'.padEnd(11) + String(Math.round(art.length / 1024)).padStart(8) + '     ' +
        (h.s + '/' + h.totS).padEnd(12) + (h.i + '/' + h.totI).padEnd(14) + pctOf(h).toFixed(1) + '%');
}

console.log('');
console.log('This reads the file only. A runtime dump is not measured here.');
console.log(failures ? 'CONTROLS FAILED: ' + failures : 'CONTROLS PASSED');
if (failures) process.exitCode = 1;
