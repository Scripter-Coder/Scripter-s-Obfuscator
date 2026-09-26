// src/vm/metamethod.js — Metamethod Completeness (Phase 7, §32)

export const METAMETHODS = ['__call','__index','__newindex','__add','__sub','__mul','__div','__mod','__pow','__concat','__eq','__lt','__le','__len'];

export function hasMetamethod(table, name) {
  const mt = table && table.__metatable || table;
  return mt && mt[name];
}

export function dispatchMetamethod(vm, table, name, ...args) {
  const fn = table && table[name] || (vm && vm.lookup && vm.lookup(name));
  if (typeof fn === 'function') return fn(...args);
  return null;
}

// Test cases for completeness
export const METAMETHOD_TESTS = [
  { name:'callable table', code:'local t=setmetatable({}, {__call=function(_,x) return x*2 end}); RESULT=t(3)', expect:6 },
  { name:'__index VM function', code:'local t=setmetatable({}, {__index=function(_,k) return k.."!" end}); RESULT=t.foo', expect:'foo!' },
  { name:'__newindex VM', code:'local t=setmetatable({}, {__newindex=function(_,k,v) rawset(_,k,v*2) end}); t.x=3; RESULT=t.x', expect:6 },
  { name:'nested metamethod', code:'local a=setmetatable({x=1}, {__add=function(a,b) return a.x+b.x end}); local b={x=2}; setmetatable(b,getmetatable(a)); RESULT=(a+b)', expect:null },
];
