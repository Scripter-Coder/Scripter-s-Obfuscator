import luaparse from 'luaparse';
import { vmBCSetLuaparse, _vmBcCompile } from '../vm-bytecode.js';
import { instructionFormat, encodeChunkWords, decodeChunkWords } from '../src/vm/instruction-format.js';

vmBCSetLuaparse(luaparse);
const source = 'local function f(x) return x+1 end; RESULT=tostring(f(4))';
const arg = process.argv[2];
const profiles = arg ? [arg.toUpperCase()] : ['OPAL', 'ONYX'];
for (const profile of profiles) {
  const build = _vmBcCompile(source, { profile, seedOverride: 123 });
  const format = instructionFormat(build.architecture, build.seed);
  const output = [];
  let roundTrip = true;
  for (let chunkIndex = 0; chunkIndex < build.chunks.length; chunkIndex++) {
    const logical = build.chunks[chunkIndex].code.slice();
    const encoded = encodeChunkWords(format, logical, chunkIndex);
    const decoded = decodeChunkWords(format, encoded, chunkIndex);
    if (JSON.stringify(logical) !== JSON.stringify(decoded)) roundTrip = false;
    output.push({ chunk: chunkIndex + 1, words: decoded });
  }
  console.log(JSON.stringify({ profile, architecture: build.architecture, format: format.name, roundTrip, chunks: output }, null, 2));
  if (!roundTrip) process.exitCode = 1;
}
