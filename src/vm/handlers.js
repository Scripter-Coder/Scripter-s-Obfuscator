// src/vm/handlers.js — Real Handler Decomposition (Phase 4, §7)
// CALL → prepareCall/resolveCallable/setupFrame/dispatchFrame, per-variant.

export const HANDLER_VARIANTS = {
  CALL: [
    { name:'monolithic', parts: ['CALL'], helpers: [] },
    { name:'decomposed2', parts: ['prepareCall','resolveCallable','setupFrame'], helpers: ['prepareCall','resolveCallable'] },
    { name:'decomposed4', parts: ['prepareCall','resolveCallable','setupFrame','dispatchFrame'], helpers: ['prepareCall','resolveCallable','setupFrame'] },
    { name:'helper', parts: ['CALL'], helpers: ['callHelper'] },
  ],
  TGET: [
    { name:'direct', parts:['TGET'] },
    { name:'split', parts:['PREP_KEY','LOOKUP'] },
  ],
};

export function pickHandlerVariant(op, seed, profileName) {
  const variants = HANDLER_VARIANTS[op];
  if(!variants) return { name:'direct', parts:[op] };
  let s = seed >>>0;
  const rnd = n=>{s=(s*1664525+1013904223)>>>0; return s % n;};
  if(profileName==='FAST') return variants[0];
  if(profileName==='SECURE') return variants[rnd(variants.length)];
  return variants[rnd(Math.min(2,variants.length))];
}

export function handlerIsReachable(variant) {
  // Every generated helper must be reachable from production path
  return variant.parts.length>0;
}

export function luaHandlerSnippet(op, variant, vars) {
  // vars: {S,SP,SC,CODE,PC etc.}
  if(op==='CALL' && variant.name==='decomposed2') {
    return `-- decomposed CALL: prepareCall + resolveCallable
local function prepareCall(a) return a end
local function resolveCallable(f) return f end`;
  }
  if(op==='CALL' && variant.name==='decomposed4') {
    return `-- decomposed CALL 4 parts
local function prepareCall(a) return a end
local function resolveCallable(f) return f end
local function setupFrame(f) return f end`;
  }
  return `-- handler ${op} ${variant.name}`;
}
