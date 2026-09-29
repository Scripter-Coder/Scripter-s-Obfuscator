// A/B the live artifact against a build made from the current source.
//
// The live artifact builds 8 of 63 objects - the pre-fix signature. That could mean
// either "it predates the fix" or "the fix is in but my harness is wrong about
// something else". Those are very different conclusions, so this settles it by
// difference: generate the same artifact from the current tree and push BOTH through
// the identical harness. If the current one builds 63 and the live one builds 8, the
// live one is simply an old build.
import luaparse from 'luaparse';
import fs from 'node:fs';
import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmSetLuaparse } from '../vm-pass.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
vmSetLuaparse(luaparse);
vmBCSetLuaparse(luaparse);
globalThis.window = globalThis;

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) { console.log('usage: node tools/regen_for_ab.mjs <source.lua> <out.lua>'); process.exit(2); }

const src = fs.readFileSync(SRC, 'utf8');
// The options main.js uses for a ~44KB keyless script at intensity 5.
const dbg = {};
const obf = applyCustomObfuscator(src, {
    intensity: 5,
    ultra: true,
    antiTamper: true,
    antiSkid: false,
    antiLogger: true,
    hwidLock: true,
    keyless: true,
    vmPass: true,
}, dbg);
// The FULL output, not dbg.payload. The payload is the obfuscated body; the canary
// REGISTRATION that satisfies the anti-crack wrapper lives in the wrapper around it.
// Writing the payload alone means the wrapper finds no canary, concludes it was
// tampered with, prints its decoy and returns - so the run builds nothing and the
// comparison is meaningless.
const out = obf;
fs.writeFileSync(OUT, out, 'utf8');
console.log('regenerated from the CURRENT tree: ' + out.length + ' bytes -> ' + OUT);
console.log('canary registration present: ' + /g\._shc[0-9a-f]+\s*=\s*\d+/.test(out));
