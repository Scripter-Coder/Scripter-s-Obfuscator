// tools/bench/deob-oracle.mjs
//
// A/B measurement of what an analyst recovers from the VM IMAGE.
//
// Scope, stated honestly: this is not a decompiler. It is the step every
// devirtualizer must pass first - get the chunk image and look at it. It
// assumes the cipher and the opcode map are already broken (it is handed both,
// because re-implementing them here would only measure the cipher). What it
// measures is the remaining work: how much of the image an analyst has to
// classify before any statement can be trusted, and whether address order can
// stand in for execution order.
//
// It runs the SAME artifact twice - layout hardening on, then off - so the
// delta is the contribution of the hardening and nothing else.
//
// Usage: node tools/bench/deob-oracle.mjs [--seeds 2] [--profile SECURE]
import luaparse from 'luaparse';
import { vmBCSetLuaparse, applyBytecodeVm } from '../../vm-bytecode.js';
vmBCSetLuaparse(luaparse);

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i === -1) return d;
  const a = argv[i + 1];
  return a && !a.startsWith('--') ? a : 'true';
};
const SEEDS = parseInt(opt('seeds', '2'), 10);
const PROFILES = (opt('profiles', 'FAST,BALANCED,SECURE') || '').split(',').filter(Boolean);

const HAS_ARG = {
  CONST: 1, NUMK: 1, GLOB: 1, GSET: 1, HGLOB: 1, LLOAD: 1, LNEW: 1, LSET: 1,
  ULOAD: 1, USET: 1, UNPK: 1, UNPKR: 1, CALL: 1, CALLM: 1, PCALL: 1, XPCALL: 1,
  TAILCALL: 1, RET: 1, RETP: 1, NEWF: 1, STACKNEW: 1, STACKGET: 1, STACKSET: 1,
  STACKLEN: 1, STACKPACK: 1, STACKUNPACK: 1, STACKCLEAR: 1, STACKADAPT: 1,
  JMP: 1, JIF: 1, JIT: 1, JNIL: 1, ANDK: 1, ORK: 1, LOADK_ADD: 1, LOADK_MUL: 1,
};
const size = (op) => (HAS_ARG[op] ? 2 : 1);
const COND = new Set(['JIF', 'JIT', 'JNIL', 'ANDK', 'ORK']);
const TERM = new Set(['RET', 'RETP', 'CRASH']);

function analyseImage(code, byWord) {
  const insts = [];
  let pc = 1;
  for (let i = 0; i < code.length;) {
    const op = byWord.get(code[i]) || ('?' + code[i]);
    const n = size(op);
    insts.push({ pc, op, arg: n === 2 ? code[i + 1] : null });
    i += n;
    pc += n;
  }
  const idx = new Map(insts.map((x, i) => [x.pc, i]));
  const reach = new Set();
  const stack = [1];
  while (stack.length) {
    const p = stack.pop();
    if (reach.has(p)) continue;
    const k = idx.get(p);
    if (k === undefined) continue;
    reach.add(p);
    const inst = insts[k];
    if (TERM.has(inst.op)) continue;
    if (inst.op === 'JMP') { if (inst.arg != null) stack.push(inst.arg); continue; }
    if (COND.has(inst.op) && inst.arg != null) stack.push(inst.arg);
    stack.push(p + size(inst.op));
  }

  // Leaders, then execution order via DFS from the entry.
  const leaders = new Set([1]);
  for (const inst of insts) {
    if ((COND.has(inst.op) || inst.op === 'JMP') && inst.arg != null && idx.has(inst.arg)) leaders.add(inst.arg);
    const nx = inst.pc + size(inst.op);
    if (!TERM.has(inst.op) && inst.op !== 'JMP' && idx.has(nx)) leaders.add(nx);
  }
  const leaderList = [...leaders].filter((p) => idx.has(p)).sort((a, b) => a - b);
  const blockOf = new Map(leaderList.map((p, i) => [p, i]));
  const succ = leaderList.map(() => []);
  const lastOf = (b) => {
    const start = leaderList[b];
    const endPc = b + 1 < leaderList.length ? leaderList[b + 1] : null;
    let inst = insts[idx.get(start)];
    while (endPc !== null && inst.pc + size(inst.op) < endPc) {
      const ni = idx.get(inst.pc + size(inst.op));
      if (ni === undefined) break;
      inst = insts[ni];
    }
    return inst;
  };
  leaderList.forEach((start, b) => {
    const first = insts[idx.get(start)];
    const fall = start + size(first.op);
    if (!TERM.has(first.op) && first.op !== 'JMP' && blockOf.has(fall)) succ[b].push(blockOf.get(fall));
    if ((COND.has(first.op) || first.op === 'JMP') && first.arg != null && blockOf.has(first.arg)) succ[b].push(blockOf.get(first.arg));
    const last = lastOf(b);
    if (!last || TERM.has(last.op) || last.op === 'JMP') return;
    if (blockOf.has(last.pc + size(last.op))) succ[b].push(blockOf.get(last.pc + size(last.op)));
  });
  const visit = [];
  const seen = new Set();
  (function walk(b) {
    if (seen.has(b)) return;
    seen.add(b);
    visit.push(b);
    for (const s of succ[b]) walk(s);
  })(blockOf.get(1));
  let pairs = 0, inverted = 0;
  for (let a = 0; a < leaderList.length; a++) {
    if (!seen.has(a)) continue;
    for (let b = a + 1; b < leaderList.length; b++) {
      if (!seen.has(b)) continue;
      pairs++;
      if (visit.indexOf(a) > visit.indexOf(b)) inverted++;
    }
  }
  // Back edges: an address-order reader meets a back edge before it has met the
  // forward path, which is the classic trigger for a decompiler emitting a loop
  // it cannot close.
  let backEdges = 0;
  for (let i = 0; i < insts.length; i++) {
    const inst = insts[i];
    const isJmp = inst.op === 'JMP' || COND.has(inst.op);
    if (!isJmp || inst.arg == null) continue;
    if (inst.arg < inst.pc && idx.has(inst.arg) && reach.has(inst.pc)) backEdges++;
  }
  return {
    instructions: insts.length,
    reachable: [...reach].filter((p) => idx.has(p)).length,
    blocks: leaderList.length,
    inverted, pairs, backEdges,
  };
}

