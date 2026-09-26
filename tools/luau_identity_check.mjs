import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const roots = [
  'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\native-build\\luau-windows',
  'C:\\Users\\Ryzen 9 5900x\\Downloads\\Lua Files\\luau-windows',
];
const evidence = { roots: [], versionTokens: [], sourceMetadata: [], runtimeOutput: [], identicalExecutables: null, status: 'LUAU 0.709 IDENTITY UNVERIFIED' };
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const files = fs.readdirSync(root).map((name) => ({ name, path: path.join(root, name) }));
  evidence.roots.push({ root, files: files.map((f) => ({ name: f.name, size: fs.statSync(f.path).size })) });
  for (const file of files) {
    if (/\.(exe|dll)$/i.test(file.name)) {
      const data = fs.readFileSync(file.path);
      const strings = data.toString('latin1');
      const tokens = [...new Set(strings.match(/0\.\d{3}/g) || [])];
      if (tokens.length) evidence.versionTokens.push({ file: file.path, tokens });
    }
    if (/^(?:_ver|VERSION|version|COMMIT|RELEASE|BUILD|PACKAGE)/i.test(file.name) || /\.(?:json|manifest|lock)$/i.test(file.name)) {
      evidence.sourceMetadata.push({ file: file.path, content: fs.readFileSync(file.path, 'utf8').slice(0, 500) });
    }
  }
  const exe = path.join(root, 'luau.exe');
  if (fs.existsSync(exe)) {
    try { evidence.runtimeOutput.push({ root, output: execFileSync(exe, [path.join(root, '_ver.luau')], { encoding: 'utf8' }).trim() }); } catch (error) { evidence.runtimeOutput.push({ root, error: String(error.stderr || error.message || error) }); }
  }
}
const exePaths = roots.map((root) => path.join(root, 'luau.exe')).filter((p) => fs.existsSync(p));
if (exePaths.length === 2) {
  const hashes = exePaths.map((p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  evidence.identicalExecutables = hashes[0] === hashes[1];
  evidence.sha256 = hashes;
}
const authoritative = evidence.sourceMetadata.some((item) => /(?:^|\n)\s*(?:version|commit|release|tag)\s*[:=]/i.test(item.content)) || evidence.versionTokens.some((item) => item.tokens.includes('0.709'));
if (authoritative) evidence.status = 'EXACT LUAU 0.709 VERIFIED';
console.log(JSON.stringify(evidence, null, 2));
