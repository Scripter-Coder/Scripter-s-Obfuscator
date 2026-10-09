// tools/bench/deob-resistance.mjs
//
// Measures how much of an emitted VM artifact survives an analyst.
//
// Three independent signals, none of which trusts the obfuscator's own claims:
//
//   1. ORACLE. deob.py - the project's own attacker tool, run unmodified against
//      the emitted VM layer. Whatever it produces IS what a determined static
//      tool currently recovers. Classified by how far it got.
//
//   2. ORDER DIVERGENCE. A stack VM is trivial to decompile while its address
//      order is its execution order. This is the fraction of basic blocks that
//      are laid out out of execution order, and the fraction of instructions
//      whose linear fall-through does NOT follow execution.
//
//   3. DEAD RATIO. The fraction of the instruction stream a reader reaches
//      from the chunk entry. Everything else is filler that decodes into
//      plausible statements.
//
// (2) and (3) are properties of the artifact, computed from the build, so they
// are checkable by anyone and do not depend on the quality of a particular
// attacker.
//
// Usage: node tools/bench/deob-resistance.mjs [--seeds 3] [--quiet]
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
const SEEDS = parseInt(opt('seeds', '3'), 10);
const QUIET = opt('quiet', 'false') === 'true';
const PROFILES = (opt('profiles', 'FAST,BALANCED,SECURE') || '').split(',').filter(Boolean);
const SKIP_ORACLE = opt('oracle', 'true') === 'false';

const SAMPLE = `
local function greet(name, times)
  local out = {}
  for i = 1, times do
    out[i] = string.format("hello %s #%d", name, i)
  end
  return table.concat(out, ", ")
end

local account = { balance = 100, owner = "scripter" }

local function deposit(amount)
  if amount <= 0 then
    return false, "invalid amount"
  end
  account.balance = account.balance + amount
  return true, account.balance
end

local ok, newbal = deposit(50)
print(greet(account.owner, 3))
print(ok, newbal)

local cache = {}
for k, v in pairs({a = 1, b = 2, c = 3}) do
  cache[k] = v * 2
end
for i = 1, #({1,2,3}) do
  print(i)
end
print(greet("world", 2))
`;

// --- artifact metrics, computed from the build -----------------------------
const COND = new Set(['JIF', 'JIT', 'JNIL', 'ANDK', 'ORK']);
const TERM = new Set(['RET', 'RETP', 'CRASH']);
const hasArg = (op) => ({
  CONST: 1, NUMK: 1, GLOB: 1, GSET: 1, HGLOB: 1, LLOAD: 1, LNEW: 1, LSET: 1,
  ULOAD: 1, USET: 1, UNPK: 1, UNPKR: 1, CALL: 1, CALLM: 1, PCALL: 1, XPCALL: 1,
  TAILCALL: 1, RET: 1, RETP: 1, NEWF: 1, STACKNEW: 1, STACKGET: 1, STACKSET: 1,
  STACKLEN: 1, STACKPACK: 1, STACKUNPACK: 1, STACKCLEAR: 1, STACKADAPT: 1,
  JMP: 1, JIF: 1, JIT: 1, JNIL: 1, ANDK: 1, ORK: 1, LOADK_ADD: 1, LOADK_MUL: 1,
}[op] ? 2 : 1);

