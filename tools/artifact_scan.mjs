import fs from 'node:fs';
import luaparse from 'luaparse';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);

function scanArtifact(artifact) {
  const findings = [];
  const forbidden = [
    ['source-fragment', /local function secret\s*\(/i, 'original function declaration survived'],
    ['source-fragment', /RESULT\s*=\s*secret\s*\(/i, 'original call survived'],
    ['recursive-vm-run', /return\s+\w+\s*\(ci,links,\.\.\.\)/i, 'recursive VM closure wrapper survived'],
    ['host-bridge-marker', /VM\s*[-→]\s*VM|VM_TO_VM_HOST|vm_to_vm_host|_vm_host_bridge|vm[_ -]?host[_ -]?bridge|vm[_ -]?to[_ -]?vm/i, 'forbidden VM bridge marker survived'],
    ['decoded-source-execution', /loadstring\s*\(.*decode|load\s*\(.*decode|loadfile\s*\(.*decode/i, 'decoded source execution pattern survived'],
    ['direct-source-load', /loadstring\s*\(|load\s*\(|dofile\s*\(/i, 'direct source load fallback survived'],
    ['source-comment', /--\s*(?:local function|RESULT=|original source|secret)/i, 'source-like comment survived'],
  ];

  for (const [kind, regex, message] of forbidden) {
    if (regex.test(artifact)) findings.push({ kind, detail: message });
  }

  for (const match of artifact.matchAll(/local\s+[A-Za-z0-9_]+\s*=\s*\{([^}]*)\}/g)) {
    const block = match[1] || '';
    const nums = block.split(',').map((s) => Number.parseInt(String(s).trim(), 10)).filter((n) => Number.isFinite(n));
    if (nums.length >= 4 && nums.length <= 24 && nums.every((n) => n >= 0 && n <= 127)) {
      findings.push({ kind: 'plain-constant-pool', detail: 'short plaintext constant pool survived' });
      break;
    }
  }

  return findings;
}

function positiveFixture() {
  const source = 'local function secret(x) return x + 3 end; RESULT=secret(4)';
  return applyBytecodeVm(source, { profile: 'SECURE', seedOverride: 424242, rethrow: true });
}

function negativeFixtures() {
  return [
    `local function secret(x) return x + 3 end; local payload = loadstring('return secret(4)'); RESULT = payload()`,
    `local function secret(x) return x + 3 end; local src = 'RESULT=secret(4)'; local f = load(src); RESULT = f()`,
    `local decode = {1,2,3,4,5}; local function run() return decode[1] end; RESULT = run()`,
    `local v = {1,2,3}; local _vm_host_bridge = { unpack = function(...) return ... end }; RESULT = _vm_host_bridge.unpack(1,2,3)`,
    `local function secret(x) return x + 3 end; RESULT=secret(4)`,
  ];
}

const file = process.argv[2];
const artifact = file ? fs.readFileSync(file, 'utf8') : positiveFixture();
const findings = scanArtifact(artifact);
const result = { ok: findings.length === 0, bytes: artifact.length, findings };

if (file) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

// Positive / negative scanner verification.
const positive = scanArtifact(positiveFixture());
if (positive.length !== 0) {
  console.error('positive fixture unexpectedly failed', JSON.stringify(positive, null, 2));
  process.exit(1);
}
for (const [index, text] of negativeFixtures().entries()) {
  const hits = scanArtifact(text);
  if (hits.length === 0) {
    console.error(`negative fixture ${index} unexpectedly passed`, text);
    process.exit(1);
  }
}

console.log(JSON.stringify({ ok: true, artifactScanPositive: true, negativeFixturesChecked: negativeFixtures().length, findings: result.findings }, null, 2));
