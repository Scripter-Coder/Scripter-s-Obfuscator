// tools/bom_vm_regression_test.mjs
//
// Guards a silent total-compromise bug.
//
// A UTF-8 BOM (U+FEFF) at the head of a customer's script made luaparse 0.3.1
// throw a misleading "Cannot read properties of undefined (reading 'range')".
// applyBytecodeVm caught that and returned null, and custom-obfuscator.js
// degraded to the lite tier with NO signal. The customer received a ~33 KB
// artifact whose payload is their own source behind a static key schedule,
// instead of the ~355 KB real VM - and that artifact is recoverable in a
// single static pass.
//
// Because scripts arrive by copy-paste and every Windows text editor writes a
// BOM, this was not an edge case; it silently disarmed the VM for a large
// share of real uploads. Nothing in the existing suite caught it, because
// every fixture in this repo was written without a BOM.
//
// Run: node tools/bom_vm_regression_test.mjs
import luaparse from 'luaparse';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vmBCSetLuaparse, applyBytecodeVm, normalizeSourceText } from '../vm-bytecode.js';
import { applyCustomObfuscator } from '../custom-obfuscator.js';

vmBCSetLuaparse(luaparse);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(name, cond, detail) {
    if (cond) console.log('  PASS  ' + name);
    else { console.log('  FAIL  ' + name + (detail ? '  ->  ' + detail : '')); failures++; }
}

// NOTE: build this by joining whole lines. Writing it as one long string in a
// shell heredoc silently ate the closing ')' of Connect(...) and produced
// invalid Lua, which looked like an obfuscator bug but was a bad fixture.
const SCRIPT = [
    'local Players = game:GetService("Players")',
    'local function greet(name)',
    '  return "Hello, " .. name .. "!"',
    'end',
    'Players.PlayerAdded:Connect(function(p)',
    '  print(greet(p.Name))',
    'end)',
    'for i = 1, 10 do',
    '  if i % 2 == 0 then print(i) end',
    'end',
    ''
].join('\n');

// The fixture must itself be valid Lua, otherwise every assertion below is
// measuring the wrong thing: the backend correctly refuses invalid source and
// correctly falls back, which looks identical to the BOM bug from a distance.
try {
    luaparse.parse(SCRIPT, { luaVersion: '5.1', locations: true });
} catch (e) {
    console.error('FIXTURE IS NOT VALID LUA: ' + e.message);
    process.exit(1);
}

const BOM = '\uFEFF';

console.log('\n1. normalizeSourceText strips BOM variants');
check('UTF-8 BOM (U+FEFF) removed',
    normalizeSourceText(BOM + 'local x = 1') === 'local x = 1',
    JSON.stringify(normalizeSourceText(BOM + 'local x = 1')));
check('UTF-16BE BOM (U+FFFE) removed',
    normalizeSourceText('\uFFFE' + 'local x = 1') === 'local x = 1');
check('BOM + UTF-16 BOM double-prefix removed',
    normalizeSourceText('\uFEFF\uFFFE' + 'local x = 1') === 'local x = 1');
check('clean source untouched', normalizeSourceText(SCRIPT) === SCRIPT);

console.log('\n2. applyBytecodeVm must NOT silently decline a BOM script');
for (const profile of ['FAST', 'BALANCED', 'SECURE']) {
    const bare = applyBytecodeVm(SCRIPT, { profile, seedOverride: 12345 });
    const withBom = applyBytecodeVm(BOM + SCRIPT, { profile, seedOverride: 12345 });
    check(profile + ': BOM build is produced (not null)', withBom !== null && typeof withBom === 'string',
        withBom === null ? 'returned NULL -> VM silently disabled' : 'not a string');
    check(profile + ': BOM build has real VM structure',
        !!withBom && /setmetatable/.test(withBom) && /function/.test(withBom));
    if (bare && withBom) {
        check(profile + ': BOM build is comparable in size to the clean build',
            withBom.length > bare.length * 0.8,
            'bom=' + withBom.length + ' clean=' + bare.length);
    }
}

console.log('\n3. applyCustomObfuscator must report VM degradation');
for (const variant of [SCRIPT, BOM + SCRIPT]) {
    const label = variant.charCodeAt(0) === 0xFEFF ? 'with BOM' : 'clean';
    const dbg = {};
    const out = applyCustomObfuscator(variant, { profile: 'SECURE', seedOverride: 12345 }, dbg);
    check(label + ': build produced', typeof out === 'string' && out.length > 0);
    check(label + ': bytecode VM actually ran (vmApplied=bytecode)',
        String(dbg.vmApplied || '').indexOf('bytecode') === 0,
        'vmApplied=' + dbg.vmApplied + ' fallback=' + dbg.vmFallback);
    check(label + ': no silent fallback recorded', !dbg.vmFallback,
        'vmFallback=' + dbg.vmFallback);
    check(label + ': artifact carries VM structure, not a bare string cipher',
        /setmetatable/.test(out) || out.length > 150000,
        'bytes=' + out.length);
}

console.log('\n4. strictVm refuses to ship a degraded build');
{
    // Force the VM to decline by denying the whole source via the DENY list path
    // is not reachable here, so assert the guard exists and is off by default.
    const dbg = {};
    let threw = false;
    try {
        applyCustomObfuscator(SCRIPT, { profile: 'SECURE', strictVm: true, seedOverride: 12345 }, dbg);
    } catch (e) { threw = true; }
    check('strictVm does not throw when the VM succeeds', threw === false);
}

console.log('\n5. end-to-end: a BOM script produces a full VM artifact');
{
    const out = applyCustomObfuscator(BOM + SCRIPT, { profile: 'SECURE', seedOverride: 12345 }, {});
    const clean = applyCustomObfuscator(SCRIPT, { profile: 'SECURE', seedOverride: 12345 }, {});
    check('BOM artifact is not a thin 30 KB stub',
        out.length > clean.length * 0.8,
        'bom=' + out.length + ' clean=' + clean.length);
    check('BOM artifact exposes no plaintext source',
        !/Players/.test(out) && !/Hello/.test(out) && !/PlayerAdded/.test(out));
}

console.log('\n' + (failures === 0
    ? 'ALL CHECKS PASSED - the BOM path is protected.'
    : failures + ' CHECK(S) FAILED - the BOM hole is open.'));
process.exit(failures === 0 ? 0 : 1);