// `code` holds RAW opcode numbers, so the caller supplies the per-build name
// map. Everything below works in names; the numbers are only used to size
// instructions.
function measureChunk(code, nameOf) {
  // pc is the 1-based WORD position the scheduler uses, not the instruction
  // index. Sizing has to advance in both.
  const insts = [];
  let pc = 1;
  for (let i = 0; i < code.length;) {
    const name = nameOf(code[i]);
    const size = hasArg(name);
    insts.push({ pc, op: name, arg: size === 2 ? code[i + 1] : null });
    i += size;
    pc += size;
  }
  const idx = new Map(insts.map((x, i) => [x.pc, i]));
  const reach = new Set();
  const stack = [1];
  while (stack.length) {
    const p = stack.pop();
    if (reach.has(p)) continue;
    const i = idx.get(p);
    if (i === undefined) continue;
    reach.add(p);
    const inst = insts[i];
    if (TERM.has(inst.op)) continue;
    if (inst.op === 'JMP') { if (inst.arg != null) stack.push(inst.arg); continue; }
    if (COND.has(inst.op) && inst.arg != null) stack.push(inst.arg);
    stack.push(p + hasArg(inst.op));
  }
  const reachable = [...reach].filter((p) => idx.has(p)).length;

  // Blocks, then the layout metric: walk the reachable CFG from the entry and
  // record the visiting order, then count how many pairs of blocks are laid out
  // in the opposite order from the one execution visits them in. 0 means
  // address order IS execution order (trivial for a decompiler); 1 means fully
  // scrambled.
  const leaders = new Set([1]);
  for (const inst of insts) {
    if ((COND.has(inst.op) || inst.op === 'JMP') && inst.arg != null && idx.has(inst.arg)) leaders.add(inst.arg);
    const nx = inst.pc + hasArg(inst.op);
    if (!TERM.has(inst.op) && inst.op !== 'JMP' && idx.has(nx)) leaders.add(nx);
  }
  const leaderList = [...leaders].filter((p) => idx.has(p)).sort((a, b) => a - b);
  const blockOf = new Map(leaderList.map((p, i) => [p, i]));
  const succ = leaderList.map(() => []);
  // Last instruction of the block starting at leaderList[b].
  const lastOf = (b) => {
    const start = leaderList[b];
    const endPc = b + 1 < leaderList.length ? leaderList[b + 1] : null;
    let inst = insts[idx.get(start)];
    while (endPc !== null && inst.pc + hasArg(inst.op) < endPc) {
      const nx = inst.pc + hasArg(inst.op);
      const ni = idx.get(nx);
      if (ni === undefined) break;
      inst = insts[ni];
    }
    return inst;
  };
  leaderList.forEach((start, b) => {
    const first = insts[idx.get(start)];
    const fall = start + hasArg(first.op);
    if (!TERM.has(first.op) && first.op !== 'JMP' && blockOf.has(fall)) succ[b].push(blockOf.get(fall));
    if ((COND.has(first.op) || first.op === 'JMP') && first.arg != null && blockOf.has(first.arg)) succ[b].push(blockOf.get(first.arg));
    const last = lastOf(b);
    if (!last || TERM.has(last.op) || last.op === 'JMP') return;
    const after = last.pc + hasArg(last.op);
    if (blockOf.has(after)) succ[b].push(blockOf.get(after));
  });
  const visit = [];
  const seen = new Set();
  const walk = (b) => {
    if (seen.has(b)) return;
    seen.add(b);
    visit.push(b);
    for (const s of succ[b]) walk(s);
  };
  walk(blockOf.get(1));
  // Compare ADDRESS order (block index, since leaderList is sorted by pc)
  // against EXECUTION order (position in the DFS from the entry). A pair
  // (a, b) with a < b is inverted when execution visits b before a: the layout
  // says a comes first, execution says otherwise.
  const execIndex = new Map(visit.map((b, i) => [b, i]));
  let pairs = 0, inverted = 0;
  for (let a = 0; a < leaderList.length; a++) {
    if (!execIndex.has(a)) continue;
    for (let b = a + 1; b < leaderList.length; b++) {
      if (!execIndex.has(b)) continue;
      pairs++;
      if (execIndex.get(a) > execIndex.get(b)) inverted++;
    }
  }
  return {
    instructions: insts.length,
    reachable,
    blocks: leaderList.length,
    execBlocks: visit.length,
    pairs,
    inverted,
  };
}

