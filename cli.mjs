#!/usr/bin/env node
// cli.mjs — Final CLI (Phase 8, §38)
import { readFileSync, writeFileSync } from 'fs';
import luaparse from 'luaparse';
import { applyCustomObfuscator } from './custom-obfuscator.js';
import { vmBCSetLuaparse, applyBytecodeVm } from './vm-bytecode.js';
import { getTarget, listTargets } from './src/targets/registry.js';
import { resolveProfile } from './src/profiles.js';
vmBCSetLuaparse(luaparse);

function parseArgs(argv){
  const opts={};
  const flags=new Set(['--target','--profile','--vm','--seed','--compress','--debug','--static-env','--compatibility','--ffi','--hardcode-globals','--control-flow','--constants','--report']);
  for(let i=2;i<argv.length;i++){
    const a=argv[i];
    if(a==='--help' || a==='-h'){ opts.help=true; continue; }
    if(a.startsWith('--')){
      const eq=a.indexOf('=');
      let k, v;
      if(eq>0){ k=a.slice(0,eq); v=a.slice(eq+1); }
      else { k=a; v=argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : 'true'; }
      if(!flags.has(k)) { console.error('Unknown flag',k); process.exit(1); }
      opts[k.slice(2)]=v;
    } else {
      if(!opts.input) opts.input=a; else if(!opts.output) opts.output=a;
    }
  }
  return opts;
}
function validate(opts){
  if(opts.target && opts.target.toLowerCase().includes('luajit') && opts.ffi==='true' && !['luajit','jit'].includes(opts.target.toLowerCase())) {
    console.error('Incompatible: --ffi only valid with --target luajit'); process.exit(1);
  }
  if(opts.profile && !['FAST','BALANCED','SECURE','OBSIDIAN','ONYX','OPAL'].includes(opts.profile.toUpperCase())){
    console.error('Invalid --profile',opts.profile); process.exit(1);
  }
  if(opts.vm && !['FAST_VM','BALANCED_VM','SECURE_VM','CRYSTAL','ONYX2','OBSIDIAN','PHANTOM_VM'].includes(opts.vm.toUpperCase())){
    console.error('Invalid --vm',opts.vm); process.exit(1);
  }
  if(opts.seed && isNaN(parseInt(opts.seed,10))){ console.error('Invalid --seed'); process.exit(1); }
}
function help(){
  console.log(`ScripterHub Obfuscator CLI

Usage: node cli.mjs [options] <input.lua> [output.lua]

Options:
  --target <lua51|lua52|lua53|lua54|luajit|luau>   Target Lua version (default lua51)
  --profile <FAST|BALANCED|SECURE>                 VM profile (default BALANCED)
  --vm <FAST_VM|BALANCED_VM|SECURE_VM|CRYSTAL|ONYX2|OBSIDIAN>  VM variant (affects dispatch, state layout, encoding)
  --seed <int>                                     Build seed for reproducibility (same seed → byte-identical)
  --compress                                       Enable VM compression (size optimization, SECURE default on)
  --debug                                          Keep debug info (default off)
  --static-env                                     Force static environment (optimize globals) or --static-env=false
  --compatibility                                  Compatibility mode (disable transforms unsafe for target)
  --ffi                                            Enable FFI (only with --target luajit)
  --hardcode-globals                               Hardcode globals (unsafe on dynamic envs)
  --control-flow <none|light|heavy>                Control-flow strength
  --constants <basic|typed|strong>                 Constant protection level
  --report                                         Print build report (size, profile, variant, seed)

Per-function attributes (inside Lua source):
  VMATTR(VM=SECURE, PRESET=SECURE, TRANSFORM=CONTROL_FLOW, INLINE=true, UNROLL=true, MBA=STRONG)

Examples:
  node cli.mjs --target lua51 --profile SECURE --seed 123 input.lua output.lua
  node cli.mjs --target lua54 input.lua   # will error: lua54 NOT READY
`);
}
const opts=parseArgs(process.argv);
if(opts.help){ help(); process.exit(0); }
validate(opts);
if(!opts.input){ help(); process.exit(1); }
const src=readFileSync(opts.input,'utf8');
const profile=opts.profile ? opts.profile.toUpperCase() : 'BALANCED';
const target=opts.target ? opts.target.toLowerCase() : 'lua51';
const vm=opts.vm ? opts.vm.toUpperCase() : null;
const seed=opts.seed ? parseInt(opts.seed,10) : null;
const t=getTarget(target);
if(t.TARGET.status!=='IMPLEMENTED'){
  console.error(`Target ${target} ${t.TARGET.status}: ${t.TARGET.reason || 'not implemented'}`);
  console.error(`Available: ${listTargets().map(x=>x.name+':'+x.status).join(', ')}`);
  process.exit(1);
}
const obfOpts={ profile, target, seed, vm, compress: opts.compress==='true', debug: opts.debug==='true', staticEnv: opts['static-env'], compatibility: opts.compatibility==='true', ffi: opts.ffi==='true' };
if(seed!=null) obfOpts.seedOverride=seed;
if(vm) obfOpts.vmTier=vm;
const t0=Date.now();
const out=applyBytecodeVm ? (applyCustomObfuscator(src, obfOpts) || applyBytecodeVm(src,{profile, seedOverride:seed})) : applyCustomObfuscator(src, obfOpts);
const dt=Date.now()-t0;
if(opts.output) writeFileSync(opts.output, out, 'utf8'); else process.stdout.write(out);
if(opts.report==='true'){
  console.error(`\n[report] target=${target} profile=${profile} vm=${vm||profile} seed=${seed||'(random)'} in=${src.length} out=${out.length} ratio=${(out.length/src.length).toFixed(2)}x time=${dt}ms`);
}
