import crypto from 'node:crypto';
import luaparse from 'luaparse';
import { applyBytecodeVm, vmBCSetLuaparse } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const source = 'local function f(x) return x+1 end; RESULT=tostring(f(4))';
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16); }
function build(profile, seed) {
  let meta;
  const artifact = applyBytecodeVm(source, {
    profile,
    seedOverride: seed,
    rethrow: true,
    onBuild: value => { meta = value; },
  });
  const opcodeMap = Object.entries(meta.OPCODES).sort((a,b)=>a[0].localeCompare(b[0]));
  const pipeline = meta.pipeline?.stats || {};
  return {
    profile,
    seed,
    architecture: meta.architecture,
    dispatcher: /-- dispatcher strategy: branch/.test(artifact) ? 'branch' : 'table',
    frameLayout: (artifact.match(/frame stride: \d+/) || ['unknown'])[0],
    instructionFormat: (artifact.match(/instruction format: [^\n ]+/) || ['unknown'])[0],
    operandEncoding: meta.architecture === 'ONYX' ? 'tagged-additive-u32' : 'compact-u32',
    decodeStrategy: meta.architecture === 'ONYX' ? 'boot-fragment-decode' : 'direct-word-read',
    registerEncoding: 'logical-physical-raw',
    constantEncoding: 'vault-reference-shared',
    opcodeFingerprint: hash(JSON.stringify(opcodeMap)),
    instructionFingerprint: hash(artifact.match(/local [^\n]*HAND|local [^\n]*FRAMES|local [^\n]*dispatcher strategy[^\n]*/g)?.join('\n') || artifact.slice(0, 1000)),
    constantFingerprint: hash(JSON.stringify(meta.refs)),
    handlerFingerprint: hash(artifact.match(/\[\d+\]=function\(\)/g)?.join('|') || ''),
    artifactFingerprint: hash(artifact),
    fused: pipeline.fused || 0,
    split: pipeline.split || 0,
    mutations: pipeline.mutations || 0,
  };
}
const rows = [build('OPAL', 1), build('ONYX', 1), build('OPAL', 2), build('ONYX', 2)];
for (const row of rows) console.log(JSON.stringify(row));
const sameSeedDifferentProfile = rows[0].artifactFingerprint !== rows[1].artifactFingerprint && rows[0].opcodeFingerprint !== rows[1].opcodeFingerprint;
const opalSeedsDiffer = rows[0].artifactFingerprint !== rows[2].artifactFingerprint;
const onyxSeedsDiffer = rows[1].artifactFingerprint !== rows[3].artifactFingerprint;
if (!sameSeedDifferentProfile || !opalSeedsDiffer || !onyxSeedsDiffer) {
  console.error('FAIL structural diversity gate');
  process.exit(1);
}
console.log('PASS structural diversity gate');
