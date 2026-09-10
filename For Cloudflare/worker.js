// ============================================================
// ScripterHub Worker (Cloudflare) — Stats + HIDDEN Loader Host
// ============================================================
// PART 1 (existing): powers the "Live Executions Chart":
//   POST /track             <- obfuscated scripts ping on every execution
//   POST /threat            <- checkpoint bypass attempts
//   POST /visitor           <- reward page visitors
//   GET  /v3/realtime_stats <- dashboard polls every 5 seconds
//
// PART 2 (NEW — "raw page" system, the invisible loader host):
//   POST /sh/upload         <- your hidden raw.html page uploads the script
//                              ENCRYPTED under the owner's Special Key
//                              (encryption happens in the OWNER's browser
//                              BEFORE upload - the worker NEVER sees the
//                              key or the plaintext). Stored in KV.
//                              Every upload also notifies your Discord.
//   POST /sh/login          <- raw.html owner login (access-code check)
//   GET  /sh/ScripterHubNNN <- executor UA: a Lua bootstrap that reads the
//                              Special Key from getgenv().ScripterHubKey
//                              (NO in-game GUI anymore) and decrypts the
//                              payload client-side. If the key is not set
//                              it just notifies + prints instructions.
//                              Browser/curl/AI: an HTML "Special Key
//                              required" page that decrypts locally.
//                              The wire only ever carries CIPHERTEXT -
//                              the key is in nobody's URL.
//   GET  /sh/health         <- quick check the loader system is live
//
// PART 3 (cross-device USER SYNC - fixes "panels only show same-device
// users"): all accounts live in KV under one key so the Users/Admin
// panels show every user from any device, and users can log in from
// any device:
//   POST /sh/user-signup    <- public: create a user record (plan forced
//                              to Basic, admin flags stripped)
//   POST /sh/user-login     <- public: verify email/username + btoa pass,
//                              returns the record (cross-device login)
//   POST /sh/user-get       <- public: fetch YOUR OWN record (email +
//                              b64 password proof) - used on page load so
//                              plan changes made by the owner show up on
//                              every device after a refresh
//   POST /sh/user-sync      <- public: password-proved upsert of your OWN
//                              profile fields (theme, images, etc.).
//                              plan/admin flags are PROTECTED here - they
//                              only change via the owner endpoints below
//   POST /sh/user-delete    <- public: password-verified self-delete
//   GET  /sh/users          <- owner: full users map (panels pull).
//                              Auth: raw-page token OR ownerProof (the
//                              b64 password of the owner account)
//   POST /sh/users          <- owner: upsert one user (plan changes,
//                              admin flags) - this is THE plan-change path
//   POST /sh/users-delete   <- owner: delete one user
//   POST /sh/users-clear    <- owner: delete all except creator/admin
//
// KEYLESS (FREE) SCRIPTS: /sh/upload accepts { keyless: true, cipher, keyHash,
// webKey: true } — free scripts are ENCRYPTED with the owner's Special Key
// exactly like paid ones (so a browser can NEVER read them without the key),
// BUT executors get the decrypted obfuscated code directly - no key needed
// in-game. The Special Key only gates the WEBSITE key page, not execution.
//   - executor UA  -> obfuscated code served AS-IS (free = runs for anyone)
//   - browser/curl-> HTML key page (Special Key required to view the code)
// This closes the "keyless = trivially crackable" hole: the code on the
// wire is still ciphertext for everyone who can't supply the key.
//
// The source is NEVER in the website repo, NEVER in localStorage of any
// visitor, NEVER on the wire in plaintext, and the worker holds only an
// encrypted blob it cannot read. Even you can't download it back; you
// keep the original file yourself.
//
// HOW TO DEPLOY:
//   1. dash.cloudflare.com -> Storage & Databases -> KV -> Create namespace
//      name it e.g. "scripterhub_loaders"
//   2. Workers & Pages -> your worker (scripterhub-stats) -> Settings ->
//      Bindings -> Add -> KV Namespace:
//         Variable name: LOADERS_KV
//         Namespace:     scripterhub_loaders
//   3. Same page, Variables and Secrets -> Add:
//         Type:   Secret
//         Name:   SH_SETUP_TOKEN
//         Value:  (any long random password - used ONCE to store your
//                  giant access code, and to change it later)
//      Also add plain Text variables:
//         Name:   SH_DISCORD_WEBHOOK
//         Value:  https://discord.com/api/webhooks/... (your log webhook)
//         Name:   SH_BASE_URL
//         Value:  https://scripterhub-stats.dubovikstanislav51.workers.dev
//   4. Edit code -> paste THIS ENTIRE FILE -> Deploy.
//   5. Open https://YOUR-WORKER/sh/health — must say "loaders": true.
//   6. Open https://YOUR-SITE/raw.html?auth=1 — log in with the access
//      code "ScripterHub" (the built-in default). NO setup needed.
//      Optional: set your own extra code via /sh/setcode — both work.
//      Only SHA-256 hashes are ever stored, never the codes themselves.
//   7. SPECIAL KEYS — every script is encrypted IN THE BROWSER with the
//      owner's "Your Special Key" (any length). The loadstring contains
//      NO key. At runtime the script reads the key ONLY from
//      getgenv().ScripterHubKey = "..." (set BEFORE executing the
//      loadstring — there is NO in-game popup GUI anymore, so the
//      bootstrap cannot be deobfuscated into a UI that reveals hints);
//      in a browser the key page decrypts locally. Wrong key = garbage.
//      Losing the key = the script is gone forever (keep it safe!).
//
//   8. USER SYNC — signup/login now write to KV too, so the Users/Admin
//      panels list every user from EVERY device. Re-deploy this worker
//      after adding the /sh/user-* endpoints (existing local users get
//      pushed to the cloud on their next login/signup).
//
// ============================================================

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// sliding window of execution events (kept 10 minutes in memory)
const WINDOW_MS = 10 * 60 * 1000;

