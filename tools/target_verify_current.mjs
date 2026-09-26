import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import luaparse from 'luaparse';
import fengari from 'fengari';
import { vmBCSetLuaparse, applyBytecodeVm } from '../vm-bytecode.js';

vmBCSetLuaparse(luaparse);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const TARGETS = [
  { name: 'lua51', env: 'LUA51_EXE', expected: /^Lua 5\.1\.5\b/, names: ['lua51.exe', 'lua.exe'] },
  { name: 'lua52', env: 'LUA52_EXE', expected: /^Lua 5\.2\.4\b/, names: ['lua52.exe', 'lua.exe'] },
  { name: 'lua53', env: 'LUA53_EXE', expected: /^Lua 5\.3\.6\b/, names: ['lua53.exe', 'lua.exe'] },
  { name: 'lua54', env: 'LUA54_EXE', expected: /^Lua 5\.4\.8\b/, names: ['lua54.exe', 'lua.exe'] },
  { name: 'luajit', env: 'LUAJIT_EXE', expected: /^LuaJIT 2\.1\b/, names: ['luajit.exe'] },
  { name: 'luau', env: 'LUAU_EXE', expected: /\bLuau 0\.709\b/i, names: ['luau.exe'] },
];

const corpus = [
  ['arithmetic', 'RESULT=tostring(2+3*4)'],
  ['locals_globals', 'local x=3; GLOBAL_TARGET=x+2; RESULT=tostring(GLOBAL_TARGET)'],
  ['tables_index', 'local t={a=3}; t.b=4; RESULT=tostring(t.a+t["b"])'],
  ['assignment', 'local x=1; x=x+4; RESULT=tostring(x)'],
  ['branch', 'local x=4; if x>2 then RESULT="yes" elseif x==2 then RESULT="equal" else RESULT="no" end'],
  ['numeric_loop', 'local x=0; for i=1,4 do x=x+i end; RESULT=tostring(x)'],
  ['generic_loop', 'local t={2,3}; local x=0; for _,v in ipairs(t) do x=x+v end; RESULT=tostring(x)'],
  ['functions_closures', 'local x=4; local function f() return x+3 end; RESULT=tostring(f())'],
  ['recursion', 'local function f(n) if n<2 then return 1 end return n*f(n-1) end; RESULT=tostring(f(5))'],
  ['varargs_returns', 'local function f(...) return select("#",...) end; RESULT=tostring(f(1,2,3))'],
  ['pcall_xpcall', 'local ok,a=pcall(function() return 6 end); local ok2,b=xpcall(function() error("x") end,function() return "caught" end); RESULT=tostring(ok)..":"..tostring(a)..":"..tostring(ok2)..":"..b'],
  ['coroutine', 'local c=coroutine.create(function() coroutine.yield(7); return 8 end); local a,b=coroutine.resume(c); local d,e=coroutine.resume(c); RESULT=tostring(a)..":"..tostring(b)..":"..tostring(d)..":"..tostring(e)'],
  ['metamethod', 'local t=setmetatable({x=4},{__add=function(a,b)return a.x+b end}); RESULT=tostring(t+6)'],
  ['vm_none_to_vm', '-- VMATTR(VM=NONE)\nlocal function n(x)return x+1 end\n-- VMATTR(VM=OPAL)\nlocal function v(x)return n(x)*2 end\nRESULT=tostring(v(4))'],
  ['vm_to_none', '-- VMATTR(VM=OPAL)\nlocal function v(x)return x+1 end\n-- VMATTR(VM=NONE)\nlocal function n(x)return v(x)*2 end\nRESULT=tostring(n(4))'],
  ['precheck', 'LPH_PRECHECK(function() return 123 end, 123); RESULT="ok"'],
];

function runFengari(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) return { ok: false, error: to_jsstring(lua.lua_tostring(L, -1)) };
  lua.lua_getglobal(L, to_luastring('RESULT'));
  return { ok: true, result: to_jsstring(lua.lua_tostring(L, -1)) };
}

function where(name) {
  try { return execFileSync('where.exe', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).find(Boolean) || null; } catch { return null; }
}

function projectCandidates(names) {
  const roots = [path.resolve('runtimes'), path.resolve('tools', 'runtimes'), path.resolve('vendor')].filter(fs.existsSync);
  const found = [];
  for (const root of roots) {
    const pending = [root];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (names.includes(entry.name.toLowerCase())) found.push(full);
      }
    }
  }
  return found;
}

function discover(target) {
  const explicit = process.env[target.env];
  if (explicit) return { executable: explicit, source: target.env };
  for (const name of target.names) {
    const hit = where(name);
    if (hit) return { executable: hit, source: 'PATH' };
  }
  const project = projectCandidates(target.names);
  return project.length ? { executable: project[0], source: 'project runtime directory' } : null;
}

function versionOf(executable) {
  const result = spawnSync(executable, ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function writeCorpusFiles(source, artifact) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-obfuscator-target-'));
  const nativeFile = path.join(tempDir, 'native.lua');
  const artifactFile = path.join(tempDir, 'artifact.lua');
  fs.writeFileSync(nativeFile, source);
  fs.writeFileSync(artifactFile, artifact);
  return { nativeFile, artifactFile };
}

function execute(executable, file) {
  try { return { ok: true, output: execFileSync(executable, [file], { encoding: 'utf8', timeout: 30000 }).trim() }; }
  catch (error) { return { ok: false, output: String(error.stderr || error.message).trim().slice(0, 300) }; }
}

for (const target of TARGETS) {
  const found = discover(target);
  if (!found) {
    console.log(JSON.stringify({ target: target.name, status: 'UNAVAILABLE', evidence: 'not found in explicit env, PATH, or project runtime directories' }));
    continue;
  }
  const versionText = versionOf(found.executable).trim().replace(/\s+/g, ' ');
  if (!target.expected.test(versionText)) {
    console.log(JSON.stringify({ target: target.name, executable: found.executable, version: versionText, status: 'ADAPTER ONLY', evidence: `version did not match ${target.expected}` }));
    continue;
  }
  let passed = 0;
  const failures = [];
  for (const [name, source] of corpus) {
    let artifact;
    try {
      artifact = applyBytecodeVm(source, { target: target.name, profile: 'BALANCED', seedOverride: 123, rethrow: true });
    } catch (error) {
      failures.push({ case: name, native: 'compile failure', generated: String(error) });
      continue;
    }
    const nativeSource = name === 'precheck' ? '_G.LPH_PRECHECK_KEY="target-key"; RESULT="ok"' : source;
    const files = writeCorpusFiles(nativeSource, artifact);
    const native = execute(found.executable, files.nativeFile);
    const generated = execute(found.executable, files.artifactFile);
    if (native.ok && generated.ok && native.output === generated.output) passed++;
    else failures.push({ case: name, native, generated });
  }
  console.log(JSON.stringify({ target: target.name, executable: found.executable, version: versionText, discoveredVia: found.source, status: failures.length ? 'RUNTIME EXECUTION FAILED' : 'RUNTIME EXECUTION VERIFIED', passed, total: corpus.length, failures }));
}

const adapterSmoke = runFengari('RESULT="adapter"');
if (!adapterSmoke.ok) process.exitCode = 1;
