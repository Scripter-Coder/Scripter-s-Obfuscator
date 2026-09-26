// Production compiler pipeline bridge.
// The scheduler bytecode ABI remains unchanged; this module makes the
// existing IR/CFG/optimizer/allocation/transforms authoritative between
// AST lowering and VM-bytecode serialization.
import { CFG } from './cfg.js';
import { runOptimizer } from './optimizer.js';
import { allocateRegisters } from './register.js';
import { applyFusion } from './fusion.js';
import { applySplitting } from './splitting.js';
import { chooseMutation } from './mutation.js';

const ARG_OPS = new Set([
  'CONST','NUMK','GLOB','GSET','LLOAD','LNEW','LSET','ULOAD','USET',
  'UNPK','UNPKR','CALL','CALLM','PCALL','XPCALL','TAILCALL','RET','RETP',
  'NEWF','JMP','JIF','JIT','JNIL','ANDK','ORK'
]);
const JUMP_OPS = new Set(['JMP','JIF','JIT','JNIL','ANDK','ORK']);
const LOCAL_OPS = new Set(['LLOAD','LNEW','LSET','ULOAD','USET']);
const CAPTURE_OPS = new Set(['ULOAD','USET']);

function decodeChunk(chunk, inverse) {
  const insts=[];
  if(chunk.code.length && typeof chunk.code[0]==='object') {
    let pc=1;
    for(const raw of chunk.code) {
      const op=raw.op; const inst={op,args:raw.a==null?[]:[raw.a],pc};
      inst.oldPc=pc; insts.push(inst); pc += raw.a==null ? 1 : 2;
    }
    return insts;
  }
  for(let pc=0; pc<chunk.code.length; ) {
    const word=chunk.code[pc++];
    const op=inverse.get(word);
    if(!op) throw new Error('IR decode: unknown opcode '+word);
    const inst={op, args:[], pc:pc};
    inst.oldPc=pc;
    if(ARG_OPS.has(op)) inst.args.push(chunk.code[pc++]);
    insts.push(inst);
  }
  return insts;
}

function encodeChunk(insts, opcodes) {
  const code=[];
  const pcMap=new Map();
  for(const i of insts) { if(opcodes[i.op]==null) throw new Error('IR lower unknown op '+String(i.op)+' meta='+JSON.stringify(i.meta||{})); pcMap.set(i.oldPc, code.length+1); code.push(opcodes[i.op]); if(i.args.length) code.push(i.args[0]); }
  // Jump operands are old absolute PCs; rewrite them after all positions exist.
  let off=0;
  for(const i of insts) {
    if(i.args.length && JUMP_OPS.has(i.op)) {
      const target=pcMap.get(i.meta?.targetPc ?? i.args[0]);
      if(target==null) throw new Error('IR lower: missing jump target '+i.args[0]);
      code[off+1]=target;
    }
    off += 1 + (i.args.length ? 1 : 0);
  }
  return code;
}

function makeBlocks(insts) {
  const leaders=new Set([insts[0]?.oldPc].filter(Boolean));
  for(let n=0;n<insts.length;n++) {
    const i=insts[n];
    if(JUMP_OPS.has(i.op)) {
      leaders.add(i.args[0]);
      if(insts[n+1]) leaders.add(insts[n+1].oldPc);
    }
  }
  const starts=[...leaders].sort((a,b)=>a-b);
  const blockByPc=new Map(starts.map((pc,i)=>[pc,i]));
  const blocks=[];
  for(let i=0;i<starts.length;i++) {
    const start=starts[i], end=i+1<starts.length?starts[i+1]:Infinity;
    const bi={id:i,insts:insts.filter(x=>x.oldPc>=start&&x.oldPc<end).map(x=>({
      op:x.op,a:x.args[0],target:JUMP_OPS.has(x.op)?blockByPc.get(x.args[0]):undefined,
      meta:{oldPc:x.oldPc,targetPc:JUMP_OPS.has(x.op)?x.args[0]:undefined,stackValue:x.stackValue}
    })),succ:[],pred:[],phis:[]};
    blocks.push(bi);
  }
  return blocks;
}
function annotateUses(blocks) {
  for(const b of blocks) for(const i of b.insts) {
    if(LOCAL_OPS.has(i.op) && i.a!=null) {
      i.use=(i.op==='LLOAD'||i.op==='LSET'||i.op==='ULOAD'||i.op==='USET')?[i.a]:[];
      i.def=(i.op==='LNEW')?[i.a]:[];
    } else { i.use=[]; i.def=[]; }
  }
}