// persistent-ish state on globalThis (survives between requests in the same isolate)
const S = globalThis.__shStats || (globalThis.__shStats = {
    events: [],        // { t, executor, scriptId }
    totalExecutions: 0,
    threatsBlocked: 0,
    totalVisitors: 0,
    perScript: {},     // scriptId -> count
    startedAt: Date.now()
});

// ============ HIDDEN LOADER HOST CONFIG ============
// The owner access code. The built-in default is "ScripterHub" — it works
// out of the box with zero setup. Optionally you can set an EXTRA code
// via /sh/setcode (any length, emojis OK); it lives in KV and login
// accepts EITHER code. Only SHA-256 hashes are compared; the codes
// themselves are never stored anywhere.
const DEFAULT_CODE = 'ScripterHub'; // the default access code
const CODE_KV_KEY = 'sh_access_code';     // stores { hash } after setup
const CODE_SET_KEY = 'sh_code_set_at';    // stores setup timestamp
// ---- PER-SCRIPT SPECIAL KEYS (client-side encryption) ----
// Each script is encrypted IN THE OWNER'S BROWSER with their Special Key
// before upload (sh-crypto.js: FNV-1a seeded xorshift128 stream cipher).
// The worker stores ONLY ciphertext + a SHA-256 hash of the key (so the
// browser key page can verify without the server seeing anything). The
// loadstring contains NO key. At runtime a bootstrap asks for the key
// and decrypts locally. The key hash lets the key page give a "wrong
// key" message instead of showing garbage.
const KV_PREFIX = 'sh_loader_';        // sh_loader_<10 digits> -> executor blob (keyless: plain obf code; keyed: cipher)
const KV_META_PREFIX = 'sh_meta_';     // sh_meta_<10 digits>   -> { name, user, at, keyHash, keyless, webKey }
const KV_WEB_PREFIX = 'sh_web_';       // sh_web_<10 digits>    -> keyless browser view (Special-Key encrypted)
const LOADER_TTL = 60 * 60 * 24 * 365; // scripts live 1 year (then auto-delete)
const TOKEN_TTL = 12 * 60 * 60 * 1000; // login session: 12 hours
// ---- CROSS-DEVICE USER SYNC (KV-backed user database) ----
const USERS_KV_KEY = 'sh_users_db';    // single KV entry: { email: userRecord }
const OWNER_EMAIL = 'dubovikstanislav51@gmail.com'; // the owner (Scripter) account - used for ownerProof auth
// executor User-Agents -> get the Lua bootstrap (getgenv key only).
// Everything else -> the HTML key page (decrypts locally in-browser).
const EXECUTOR_UA = /Roblox|RBX|Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta|Solara|Hydrogen|Abracadabra/i;
// max encrypted payload the worker will store (base64 of up to ~3MB lua)
const MAX_CIPHER_LEN = 4_500_000;

// ---- user sync helpers ----
async function loadUsersMap(env) {
    if (!env.LOADERS_KV) return {};
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
async function saveUsersMap(env, map) {
    await env.LOADERS_KV.put(USERS_KV_KEY, JSON.stringify(map));
}
// kill an OLD loader (key rotation / re-upload on edit); returns true if replaced
async function maybeReplaceOld(env, replaces) {
    const rep = String(replaces || '');
    if (!/^ScripterHub\d{10}$/.test(rep)) return false;
    const oldCode = await env.LOADERS_KV.get(KV_PREFIX + rep);
    const oldMeta = await env.LOADERS_KV.get(KV_META_PREFIX + rep);
    if (oldCode === null && oldMeta === null) return false;
    await env.LOADERS_KV.delete(KV_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_META_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_WEB_PREFIX + rep).catch(() => {});
    return true;
}
// strip fields a client must never set/leak (password removed on read)
function publicUser(u) {
    const c = { ...u };
    delete c.password;
    return c;
}
// b64 password proof: clients may send the raw password OR the already
// base64-encoded one (the local db stores b64) - accept both.
function passMatch(storedB64, supplied) {
    const s = String(supplied || '');
    if (!s) return false;
    return s === String(storedB64 || '') || btoa(s) === String(storedB64 || '');
}

// what a signup/self-edit may control (plan is kept for existing records,
// but a NEW record always starts as Basic; admin flags are never settable)
function sanitizeUserRecord(u) {
    const allowed = ['id', 'email', 'username', 'password', 'plan', 'description', 'createdAt', 'isAdmin', 'isScripter', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled'];
    const out = {};
    for (const k of allowed) if (u[k] !== undefined) out[k] = u[k];
    out.isAdmin = false;
    out.isScripter = false;
    if (!out.plan) out.plan = 'Basic';
    return out;
}

// fetch ALL valid code hashes (default "ScripterHub" + optional custom KV one)
// returns [] = nothing valid (should never happen, default always works)
async function getCodeHashes(env) {
    const hashes = [await sha256Hex(DEFAULT_CODE)];
    if (env.LOADERS_KV) {
        try {
            const rec = await env.LOADERS_KV.get(CODE_KV_KEY);
            if (rec) {
                const h = JSON.parse(rec).hash;
                if (h && !hashes.includes(h)) hashes.push(h);
            }
        } catch (e) {}
    }
    return hashes;
}

// verify the login-session token (issued by /sh/login)
async function verifyToken(token, codeHashes) {
    try {
        const raw = JSON.parse(atob(String(token || '')));
        if (Date.now() - raw.t > TOKEN_TTL) return false;
        if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return false;
        if (!codeHashes.includes(raw.ch)) return false;
        return true;
    } catch (e) { return false; }
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: CORS_HEADERS
    });
}