// --- oracle ----------------------------------------------------------------
function runOracle(text, workDir) {
  const file = join(workDir, 'artifact.lua');
  writeFileSync(file, text, 'utf8');
  const r = spawnSync('py', ['deob.py', file, '-o', join(workDir, 'out.lua')], {
    encoding: 'utf8', cwd: process.cwd(),
  });
  if (r.error) return { verdict: 'SKIP', detail: String(r.error.message).slice(0, 60) };
  const out = (r.stdout || '') + (r.stderr || '');
  if (/VM dispatcher not found/.test(out)) return { verdict: 'no-dispatcher' };
  if (/string decoder not found/.test(out)) return { verdict: 'no-decoder' };
  if (/Traceback/.test(out)) {
    const m = out.match(/line (\d+), in (\w+)/g);
    return { verdict: 'crashed', detail: (m || []).slice(-1)[0] || '' };
  }
  const m = out.match(/\((\d+) bytes\)/);
  if (m) return { verdict: 'DECOMPILED', bytes: parseInt(m[1], 10) };
  return { verdict: 'other', detail: out.trim().slice(0, 60) };
}

function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'sh-deob-'));
  const totals = {};
  let failures = 0;
  try {
    for (const profile of PROFILES) {
      const rows = [];
      for (let s = 0; s < SEEDS; s++) {
        const seed = 4242 + s * 7919;
        let build = null;
        const vm = applyBytecodeVm(SAMPLE, {
          profile, rethrow: true, seedOverride: seed,
          onBuild: (b) => { build = b; },
        });
        if (!vm) { failures++; continue; }
        // build.OPCODES maps NAME -> number, so the benchmark needs the inverse.
        const byWord = new Map(Object.entries(build.OPCODES).map(([k, v]) => [v, k]));
        const nameOf = (word) => byWord.get(word) || ('?' + word);
        const agg = build.chunks.reduce((acc, ch) => {
          const m = measureChunk(ch.code, nameOf);
          acc.instructions += m.instructions;
          acc.reachable += m.reachable;
          acc.pairs += m.pairs;
          acc.inverted += m.inverted;
          acc.addrBlocks += m.blocks;
          acc.execBlocks += m.execBlocks;
          return acc;
        }, { instructions: 0, reachable: 0, pairs: 0, inverted: 0, addrBlocks: 0, execBlocks: 0 });
        const oracle = SKIP_ORACLE ? { verdict: 'skipped' } : runOracle(vm, workDir);
        const deadRatio = 1 - agg.reachable / Math.max(1, agg.instructions);
        // 0 = address order IS execution order. 1 = fully inverted.
        const scramble = agg.pairs ? agg.inverted / agg.pairs : 0;
        rows.push({
          seed, chars: vm.length, deadRatio, scramble,
          instructions: agg.instructions,
          relocated: build.pipeline.stats.relocatedBlocks,
          junk: build.pipeline.stats.junkBlocks,
          oracle: oracle.verdict,
        });
      }
      const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length);
      totals[profile] = {
        chars: avg((r) => r.chars),
        dead: avg((r) => r.deadRatio),
        scramble: avg((r) => r.scramble),
        instructions: avg((r) => r.instructions),
        oracle: rows.map((r) => r.oracle).join(','),
      };
      if (!QUIET) {
        for (const r of rows) {
          console.log(`  ${profile} seed=${r.seed} chars=${r.chars}` +
            ` insts=${r.instructions}` +
            ` dead=${(r.deadRatio * 100).toFixed(1)}%` +
            ` scrambled=${(r.scramble * 100).toFixed(1)}%` +
            ` relocated=${r.relocated} junk=${r.junk}` +
            ` deob.py=${r.oracle}`);
        }
      }
    }
    console.log('\ndeob-resistance summary (mean over ' + SEEDS + ' builds)');
    for (const [p, t] of Object.entries(totals)) {
      console.log(`  ${p.padEnd(9)} dead=${(t.dead * 100).toFixed(1)}%` +
        ` scrambled=${(t.scramble * 100).toFixed(1)}%` +
        ` insts=${Math.round(t.instructions)}` +
        ` chars=${Math.round(t.chars)}` +
        ` deob.py=[${t.oracle}]`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  process.exit(failures ? 1 : 0);
}
main();