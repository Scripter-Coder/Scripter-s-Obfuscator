// An attacker's first pass on a VM output, with a real Lua parser instead of
// regular expressions.
//
// It finds every place the interpreter maps an opcode number to code: a table
// entry  T[n] = function ... end  or an  if op == n  branch. Then it reads the
// operators and helper calls inside that code. Plaintext operators reveal what
// the opcode does.
//
// This does not rebuild Lua source. It answers the first question a
// deobfuscator must answer: how many opcodes can be given a meaning, and how
// fast.
//
// Controls: a synthetic dispatch with known operators must classify exactly,
// and code with no dispatch must yield nothing. Without these the numbers
// below mean nothing.
//
// Run: node tools/attacker/handler_classify.mjs

import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const req = createRequire(path.join(ROOT, 'package.json'));
const luaparse = req('luaparse');
const vmb = await import(pathToFileURL(path.join(ROOT, 'vm-bytecode.js')).href);
vmb.vmBCSetLuaparse(luaparse);

const OP_NAMES = {
    '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '^': 'POW', '..': 'CONCAT',
    '==': 'EQ', '~=': 'NE', '<': 'LT', '<=': 'LE', '>': 'GT', '>=': 'GE', 'and': 'AND', 'or': 'OR',
};

function children(node) {
    const out = [];
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) { for (const x of v) if (x && typeof x === 'object' && x.type) out.push(x); }
        else if (v && typeof v === 'object' && v.type) out.push(v);
    }
    return out;
}

function walk(node, fn) {
    fn(node);
    for (const c of children(node)) walk(c, fn);
}

// Every opcode-to-code entry: opcode number -> body (an array of statements).
function dispatchEntries(ast) {
    const entries = [];
    walk(ast, (n) => {
        if (n.type === 'AssignmentStatement' && n.variables && n.init) {
            n.variables.forEach((v, i) => {
                const val = n.init[i];
                if (v.type === 'IndexExpression' && v.index && v.index.type === 'NumericLiteral' &&
                    val && val.type === 'FunctionDeclaration') {
                    entries.push({ op: v.index.value, body: val.body });
                }
            });
        }
        if (n.type === 'IfStatement') {
            for (const cl of n.clauses) {
                const c = cl.condition;
                if (c && c.type === 'BinaryExpression' && c.operator === '==') {
                    const lit = [c.left, c.right].find((x) => x && x.type === 'NumericLiteral');
                    if (lit) entries.push({ op: lit.value, body: cl.body });
                }
            }
        }
    });
    return entries;
}

// What the code does, read from its operators and helper calls.
function classify(body) {
    const ops = {};
    const helpers = {};
    for (const s of body) {
        walk(s, (n) => {
            if ((n.type === 'BinaryExpression' || n.type === 'LogicalExpression') && OP_NAMES[n.operator]) {
                const name = OP_NAMES[n.operator];
                ops[name] = (ops[name] || 0) + 1;
            }
            if (n.type === 'CallExpression' && n.base && n.base.type === 'Identifier') {
                helpers[n.base.name] = (helpers[n.base.name] || 0) + 1;
            }
        });
    }
    const top = (o) => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
    if (top(ops)) return { kind: 'operator', name: top(ops) };
    if (top(helpers)) return { kind: 'helper', name: top(helpers) };
    return { kind: 'other', name: 'other' };
}

function analyse(text) {
    const t0 = process.hrtime.bigint();
    const ast = luaparse.parse(text, { luaVersion: '5.1', comments: false, locations: false, ranges: false, scope: false });
    const entries = dispatchEntries(ast);
    const results = entries.map((e) => ({ op: e.op, ...classify(e.body) }));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { results, ms };
}

// ---- controls -----------------------------------------------------------------
const POSITIVE = `
local function run(op, a, b)
  if op == 1 then return a + b
  elseif op == 2 then return a - b
  elseif op == 3 then return a * b
  elseif op == 4 then return a / b
  end
end
local H = {}
H[10] = function(a, b) return a .. b end
H[11] = function(a, b) return a < b end
`;
const NEGATIVE = 'local x = 1 print(x)';
const want = { 1: 'ADD', 2: 'SUB', 3: 'MUL', 4: 'DIV', 10: 'CONCAT', 11: 'LT' };

let failures = 0;
console.log('[HC] attacker pass: opcode -> meaning, read from the interpreter');
console.log('-'.repeat(78));
console.log('controls');
{
    const { results } = analyse(POSITIVE);
    const right = results.filter((r) => want[r.op] === r.name).length;
    const ok = right === Object.keys(want).length && results.length === Object.keys(want).length;
    if (!ok) failures++;
    console.log('  positive  known operators             -> ' + right + '/' + Object.keys(want).length + ' exact   ' + (ok ? 'ok' : 'FAIL'));
}
{
    const { results } = analyse(NEGATIVE);
    const ok = results.length === 0;
    if (!ok) failures++;
    console.log('  negative  no dispatch at all          -> ' + results.length + ' entries   ' + (ok ? 'ok' : 'FAIL'));
}

// ---- the real VM output ---------------------------------------------------------
const SMALL = 'local playerName = "scripter_hub_player"\nlocal rewardKey = "ALPHA_KEY_77"\n' +
    'local function greetPlayer(name)\n  print("welcome " .. name .. " to the arena")\nend\n' +
    'greetPlayer(playerName)\nprint(rewardKey)';
function generated(target, tag) {
    const parts = [];
    let i = 0;
    while (parts.join('\n').length < target) {
        i++;
        parts.push(`
local function ${tag}_handler_${i}(player, amount)
  local ${tag}_total_${i} = 0
  for idx = 1, amount do ${tag}_total_${i} = ${tag}_total_${i} + idx * ${i} end
  if ${tag}_total_${i} > ${i * 7} then print("${tag} over", ${tag}_total_${i}) else warn("${tag} under") end
  return { ok = ${tag}_total_${i} > 0 }
end`);
    }
    return parts.join('\n');
}
const SAMPLES = [{ name: 'small', src: SMALL }, { name: 'medium', src: generated(4000, 'mid') }];

console.log('');
console.log('the VM layer (layers already peeled; the strongest VM output, not the shipped file)');
console.log('sample   profile   VM KB   opcodes   operator   helper   other   time');
for (const s of SAMPLES) {
    for (const profile of ['FAST', 'BALANCED', 'SECURE']) {
        const vm = vmb.applyBytecodeVm(s.src, {
            profile, staticEnv: false, hardCodeGlobals: false, compatibility: false,
            inline: false, unroll: false, debugProtect: false, target: 'lua51', rethrow: true
        });
        if (!vm) { console.log(s.name + ' ' + profile + ' VM declined'); continue; }
        const { results, ms } = analyse(vm);
        const byKind = (k) => results.filter((r) => r.kind === k).length;
        console.log(
            s.name.padEnd(9) + profile.padEnd(10) + String(Math.round(vm.length / 1024)).padStart(6) + '   ' +
            String(results.length).padStart(7) + '   ' + String(byKind('operator')).padStart(8) + '   ' +
            String(byKind('helper')).padStart(6) + '   ' + String(byKind('other')).padStart(5) + '   ' +
            ms.toFixed(0) + ' ms');
    }
}

console.log('');
console.log('This finds opcode meanings from plaintext. It does not rebuild source.');
console.log(failures ? 'CONTROLS FAILED: ' + failures : 'CONTROLS PASSED');
if (failures) process.exitCode = 1;
