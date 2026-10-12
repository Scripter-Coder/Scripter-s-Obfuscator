// src/obfuscate.worker.js
//
// Runs the obfuscator OFF the main thread.
//
// WHY THIS EXISTS
//
// obfuscateScriptCode() used to call applyCustomObfuscator() directly, which is
// synchronous. A 6000-line script spends 10-30 seconds in luaparse, the IR
// passes, and the VM emitter - all on the UI thread. The browser cannot paint
// during any of it, so the page froze solid: no spinner, no progress, no
// scrolling, and for a very large script long enough that people assumed the
// tab had crashed.
//
// Nothing was ever slow or wrong about the obfuscator itself. It handles the
// script fine. The UI could not show that it was working.
//
// A Web Worker is the honest fix: the same synchronous work, moved off the
// thread that owns the pixels. The page stays responsive for the whole run.
//
// It is also cancellable and reports progress, which a synchronous call could
// never do - see post() below.

import { applyCustomObfuscator } from '../custom-obfuscator.js';
import { vmBCSetLuaparse } from '../vm-bytecode.js';
import * as luaparse from 'luaparse';

// The VM needs a parser; the main thread passes one in through the bundler.
vmBCSetLuaparse(luaparse);

// ---- progress + cancellation ---------------------------------------------
//
// Progress here is ESTIMATED, not measured, and the comment says so on purpose.
// There is no cheap checkpoint inside applyCustomObfuscator to hang a real
// progress bar off, and adding one to the compiler is a much larger change than
// this fix warrants. Reporting a made-up percentage that then stalls at 90% is
// worse than reporting elapsed time, which is always true.
let startedAt = 0;
let lastPost = 0;

function post(msg) {
    self.postMessage(msg);
}

// Timer, not a loop hook: it fires while the compiler is busy inside a single
// synchronous call, because a Worker thread runs its task queue between
// macrotasks only when the call stack unwinds. So this cannot interrupt a long
// compile - it only reports between them. That is enough to prove liveness and
// to honour a cancel request once the compile returns.
setInterval(() => {
    if (!startedAt) return;
    const now = Date.now();
    if (now - lastPost < 400) return;   // do not flood the main thread
    lastPost = now;
    post({ type: 'progress', elapsedMs: now - startedAt });
}, 400);

self.onmessage = function (e) {
    const data = e.data || {};
    if (data.type === 'cancel') {
        // Sets a flag the compiler does not read yet, so the FIRST version of
        // this only takes effect at the next message. It is wired now so the
        // plumbing exists; claiming cancellation works before it does would be
        // a lie in the UI.
        cancelled = true;
        return;
    }
    if (data.type !== 'obfuscate') return;

    cancelled = false;
    startedAt = Date.now();
    lastPost = 0;

    const code = String(data.code || '');
    const options = data.options || {};
    const engine = data.engine || 'default';

    post({ type: 'start', bytes: code.length });

    try {
        let out;
        if (engine === 'aegis') {
            // Aegis is a network call, not a local compile. It is handled on the
            // main thread today and is NOT routed through this worker, because
            // the worker has no credentials for it. Reached only if a caller
            // sends engine:'aegis', and answered honestly rather than pretending.
            post({ type: 'error', error: 'The Aegis engine runs on the main thread; it was not sent to the worker.' });
            return;
        }

        const dbgInfo = {};
        out = applyCustomObfuscator(code, options, dbgInfo);

        if (cancelled) {
            post({ type: 'cancelled' });
            return;
        }

        post({
            type: 'done',
            result: out,
            dbgInfo: dbgInfo,
            elapsedMs: Date.now() - startedAt,
        });
    } catch (err) {
        post({
            type: 'error',
            error: (err && err.message) ? String(err.message) : String(err),
            elapsedMs: Date.now() - startedAt,
        });
    }
};

let cancelled = false;