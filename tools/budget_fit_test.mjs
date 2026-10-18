// The obfuscator must ship artifacts that fit the budget, and it must keep a VM
// for sources where one fits.
//
// WHAT WAS WRONG
//
// A 3 KB script at the default intensity shipped a 4 MB artifact under BALANCED
// and SECURE: the double wrap multiplied the VM output after the tier had been
// chosen. A 20 KB script got layers only, because the encoded payload was about
// 4x its input and no VM tier fit the budget with that encoding.
//
// WHAT THIS CHECKS
//
//   1. Every build at the default intensity is within the 600 KB budget.
//   2. A small script keeps the bytecode VM, not a silent downgrade.
//   3. A mid-size script gets a VM (lite) instead of layers only.
//
// Run: node tools/budget_fit_test.mjs

import luaparse from 'luaparse';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';

vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);

const BUDGET_KB = 600;

function sample(targetBytes) {
    const parts = [];
    let i = 0;
    while (parts.join('\n').length < targetBytes) {
        i++;
        parts.push(`
local function handler_${i}(player, amount)
  local total = 0
  for idx = 1, amount do total = total + idx * ${i} end
  if total > ${i * 7} then
    print("handler ${i} over", total, player and player.Name or "none")
  else
    warn("handler ${i} under " .. tostring(total))
  end
  return { ok = total > 0, value = total, tag = "h${i}" }
end
local cfg_${i} = { speed = ${i}, name = "item_${i}", enabled = ${i % 2 === 0} }
for k, v in pairs(cfg_${i}) do
  if type(v) == "number" then cfg_${i}[k] = v * 2 end
end`);
    }
    return parts.join('\n');
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
    if (cond) { console.log('  OK   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); fail++; }
}

const origWarn = console.warn;
console.warn = () => {};
const build = (src, profile) => {
    const dbg = {};
    const out = applyCustomObfuscator(src, {
        profile, intensity: 10, antiTamper: true, antiSkid: true, antiLogger: true,
        envLogging: false, scriptName: 'fit', owner: 'fit', _debug: true
    }, dbg);
    return { out, dbg };
};

const results = [];
for (const profile of ['BALANCED', 'SECURE', 'FAST']) {
    for (const kb of [2, 3, 8, 20, 60, 150]) {
        const { out, dbg } = build(sample(kb * 1000), profile);
        results.push({ profile, kb, sizeKB: Math.round(out.length / 1024), applied: dbg.vmApplied || 'none', retry: dbg.budgetRetry || '' });
    }
}
console.warn = origWarn;

console.log('[BF] every shipped artifact fits the budget at the default intensity');
for (const r of results) {
    check(r.profile + ' ' + r.kb + ' KB -> ' + r.sizeKB + ' KB (' + r.applied + ')', r.sizeKB <= BUDGET_KB,
        'over the ' + BUDGET_KB + ' KB budget');
}

console.log('[BF] a small script keeps its VM');
const bal3 = results.find(r => r.profile === 'BALANCED' && r.kb === 3);
check('BALANCED 3 KB is bytecode-VM protected', bal3 && bal3.applied === 'bytecode', bal3 ? bal3.applied : 'missing');

console.log('[BF] a mid-size script gets a VM, not layers only');
const fast20 = results.find(r => r.profile === 'FAST' && r.kb === 20);
check('FAST 20 KB is VM-protected', fast20 && fast20.applied !== 'none', fast20 ? fast20.applied : 'missing');

console.log('');
console.log('BUDGET FIT   ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
