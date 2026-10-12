// Storage Keeper/host_obfuscate.mjs
//
// Compiles Lua on the owner's machine, off the browser.
//
// WHY THIS EXISTS
//
// A 6000-line Lua script expands ~195x through the obfuscator. Measured on
// this machine with the project's own CLI:
//
//    17 KB ->   3.5 MB    0.6s
//   203 KB ->  38.3 MB   12.4s
//   512 KB ->  95.9 MB   53.8s
//  1501 KB -> 220.1 MB  243.4s
//
// The browser tab cannot survive that. It holds the page, the AST, the IR
// blocks, the instruction stream and the emitted source simultaneously, in a
// fraction of the heap Node has, and "Obfuscation Failed" is what the catch
// reports when the tab dies. The compiler was never wrong about large input -
// it was simply being asked to do it in the wrong place.
//
// Node has the whole machine, so the work happens here and the browser only
// ships source and renders the result.
//
// READS STDIN, WRITES ONE JSON LINE TO STDOUT. The result can be tens of
// megabytes, so it is written as a single line with JSON escaping rather than
// streamed: a partial line would be a partial result, and the client must be
// able to trust that a complete line means the compile finished.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function emit(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

async function readStdin() {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks);
}

function replyOnce(obj) {
    // Belt and braces: an unhandled rejection must still produce a line the
    // client can parse, or it waits out the full timeout for nothing.
    if (replyOnce._done) return;
    replyOnce._done = true;
    emit(obj);
}

process.on('uncaughtException', (e) => {
    replyOnce({ ok: false, error: String((e && e.message) || e).slice(0, 400) });
    process.exit(1);
});
process.on('unhandledRejection', (e) => {
    replyOnce({ ok: false, error: String((e && e.message) || e).slice(0, 400) });
    process.exit(1);
});

try {
    const raw = await readStdin();
    const req = JSON.parse(raw.toString('utf8'));
    const code = String(req.code || '');
    const opts = (req.options && typeof req.options === 'object') ? req.options : {};

    if (!code) {
        replyOnce({ ok: false, error: 'no code supplied' });
        process.exit(0);
    }

    // Imported from source, not from dist: this runs on the owner's machine
    // from a checkout, and the browser bundle is not on disk here.
    const [{ applyCustomObfuscator }, { vmBCSetLuaparse }, luaparse] = await Promise.all([
        import(pathToFileURL(path.join(ROOT, 'custom-obfuscator.js')).href),
        import(pathToFileURL(path.join(ROOT, 'vm-bytecode.js')).href),
        import(pathToFileURL(path.join(ROOT, 'node_modules', 'luaparse', 'luaparse.js')).href),
    ]);
    vmBCSetLuaparse(luaparse.default || luaparse);

    const dbgInfo = {};
    const t0 = Date.now();
    const out = applyCustomObfuscator(code, opts, dbgInfo);
    const elapsedMs = Date.now() - t0;

    // splitKey is what the caller must send to the worker on upload; without it
    // the published script cannot be unlocked at runtime.
    const payload = {
        ok: true,
        code: out,
        elapsedMs: elapsedMs,
        dbgInfo: {
            vmApplied: dbgInfo.vmApplied || null,
            vmFallback: dbgInfo.vmFallback || null,
            estimatedOutputKB: dbgInfo.estimatedOutputKB || null,
            intensityClampedBySize: !!dbgInfo.intensityClampedBySize,
            budgetUnreachable: !!dbgInfo.budgetUnreachable,
        },
        splitKey: dbgInfo.splitKey || null,
    };
    // wantId travels inside dbgInfo on the browser path; mirror it so the
    // client can use the same id the artifact was built against.
    if (dbgInfo.wantId) payload.wantId = dbgInfo.wantId;
    if (dbgInfo.splitKey && dbgInfo.splitKey.wantId) payload.wantId = dbgInfo.splitKey.wantId;

    replyOnce(payload);
    process.exit(0);
} catch (e) {
    replyOnce({ ok: false, error: String((e && e.message) || e).slice(0, 400) });
    process.exit(1);
}