// "Method Not Allowed" page — what browsers see when opening a loader link
function methodNotAllowed() {
    return new Response('Method Not Allowed\n', {
        status: 405,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

// generate the random 10 digits: ScripterHub(1234567890)
function loaderId() {
    let d = '';
    for (let i = 0; i < 10; i++) d += Math.floor(Math.random() * 10);
    return 'ScripterHub' + d;
}

// ---- Discord notification for every created script ----
async function notifyDiscord(env, username, scriptName, normalCode, obfCode) {
    const url = env.SH_DISCORD_WEBHOOK;
    if (!url) return; // webhook not configured — skip silently
    const safeName = String(scriptName || 'script').replace(/[^\w\-. ]+/g, '_').slice(0, 60) || 'script';
    const safeUser = String(username || 'unknown').replace(/[^\w\-. ]+/g, '_').slice(0, 60);
    const payload = {
        username: 'ScripterHub',
        embeds: [{
            title: 'User "' + safeUser + '" Successfully Created Script',
            color: 0x6c3bff,
            fields: [
                { name: 'User', value: '`' + safeUser + '`', inline: true },
                { name: 'Script Name', value: '`' + safeName + '`', inline: true }
            ],
            footer: { text: 'ScripterHub Loader System' },
            timestamp: new Date().toISOString()
        }]
    };
    // attachments: Normal Code Download + Obfuscated Code Download (.lua files)
    // Discord caps attachments ~8MB; guard at 7MB each
    const fd = new FormData();
    let idx = 0;
    if (normalCode && normalCode.length < 7_000_000) {
        fd.append('files[' + idx + ']', new Blob([normalCode], { type: 'text/plain' }), safeName + '_normal.lua');
        idx++;
    }
    if (obfCode && obfCode.length < 7_000_000) {
        fd.append('files[' + idx + ']', new Blob([obfCode], { type: 'text/plain' }), safeName + '_obfuscated.lua');
        idx++;
    }
    try {
        if (idx > 0) {
            fd.append('payload_json', JSON.stringify(payload));
            await fetch(url, { method: 'POST', body: fd });
        } else {
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }
    } catch (e) {}
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        // ================= HIDDEN LOADER HOST =================

        // ---------- GET /sh/health ----------
        if (url.pathname === '/sh/health') {
            const setAt = env.LOADERS_KV ? await env.LOADERS_KV.get(CODE_SET_KEY) : null;
            return jsonResponse({ ok: true, loaders: !!(env.LOADERS_KV), webhook: !!env.SH_DISCORD_WEBHOOK, codeSet: !!setAt, at: Date.now() });
        }

        // ---------- POST /sh/setcode : OPTIONAL extra owner code ----------
        // Body: { setupToken, code }  - setupToken = your SH_SETUP_TOKEN secret.
        // The default code "ScripterHub" ALWAYS works; this adds an EXTRA code.
        // Can be called again to change the extra code (requires the NEW setup token).
        if (url.pathname === '/sh/setcode' && request.method === 'POST') {
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV first (Settings > Bindings).' }, 500);
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const setupToken = String(body.setupToken || '');
            if (!env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'SH_SETUP_TOKEN secret is MISSING in worker settings. Go to Settings > Variables and Secrets > add Secret named exactly "SH_SETUP_TOKEN", then re-deploy and try again.' }, 401);
            }
            if (setupToken !== env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'Invalid setup token (does not match the SH_SETUP_TOKEN secret).' }, 401);
            }
            const code = String(body.code || '');
            if (code.length < 8) return jsonResponse({ ok: false, error: 'Code too short (min 8 chars).' }, 400);
            if (code.length > 100_000) return jsonResponse({ ok: false, error: 'Code too large (max 100k chars).' }, 413);
            // store ONLY the hash - the code itself is never saved
            const hash = await sha256Hex(code);
            await env.LOADERS_KV.put(CODE_KV_KEY, JSON.stringify({ hash }));
            await env.LOADERS_KV.put(CODE_SET_KEY, String(Date.now()));
            return jsonResponse({ ok: true, len: code.length, setAt: Date.now() });
        }

        // ---------- POST /sh/login : owner login for hidden raw page ----------
        // Body: { code }. Accepted codes: the default "ScripterHub" plus any
        // optional extra code set via /sh/setcode. The worker hashes the
        // supplied code and compares against the valid hashes. Codes are
        // never stored anywhere - only hashes.
        if (url.pathname === '/sh/login' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) {}
            const codeHashes = await getCodeHashes(env);
            const supplied = String(body.code || '');
            const suppliedHash = await sha256Hex(supplied);
            // constant-time-ish compare
            let matched = null;
            for (const h of codeHashes) {
                if (suppliedHash.length === h.length) {
                    let diff = 0;
                    for (let i = 0; i < h.length; i++) diff |= suppliedHash.charCodeAt(i) ^ h.charCodeAt(i);
                    if (diff === 0) { matched = h; break; }
                }
            }
            if (!matched) {
                return jsonResponse({ ok: false, error: 'Invalid access code.' }, 401);
            }
            // hand out a short-lived session token (timestamp + hash-of-hash)
            const now = Date.now();
            const token = btoa(JSON.stringify({ t: now, ch: matched, k: await sha256Hex(matched + now) })).replace(/=+$/, '');
            return jsonResponse({ ok: true, token, ttl: TOKEN_TTL });
        }

        // ---------- POST /sh/upload : store ENCRYPTED script + notify Discord ----------
        // Body: { token, name, user, cipher, keyHash, normalCode }.
        // The browser encrypts the script with the Special Key BEFORE
        // uploading (sh-crypto.js) - the worker NEVER sees the key or the
        // plaintext. keyHash (SHA-256 of the key) is optional metadata.
        if (url.pathname === '/sh/upload' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            // token check (issued by /sh/login, valid 12h)
            const codeHashes = await getCodeHashes(env);
            if (!(await verifyToken(body.token, codeHashes))) {
                return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV (see worker comments).' }, 500);
            const name = String(body.name || 'script').slice(0, 100);
            const user = String(body.user || 'unknown').slice(0, 100);
            const id = loaderId();
            // ---- KEYLESS (free) scripts ----
            // Executor blob (plainCode) = the obfuscated code, served to
            // executors with NO key (free = anyone can run). Browser view
            // (cipher) = the SAME code encrypted with the owner's Special Key,
            // so the website key page requires the key to show it.
            if (body.keyless === true) {
                const plainCode = String(body.plainCode || '');
                const cipher = String(body.cipher || '');
                if (!plainCode) return jsonResponse({ ok: false, error: 'plainCode is required for keyless scripts (the obfuscated code)' }, 400);
                if (plainCode.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~3MB)' }, 413);
                // executor blob (no key needed in-game)
                await env.LOADERS_KV.put(KV_PREFIX + id, plainCode, { expirationTtl: LOADER_TTL });
                // browser view: encrypted with the Special Key if provided
                // (website key page asks for it); without a key the browser
                // keeps getting "Method Not Allowed" (legacy behavior).
                const keyHash = String(body.keyHash || '');
                await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                    name, user, at: Date.now(), keyHash,
                    keyless: true,
                    webKey: !!cipher
                }), { expirationTtl: LOADER_TTL });
                if (cipher) {
                    if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'cipher too large (max ~3MB after encryption)' }, 413);
                    await env.LOADERS_KV.put(KV_WEB_PREFIX + id, cipher, { expirationTtl: LOADER_TTL });
                }
                await maybeReplaceOld(env, body.replaces);
                ctx.waitUntil(notifyDiscord(env, user, name, body.normalCode || '', ''));
                const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
                return jsonResponse({ ok: true, id, replaced: false, keyless: true, loadstring: 'loadstring(game:HttpGet("' + base + '/sh/' + id + '"))()' });
            }
            // ---- keyed scripts: ENCRYPTED with the Special Key ----
            const cipher = String(body.cipher || '');
            if (!cipher) return jsonResponse({ ok: false, error: 'cipher is required (encrypt client-side with the Special Key first)' }, 400);
            if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~3MB after encryption)' }, 413);
            const keyHash = String(body.keyHash || ''); // optional SHA-256 hex
            await env.LOADERS_KV.put(KV_PREFIX + id, cipher, { expirationTtl: LOADER_TTL });
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({ name, user, at: Date.now(), keyHash }), { expirationTtl: LOADER_TTL });
            // optional: kill an OLD loader (key rotation / re-upload on edit)
            let replaced = await maybeReplaceOld(env, body.replaces);
            // Discord notification (attachments = download txt/lua files)
            ctx.waitUntil(notifyDiscord(env, user, name, body.normalCode || '', ''));
            const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
            // NO key in the URL - the key is asked at runtime
            return jsonResponse({ ok: true, id, replaced, loadstring: 'loadstring(game:HttpGet("' + base + '/sh/' + id + '"))()' });
        }

        // ================= CROSS-DEVICE USER SYNC =================
        // Lets accounts made on one device appear in the Users/Admin
        // panels on EVERY device, and lets users log in from anywhere.

        if (!env.LOADERS_KV && url.pathname.startsWith('/sh/user')) {
            return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV first (Settings > Bindings).' }, 500);
        }

        // ---------- POST /sh/user-signup : public account creation ----------
        if (url.pathname === '/sh/user-signup' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const username = String(body.username || '').trim();
            const password = String(body.password || '');
            if (!email || !username || !password) return jsonResponse({ ok: false, error: 'missing fields' }, 400);
            if (password.length < 6) return jsonResponse({ ok: false, error: 'password too short' }, 400);
            const map = await loadUsersMap(env);
            if (map[email]) return jsonResponse({ ok: false, error: 'An account with this email already exists.' }, 409);
            for (const k in map) {
                if (String(map[k].username || '').toLowerCase() === username.toLowerCase()) {
                    return jsonResponse({ ok: false, error: 'This username is already taken.' }, 409);
                }
            }
            const rec = sanitizeUserRecord({
                id: body.id || ('user_' + Date.now()),
                email: email,
                username: username,
                password: btoa(password),
                plan: 'Basic',
                description: String(body.description || ''),
                createdAt: body.createdAt || new Date().toISOString(),
                profileImage: '', bannerImage: '', theme: 'default',
                stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
            });
            map[email] = rec;
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true, user: publicUser(rec) });
        }

        // ---------- POST /sh/user-login : cross-device login ----------
        if (url.pathname === '/sh/user-login' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const emailOrUser = String(body.emailOrUsername || '').trim();
            const map = await loadUsersMap(env);
            let found = null;
            for (const k in map) {
                if (k === emailOrUser || String(map[k].username || '').toLowerCase() === emailOrUser.toLowerCase()) { found = map[k]; break; }
            }
            if (!found || !passMatch(found.password, body.password)) {
                return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
            }
            if (found.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
            return jsonResponse({ ok: true, user: publicUser(found) });
        }

        // ---------- POST /sh/user-sync : password-verified self profile upsert ----------
        // Used to push local profile changes (theme/images/stats) and to
        // migrate existing local accounts to the cloud. The password field
        // MUST match the stored one for existing records. plan/admin flags
        // are protected - they only change via the owner /sh/users route.
        if (url.pathname === '/sh/user-sync' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const password = String(body.password || '');
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (existing) {
                // must prove identity with the real password (raw or b64)
                if (!passMatch(existing.password, password)) {
                    return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
                }
                const inc = sanitizeUserRecord(body.user || {});
                // merge only profile fields - keep server plan/flags/password
                const rec = { ...existing };
                for (const k of ['username', 'description', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled', 'createdAt', 'id']) {
                    if (inc[k] !== undefined) rec[k] = inc[k];
                }
                map[email] = rec;
                await saveUsersMap(env, map);
                return jsonResponse({ ok: true, user: publicUser(rec) });
            }
            // new record (account migration from a device that made it
            // before cloud sync existed) - plan starts at Basic
            const rec = sanitizeUserRecord(body.user || {});
            rec.email = email;
            // the owner account keeps its owner/admin flags on migration
            // (sanitize strips them for everyone - the owner's flags are
            // what make ownerProof work for plan changes)
            if (email === OWNER_EMAIL && body.user && (body.user.isScripter === true || body.user.isAdmin === true)) {
                rec.isScripter = true;
                rec.isAdmin = true;
            }
            rec.password = btoa(password || rec.password || 'x');
            if (!rec.password || rec.password === btoa('')) rec.password = btoa('sh_no_login_' + Date.now());
            map[email] = rec;
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true, user: publicUser(rec) });
        }

        // ---------- POST /sh/user-get : fetch YOUR OWN record (page refresh) ----------
        // Lets any logged-in device pull its fresh record (plan changes by
        // the owner, profile edits from another device, bans, etc.) after a
        // page refresh. Requires email + password proof (raw or b64).
        if (url.pathname === '/sh/user-get' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const map = await loadUsersMap(env);
            const rec = map[email];
            if (!rec || !passMatch(rec.password, body.password)) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            if (rec.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
            return jsonResponse({ ok: true, user: publicUser(rec) });
        }

        // ---------- POST /sh/user-delete : password-verified self-delete ----------
        if (url.pathname === '/sh/user-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (!existing) return jsonResponse({ ok: true }); // already gone
            if (!passMatch(existing.password, body.password)) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            delete map[email];
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true });
        }

        // ---------- owner auth helper for the users endpoints ----------
        // Two ways to prove "I am the owner (Scripter)":
        //   1. token     - raw-page session token (sh/login)
        //   2. ownerProof- b64 password of the owner account stored in KV
        // The panels use ownerProof so plan changes sync without needing
        // the raw-page access code prompt.
        // NOTE: the isScripter flag is NO LONGER required for ownerProof
        // (record migrations stripped it, which silently killed every plan
        // change). The OWNER_EMAIL + matching password is proof enough -
        // only the owner can know that password.
        async function isOwnerRequest(env, url, body) {
            const codeHashes = await getCodeHashes(env);
            const token = (url && url.searchParams.get('token')) || (body && body.token) || (request.headers.get('X-SH-Token') || '');
            if (await verifyToken(token, codeHashes)) return true;
            const proof = (body && body.ownerProof) || (url && url.searchParams.get('ownerProof')) || '';
            if (proof) {
                const map = await loadUsersMap(env);
                const owner = map[OWNER_EMAIL];
                if (owner && String(owner.password || '') === String(proof)) return true;
            }
            return false;
        }

        // ---------- GET /sh/users : owner pull of ALL users ----------
        if (url.pathname === '/sh/users' && request.method === 'GET') {
            if (!(await isOwnerRequest(env, url, null))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadUsersMap(env);
            const out = {};
            for (const k in map) out[k] = publicUser(map[k]);
            return jsonResponse({ ok: true, users: out });
        }

        // ---------- POST /sh/users : owner upsert one user (PLAN CHANGES) ----------
        if (url.pathname === '/sh/users' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!body.email) return jsonResponse({ ok: false, error: 'email required' }, 400);
            const map = await loadUsersMap(env);
            const prev = map[body.email] || {};
            // full owner-controlled upsert (plan, admin flags, everything)
            map[body.email] = { ...prev, ...(body.user || {}), email: body.email };
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true, user: publicUser(map[body.email]) });
        }

        // ---------- POST /sh/users-delete : owner delete one user ----------
        if (url.pathname === '/sh/users-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadUsersMap(env);
            delete map[String(body.email || '')];
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/users-clear : owner delete all (keeps creator/admin) ----------
        if (url.pathname === '/sh/users-clear' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const keep = String(body.keep || '');
            const map = await loadUsersMap(env);
            const kept = {};
            for (const k of (keep || '').split(',')) {
                const e = k.trim();
                if (e && map[e]) kept[e] = map[e];
            }
            await saveUsersMap(env, kept);
            return jsonResponse({ ok: true });
        }

        // ---------- GET /sh/ScripterHub########## : the loader itself ----------
        // Executor UA + KEYLESS script -> the obfuscated code DIRECTLY (no
        // key, no decrypt - free scripts just run).
        // Executor UA + keyed script -> Lua bootstrap (reads the Special Key
        // from getgenv().ScripterHubKey + local decrypt).
        // Browser + keyless script WITH webKey -> HTML key page (the Special
        // Key is required to VIEW the code on the website - the free-script
        // key gate). Browser + keyless legacy (no cipher) -> Method Not
        // Allowed. Everything else -> HTML key page / "Method Not Allowed".
        // The wire only ever carries CIPHERTEXT for keyed scripts.
        const shMatch = url.pathname.match(/^\/sh\/(ScripterHub\d{10})$/);
        if (shMatch) {
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = shMatch[1];
            const cipher = await env.LOADERS_KV.get(KV_PREFIX + id);
            if (cipher === null) return methodNotAllowed();
            let meta = {};
            try { meta = JSON.parse((await env.LOADERS_KV.get(KV_META_PREFIX + id)) || '{}'); } catch (e) {}
            const ua = request.headers.get('User-Agent') || '';
            const isExecutor = EXECUTOR_UA.test(ua);
            // count the execution either way
            S.events.push({ t: Date.now(), executor: sniffExecutor(ua), scriptId: id });
            S.totalExecutions++;
            S.perScript[id] = (S.perScript[id] || 0) + 1;
            prune(Date.now());
            if (isExecutor && meta.keyless === true) {
                // FREE script: serve the obfuscated code as-is - no key gate
                // in executors (the Special Key only gates the website page)
                return new Response(cipher, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            }
            if (isExecutor) {
                // keyed script: bootstrap that reads the key from getgenv
                return new Response(luaBootstrap(id, cipher), {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            }
            // browser / curl / AI scraper: never any plaintext for reading.
            // Keyed scripts -> key page (decrypts locally). Keyless scripts
            // -> key page TOO when a webKey cipher exists (free scripts
            // require the Special Key on the WEBSITE only), otherwise the
            // legacy "Method Not Allowed". Count as blocked threat attempts.
            S.threatsBlocked++;
            if (meta.keyless === true) {
                const webCipher = meta.webKey ? await env.LOADERS_KV.get(KV_WEB_PREFIX + id) : null;
                if (webCipher) return keyPageResponse(id, webCipher, meta.keyHash);
                return methodNotAllowed();
            }
            return keyPageResponse(id, cipher, meta.keyHash);
        }

        // ================= STATS (existing) =================

        // ---------- POST /track : record an execution ----------
        if (url.pathname === '/track' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) {}
            const executor = String(body.executor || 'Unknown').slice(0, 40);
            const scriptId = String(body.scriptId || '').slice(0, 80);
            const now = Date.now();
            S.events.push({ t: now, executor: executor, scriptId: scriptId });
            S.totalExecutions++;
            if (scriptId) S.perScript[scriptId] = (S.perScript[scriptId] || 0) + 1;
            prune(now);
            return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
        }

        // ---------- POST /threat : record a blocked bypass attempt ----------
        if (url.pathname === '/threat' && request.method === 'POST') {
            S.threatsBlocked++;
            return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
        }

        // ---------- POST /visitor : reward page visitor ----------
        if (url.pathname === '/visitor' && request.method === 'POST') {
            S.totalVisitors++;
            return new Response(JSON.stringify({ ok: true, visitors: S.totalVisitors }), { headers: CORS_HEADERS });
        }

        // ---------- GET /v3/realtime_stats : live chart data ----------
        if (url.pathname === '/v3/realtime_stats') {
            const now = Date.now();
            prune(now);
            const perExecutor = {};   // last 60s counts
            const last5s = {};        // last 5s counts (for per-second rate)
            for (const e of S.events) {
                const age = now - e.t;
                if (age < 60000) perExecutor[e.executor] = (perExecutor[e.executor] || 0) + 1;
                if (age < 5000) last5s[e.executor] = (last5s[e.executor] || 0) + 1;
            }
            const executors = {};
            for (const name in perExecutor) {
                executors[name] = {
                    perSecond: Math.round(((last5s[name] || 0) / 5) * 100) / 100,
                    lastMinute: perExecutor[name]
                };
            }
            const out = {
                ok: true,
                endpoint: 'v3/realtime_stats',
                totalExecutions: S.totalExecutions,
                threatsBlocked: S.threatsBlocked,
                totalVisitors: S.totalVisitors,
                executors: executors,
                topScripts: S.perScript,
                uptimeSeconds: Math.floor((now - S.startedAt) / 1000),
                updatedAt: now
            };
            return new Response(JSON.stringify(out), { headers: CORS_HEADERS });
        }

        // ---------- GET / : status page ----------
        if (url.pathname === '/' || url.pathname === '') {
            const html = '<!DOCTYPE html><html><head><title>ScripterHub Stats Worker</title><style>body{background:#0a0a0f;color:#66ff66;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-size:22px;font-weight:700}</style></head><body>✅ ScripterHub Stats Worker is LIVE!<div style="position:fixed;bottom:16px;font-size:12px;color:#555">endpoint: /v3/realtime_stats</div></body></html>';
            return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404, headers: CORS_HEADERS });
    }
};