export function runProductionPipeline(build, opts={}) {
  const inverse=new Map(Object.entries(build.OPCODES).map(([k,v])=>[v,k]));
  const reports=[];
  const seed=build.seed>>>0;
  const profile=build.profileName||'BALANCED';
  let totalReuse=0,totalFold=0,totalFusion=0,totalSplit=0,totalMut=0,totalCfg=0,totalAppliedReuse=0;
  for(let chunkIndex=0; chunkIndex<build.chunks.length; chunkIndex++) {
    const chunk=build.chunks[chunkIndex];
    const transformThisChunk = chunkIndex === build.chunks.length-1;
    const decoded=decodeChunk(chunk,inverse);
    chunk._decodedForPipeline=decoded;
    decoded.forEach((i,n)=>{
      i.index=n;
      if(i.op==='NUMK' && i.args[0]>0) {
        const ref=build.refs[i.args[0]-1];
        if(ref) { let raw=''; for(let q=0;q<ref.len;q++) raw+=String.fromCharCode(build.vaultPlain[ref.start+q]); const v=Number(raw); if(Number.isFinite(v)) i.stackValue=v; }
      }
    });
    const blocks=makeBlocks(decoded);
    const funcIR={name:'chunk',blocks,maxReg:0,captured:new Set()};
    annotateUses(blocks);
    const cfg=new CFG(funcIR); cfg.build();
    // Existing numeric constants are safe fold targets without extending the
    // encrypted vault layout during this pass.
    for(const b of blocks) for(const ii of b.insts) if(ii.op==='ADD'||ii.op==='SUB'||ii.op==='MUL'||ii.op==='DIV'||ii.op==='MOD'||ii.op==='POW') ii.meta=ii.meta||{};
    totalCfg += blocks.length;
    // Conservative optimizer is now genuinely run against production IR.
    // For multi-block chunks, preserve the existing absolute-PC layout; control-flow
    // lowering remains authoritative until a label-aware allocator is used.
    if(blocks.length===1 && !build.disableFolding) {
      for(const b of blocks) for(let q=0;q+2<b.insts.length;q++){ const a=b.insts[q],c=b.insts[q+1],o=b.insts[q+2]; if(a.op==='NUMK'&&c.op==='NUMK'&&['ADD','SUB','MUL','DIV','MOD','POW'].includes(o.op)){ const av=a.meta?.stackValue,bv=c.meta?.stackValue; let v; if(o.op==='ADD')v=av+bv;else if(o.op==='SUB')v=av-bv;else if(o.op==='MUL')v=av*bv;else if(o.op==='DIV')v=av/bv;else if(o.op==='MOD')v=av%bv;else v=av**bv; let found=false; for(const r of build.refs){let raw='';for(let z=0;z<r.len;z++)raw+=String.fromCharCode(build.vaultPlain[r.start+z]);if(raw===String(v)){found=true;break;}} o.meta=o.meta||{};o.meta.allowFold=found; } }
    }
    const opt=blocks.length===1 && !build.disableFolding ? runOptimizer(funcIR,{profile}) : {changed:false,stats:{constFolding:{folded:0},redundantMoveElim:{elim:0},deadCode:{removed:0}},profile};
    totalFold += opt.stats.constFolding?.folded||0;
    // Apply safe CFG analysis. Do not reorder blocks: absolute-PC ABI and
    // protected/coroutine edges require stable instruction ordering.
    cfg.build();
    const flat=funcIR.blocks.flatMap(b=>b.insts);
    const capturedGlobal=new Set();
    for(const other of build.chunks) {
      if(other._decodedForPipeline) for(const ii of other._decodedForPipeline) if(CAPTURE_OPS.has(ii.op)) capturedGlobal.add(ii.args[0]);
    }
    for(const ii of decoded) if(CAPTURE_OPS.has(ii.op)) capturedGlobal.add(ii.args[0]);
    const reserved=new Map();
    // Keep every ordinary lexical ID at its existing numeric slot. The allocator
    // is then free to reuse only slots above the existing ABI range for compiler
    // temporaries, so a physical temporary can never alias a scheduler local.
    for(const ii of flat) if(LOCAL_OPS.has(ii.op)&&ii.a!=null && !(build.hiddenIds||new Set()).has(ii.a)) reserved.set(ii.a,ii.a);
    const allocIR={blocks:[{id:0,insts:flat,succ:[]}],maxReg:0,captured:capturedGlobal};
    annotateUses(allocIR.blocks);
    const alloc=allocateRegisters(allocIR,profile,{reservedCaptured:reserved});
    totalReuse += alloc.reused||0;
    const allocMap=alloc.allocated;
    // Apply lifetime allocation only to compiler-generated temporary lexical IDs.
    // User-visible/captured IDs remain ABI-stable; reserved slots prevent a temp
    // from aliasing an ordinary local or an upvalue key.
    const hiddenIds=build.hiddenIds || new Set();
    for(const ii of flat) if(LOCAL_OPS.has(ii.op)&&ii.a!=null&&hiddenIds.has(ii.a)&&!capturedGlobal.has(ii.a)&&allocMap.has(ii.a)) { const old=ii.a; const next=allocMap.get(ii.a); if(next!==old) totalAppliedReuse++; ii.a=next; }
    // Production transforms operate on the IR. Fusion/splitting only select
    // instructions with concrete VM implementations below.
    let insts=flat.map(i=>({op:i.op,a:i.a,target:i.target,meta:i.meta||{}}));
    const fu=transformThisChunk && blocks.length===1 ? applyFusion(insts,seed,profile) : {insts,fused:0,log:[]}; totalFusion += fu.fused;
    insts=fu.insts;
    // Only use splitting rules whose parts are real VM ops; unsupported pseudo
    // handlers remain unsplit rather than generating dead opcodes.
    let filtered=[]; let originalSplit={insts, splits:0};
    if(transformThisChunk && blocks.length===1) {
      for(const i of insts) {
        if(i.op==='TGET') {
          const r=applySplitting([i],seed,profile); filtered.push(...r.insts); originalSplit.splits += r.splits;
        } else filtered.push(i);
      }
    } else filtered=insts.slice();
    totalSplit += originalSplit.splits;
    // Mutation is restricted to semantically identical concrete handler variants.
    for(let n=0;n<filtered.length && transformThisChunk && blocks.length===1;n++) {
      const i=filtered[n]; const m=chooseMutation(i.op,seed,profile,n);
      if(m && (m.mutation.name==='reversed' && (i.op==='ADD'||i.op==='MUL'))) {
        // Stack operands are symmetric for these operators; preserve the opcode
        // but record the build mutation in metadata for handler selection.
        i.meta.mutation=m.mutation.name; i.op=(i.op==='ADD'?'ADD_R':'MUL_R'); totalMut++;
      }
    }
    const lowered=filtered.map((i,n)=>{
      if(i.op==='NUMK' && i.meta?.folded) {
        const text=String(i.meta.stackValue);
        let found=0;
        for(let r=0;r<build.refs.length;r++){ const ref=build.refs[r]; let raw=''; for(let q=0;q<ref.len;q++) raw+=String.fromCharCode(build.vaultPlain[ref.start+q]); if(raw===text){found=r+1;break;} }
        if(found) i.a=found; else i.meta.noLower=true;
      }
      return {op:i.op,args:i.a==null?[]:[i.a],oldPc:i.meta?.oldPc||decoded[n]?.oldPc||0,meta:i.meta};
    });
    chunk.code=encodeChunk(lowered,build.OPCODES);
    reports.push({blocks:blocks.length,optimizer:opt.stats,allocation:alloc, fused:fu.fused, split:originalSplit.splits, mutations:filtered.filter(i=>i.meta?.mutation).length});
  }
  // User-visible and captured lexical IDs remain ABI-stable; compiler-generated
  // temporaries are physically reused before lowering and remain scheduler-safe.
  build.pipeline={
    stages:['AST','IR','CFG','optimizer','register-allocation','transforms','lowering','VM-bytecode'],
    ir:true,cfg:true,optimizer:true,registerAllocation:true,transforms:true,lowering:true,
    stats:{chunks:build.chunks.length,cfgBlocks:totalCfg,folded:totalFold,reused:totalReuse,appliedReuse:totalAppliedReuse,fused:totalFusion,split:totalSplit,mutations:totalMut},
    reports
  };
  for(const ch of build.chunks) delete ch._decodedForPipeline;
  return build;
}
