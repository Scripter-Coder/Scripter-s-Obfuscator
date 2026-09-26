// Deep Luau identity evidence scan across ALL FOUR supplied executables.
// Only luau.exe is the runtime; luau-analyze/luau-ast/luau-compile are
// developer tools whose build metadata can still help identify the release.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows';
const EXES = ['luau.exe', 'luau-analyze.exe', 'luau-ast.exe', 'luau-compile.exe'];

function ascii(buf) {
  return buf.toString('latin1');
}
function strings(buf, min = 4) {
  return (ascii(buf).match(new RegExp(`[\\x20-\\x7e]{${min},}`, 'g')) || []);
}

const report = {};
for (const name of EXES) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) { report[name] = { error: 'missing' }; continue; }
  const buf = fs.readFileSync(p);
  const s = strings(buf);
  const text = ascii(buf);

  const versionLike = [...new Set(text.match(/\b0\.\d{2,4}\b/g) || [])].sort();
  const copyright = [...new Set(s.filter((x) => /Copyright \(C\)/.test(x)))];
  const urls = [...new Set(s.filter((x) => /https?:\/\/|luau\.org|github\.com\/luau/i.test(x)))].slice(0, 12);
  // Luau feature flags are highly release-specific; a distinctive modern flag
  // is much stronger evidence than a date.
  const flags = [...new Set(s.filter((x) => /^(Luau|FFlag|FScalar|DebugLuau|FFlagLuau)[A-Za-z0-9_]{3,}$/.test(x)))];
  const versionTokens = versionLike.filter((v) => /0\.7[0-9]{2}|0\.6[0-9]{2}/.test(v));
  const hasVersionSymbol = /LUAU_VERSION|LuauVersion|VERSION_STRING|LUAU_BUILD/.test(text);
  const pdbPaths = [...new Set(s.filter((x) => /\.pdb$/i.test(x)))];

  report[name] = {
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    peTimestamp: readPetime(buf),
    versionLikeTokens: versionTokens,
    allDecimalTokens: versionLike.slice(0, 20),
    copyright,
    urls,
    pdbPaths,
    hasVersionSymbol,
    distinctLuauFlags: flags.length,
    sampleFlags: flags.filter((f) => /Luau[A-Z]/.test(f)).slice(0, 40),
  };
}

// PE TimeDateStamp
function readPetime(buf) {
  if (buf.length < 0x40) return null;
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) return null;
  const ts = buf.readUInt32LE(peOff + 8);
  return { raw: ts, iso: new Date(ts * 1000).toISOString() };
}

console.log(JSON.stringify(report, null, 2));