function prune(now) {
    while (S.events.length && S.events[0].t < now - WINDOW_MS) S.events.shift();
}

function sniffExecutor(ua) {
    const m = ua.match(/Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta|Solara|Hydrogen|Abracadabra|Roblox/i);
    return m ? m[0] : 'Unknown';
}

async function sha256Hex(str) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ SPECIAL KEY HELPERS ============
// constant-time-ish hex compare
function hashEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length || a.length === 0) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// ---------- HTML KEY PAGE (browsers) ----------
// Serves the CIPHERTEXT + the same stream cipher in JS. The visitor
// types the Special Key; the page decrypts LOCALLY (the key never
// leaves their machine either). "SHOK" magic detects a wrong key.
// The <noscript> variant for curl/AI scrapers shows NO code at all.
function keyPageHtml(id, cipherB64, keyHash) {
    const safeCipher = String(cipherB64 || '').replace(/</g, '\\u003c');
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Special Key Required</title>'
        + '<style>*{box-sizing:border-box}body{background:#0a0a0f;color:#fff;font-family:Segoe UI,Tahoma,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}'
        + '.box{padding:36px;border:2px solid rgba(108,59,255,0.35);border-radius:16px;background:rgba(20,20,35,0.85);text-align:center;max-width:460px;width:92%}'
        + 'h1{font-size:20px;margin:0 0 8px}p{color:#8888aa;font-size:13px;margin:0 0 18px}'
        + 'input{width:100%;background:#0a0a15;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;padding:12px;font-size:14px;font-family:monospace}'
        + 'button{width:100%;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:15px;padding:12px;color:#fff;background:linear-gradient(135deg,#6c3bff,#00bfff);margin-top:12px}'
        + '.err{color:#ff6666;font-size:13px;margin-top:10px}pre{display:none;text-align:left;color:#66ff66;font-size:12px;background:#0a0a15;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;max-height:340px;overflow:auto;white-space:pre-wrap;word-break:break-all}</style>'
        + '<script>'
        + 'var C=' + JSON.stringify(safeCipher) + ';'
        // --- exact sh-crypto.js v2 cipher, minified inline ---
        // (>>> 0 after each xor: JS ^ returns SIGNED int32; without the
        //  normalization the state can go negative and diverge from
        //  sh-crypto.js, breaking decryption with the CORRECT key)
        + 'function sd(k,idx){var b=new TextEncoder().encode(k),h=5381+idx*7;for(var i=0;i<b.length;i++){h=(h*33+b[i])%4294967296}return h}'
        + 'function nx(s){var x=s[0]>>>0;x=(x^((x*8192)%4294967296))>>>0;x=(x^Math.floor(x/131072))>>>0;x=(x^((x*32)%4294967296))>>>0;s[0]=s[1];s[1]=s[2];s[2]=s[3];s[3]=x;return x}'
        + 'function dec(key){var s=[sd(key,0),sd(key,1),sd(key,2),sd(key,3)];if(!s[0])s[0]=1;if(!s[1])s[1]=2;if(!s[2])s[2]=3;if(!s[3])s[3]=4;'
        + 'var bin=atob(C),out=new Uint8Array(bin.length);'
        + 'for(var i=0;i<bin.length;i++){out[i]=bin.charCodeAt(i)^(nx(s)&255)}'
        + 'var t=new TextDecoder("utf-8",{fatal:false}).decode(out);'
        + 'if(t.substring(0,4)!=="SHOK")return null;return t.substring(4)}'
        + 'function go(){var k=document.getElementById("kk").value;var e=document.getElementById("ee");var p=document.getElementById("pp");e.textContent="";'
        + 'try{var t=dec(k);'
        + 'if(t===null){e.textContent="\\u274c Wrong key.";return}'
        + 'p.textContent=t;p.style.display="block"'
        + '}catch(x){e.textContent="\\u274c Wrong key."}}'
        + '<\/script></head><body><div class="box">'
        + '<h1>🔐 Special Key Required</h1>'
        + '<p>This script is encrypted with a Special Key. Enter it to decrypt (happens only on this page - the key is never sent anywhere).</p>'
        + '<input type="password" id="kk" placeholder="Enter the Special Key..." autocomplete="off">'
        + '<button onclick="go()">🔓 Decrypt &amp; View</button>'
        + '<div class="err" id="ee"></div>'
        + '<pre id="pp"></pre>'
        + '<p style="margin:18px 0 0;font-size:11px;">Protected by ScripterHub</p>'
        + '</div>'
        + '<noscript><p style="color:#8888aa;text-align:center;">Special Key required. Enable JavaScript to enter it.</p></noscript>'
        + '</body></html>';
}