const SAMPLE = `
local function greet(name, times)
  local out = {}
  for i = 1, times do out[i] = string.format("hello %s #%d", name, i) end
  return table.concat(out, ", ")
end
local account = { balance = 100, owner = "scripter" }
local function deposit(amount)
  if amount <= 0 then return false, "invalid amount" end
  account.balance = account.balance + amount
  return true, account.balance
end
local ok, newbal = deposit(50)
print(greet(account.owner, 3))
print(ok, newbal)
local cache = {}
for k, v in pairs({a = 1, b = 2, c = 3}) do cache[k] = v * 2 end
for i = 1, #({1,2,3}) do print(i) end
print(greet("world", 2))
`;

function buildFor(profile, seed, opts) {
  let build = null;
  const vm = applyBytecodeVm(SAMPLE, Object.assign({
    profile, rethrow: true, seedOverride: seed, onBuild: (b) => { build = b; },
  }, opts));
  return { vm, build };
}

function measure(profile, seed, opts) {
  const { vm, build } = buildFor(profile, seed, opts);
  if (!vm) return null;
  const byWord = new Map(Object.entries(build.OPCODES).map(([k, v]) => [v, k]));
  const t = { insts: 0, reach: 0, inv: 0, pairs: 0, back: 0, chars: vm.length, relocated: 0, junk: 0 };
  for (const ch of build.chunks) {
    const a = analyseImage(ch.code, byWord);
    t.insts += a.instructions;
    t.reach += a.reachable;
    t.inv += a.inverted;
    t.pairs += a.pairs;
    t.back += a.backEdges;
  }
  t.relocated = build.pipeline.stats.relocatedBlocks;
  t.junk = build.pipeline.stats.junkBlocks;
  return t;
}

function row(label, t) {
  const dead = 1 - t.reach / Math.max(1, t.insts);
  const scrambled = t.pairs ? t.inv / t.pairs : 0;
  return `  ${label.padEnd(22)} image=${String(t.insts).padStart(5)} insts` +
    ` dead=${(dead * 100).toFixed(1).padStart(5)}%` +
    ` scrambled=${(scrambled * 100).toFixed(1).padStart(5)}%` +
    ` back-edges=${String(t.back).padStart(3)}` +
    ` chars=${String(Math.round(t.chars)).padStart(7)}`;
}

console.log('What an analyst must classify before trusting a single statement.\n');
console.log('  dead       = share of the image unreachable from the chunk entry');
console.log('  scrambled  = block pairs laid out in the opposite order to execution');
console.log('  back-edges = backward jumps an address-order reader meets out of sequence\n');

for (const profile of PROFILES) {
  console.log(profile + ':');
  for (const seed of [4242, 4242 + 7919].slice(0, SEEDS)) {
    const off = measure(profile, seed, { hardenOff: true, scrambleOff: true });
    const on = measure(profile, seed, {});
    console.log(row('seed ' + seed + ' OFF', off));
    console.log(row('seed ' + seed + ' ON', on));
  }
  console.log('');
}