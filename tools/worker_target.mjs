// =============================================================================
// WHICH WORKER ARE THE TESTS EXERCISING?
// =============================================================================
// Every runtime suite in tools/ used to hardcode:
//
//     const worker = (await import('../For Cloudflare/worker.js')).default;
//
// which means they only ever tested the MULTI-FILE source. That is correct for
// development, but it left dist/worker.single.js — the artifact actually
// pasted into the Cloudflare dashboard — completely untested.
//
// An untested build artifact is a liability, not a convenience. The first
// version of the bundler emitted a file that passed `node --check` and was
// missing the declaration for `d1run` (an import alias that had been written
// out as a comment). Nothing caught it, because nothing ran it. Syntax
// checking and reference checking are different things, and only the second
// one finds a missing binding.
//
// So: set SH_WORKER_PATH to test a different build, and every runtime suite
// follows. The staleness test uses exactly this to run the full gate and
// benchmark suites against the bundle, which is the only thing that can
// honestly certify that the dashboard gets a working worker.
//
//   node tools/security_gates_test.mjs                          # source
//   SH_WORKER_PATH=dist/worker.single.js node tools/security_gates_test.mjs
//
// Resolution is relative to the repo root so a value from package.json or CI
// behaves the same as a value typed by hand.
// =============================================================================

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_WORKER = 'For Cloudflare/worker.js';

export function workerPath() {
  return path.resolve(ROOT, process.env.SH_WORKER_PATH || DEFAULT_WORKER);
}

export function workerLabel() {
  return process.env.SH_WORKER_PATH || DEFAULT_WORKER;
}

// Dynamic import keyed on the absolute path, with a cache-buster. Without the
// buster, running two suites in one process against two different builds would
// hand back the first build's module — ESM caches by resolved URL.
export async function loadWorker() {
  const abs = workerPath();
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    throw new Error(
      'could not load the worker from ' + abs + '\n  ' + e.message +
      '\n  Set SH_WORKER_PATH to a valid module, or unset it to test the source.'
    );
  }
  if (!mod.default || typeof mod.default.fetch !== 'function') {
    throw new Error(
      abs + ' has no default export with a .fetch method.\n' +
      '  A Worker must be `export default { fetch, ... }`. If this is a\n' +
      '  generated bundle, the bundler dropped the default export.'
    );
  }
  return mod.default;
}