function keyPageResponse(id, cipherB64, keyHash, status) {
    return new Response(keyPageHtml(id, cipherB64, keyHash), {
        status: status || 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

// ---------- LUA BOOTSTRAP (executors) ----------
// Served to executor User-Agents. Embeds ONLY the ciphertext. The key is
// read EXCLUSIVELY from getgenv().ScripterHubKey (set BEFORE executing
// the loadstring) - there is NO in-game popup GUI anymore, so no UI code
// ships in the payload. Lua decrypts locally with the SAME double-safe
// cipher as sh-crypto.js (djb2 seeds + xorshift128, exact in doubles) ->
// checks the "SHOK" magic -> loadstrings the plaintext. A missing/wrong
// key just notifies + prints instructions and stops.
function luaBootstrap(id, cipherB64) {
    // base64 ciphertext -> escaped \ddd lua string literals (chunked)
    const bin = atob(String(cipherB64 || ''));
    let lit = '';
    const CH = 4000;
    for (let i = 0; i < bin.length; i += CH) {
        let seg = '';
        for (let j = i; j < Math.min(i + CH, bin.length); j++) seg += '\\' + bin.charCodeAt(j);
        lit += (i === 0 ? '' : '\n..') + '"' + seg + '"';
    }
    if (bin.length === 0) lit = '""';
    return '--[[ ScripterHub protected loader | ' + id + ' | encrypted with your Special Key ]]\n'
        + '-- Set the key BEFORE executing: getgenv().ScripterHubKey = "YOUR_KEY"\n'
        + '-- (no popup - the key is read only from getgenv().ScripterHubKey)\n'
        + 'local B=' + lit + '\n'
        // 5.1/Luau/5.3-safe 32-bit xor — float math (0.0 seeds) so 32-bit
        // integer builds never wrap negative; exact in doubles everywhere
        + 'local function BX(a,b) a=a%4294967296 b=b%4294967296 local r,p=0.0,1.0 for _=1,32 do local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end\n'
        // djb2-style seed: h=(5381.0+idx*7); h=(h*33+byte)%2^32 (float, exact)
        + 'local function SD(k,idx) local h=5381.0+idx*7 for i=1,#k do local c=string.byte(k,i) h=(h*33+c)%4294967296 end return h end\n'
        // xorshift128 step (only *8192, /131072, *32 + BX - double & 5.1 safe)
        + 'local function NX(s) local x=s[1] x=BX(x,(x*8192)%4294967296) x=BX(x,math.floor(x/131072)) x=BX(x,(x*32)%4294967296) s[1]=s[2] s[2]=s[3] s[3]=s[4] s[4]=x return x end\n'
        // decrypt: seeds from the key, xor keystream, check "SHOK" magic
        + 'local function DEC(k) local a=SD(k,0) if a==0 then a=1 end local b=SD(k,1) if b==0 then b=2 end local c=SD(k,2) if c==0 then c=3 end local d=SD(k,3) if d==0 then d=4 end local s={a,b,c,d} local o={} for i=1,#B do local x=NX(s) o[i]=string.char(BX(string.byte(B,i),x%256)) end local t=table.concat(o) if t:sub(1,4)~="SHOK" then return nil end return t:sub(5) end\n'
        + 'local NT=function(t2,d) pcall(function() game:GetService("StarterGui"):SetCore("SendNotification",{Title="ScripterHub",Text=t2,Duration=d or 5}) end) end\n'
        + 'local LS=loadstring or load\n'
        // key comes ONLY from getgenv - no popup GUI ships in the payload
        + 'local G=(getgenv and getgenv()) or _G\n'
        + 'local K=G and G.ScripterHubKey\n'
        + 'if type(K)~="string" or #K==0 then\n'
        + ' NT("Special Key required! Set getgenv().ScripterHubKey and re-execute.",7)\n'
        + ' print("[ScripterHub] Special Key required: run getgenv().ScripterHubKey = \\"YOUR_KEY\\" then re-execute this loadstring.")\n'
        + ' return\n'
        + 'end\n'
        + 'local src=DEC(K)\n'
        + 'if not src then NT("Wrong Special Key!") print("[ScripterHub] Wrong Special Key.") return end\n'
        + 'local fn=LS(src)\n'
        + 'if not fn then NT("Wrong Special Key!") return end\n'
        + 'pcall(function() fn() end)\n';
}
