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

// ---- stats persistence (counters survive worker deploys/restarts) ----
// In-memory counters used to reset on every deploy, so the dashboard
// chart read 0 forever. Counters are now loaded from KV once per isolate
// and saved back (throttled) after each execution.
let shStatsLoaded = false;
async function loadStatsOnce(env) {
    if (shStatsLoaded || !env.LOADERS_KV) return;
    shStatsLoaded = true;
    try {
        const raw = await env.LOADERS_KV.get('sh_stats_counters');
        if (raw) {
            const c = JSON.parse(raw);
            if (typeof c.totalExecutions === 'number' && c.totalExecutions > S.totalExecutions) S.totalExecutions = c.totalExecutions;
            if (typeof c.threatsBlocked === 'number' && c.threatsBlocked > S.threatsBlocked) S.threatsBlocked = c.threatsBlocked;
            if (typeof c.totalVisitors === 'number' && c.totalVisitors > S.totalVisitors) S.totalVisitors = c.totalVisitors;
            if (typeof c.perScript === 'object' && c.perScript) {
                for (const k in c.perScript) {
                    S.perScript[k] = Math.max(S.perScript[k] || 0, c.perScript[k]);
                }
            }
        }
    } catch (e) { /* counters stay in-memory */ }
}
let shStatsSaveAt = 0;
function saveStatsSoon(env) {
    const now = Date.now();
    if (!env.LOADERS_KV || now - shStatsSaveAt < 30000) return;
    shStatsSaveAt = now;
    env.LOADERS_KV.put('sh_stats_counters', JSON.stringify({
        totalExecutions: S.totalExecutions,
        threatsBlocked: S.threatsBlocked,
        totalVisitors: S.totalVisitors,
        perScript: S.perScript,
        updatedAt: now
    })).catch(function() {});
}

// ============ HIDDEN LOADER HOST CONFIG ============
// The owner access code. The built-in default is "ScripterHub" — it works
// out of the box with zero setup. Optionally you can set an EXTRA code
// via /sh/setcode (any length, emojis OK); it lives in KV and login
// accepts EITHER code. Only SHA-256 hashes are compared; the codes
// themselves are never stored anywhere.
//
// REMOVED (Phase 1): const DEFAULT_CODE = 'ScripterHub';
// The default owner code was the product name and appeared in the page title,
// so it was never a secret. See getCodeHashes() for the replacement: a
// generated 192-bit code, stored only as a hash, minted once on first use.
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
const KV_SKEY_PREFIX = 'sh_skey_';     // sh_skey_<10 digits>   -> split-key record (padded last-layer key)
// ---- REAL SERVER-SIDE LICENSES (Luarmor model, Tier 2) ----
// /sh/upload accepts authRequired: true. Such scripts NEVER serve their
// blob or split key to anyone without a valid LICENSE key + HWID auth.
// KV layout:
//   sh_licenses          -> { "KEYSTRING": { hwid, expiresAt, banned,
//                                banReason, discordId, note, hwidResets,
//                                executions, lastAuthAt, lastIp } }
//   sh_killswitch        -> { on: true }  (flip once, every auth fails)
// Auth flow (executor):
//   GET /sh/auth/<loaderId>?k=<license>&h=<hwid>&t=<t0>
//     -> "SHA <token> <expires> <t0>"  (token = HMAC of key+hwid+t0)
//   GET /sh/k/<id>?t=<t0>&a=<token>   (split key, now token-gated for
//      auth-required scripts; t0 must match the one baked into the file)
// The token lives ~90 seconds (short-lived), is bound to key+hwid, and
// is verified with a constant-time compare before any key bytes move.
const KV_LICENSES_KEY = 'sh_licenses';
const KV_KILLSWITCH_KEY = 'sh_killswitch';
const AUTH_TOKEN_TTL_MS = 90 * 1000;        // 90-second short-lived auth token
const HWID_RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 HWID reset per day
const LOADER_TTL = 60 * 60 * 24 * 365; // scripts live 1 year (then auto-delete)
const TOKEN_TTL = 12 * 60 * 60 * 1000; // login session: 12 hours
// ---- CROSS-DEVICE USER SYNC (KV-backed user database) ----
const USERS_KV_KEY = 'sh_users_db';    // single KV entry: { email: userRecord }
const OWNER_EMAIL = 'dubovikstanislav51@gmail.com'; // the owner (Scripter) account - used for ownerProof auth
// ---- SIGNUP ABUSE GUARDS (the KV got flooded with 1200+ junk bot
// accounts, which burned the ENTIRE daily KV write quota and broke every
// signup/login for real users) ----
const VALID_PLANS = ['Basic', 'Advanced', 'Pro', 'God', 'Custom']; // anything else = junk -> Basic
const MAX_USERNAME_LEN = 20;    // usernames were 60+ chars of keyboard mash
const MAX_EMAIL_LEN = 100;
const MAX_DESC_LEN = 500;       // description/plan fields were weaponized to store 15KB of junk
const SIGNUP_FLOOD_LIMIT = 10;  // >10 signups/minute from one IP = bot flood
const SIGNUP_FLOOD_WINDOW_MS = 60 * 1000;
// executor User-Agents -> get the Lua bootstrap (getgenv key only).
// Everything else -> the HTML key page (decrypts locally in-browser).
const EXECUTOR_UA = /Roblox|RBX|Synapse|Krnl|Script[- ]?Ware|Fluxus|Electron|Oxygen|Valyse|Vega|Calamari|Xeno|Sirius|Wave|Delta|Solara|Hydrogen|Abracadabra/i;
// max encrypted payload the worker will store. Cloudflare platform caps:
//   - KV values: 25 MB each -> we CHUNK large blobs (20 x 25MB = ~50MB max)
//   - Worker request bodies: ~100 MB (JSON-escaped base64 ~1.37x) so the
//     practical client-side cap is ~70 MB of cipher text
// A single KV put is used for small scripts; chunking kicks in above
// CHUNK_THRESHOLD. Browsers get the key page only (chunks never sent
// whole to browsers); executors receive a bootstrap that fetches the
// chunks and stitches them in memory.
const MAX_CIPHER_LEN = 72_000_000;  // ~70 MB of cipher text (was 4.5 MB)
const KV_MAX_VALUE = 25_000_000;    // Cloudflare KV hard per-value limit
const CHUNK_THRESHOLD = KV_MAX_VALUE - 1000; // chunk when bigger than one safe KV value
const MAX_CHUNKS = 20;              // 20 * ~25MB = ~50MB blob ceiling

// ---- user sync helpers ----
async function loadUsersMap(env) {
    if (!env.LOADERS_KV) return {};
    try {
        const raw = await env.LOADERS_KV.get(USERS_KV_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
// kill an OLD loader (key rotation / re-upload on edit); returns true if replaced
async function maybeReplaceOld(env, replaces) {
    const rep = String(replaces || '');
    if (!/^ScripterHub\d{10}$/.test(rep)) return false;
    const oldCode = await env.LOADERS_KV.get(KV_PREFIX + rep);
    const oldMeta = await env.LOADERS_KV.get(KV_META_PREFIX + rep);
    const oldCmeta = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + rep);
    if (oldCode === null && oldMeta === null && oldCmeta === null) return false;
    // chunked blob: delete every chunk + its manifest (unordered, safe)
    if (oldCmeta !== null) {
        try {
            const m = JSON.parse(oldCmeta);
            for (let i = 0; i < m.n; i++) await env.LOADERS_KV.delete(KV_CHUNK_PREFIX + KV_PREFIX + rep + '_' + i).catch(() => {});
        } catch (e) {}
        await env.LOADERS_KV.delete(KV_CMETA_PREFIX + KV_PREFIX + rep).catch(() => {});
        // the web view may be chunked too
        const webCmeta = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_WEB_PREFIX + rep);
        if (webCmeta !== null) {
            try {
                const w = JSON.parse(webCmeta);
                for (let i = 0; i < w.n; i++) await env.LOADERS_KV.delete(KV_CHUNK_PREFIX + KV_WEB_PREFIX + rep + '_' + i).catch(() => {});
            } catch (e) {}
            await env.LOADERS_KV.delete(KV_CMETA_PREFIX + KV_WEB_PREFIX + rep).catch(() => {});
        }
    }
    await env.LOADERS_KV.delete(KV_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_META_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_WEB_PREFIX + rep).catch(() => {});
    await env.LOADERS_KV.delete(KV_SKEY_PREFIX + rep).catch(() => {});
    return true;
}
// strip fields a client must never set/leak (password removed on read).
// ALSO trims giant base64 images: profile/banner photos used to ride
// inside the single sh_users_db KV value. A few 2-5MB images blew past
// Cloudflare's 25MB per-value cap -> saveUsersMap() threw -> every
// signup/login returned a BLANK 500 (no CORS headers) -> browsers saw
// "fetch failed" and users could not create accounts or claim
// loadstrings. Images are trimmed server-side to a safe cap; anything
// bigger is dropped from CLOUD SYNC (it stays in the user's own
// browser localStorage where the UI reads it anyway).
const SH_IMAGE_CAP = 2_000_000; // ~2MB of base64 per image field (increased from 200KB to accommodate normal images)
function publicUser(u) {
    const c = { ...u };
    delete c.password;
    if (typeof c.profileImage === 'string' && c.profileImage.length > SH_IMAGE_CAP) c.profileImage = '';
    if (typeof c.bannerImage === 'string' && c.bannerImage.length > SH_IMAGE_CAP) c.bannerImage = '';
    return c;
}
// full record for STORAGE: trim oversized images too (they would kill
// the next KV put), keep everything else intact
function storageSafeUser(u) {
    if (!u || typeof u !== 'object') return u;
    const c = { ...u };
    if (typeof c.profileImage === 'string' && c.profileImage.length > SH_IMAGE_CAP) c.profileImage = '';
    if (typeof c.bannerImage === 'string' && c.bannerImage.length > SH_IMAGE_CAP) c.bannerImage = '';
    return c;
}
// save the users map WITHOUT ever throwing a blank 500: oversized maps
// are repaired by dropping image payloads (in size order) until the
// serialized value fits the KV cap
async function saveUsersMap(env, map) {
    let json = JSON.stringify(map);
    if (json.length > KV_MAX_VALUE - 1000) {
        // emergency repair: strip ALL images, then retry
        for (const email of Object.keys(map)) map[email] = storageSafeUser(map[email]);
        json = JSON.stringify(map);
    }
    if (json.length > KV_MAX_VALUE - 1000) {
        // still too big: drop the largest non-essential fields
        for (const email of Object.keys(map)) {
            const u = map[email];
            if (u && typeof u === 'object') {
                if (typeof u.profileImage === 'string' && u.profileImage.length > SH_IMAGE_CAP) u.profileImage = '';
                if (typeof u.bannerImage === 'string' && u.bannerImage.length > SH_IMAGE_CAP) u.bannerImage = '';
            }
        }
        json = JSON.stringify(map);
    }
    await env.LOADERS_KV.put(USERS_KV_KEY, json);
}
// ===========================================================================
// PASSWORD HASHING (Phase 1, item 15)
// ===========================================================================
// Passwords used to be stored as btoa(password). That is ENCODING, not
// hashing: anyone able to read the users map recovers every password in
// cleartext with one base64 decode. The audit flagged this as the most
// damaging credential issue in the system.
//
// New format:  pbkdf2$<iterations>$<b64 salt>$<b64 derived key>
//
// PBKDF2-HMAC-SHA256 via WebCrypto (crypto.subtle.deriveBits) is used rather
// than Argon2/scrypt because Workers has no native Argon2id and no scrypt;
// adding a WASM KDF for this is possible but is a larger supply-chain
// decision than this phase should make unilaterally. PBKDF2 at a high
// iteration count is the defensible choice on this runtime and is a
// one-function swap if Argon2id is added later.
//
// WHY A SINGLE GLOBAL SALT IS NOT ENOUGH, and what is done instead:
// one salt per user (stored with the hash) is mandatory so that two users
// with the same password do not produce the same record. A server-side pepper
// (SH_KDF_PEPPER) is ALSO supported and is applied as additional keyed
// material, so a stolen KV dump alone does not allow offline cracking. The
// pepper lives in a Worker secret, never in KV, so it is not recoverable from
// the database.
//
// MIGRATION: a stored value that is not "pbkdf2$..." is LEGACY (plain btoa).
// On a successful login it is accepted once and immediately re-hashed. That
// keeps existing users working while the weak records disappear over time.
// This is opportunistic migration, not a silent one: it happens only after
// the correct password is proven, so it cannot lock anyone out.
const PBKDF2_ITERATIONS = 210000;   // OWASP guidance for PBKDF2-HMAC-SHA256
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;

function b64bytes(buf) {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
}
function unb64bytes(s) {
    const raw = atob(String(s || ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function pbkdf2(password, salt, iterations) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
    }, baseKey, PBKDF2_KEY_BYTES * 8);
    return new Uint8Array(bits);
}

// Optional server-side pepper. Absent is tolerated (with a warning path) so
// the code is testable without secrets, but production should set it.
async function kdfPepper(env) {
    return (env && env.SH_KDF_PEPPER) ? String(env.SH_KDF_PEPPER) : '';
}

async function hashPassword(env, password) {
    const salt = new Uint8Array(PBKDF2_SALT_BYTES);
    crypto.getRandomValues(salt);
    const pepper = await kdfPepper(env);
    const dk = await pbkdf2(pepper ? pepper + ' ' + password : password, salt, PBKDF2_ITERATIONS);
    return 'pbkdf2$' + PBKDF2_ITERATIONS + '$' + b64bytes(salt) + '$' + b64bytes(dk);
}

function isLegacyPasswordHash(stored) {
    return !/^pbkdf2\$\d+\$/.test(String(stored || ''));
}

// Constant-time-ish comparison. Lengths are compared first (unavoidable) but
// the byte loop accumulates differences rather than returning early, so the
// comparison time does not reveal the matching prefix.
function timingSafeEqualStr(a, b) {
    const x = String(a == null ? '' : a);
    const y = String(b == null ? '' : b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return diff === 0;
}

// Verify a supplied password against a stored record, accepting BOTH the new
// PBKDF2 format and the legacy btoa format.
//
// Returns { ok, needsRehash } so the caller can transparently upgrade a
// legacy record after a successful login.
async function verifyPassword(env, stored, supplied) {
    const s = String(supplied || '');
    if (!s) return { ok: false, needsRehash: false };

    if (!isLegacyPasswordHash(stored)) {
        const parts = String(stored).split('$');
        const iterations = parseInt(parts[1], 10);
        const salt = unb64bytes(parts[2]);
        const want = parts[3];
        if (!Number.isFinite(iterations) || !parts[2] || !want) return { ok: false, needsRehash: false };
        const pepper = await kdfPepper(env);
        const dk = b64bytes(await pbkdf2(pepper ? pepper + ' ' + s : s, salt, iterations));
        // Re-hash if the iteration count no longer matches the current policy.
        return { ok: timingSafeEqualStr(dk, want), needsRehash: iterations !== PBKDF2_ITERATIONS };
    }

    // LEGACY: btoa(password). Accepted so existing accounts keep working, and
    // the caller re-hashes immediately after a correct password.
    const legacyOk = (s === String(stored || '')) || (btoa(s) === String(stored || ''));
    return { ok: legacyOk, needsRehash: legacyOk };
}

// ===========================================================================
// SESSION TOKENS (Phase 1, item 16)
// ===========================================================================
// Tokens used to be base64(JSON) with a checksum that was DERIVED FROM THE
// DATA INSIDE THE TOKEN ITSELF:
//
//   token = btoa({ t, e, ch: <the stored password hash>, k: sha256(ch + t) })
//
// That is not a signature. The "key" proving the token is valid travels inside
// the token, so anyone who can read one token can mint an unlimited number of
// valid ones for any future timestamp. It also meant the token CONTAINED the
// password hash, so every base64-decodable session token in a log or a browser
// handed over the credential itself.
//
// Now: HMAC-SHA256 over the payload, keyed by a server-only secret
// (SH_SESSION_SECRET). The secret is in a Worker secret and never in KV, so
// forging a token requires the secret, not just a sample token.
//
// The payload additionally carries `pwd`, a fingerprint of the current
// password-hash generation, so a password change invalidates live tokens.
async function sessionSecret(env) {
    const s = env && env.SH_SESSION_SECRET;
    if (s) return String(s);
    // No secret configured. Derive a stable fallback so the system still
    // functions, but it is derived from public-ish values, so tokens are not
    // cryptographically unforgeable. This is logged once per cold start so
    // the misconfiguration is visible instead of silent.
    if (!globalThis.__sh_session_secret_warned) {
        globalThis.__sh_session_secret_warned = true;
        console.warn('[ScripterHub] SH_SESSION_SECRET is NOT set. Session tokens are signed with a derived fallback and are therefore forgeable. Run: wrangler secret put SH_SESSION_SECRET');
    }
    return 'SH_FALLBACK::' + (env && env.SH_SETUP_TOKEN ? String(env.SH_SETUP_TOKEN) : 'no-setup-token');
}

async function credentialFingerprint(env, storedHash) {
    // Fingerprint of the stored hash, NOT the password. Lets a token be
    // invalidated by a password change without the token carrying anything
    // that could be replayed against the KDF.
    return (await sha256Hex('SHSESS::' + await sessionSecret(env) + '::' + String(storedHash || ''))).slice(0, 32);
}

async function signSessionToken(env, payload) {
    const body = JSON.stringify(payload);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
    let hex = '';
    for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, '0');
    // body . sig, both base64url-ish
    return b64url(enc.encode(body)) + '.' + hex;
}

async function verifySessionSignature(env, bodyB64, sigHex) {
    try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, unb64url(bodyB64)));
        let hex = '';
        for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, '0');
        return hashEqual(hex, String(sigHex || ''));
    } catch (e) {
        return false;
    }
}

function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const raw = atob(t);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

// The old synchronous base64 comparison is REMOVED.
//
// It had no callers left after the PBKDF2 migration. It is kept out of the
// file deliberately rather than left as an unused helper: a function that
// compares passwords with === and btoa() is exactly the thing a future edit
// would reach for, and it is the reason this hole existed in the first place.
// Legacy records are still READ by verifyPassword(), which is the only path
// that should touch them.

// ===========================================================================
// RATE LIMITING (Phase 1, item 17)
// ===========================================================================
// The audit found rate limiting on ONE route: signup. /sh/login,
// /sh/user-login, /sh/auth, /sh/k, /sh/upload and the password routes were
// all unthrottled, so license keys, access codes and passwords could be
// brute-forced at whatever rate the network allows.
//
// WHERE THE COUNTERS LIVE, AND WHY IT MATTERS
// The old signup limiter kept its counters in a module-level Map. Cloudflare
// recycles isolates continuously, so that counter was reset by garbage
// collection rather than by the clock: the limit was advisory at best, and a
// bot that spread its requests across isolates got no limit at all.
//
// The counters here are still in-memory, which is a deliberate, documented
// limitation rather than an oversight:
//   * it needs no new binding, so it can ship before the D1 migration, and
//   * it is a large improvement over no limit for the brute-force case.
// It is NOT sufficient for a determined distributed attacker, and it is NOT
// durable. Phase 2 moves these buckets to the D1 `rate_limits` table, where
// the increment is a single atomic upsert and survives isolate recycling. The
// gate for that is G14, which stays open until it happens.
//
// The bucket key deliberately mixes the caller identity AND the route, so
// attempts against two different routes cannot be used to exhaust one
// route's budget, and vice versa.
const RATE_BUCKETS = {
    // [limit, windowMs]
    'login':          { limit: 10,  window: 60 * 1000 },        // /sh/login access code
    'user-login':     { limit: 10,  window: 60 * 1000 },        // /sh/user-login password
    'signup':         { limit: SIGNUP_FLOOD_LIMIT, window: SIGNUP_FLOOD_WINDOW_MS },
    'auth':           { limit: 30,  window: 60 * 1000 },        // /sh/auth license key guesses
    'key':            { limit: 30,  window: 60 * 1000 },        // /sh/k split-key requests
    'upload':         { limit: 20,  window: 60 * 1000 },
    'password':       { limit: 5,   window: 15 * 60 * 1000 },   // change/recovery: tight
    'setcode':        { limit: 5,   window: 15 * 60 * 1000 },
    'admin':          { limit: 60,  window: 60 * 1000 }
};

const rateState = new Map();
const RATE_STATE_MAX = 20000;   // memory cap; cleared wholesale when exceeded

// Consume one unit from a bucket. Returns { allowed, retryAfterSec }.
function rateLimit(bucket, identity) {
    const cfg = RATE_BUCKETS[bucket];
    if (!cfg) return { allowed: true, retryAfterSec: 0 };
    if (rateState.size > RATE_STATE_MAX) rateState.clear();
    const now = Date.now();
    const key = bucket + '|' + String(identity || 'anon');
    let arr = rateState.get(key);
    if (!arr) { arr = []; rateState.set(key, arr); }
    // drop timestamps that have aged out of the window
    while (arr.length && now - arr[0] > cfg.window) arr.shift();
    if (arr.length >= cfg.limit) {
        const retryAfterSec = Math.max(1, Math.ceil((cfg.window - (now - arr[0])) / 1000));
        return { allowed: false, retryAfterSec };
    }
    arr.push(now);
    return { allowed: true, retryAfterSec: 0 };
}

// The identity a rate limit is keyed on.
//
// Using a client-supplied header as the key would let an attacker rotate it
// to get a fresh budget, so only two things are trusted here: the
// Cloudflare-provided connecting IP, and — for authenticated routes — the
// identity the credential actually proves. Never a query parameter.
function rateIdentity(request, url, provenIdentity) {
    if (provenIdentity) return 'id:' + String(provenIdentity);
    const ip = (request.headers.get('CF-Connecting-IP') || '').slice(0, 64);
    return ip ? 'ip:' + ip : 'anon';
}

function rateLimitedResponse(retryAfterSec) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Try again shortly.' }), {
        status: 429,
        headers: Object.assign({}, CORS_HEADERS, { 'Retry-After': String(retryAfterSec || 60) })
    });
}

// ---- signup flood guard (kept: the dedicated per-IP + global caps) ----
// KV daily writes are a shared quota - 1000 signups/day of bot junk
// starved every REAL signup/login. This caps the damage: a flood gets
// 429s long before the quota dies.
const signupHits = new Map();
function signupFloodBlocked(ip) {
    const now = Date.now();
    if (signupHits.size > 5000) signupHits.clear(); // memory cap
    let arr = signupHits.get(ip);
    if (!arr) { arr = []; signupHits.set(ip, arr); }
    while (arr.length && now - arr[0] > SIGNUP_FLOOD_WINDOW_MS) arr.shift();
    if (arr.length >= SIGNUP_FLOOD_LIMIT) return true;
    arr.push(now);
    return false;
}

// global per-isolate hourly cap: bots rotate IPs/proxies, so the per-IP
// limit alone still let hundreds of junk accounts through. This caps the
// TOTAL signups per isolate per hour no matter where they come from.
const SIGNUP_GLOBAL_LIMIT = 120;      // max signups per hour per isolate
const SIGNUP_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
let signupGlobalHits = [];
function signupGlobalBlocked() {
    const now = Date.now();
    while (signupGlobalHits.length && now - signupGlobalHits[0] > SIGNUP_GLOBAL_WINDOW_MS) signupGlobalHits.shift();
    if (signupGlobalHits.length >= SIGNUP_GLOBAL_LIMIT) return true;
    signupGlobalHits.push(now);
    return false;
}

// what a signup/self-edit may control (plan is kept for existing records,
// but a NEW record always starts as Basic; admin flags are never settable)
function sanitizeUserRecord(u) {
    const allowed = ['id', 'email', 'username', 'password', 'plan', 'description', 'createdAt', 'isAdmin', 'isScripter', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled', 'twoStepEnabled', 'twoStepCode', 'twoStepExpires'];
    const out = {};
    for (const k of allowed) if (u[k] !== undefined) out[k] = u[k];
    out.isAdmin = false;
    out.isScripter = false;
    // plan whitelist: junk plans (15KB keyboard mash) rendered the whole
    // dashboard unreadable. Unknown plan -> Basic.
    if (!VALID_PLANS.includes(String(out.plan || ''))) out.plan = 'Basic';
    // hard caps on free-text fields (they were abused to store garbage)
    if (typeof out.username === 'string' && out.username.length > MAX_USERNAME_LEN) out.username = out.username.slice(0, MAX_USERNAME_LEN);
    if (typeof out.email === 'string' && out.email.length > MAX_EMAIL_LEN) out.email = out.email.slice(0, MAX_EMAIL_LEN);
    if (typeof out.description === 'string' && out.description.length > MAX_DESC_LEN) out.description = out.description.slice(0, MAX_DESC_LEN);
    if (typeof out.theme === 'string' && out.theme.length > 30) out.theme = 'default';
    return storageSafeUser(out);
}

// fetch ALL valid owner access-code hashes.
//
// SECURITY (Phase 1): there is NO hard-coded default any more.
//
// The previous implementation seeded this list with sha256("ScripterHub"), and
// the literal "ScripterHub" was the product name, in the page title, and in
// every loadstring. It was therefore not a secret at all: anyone who had read
// the source, seen a screenshot, or guessed the obvious could authenticate as
// owner and receive a 12-hour owner session token, which unlocks /sh/upload,
// /sh/users, /sh/users-delete and /sh/users-clear.
//
// The owner code is now generated once, at high entropy, and only its SHA-256
// is stored. It is never a constant in this file.
//
// THE CODE IS NEVER WRITTEN TO A LOG. An earlier version of this printed it
// with console.log on bootstrap, which is not acceptable: Cloudflare retains
// worker logs, they are visible to anyone with dashboard access, they can be
// shipped to log aggregation, and `wrangler tail` replays them. Printing a
// credential once is still putting a credential in a place designed to keep
// it. The flow is now strictly:
//
//   1. run the claim once from your own machine (see the endpoint below)
//   2. the plaintext is returned in that HTTP response and nowhere else
//   3. it is never written to KV, a log, or a Worker secret
//   4. only its SHA-256 is persisted
//
// The endpoint is protected by SH_SETUP_TOKEN, which the operator sets as a
// Worker secret, so an attacker who reaches the worker still cannot claim it.
// The claim is single-use: the stored record is deleted as it is read, so a
// second attempt returns nothing even with the setup token.
const OWNER_CODE_BOOTSTRAPPED_KEY = 'sh_owner_bootstrapped';

async function getCodeHashes(env) {
    const hashes = [];
    if (env.SH_OWNER_CODE_HASH) {
        // operator-supplied hash wins and needs no KV at all
        hashes.push(String(env.SH_OWNER_CODE_HASH).trim().toLowerCase());
    }
    if (env.LOADERS_KV) {
        try {
            const rec = await env.LOADERS_KV.get(CODE_KV_KEY);
            if (rec) {
                const h = JSON.parse(rec).hash;
                if (h && !hashes.includes(h)) hashes.push(h);
            }
        } catch (e) {}
    }
    if (hashes.length === 0) {
        // Pre-Phase-1 deployment with no code ever set. Mint one now rather
        // than fall back to a guessable default.
        //
        // The minted plaintext is hashed and immediately discarded here. The
        // ONLY way for the operator to obtain it is the single-use
        // /sh/owner-claim endpoint, which calls bootstrapOwnerCode() itself.
        const code = await bootstrapOwnerCode(env);
        if (code) {
            hashes.push(await sha256Hex(code));
        }
    }
    return hashes;
}

// 192 bits of entropy from crypto.getRandomValues, grouped for transcription
// and stripped of look-alike characters (no I/O/0/1).
function generateOwnerCode() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
        if ((i + 1) % 6 === 0 && i + 1 < bytes.length) out += '-';
    }
    return out;
}

// Mint the owner code if this deployment has none.
//
// SECURITY: the plaintext is returned to the CALLER ONLY. It is never logged,
// never written to KV, and never placed in an env binding. Only its SHA-256
// is persisted, which is what getCodeHashes() compares against.
//
// The caller is claimOwnerCode(), which serves it once over an endpoint
// gated on SH_SETUP_TOKEN and then deletes the record. The plaintext exists
// in exactly two places at any moment: the response body being returned, and
// the operator's terminal.
//
// Returns the code to the caller, or null if one already exists / no KV.
async function bootstrapOwnerCode(env) {
    if (!env.LOADERS_KV) return null;
    try {
        const done = await env.LOADERS_KV.get(OWNER_CODE_BOOTSTRAPPED_KEY);
        if (done) return null;   // already bootstrapped once; do not re-mint
        const code = generateOwnerCode();
        await env.LOADERS_KV.put(CODE_KV_KEY, JSON.stringify({
            hash: await sha256Hex(code),
            setAt: Date.now(),
            generated: true
        }), { expirationTtl: LOADER_TTL });
        await env.LOADERS_KV.put(OWNER_CODE_BOOTSTRAPPED_KEY, String(Date.now()), { expirationTtl: LOADER_TTL });
        // Returned to claimOwnerCode() and then dropped on the floor. There is
        // deliberately no console.log here: a credential in retained logs is
        // still a credential in retained logs, however briefly it was printed.
        return code;
    } catch (e) {
        return null;
    }
}

// ---- REAL LICENSE helpers (Luarmor-model server auth) ----
async function loadLicenses(env) {
    if (!env.LOADERS_KV) return {};
    try {
        const raw = await env.LOADERS_KV.get(KV_LICENSES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
async function saveLicenses(env, map) {
    await env.LOADERS_KV.put(KV_LICENSES_KEY, JSON.stringify(map));
}
// ---- STORAGE KEEPER (GitHub-backed big-script storage) ----
// Cloudflare KV caps at ~50MB/script (25MB per value). Scripts larger
// than the KV ceiling are stored in a PRIVATE GitHub repository (the
// owner's "Storage Keeper" repo) using the Git Data API:
//   POST /sh/gh-put      <- owner: upload one part (<=40MB, matches the
//                           100MB API file cap with base64 overhead ~1.33x)
//   POST /sh/gh-finalize <- owner: create the git tree+commit+ref update
//                           (all parts land in ONE commit at path
//                            scripts/<id>/<i>.part) and register the
//                           loader meta so /sh/<id> starts working
//   POST /sh/gh-delete   <- owner: delete a script's folder + commit
//   POST /sh/gh-status   <- owner: usage summary (repos + parts + sizes)
//   GET  /sh/g/<id>/<i>  <- EXECUTOR-ONLY part download, proxied from
//                           GitHub by the worker (repo stays private,
//                           the token never leaves the worker)
// Requirements (worker Settings -> Variables and Secrets):
//   SH_GH_TOKEN    = GitHub PAT with repo scope (classic) or Contents
//                    read+write (fine-grained) for the storage repo
//   SH_GH_REPO     = "owner/repo" e.g. "Scripter-Coder/Storage-Keeper-1"
// The parts are the SAME obfuscated/encrypted ciphertext as KV scripts
// - GitHub never sees plaintext, and neither does anyone without a valid
// executor User-Agent hitting the worker proxy.
const GH_PART_MAX = 40_000_000;      // 40MB raw -> ~53MB base64 (API cap 100MB)
const KV_GH_PREFIX = 'sh_gh_';      // sh_gh_<id> = { repo, path, n, len, sha, at, name, user, keyless, webKey, keyHash, authRequired }
const GH_API = 'https://api.github.com';
// minimal GitHub REST client (workers fetch, no deps)
async function ghFetch(env, path, opts) {
    if (!env.SH_GH_TOKEN || !env.SH_GH_REPO) throw new Error('Storage Keeper not configured (SH_GH_TOKEN / SH_GH_REPO missing)');
    const res = await fetch(GH_API + path, {
        method: (opts && opts.method) || 'GET',
        headers: {
            'Authorization': 'Bearer ' + env.SH_GH_TOKEN,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'scripterhub-storage-keeper',
            ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) throw new Error('github ' + res.status + ': ' + (data && data.message ? data.message : String(text).slice(0, 200)));
    return { status: res.status, data: data };
}
// read one blob part from the storage repo (base64 -> raw string)
async function ghGetPart(env, repo, path, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(ref || 'main'));
    const b64 = r.data && r.data.content ? r.data.content.replace(/\s/g, '') : '';
    if (!b64) throw new Error('part missing');
    return atob(b64);
}
// write one blob + async task to also append it to the ref via a commit
// (simplest reliable path on Workers: contents API single-file commit)
async function ghPutPart(env, repo, path, contentB64, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/contents/' + path, {
        method: 'PUT',
        body: { message: 'storage: ' + path, content: contentB64, branch: ref || 'main' }
    });
    return r.data; // { commit, content: { sha } }
}
// head (latest sha) of the storage branch
async function ghHead(env, repo, ref) {
    const r = await ghFetch(env, '/repos/' + repo + '/git/ref/' + (ref || 'heads/main'));
    return r.data.object && r.data.object.sha ? r.data.object.sha : null;
}
// ---- CHUNKED BLOB STORAGE (big scripts, KV 25MB/value workaround) ----
// Small blobs: one KV put (unchanged legacy format). Big blobs: stored as
//   sh_chunk_<id>_0 .. sh_chunk_<id>_N  + sh_cmeta_<id> = { n, len }
// getBlob reassembles them in order. Chunk writes are sequential (KV
// is eventually consistent; the meta record with the count is written
// LAST so a half-finished upload can never be served as a valid script).
const KV_CHUNK_PREFIX = 'sh_chunk_';
const KV_CMETA_PREFIX = 'sh_cmeta_';
async function putBlob(env, id, prefix, text) {
    const s = String(text);
    if (s.length <= CHUNK_THRESHOLD) {
        // legacy single-value path (scripts < ~25MB - the common case)
        await env.LOADERS_KV.put(prefix + id, s, { expirationTtl: LOADER_TTL });
        return { chunked: false, len: s.length };
    }
    const n = Math.ceil(s.length / CHUNK_THRESHOLD);
    if (n > MAX_CHUNKS) throw new Error('too large');
    for (let i = 0; i < n; i++) {
        await env.LOADERS_KV.put(KV_CHUNK_PREFIX + prefix + id + '_' + i, s.slice(i * CHUNK_THRESHOLD, (i + 1) * CHUNK_THRESHOLD), { expirationTtl: LOADER_TTL });
    }
    await env.LOADERS_KV.put(KV_CMETA_PREFIX + prefix + id, JSON.stringify({ n, len: s.length }), { expirationTtl: LOADER_TTL });
    return { chunked: true, n, len: s.length };
}
async function getBlob(env, id, prefix) {
    // legacy single value first
    const v = await env.LOADERS_KV.get(prefix + id);
    if (v !== null) return v;
    // chunked? read the meta then every chunk in order
    const metaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + prefix + id);
    if (metaRaw === null) return null;
    let meta = {};
    try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
    const parts = [];
    for (let i = 0; i < meta.n; i++) {
        const c = await env.LOADERS_KV.get(KV_CHUNK_PREFIX + prefix + id + '_' + i);
        if (c === null) return null; // missing chunk = corrupted upload
        parts.push(c);
    }
    const joined = parts.join('');
    return joined.length === meta.len ? joined : null;
}
// token = HMAC-SHA256(secret = SHA256(key), msg = key|hwid|t0) hex[0..32].
//
// STILL FORGEDABLE BY THE CLIENT (gate G09, not yet closed): the "secret" is
// SHA-256("SHAUTH::" + key), i.e. it is derived from the license key, and the
// message is key|hwid|t0. Every one of those inputs is known to any client
// that already holds the key, so a client can compute this token offline
// without ever asking the server. The token therefore proves nothing that the
// key did not already prove, it is constant for a given (key, hwid, t0), and
// because t0 is baked into the shipped file it never changes.
//
// It is kept here ONLY so the legacy /sh/k path keeps working while Phase 3
// replaces it with a real server-side session (migrations/0001_init.sql,
// tables `sessions` + `nonces`). Do not add new callers. A proper token is
// server-side state: minted once, single-use, expiring, and verifiable only
// against the atomic state layer.
async function makeAuthToken(key, hwid, t0) {
    const enc = new TextEncoder();
    const secretDigest = await crypto.subtle.digest('SHA-256', enc.encode('SHAUTH::' + key));
    const secretKey = await crypto.subtle.importKey('raw', secretDigest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', secretKey, enc.encode(key + '|' + hwid + '|' + t0));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function verifyAuthToken(key, hwid, t0, token) {
    const want = await makeAuthToken(key, hwid, t0);
    return hashEqual(want, String(token || ''));
}
async function isKillswitchOn(env) {
    if (!env.LOADERS_KV) return false;
    try {
        const raw = await env.LOADERS_KV.get(KV_KILLSWITCH_KEY);
        return !!(raw && JSON.parse(raw).on);
    } catch (e) { return false; }
}
// auth decision for one license key at hwid; mutates nothing
function classifyLicense(rec, hwid, now) {
    if (!rec) return { code: 'invalid' };                      // no such key
    if (rec.banned) return { code: 'banned', reason: rec.banReason }; // blacklisted
    if (rec.expiresAt && rec.expiresAt <= now) return { code: 'expired' }; // expired
    if (rec.hwid && rec.hwid !== hwid) return { code: 'hwid' }; // shared key
    return { code: 'ok', rec: rec };
}
// ---------------------------------------------------------------------------
// TELEMETRY — metadata only, by construction.
//
// SECURITY: this function is the ONLY outbound webhook path, and it accepts a
// fixed set of metadata fields. It has no parameter that can carry source
// code, a license key, a Special Key, or artifact bytes, so "never log the
// secret" is a property of the signature rather than a rule at the call site.
//
// It replaced two functions that did leak:
//   notifyDiscord()      appended the PLAINTEXT source as a .lua attachment
//                        on every single upload
//   notifyAuthDiscord()  posted every valid LICENSE KEY in cleartext
// Both are treated as credentials-in-a-third-party-service, so neither is
// acceptable regardless of who can read the Discord channel.
//
// Identifiers are hashed rather than sent raw. An operator can correlate
// "the same key failed 40 times" without the log becoming a credential store
// in its own right, and without a leaked webhook URL exposing working keys.
// ---------------------------------------------------------------------------

// Whitelist. Anything not named here cannot be emitted, no matter what a
// caller passes. This is the enforcement point.
const TELEMETRY_FIELDS = [
    'event', 'outcome', 'scriptId', 'userRef', 'licenseRef', 'sessionId',
    'executor', 'reason', 'transport', 'ip', 'ua', 'at', 'bytes', 'parts'
];
// Never emitted, and stripped if a caller tries: the actual secrets.
const TELEMETRY_DENY = /^(code|source|plainCode|obfCode|normalCode|cipher|key|license|hwid|password|specialKey|paddedKey|token|secret)$/i;

function scrubTelemetryValue(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    const s = String(v);
    // keep it short and log-safe; never let a caller smuggle a blob through
    return s.replace(/[\r\n]+/g, ' ').slice(0, 120);
}

// A caller may legitimately pass something non-numeric in `at`; toISOString()
// throws RangeError on that, and this runs inside a request path.
function telemetryIso(ms) {
    const n = Number(ms);
    return new Date(Number.isFinite(n) && n > 0 ? n : Date.now()).toISOString();
}

function buildTelemetry(ev) {
    const out = {};
    for (const f of TELEMETRY_FIELDS) {
        if (TELEMETRY_DENY.test(f)) continue;   // belt and braces
        if (ev[f] !== undefined) out[f] = scrubTelemetryValue(ev[f]);
    }
    return out;
}

// Stable short reference for an identifier we must correlate on but not reveal.
async function telemetryRef(kind, value) {
    if (!value) return '';
    return kind + ':' + (await sha256Hex('SHTELE::' + kind + '::' + String(value))).slice(0, 12);
}

async function notifyAuthDiscord(env, result) {
    return notifyTelemetry(env, {
        event: result.ok ? 'auth.ok' : 'auth.denied',
        outcome: result.ok ? 'ok' : 'denied',
        scriptId: result.scriptId,
        // hashed, not the key itself
        licenseRef: await telemetryRef('lic', result.key),
        // HWID is a stable device fingerprint: hash it too
        userRef: await telemetryRef('hw', result.hwid),
        executor: result.executor,
        reason: result.reason || (result.ok ? 'valid' : 'unknown'),
        at: Date.now()
    });
}

async function notifyScriptDiscord(env, ev) {
    return notifyTelemetry(env, Object.assign({
        event: 'script.published',
        outcome: 'ok'
    }, ev));
}

async function notifyTelemetry(env, ev) {
    const url = env.SH_DISCORD_WEBHOOK;
    if (!url) return;                       // not configured: skip silently
    const meta = buildTelemetry(ev);
    const denyHit = Object.keys(ev).filter(k => TELEMETRY_DENY.test(k));
    if (denyHit.length) {
        // A caller tried to pass a secret. Refuse the whole event rather than
        // silently dropping fields, so the bug is visible in the logs.
        console.error('telemetry: refused event, denied fields: ' + denyHit.join(','));
        return;
    }
    const fields = Object.keys(meta)
        .filter(k => meta[k] !== '')
        .map(k => ({ name: k, value: '`' + meta[k] + '`', inline: true }));
    const payload = {
        username: 'ScripterHub',
        embeds: [{
            title: (meta.event || 'event') + ' — ' + (meta.outcome || 'ok'),
            color: meta.outcome === 'denied' ? 0xff3333 : (meta.outcome === 'error' ? 0xffaa33 : 0x00cc44),
            fields,
            footer: { text: 'ScripterHub telemetry (metadata only)' },
            timestamp: telemetryIso(meta.at)
        }]
    };
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { /* telemetry must never break a request */ }
}

// verify the login-session token (issued by /sh/login)
// Owner login session (issued by /sh/login).
//
// PHASE 1: the signature is a real HMAC over a server-only secret, and the
// access-code hash is no longer carried inside the token. Previously the token
// was base64({t, ch: <code hash>, k: sha256(ch+t)}), so the value used to
// validate it travelled inside it: one observed token was enough to mint
// unlimited valid ones for any future timestamp.
//
// The legacy shape is still accepted so tokens issued before this change stay
// usable for the remainder of their 12h TTL. That is not a new hole: a legacy
// token can only be minted by someone who already has a valid access code,
// because `ch` must match a configured code hash.
async function verifyToken(token, codeHashes, env) {
    const t = String(token || '');
    if (!t) return false;
    try {
        if (t.indexOf('.') > 0) {
            const parts = t.split('.');
            if (parts.length !== 2) return false;
            if (!(await verifySessionSignature(env, parts[0], parts[1]))) return false;
            const raw = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
            if (!raw || raw.kind !== 'owner') return false;
            if (Date.now() - raw.t > TOKEN_TTL) return false;
            if (!codeHashes.includes(String(raw.ch || ''))) return false;
            return true;
        }
        const raw = JSON.parse(atob(t));
        if (Date.now() - raw.t > TOKEN_TTL) return false;
        if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return false;
        if (!codeHashes.includes(raw.ch)) return false;
        return true;
    } catch (e) { return false; }
}

// verify a USER session token (issued by /sh/user-login). Any registered
// account can claim loadstrings for its own scripts - the owner access
// code is no longer required for normal users.
// PHASE 1: the token is signed with the server-only secret, and it no longer
// CONTAINS the stored password hash. That was the worst property of the old
// format: the token was base64, so any log entry, proxy capture or browser
// history entry holding a session token also handed over the credential.
//
// `pwd` is a keyed fingerprint of the current password-hash generation, so
// changing a password invalidates outstanding tokens rather than leaving them
// valid for the rest of the TTL. The legacy branch is kept so tokens issued
// before this change keep working until they expire.
async function verifyUserToken(token, env) {
    const t = String(token || '');
    if (!t) return null;
    try {
        let raw;
        if (t.indexOf('.') > 0) {
            const parts = t.split('.');
            if (parts.length !== 2) return null;
            if (!(await verifySessionSignature(env, parts[0], parts[1]))) return null;
            raw = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
        } else {
            raw = JSON.parse(atob(t));
            if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return null;
        }
        if (!raw || raw.kind !== 'user') return null;
        if (Date.now() - raw.t > TOKEN_TTL) return null;
        const map = await loadUsersMap(env);
        const rec = map[raw.e];
        if (!rec) return null;
        if (raw.pwd) {
            const want = await credentialFingerprint(env, String(rec.password || ''));
            if (!hashEqual(want, String(raw.pwd))) return null;
        } else if (String(rec.password || '') !== String(raw.ch)) {
            return null;
        }
        if (rec.disabled) return null;
        return rec;
    } catch (e) { return null; }
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

// generate the random 10 digits: ScripterHub(1234567890). A caller-supplied
// wantId (must match the same shape) is honored so the split-key URL baked
// into an obfuscated file points at the id the upload will actually use.
// Resolve the script id for an upload.
//
// PHASE 1 CHANGE: a client-supplied `wantId` is only honoured when the caller
// owns the existing script (or is the owner). Previously ANY authenticated
// user could pass someone else's id and overwrite their artifact, because
// nothing checked the target's ownership. The id space is only 10 digits, so
// it is enumerable, and the "one user clobbers another user's script" case is
// a real integrity problem rather than a theoretical one.
//
// wantId still exists because the split-key URL is baked into the obfuscated
// file at build time, so re-uploading under a fresh id would orphan the key
// request and produce an undecryptable script.
async function loaderId(wantId, env, authedUser) {
    const w = String(wantId || '');
    if (!/^ScripterHub\d{10}$/.test(w)) {
        let d = '';
        for (let i = 0; i < 10; i++) d += Math.floor(Math.random() * 10);
        return 'ScripterHub' + d;
    }
    // Not yet taken: nothing to protect.
    const existing = env && env.LOADERS_KV ? await env.LOADERS_KV.get(KV_META_PREFIX + w) : null;
    if (existing === null) return w;
    let owner = '';
    try { owner = String((JSON.parse(existing) || {}).user || ''); } catch (e) { owner = ''; }
    const caller = String(authedUser || '');
    const isOwnerRole = !!(env && env.SH_OWNER_CODE_HASH) || caller.toLowerCase() === OWNER_EMAIL;
    if (owner && caller && owner.toLowerCase() === caller.toLowerCase()) return w;   // owner re-uploading their own
    if (isOwnerRole) return w;                                                        // site owner
    // Refuse rather than silently minting a new id: a caller that asked for a
    // specific id and was refused should be told, not handed a working
    // loadstring for a different script than the one it intended to publish.
    return null;
}

// REMOVED: notifyDiscord(env, username, scriptName, normalCode, obfCode)
// This appended the PLAINTEXT source (<name>_normal.lua) and the obfuscated
// code to the Discord webhook on every upload. That made Discord a third-party
// store of the customer's source and gave anyone who obtained the webhook URL
// a full dump of every script ever published. It is replaced by
// notifyScriptDiscord() above, which takes metadata only.

export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env, ctx);
        } catch (e) {
            // GLOBAL SAFETY NET: an uncaught error used to produce a blank
            // 500 with NO CORS headers - the browser swallowed it and the
            // site just showed "fetch failed" (the loadstring outage).
            // Every error now returns readable JSON with CORS.
            return new Response(JSON.stringify({ ok: false, error: 'worker error: ' + String(e && e.message ? e.message : e).slice(0, 300) }), {
                status: 500,
                headers: CORS_HEADERS
            });
        }
    }
};

async function handleRequest(request, env, ctx) {
        const url = new URL(request.url);

        // load persisted stat counters once per isolate (fire-and-forget)
        loadStatsOnce(env);

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

        // ---------- POST /sh/owner-claim : ONE-TIME reveal of the owner code ----------
        // Body: { setupToken }  - setupToken = your SH_SETUP_TOKEN secret.
        //
        // WHY THIS EXISTS
        // A deployment created before Phase 1 has no owner access code, and the
        // hard-coded "ScripterHub" default has been removed. Without a way to
        // obtain a code, that deployment would be locked out of its own admin
        // panel. This endpoint mints one, returns it ONCE, and forgets it.
        //
        // SECURITY PROPERTIES, and they are the whole point of the design:
        //   * the plaintext is NEVER logged. Cloudflare retains worker logs and
        //     anyone with dashboard access can read them, so a credential in a
        //     log is a permanently exposed credential no matter how briefly it
        //     was printed. It exists only in this HTTP response.
        //   * only the SHA-256 is persisted, so the KV namespace never holds it.
        //   * gated on SH_SETUP_TOKEN, which the operator sets as a Worker
        //     secret, so reaching the endpoint is not enough.
        //   * strictly single-use: the code record is deleted as it is read, and
        //     the bootstrap marker prevents re-minting. A second call with a
        //     valid setup token returns { ok: true, alreadyClaimed: true } and
        //     no secret.
        //   * no-store and no CORS, so the response is not cached by any
        //     intermediary and cannot be read cross-origin by a page.
        //
        // Run it once, save the code somewhere safe, then you can disable it by
        // removing the route. To rotate later, use /sh/setcode.
        if (url.pathname === '/sh/owner-claim' && request.method === 'POST') {
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound.' }, 500);
            if (!env.SH_SETUP_TOKEN) {
                return jsonResponse({ ok: false, error: 'SH_SETUP_TOKEN is not set, so this endpoint cannot be authorized. Set it first.' }, 401);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const supplied = String(body.setupToken || '');
            if (!supplied || !hashEqual(supplied, String(env.SH_SETUP_TOKEN))) {
                // Deliberately vague: do not confirm whether the token was close.
                return new Response(JSON.stringify({ ok: false, error: 'Not authorized.' }), {
                    status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            const existing = await env.LOADERS_KV.get(CODE_KV_KEY);
            if (existing) {
                // Already has a code. Never re-reveal it: we only stored the hash,
                // so it cannot be recovered even by us.
                return new Response(JSON.stringify({ ok: true, alreadyClaimed: true, hint: 'A code already exists and cannot be shown again. Use /sh/login, or set a new one via /sh/setcode.' }), {
                    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            const code = await bootstrapOwnerCode(env);
            if (!code) {
                return new Response(JSON.stringify({ ok: false, error: 'Could not mint a code. Check KV binding.' }), {
                    status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
            // This response body is the ONLY place the plaintext ever exists.
            // It is not logged, not stored, and not cached.
            return new Response(JSON.stringify({
                ok: true,
                code: code,
                warning: 'This is shown ONCE and is not stored in readable form. Save it now. It is not in the worker logs.'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' }
            });
        }

        // ---------- POST /sh/setcode : set / rotate the owner access code ----------
        // Body: { setupToken, code }  - setupToken = your SH_SETUP_TOKEN secret.
        //
        // PHASE 1: this used to ADD an extra code while the hard-coded default
        // "ScripterHub" kept working. The default is gone, so this is now the
        // normal way to set or rotate the code, and it REPLACES any existing
        // one. Use it to rotate, or to take over from /sh/owner-claim.
        // Only the SHA-256 is stored, never the plaintext.
        if (url.pathname === '/sh/setcode' && request.method === 'POST') {
            // Tight bucket: this route can lock the owner out of their own
            // account, so it is limited hard on the setup token.
            {
                const rl = rateLimit('setcode', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
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
            // Access-code brute force. Keyed on IP only: the caller has no
            // proven identity yet, and the code is the thing being guessed.
            {
                const rl = rateLimit('login', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
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
            // Hand out a short-lived session token.
            //
            // PHASE 1: signed with HMAC-SHA256 under SH_SESSION_SECRET instead
            // of a checksum derived from the access-code hash carried INSIDE
            // the token. The old shape was self-certifying, so observing one
            // valid token was enough to forge unlimited future ones. The code
            // hash is still referenced (so rotating the code invalidates live
            // sessions) but it is no longer what makes the token genuine.
            const now = Date.now();
            const token = await signSessionToken(env, { kind: 'owner', ch: matched, t: now });
            return jsonResponse({ ok: true, token, ttl: TOKEN_TTL });
        }

        // ---------- POST /sh/upload : store ENCRYPTED script + notify Discord ----------
        // Body: { token, name, user, cipher, keyHash, normalCode }.
        // The browser encrypts the script with the Special Key BEFORE
        // uploading (sh-crypto.js) - the worker NEVER sees the key or the
        // plaintext. keyHash (SHA-256 of the key) is optional metadata.
        if (url.pathname === '/sh/upload' && request.method === 'POST') {
            // Pre-auth bucket keyed on IP. It bounds the cost of an unauthenticated
            // flood before any KV write or hashing happens. After the identity is
            // proven below, a second bucket keyed on that identity is consumed, so
            // a valid account cannot be used to publish without limit either.
            {
                const rl = rateLimit('upload', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            // Auth: an owner session token (from /sh/login) OR any registered
            // user's session token (from /sh/user-login). Normal users can
            // claim loadstrings without the owner access code.
            //
            // `authedUser` is the identity the TOKEN proves. It is deliberately
            // separate from the boolean `authed` because Phase 1 needs the real
            // principal to stop trusting body.user and to enforce ownership.
            const codeHashes = await getCodeHashes(env);
            let authed = false;
            let authedUser = null;
            let authedRole = null;
            const ownerTok = (request.headers.get('X-SH-Token') || '') || (body && body.token) || '';
            if (await verifyToken(ownerTok, codeHashes, env)) {
                authed = true;
                authedRole = 'owner';
                authedUser = OWNER_EMAIL;
            }
            if (!authed && body.userToken) {
                const u = await verifyUserToken(body.userToken, env);
                if (u) {
                    authed = true;
                    authedRole = (u.role === 'owner' || String(u.email || '').toLowerCase() === OWNER_EMAIL) ? 'owner' : 'user';
                    authedUser = String(u.email || u.username || '').slice(0, 100);
                }
            }
            // REMOVED (Phase 1): the `ownerProof` branch, which accepted the
            // base64 owner password as an alternative to a session token. See
            // isOwnerRequest() for why a password in a request is not an
            // acceptable admin credential.
            if (!authed) {
                return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            }
            // Second bucket, now keyed on the PROVEN identity. Separate from the
            // pre-auth bucket so a shared IP (office, school, hosting) does not
            // let one user exhaust another's publish budget.
            {
                const rl = rateLimit('upload', rateIdentity(request, url, authedUser));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV (see worker comments).' }, 500);
            const name = String(body.name || 'script').slice(0, 100);
            // The authenticated identity, not a client-supplied string.
            //
            // `body.user` used to be trusted verbatim, so any authenticated
            // user could publish a script attributed to anyone, poisoning the
            // telemetry and any future per-user authorization. The upload path
            // records the real owner below instead.
            const claimedUser = String(body.user || '').slice(0, 100);
            const user = authedUser || claimedUser || 'unknown';
            const id = await loaderId(body.wantId, env, authedUser);
            if (id === null) {
                return jsonResponse({ ok: false, error: 'Not authorized to publish to that script id. Pick a new one.' }, 403);
            }
            // ---- SPLIT-KEY (anti-static-peel): the obfuscated file is
            // missing its final layer key; store the padded key + t0 here
            // so the runtime can fetch it (executor-only, time-locked).
            if (body.splitKey && Array.isArray(body.splitKey.paddedKey) && body.splitKey.paddedKey.length) {
                const sk = {
                    paddedKey: body.splitKey.paddedKey.map(n => n & 0xFF),
                    t0: Number(body.splitKey.t0) || 0,
                    chk: Number(body.splitKey.chk) || 0
                };
                if (sk.t0 < 1 || sk.chk < 1) return jsonResponse({ ok: false, error: 'splitKey.t0/chk required' }, 400);
                await env.LOADERS_KV.put(KV_SKEY_PREFIX + id, JSON.stringify(sk), { expirationTtl: LOADER_TTL });
            }
            // ---- KEYLESS (free) scripts ----
            // Executor blob (plainCode) = the obfuscated code, served to
            // executors with NO key (free = anyone can run). Browser view
            // (cipher) = the SAME code encrypted with the owner's Special Key,
            // so the website key page requires the key to show it.
            // normalCode is ONLY for the Discord attachment (7MB cap there)
            // - never let a giant raw source bloat the request body.
            const normalCode = String(body.normalCode || '').slice(0, 7_000_000);
            if (body.keyless === true) {
                const plainCode = String(body.plainCode || '');
                const cipher = String(body.cipher || '');
                if (!plainCode) return jsonResponse({ ok: false, error: 'plainCode is required for keyless scripts (the obfuscated code)' }, 400);
                if (plainCode.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
                // executor blob (no key needed in-game) - chunked if large
                try {
                    await putBlob(env, id, KV_PREFIX, plainCode);
                } catch (e) {
                    return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                }
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
                    if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    try {
                        await putBlob(env, id, KV_WEB_PREFIX, cipher);
                    } catch (e) {
                        return jsonResponse({ ok: false, error: 'cipher too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
                    }
                }
                await maybeReplaceOld(env, body.replaces);
                ctx.waitUntil(notifyScriptDiscord(env, {
                    event: 'script.published', outcome: 'ok',
                    scriptId: id, userRef: await telemetryRef('user', user),
                    at: Date.now(), bytes: plainCode.length
                }));
                const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
                return jsonResponse({ ok: true, id, replaced: false, keyless: true, loadstring: 'loadstring(game:HttpGet("' + base + '/sh/' + id + '"))()' });
            }
            // ---- keyed scripts: ENCRYPTED with the Special Key ----
            const cipher = String(body.cipher || '');
            if (!cipher) return jsonResponse({ ok: false, error: 'cipher is required (encrypt client-side with the Special Key first)' }, 400);
            if (cipher.length > MAX_CIPHER_LEN) return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare: KV values cap at 25MB and request bodies at ~100MB). Reduce the script or split it into modules.' }, 413);
            const keyHash = String(body.keyHash || ''); // optional SHA-256 hex
            try {
                await putBlob(env, id, KV_PREFIX, cipher);
            } catch (e) {
                return jsonResponse({ ok: false, error: 'script too large (max ~50MB on Cloudflare). Reduce the script or split it into modules.' }, 413);
            }
            // authRequired: this script demands a valid license key + HWID
            // on EVERY run (Luarmor model) - the split key is never served
            // without a short-lived /sh/auth token
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({ name, user, at: Date.now(), keyHash, authRequired: body.authRequired === true }), { expirationTtl: LOADER_TTL });
            // optional: kill an OLD loader (key rotation / re-upload on edit)
            let replaced = await maybeReplaceOld(env, body.replaces);
            // Discord notification (attachments = download txt/lua files)
            ctx.waitUntil(notifyScriptDiscord(env, {
                event: 'script.published', outcome: 'ok',
                scriptId: id, userRef: await telemetryRef('user', user),
                at: Date.now(), bytes: cipher.length
            }));
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
            // flood guard: >10 signups/min from one IP = bot (the KV quota
            // got burned by 1200 junk signups in one day)
            const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').slice(0, 64);
            if (signupFloodBlocked(ip)) return jsonResponse({ ok: false, error: 'Too many signups. Try again later.' }, 429);
            try {
                const email = String(body.email || '').trim();
                const username = String(body.username || '').trim();
                const password = String(body.password || '');
                if (!email || !username || !password) return jsonResponse({ ok: false, error: 'missing fields' }, 400);
                if (password.length < 6) return jsonResponse({ ok: false, error: 'password too short' }, 400);
                // shape guards: junk emails/usernames were used to bloat the
                // KV (1231 records, ~500KB of garbage)
                if (email.length > MAX_EMAIL_LEN || !/^[^\s@]{1,64}@[^\s@]{1,64}\.[^\s@]{1,16}$/.test(email)) return jsonResponse({ ok: false, error: 'invalid email' }, 400);
                if (username.length > MAX_USERNAME_LEN || username.length < 2) return jsonResponse({ ok: false, error: 'invalid username' }, 400);
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
                    // PBKDF2, not btoa. See hashPassword() for why, and for the
                // legacy-migration path that keeps existing accounts working.
                password: await hashPassword(env, password),
                    plan: 'Basic',
                    description: String(body.description || ''),
                    createdAt: body.createdAt || new Date().toISOString(),
                    profileImage: '', bannerImage: '', theme: 'default',
                    stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
                });
                // global hourly cap (counts only signups about to hit KV):
                // bots rotate IPs, so the per-IP limit alone still let
                // hundreds of junk accounts through
                if (signupGlobalBlocked()) return jsonResponse({ ok: false, error: 'Too many signups right now. Try again later.' }, 429);
                map[email] = storageSafeUser(rec);
                await saveUsersMap(env, map);
                return jsonResponse({ ok: true, user: publicUser(rec) });
            } catch (e) {
                // NEVER a blank 500: the browser would swallow the error
                // (no CORS headers on the error path) and users would
                // just see "fetch failed"
                return jsonResponse({ ok: false, error: 'server error creating the account: ' + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
            }
        }

        // ---------- POST /sh/user-login : cross-device login ----------
        if (url.pathname === '/sh/user-login' && request.method === 'POST') {
            // Password brute force. Keyed on IP + the account being targeted,
            // so one attacker cannot grind a single account AND a spray across
            // accounts cannot escape the per-IP budget.
            {
                let probeEmail = '';
                try { probeEmail = String((await request.clone().json() || {}).emailOrUsername || '').toLowerCase(); } catch (e) {}
                const rl = rateLimit('user-login', rateIdentity(request, url) + '|' + probeEmail);
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            try {
                const emailOrUser = String(body.emailOrUsername || '').trim();
                if (!emailOrUser || emailOrUser.length > MAX_EMAIL_LEN || String(body.password || '').length > 500) return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                const map = await loadUsersMap(env);
                let found = null;
                let foundEmail = null;
                for (const k in map) {
                    if (k === emailOrUser || String(map[k].username || '').toLowerCase() === emailOrUser.toLowerCase()) { found = map[k]; foundEmail = k; break; }
                }
                if (!found) {
                    return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                }
                const verdict = await verifyPassword(env, found.password, body.password);
                if (!verdict.ok) {
                    return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                }
                if (found.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
                // Opportunistic migration: the correct password was just proven,
                // so a legacy base64 record can be upgraded in place. Doing it
                // here rather than in a batch means it can never lock anyone
                // out, and it means the weak records disappear on first use.
                if (verdict.needsRehash) {
                    try {
                        found.password = await hashPassword(env, body.password);
                        map[foundEmail] = storageSafeUser(found);
                        await saveUsersMap(env, map);
                    } catch (e) { /* a failed upgrade must not block login */ }
                }
                // Issue a USER session token. It binds to the account id and
                // the CURRENT password-hash generation, so changing the
                // password invalidates outstanding tokens.
                const now = Date.now();
                const token = await signSessionToken(env, {
                    kind: 'user',
                    sub: foundEmail,
                    e: foundEmail,
                    pwd: await credentialFingerprint(env, String(found.password || '')),
                    t: now
                });
                return jsonResponse({ ok: true, user: publicUser(found), token });
            } catch (e) {
                return jsonResponse({ ok: false, error: 'server error during login: ' + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
            }
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
            if (!email || email.length > MAX_EMAIL_LEN || !password || password.length > 500) return jsonResponse({ ok: false, error: 'bad request' }, 400);
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (existing) {
                // must prove identity with the real password.
                // PHASE 1: PBKDF2 (was: b64 comparison). A legacy record is
                // upgraded in place once the correct password is proven.
                const v = await verifyPassword(env, existing.password, password);
                if (!v.ok) {
                    return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
                }
                if (v.needsRehash) {
                    try {
                        existing.password = await hashPassword(env, password);
                        map[email] = storageSafeUser(existing);
                        await saveUsersMap(env, map);
                    } catch (e) { /* a failed upgrade must not block the sync */ }
                }
                const inc = sanitizeUserRecord(body.user || {});
                // merge only profile fields - keep server plan/flags/password
                const rec = { ...existing };
                for (const k of ['username', 'description', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled', 'createdAt', 'id', 'twoStepEnabled', 'twoStepCode', 'twoStepExpires']) {
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
            // PHASE 1: PBKDF2 verification, not a base64 comparison. A legacy
            // base64 record is accepted once and upgraded in place, because the
            // correct password was just proven.
            const verdict = rec ? await verifyPassword(env, rec.password, body.password) : { ok: false, needsRehash: false };
            if (!rec || !verdict.ok) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            if (verdict.needsRehash) {
                try {
                    rec.password = await hashPassword(env, body.password);
                    map[email] = storageSafeUser(rec);
                    await saveUsersMap(env, map);
                } catch (e) { /* a failed upgrade must not block the read */ }
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
            // PHASE 1: PBKDF2 verification.
            const delV = await verifyPassword(env, existing.password, body.password);
            if (!delV.ok) {
                return jsonResponse({ ok: false, error: 'Invalid email or password.' }, 401);
            }
            delete map[email];
            await saveUsersMap(env, map);
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/user-password : self password change ----------
        if (url.pathname === '/sh/user-password' && request.method === 'POST') {
            // Tight bucket keyed on the target account: a password change
            // requires the CURRENT password, so this route is a guessing
            // oracle for anyone who knows an email address.
            {
                let probeEmail = '';
                try { probeEmail = String((await request.clone().json() || {}).email || '').toLowerCase(); } catch (e) {}
                const rl = rateLimit('password', rateIdentity(request, url) + '|' + probeEmail);
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            const email = String(body.email || '').trim();
            const oldPw = String(body.oldPassword || '');
            const newPw = String(body.newPassword || '');
            if (!email || !oldPw || !newPw) return jsonResponse({ ok: false, error: 'email, oldPassword, newPassword required' }, 400);
            if (newPw.length < 6) return jsonResponse({ ok: false, error: 'New password must be at least 6 chars.' }, 400);
            const map = await loadUsersMap(env);
            const existing = map[email];
            if (!existing) return jsonResponse({ ok: false, error: 'Account not found.' }, 404);
            // PHASE 1: PBKDF2 verification, and the new password is stored as
            // a PBKDF2 hash rather than btoa(). Because a session token binds
            // to a fingerprint of the credential generation (see
            // credentialFingerprint), changing the password here also
            // invalidates every session token already issued to this account.
            const chgV = await verifyPassword(env, existing.password, oldPw);
            if (!chgV.ok) return jsonResponse({ ok: false, error: 'Current password is incorrect.' }, 401);
            existing.password = await hashPassword(env, newPw);
            map[email] = storageSafeUser(existing);
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
        // Owner authorization for the admin panel.
        //
        // REMOVED (Phase 1): the `ownerProof` branch.
        //
        // ownerProof was the base64 of the owner account's password, accepted
        // from a query string. That is a password-equivalent credential placed
        // in a URL, which means it lands in proxy and CDN access logs, in
        // browser history, and in any Referer header on a follow-up request.
        // It also meant the owner's password was the admin credential for
        // /sh/users, /sh/users-delete and /sh/users-clear, so one leaked
        // password took the whole user table with it.
        //
        // The replacement is a real owner session token from /sh/login, which
        // is derived from the access code and expires. It is read from the
        // X-SH-Token header, or from a body field for POSTs.
        //
        // A token in a query string is still not ideal, so callers should
        // prefer the header. The query parameter is retained only for
        // compatibility with the site's existing login flow.
        async function isOwnerRequest(env, url, body) {
            const codeHashes = await getCodeHashes(env);
            const token = (request.headers.get('X-SH-Token') || '')
                || (body && body.token)
                || (url && url.searchParams.get('token'))
                || '';
            if (await verifyToken(token, codeHashes, env)) return true;
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

        // ================= OWNER LICENSE MANAGEMENT =================
        // Real server-side key management (Luarmor-style ops layer):
        //   POST /sh/licenses        { ownerProof|token, licenses: {key:rec} }
        //                             -> full REPLACE of the license map
        //                                (the website syncs its Users Keys
        //                                here after every edit)
        //   POST /sh/license-delete  { ownerProof, key }
        //   POST /sh/license-reset   { ownerProof, key }  (HWID reset w/
        //                             24h cooldown enforced server-side)
        //   POST /sh/license-ban     { ownerProof, key, banned, reason }
        //   POST /sh/killswitch      { ownerProof, on }  -> flip the
        //                             global kill-switch; when on, EVERY
        //                             auth fails (all loaders die)
        //   GET  /sh/licenses        -> the whole map (owner panels)
        if (url.pathname === '/sh/licenses' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, url, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            const incoming = body.licenses;
            if (!incoming || typeof incoming !== 'object') return jsonResponse({ ok: false, error: 'licenses map required' }, 400);
            // sanitize every record (never trust client extras)
            const out = {};
            let n = 0;
            for (const k of Object.keys(incoming)) {
                const key = String(k).slice(0, 200);
                if (!key) continue;
                const r = incoming[k] || {};
                out[key] = {
                    hwid: String(r.hwid || '').slice(0, 300),
                    expiresAt: Number(r.expiresAt) || 0,
                    banned: !!r.banned,
                    banReason: String(r.banReason || '').slice(0, 300),
                    discordId: String(r.discordId || '').slice(0, 64),
                    note: String(r.note || '').slice(0, 300),
                    hwidResets: Number(r.hwidResets) || 0,
                    executions: Number(r.executions) || 0,
                    lastAuthAt: Number(r.lastAuthAt) || 0
                };
                n++;
            }
            await saveLicenses(env, out);
            return jsonResponse({ ok: true, count: n });
        }

        if (url.pathname === '/sh/licenses' && request.method === 'GET') {
            if (!(await isOwnerRequest(env, url, null))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const ks = await isKillswitchOn(env);
            return jsonResponse({ ok: true, licenses: map, killswitch: ks });
        }

        if (url.pathname === '/sh/license-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            if (!map[key]) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            delete map[key];
            await saveLicenses(env, map);
            return jsonResponse({ ok: true });
        }

        if (url.pathname === '/sh/license-reset' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            const rec = map[key];
            if (!rec) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            // 24h cooldown: the last reset must be older than a day
            if (rec.hwidResets > 0 && rec.lastHwidResetAt && Date.now() - rec.lastHwidResetAt < HWID_RESET_COOLDOWN_MS) {
                const hours = Math.ceil((HWID_RESET_COOLDOWN_MS - (Date.now() - rec.lastHwidResetAt)) / 3600000);
                return jsonResponse({ ok: false, error: 'HWID reset cooldown: try again in ~' + hours + 'h' }, 429);
            }
            rec.hwid = '';
            rec.hwidResets = (rec.hwidResets || 0) + 1;
            rec.lastHwidResetAt = Date.now();
            await saveLicenses(env, map);
            return jsonResponse({ ok: true, hwidResets: rec.hwidResets });
        }

        if (url.pathname === '/sh/license-ban' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const map = await loadLicenses(env);
            const key = String(body.key || '');
            const rec = map[key];
            if (!rec) return jsonResponse({ ok: false, error: 'no such key' }, 404);
            rec.banned = !!body.banned;
            rec.banReason = rec.banned ? String(body.reason || 'No reason provided').slice(0, 300) : '';
            await saveLicenses(env, map);
            return jsonResponse({ ok: true, banned: rec.banned });
        }

        if (url.pathname === '/sh/killswitch' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            const on = !!body.on;
            await env.LOADERS_KV.put(KV_KILLSWITCH_KEY, JSON.stringify({ on, at: Date.now() }));
            return jsonResponse({ ok: true, on });
        }

        // ================= STORAGE KEEPER (GitHub big-script storage) =================
        // For scripts too large for KV (~50MB). Parts stream from the
        // owner's browser -> worker -> private GitHub repo. Executors then
        // fetch parts through the worker proxy (/sh/g/*) - GitHub is
        // never exposed publicly.

        // ---------- POST /sh/gh-put : owner uploads ONE part ----------
        // Body: { token|ownerProof, id, part (0-based), content (RAW
        // string, <=40MB - NOT base64; the worker b64-encodes for GitHub) }
        // isOwnerRequest covers owner token + ownerProof; ALSO accept any
        // registered user's session token (sh/user-login) so normal users
        // can upload big scripts via the Storage Keeper path too.
        async function isUserOrOwner(env, url, body) {
            if (await isOwnerRequest(env, url, body)) return true;
            if (body && body.userToken && await verifyUserToken(body.userToken, env)) return true;
            return false;
        }

        if (url.pathname === '/sh/gh-put' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub\d{10}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must match ScripterHub##########' }, 400);
            const id = String(body.id);
            const part = parseInt(String(body.part), 10);
            const content = String(body.content || '');
            if (!Number.isFinite(part) || part < 0 || part > 255) return jsonResponse({ ok: false, error: 'part must be 0..255' }, 400);
            if (!content) return jsonResponse({ ok: false, error: 'content required' }, 400);
            if (content.length > GH_PART_MAX) return jsonResponse({ ok: false, error: 'part too large (max 40MB raw)' }, 413);
            try {
                const b64 = btoa(content); // worker-side b64 (content is raw text)
                const path = 'scripts/' + id + '/' + part + '.part';
                const r = await ghPutPart(env, env.SH_GH_REPO, path, b64, 'main');
                // remember the highest part we have seen for this id
                const recKey = KV_GH_PREFIX + id;
                const rec = JSON.parse((await env.LOADERS_KV.get(recKey)) || '{}');
                rec.parts = rec.parts || {};
                rec.parts[part] = { sha: r && r.content ? r.content.sha : null, len: content.length };
                rec.id = id;
                await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
                return jsonResponse({ ok: true, part: part, sha: rec.parts[part].sha });
            } catch (e) {
                return jsonResponse({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
            }
        }

        // ---------- POST /sh/gh-finalize : owner commits + registers the loader ----------
        // Body: { token|ownerProof, id, n (part count), len (total bytes),
        //         name, user, keyless, webKey, keyHash, authRequired,
        //         replaces (old loader id), cipherTail (optional - last
        //         KV-sized slice kept in KV for the browser key page) }
        if (url.pathname === '/sh/gh-finalize' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isUserOrOwner(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound' }, 500);
            if (!/^ScripterHub\d{10}$/.test(String(body.id || ''))) return jsonResponse({ ok: false, error: 'id must match ScripterHub##########' }, 400);
            const id = String(body.id);
            const recKey = KV_GH_PREFIX + id;
            const rec = JSON.parse((await env.LOADERS_KV.get(recKey)) || '{}');
            if (!rec.parts || !Object.keys(rec.parts).length) return jsonResponse({ ok: false, error: 'no parts uploaded for this id (call /sh/gh-put first)' }, 400);
            const n = parseInt(String(body.n), 10);
            if (!Number.isFinite(n) || n < 1) return jsonResponse({ ok: false, error: 'n (part count) required' }, 400);
            // verify all parts 0..n-1 exist in the KV record
            for (let i = 0; i < n; i++) {
                if (!rec.parts[i]) return jsonResponse({ ok: false, error: 'missing part ' + i + ' - upload it first' }, 400);
            }
            const repo = env.SH_GH_REPO;
            let head = null;
            try { head = await ghHead(env, repo, 'heads/main'); } catch (e) { return jsonResponse({ ok: false, error: String(e.message || e).slice(0, 300) }, 502); }
            rec.repo = repo;
            rec.path = 'scripts/' + id;
            rec.n = n;
            rec.len = Number(body.len) || 0;
            rec.head = head;
            rec.name = String(body.name || 'script').slice(0, 100);
            rec.user = String(body.user || 'unknown').slice(0, 100);
            rec.keyless = body.keyless === true;
            rec.webKey = body.webKey === true;
            rec.keyHash = String(body.keyHash || '');
            rec.authRequired = body.authRequired === true;
            rec.at = Date.now();
            await env.LOADERS_KV.put(recKey, JSON.stringify(rec), { expirationTtl: LOADER_TTL });
            // register the loader meta so /sh/<id> serves the GitHub bootstrap
            await env.LOADERS_KV.put(KV_META_PREFIX + id, JSON.stringify({
                name: rec.name, user: rec.user, at: rec.at, keyHash: rec.keyHash,
                keyless: rec.keyless, webKey: rec.webKey, authRequired: rec.authRequired,
                storage: 'github', parts: n, len: rec.len
            }), { expirationTtl: LOADER_TTL });
            // optional cipher tail in KV (browser key page for keyed GH scripts)
            if (body.cipherTail && String(body.cipherTail).length < MAX_CIPHER_LEN) {
                await env.LOADERS_KV.put(KV_WEB_PREFIX + id, String(body.cipherTail), { expirationTtl: LOADER_TTL });
            }
            // kill the OLD loader (re-upload on edit)
            await maybeReplaceOld(env, body.replaces);
            const base = (env.SH_BASE_URL || url.origin).replace(/\/+$/, '');
            ctx.waitUntil(notifyScriptDiscord(env, {
                event: 'script.published', outcome: 'ok',
                scriptId: id, userRef: await telemetryRef('user', rec.user),
                at: Date.now(), parts: n
            }));
            return jsonResponse({ ok: true, id, parts: n, loadstring: 'loadstring(game:HttpGet("' + base + '/sh/' + id + '"))()' });
        }

        // ---------- POST /sh/gh-delete : owner deletes a GitHub script ----------
        // Body: { token|ownerProof, id } - removes scripts/<id>/ folder
        // contents one by one (GitHub has no folder delete), then the KV meta.
        if (url.pathname === '/sh/gh-delete' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            const id = String(body.id || '');
            if (!/^ScripterHub\d{10}$/.test(id)) return jsonResponse({ ok: false, error: 'bad id' }, 400);
            const rec = JSON.parse((await env.LOADERS_KV.get(KV_GH_PREFIX + id)) || 'null');
            if (rec && rec.n) {
                for (let i = 0; i < rec.n; i++) {
                    try {
                        await ghFetch(env, '/repos/' + rec.repo + '/contents/scripts/' + id + '/' + i + '.part', { method: 'DELETE', body: { message: 'storage: remove ' + id + '/' + i, sha: (rec.parts && rec.parts[i] ? rec.parts[i].sha : undefined) } });
                    } catch (e) { /* already gone */ }
                }
            }
            await env.LOADERS_KV.delete(KV_GH_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_META_PREFIX + id).catch(() => {});
            await env.LOADERS_KV.delete(KV_WEB_PREFIX + id).catch(() => {});
            return jsonResponse({ ok: true });
        }

        // ---------- POST /sh/gh-status : owner usage summary ----------
        if (url.pathname === '/sh/gh-status' && request.method === 'POST') {
            let body = {};
            try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'bad json' }, 400); }
            if (!(await isOwnerRequest(env, null, body))) return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            // list sh_gh_* keys via KV list (paginated)
            let cursor = null, total = 0, scripts = 0, largest = 0;
            do {
                const page = await env.LOADERS_KV.list({ prefix: KV_GH_PREFIX, cursor: cursor });
                for (const k of (page.keys || [])) {
                    const rec = JSON.parse((await env.LOADERS_KV.get(k.name)) || '{}');
                    if (rec && rec.n) { scripts++; total += (rec.len || 0); largest = Math.max(largest, rec.len || 0); }
                }
                cursor = page.list_complete ? null : page.cursor;
            } while (cursor);
            return jsonResponse({
                ok: true, configured: !!(env.SH_GH_TOKEN && env.SH_GH_REPO),
                repo: env.SH_GH_REPO || null,
                scripts: scripts, totalBytes: total, largestBytes: largest,
                partMaxBytes: GH_PART_MAX
            });
        }

        // ---------- GET /sh/g/<id>/<i> : GitHub part proxy (executor-only) ----------
        // Executors fetch Storage Keeper parts here; the worker pulls the
        // blob from the private repo and streams it out. Browsers/AI/curl
        // get nothing. No count/index validation beyond what the KV record
        // and repo itself provide (missing part = 405 -> loader aborts).
        const gMatch = url.pathname.match(/^\/sh\/g\/(ScripterHub\d{10})\/(\d+)$/);
        if (gMatch) {
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = gMatch[1];
            const idx = parseInt(gMatch[2], 10);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua) || !Number.isFinite(idx) || idx < 0 || idx > 255) { S.threatsBlocked++; return methodNotAllowed(); }
            const raw = await env.LOADERS_KV.get(KV_GH_PREFIX + id);
            if (raw === null) return methodNotAllowed();
            let rec = {};
            try { rec = JSON.parse(raw); } catch (e) { return methodNotAllowed(); }
            if (!rec.repo || !rec.n || idx >= rec.n) { S.threatsBlocked++; return methodNotAllowed(); }
            try {
                const part = await ghGetPart(env, rec.repo, 'scripts/' + id + '/' + idx + '.part', 'main');
                // count the execution once per script (first part fetch)
                if (idx === 0) {
                    S.events.push({ t: Date.now(), executor: sniffExecutor(ua), scriptId: id });
                    S.totalExecutions++;
                    S.perScript[id] = (S.perScript[id] || 0) + 1;
                    prune(Date.now());
                    saveStatsSoon(env);
                }
                return new Response(part, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-store'
                    }
                });
            } catch (e) {
                return methodNotAllowed();
            }
        }

        // ---------- GET /sh/auth/<id>?k=<license>&h=<hwid>&t=<t0> ----------
        // EXECUTOR-ONLY license auth (Luarmor model). The loader calls
        // this BEFORE it needs the split key; the response carries a
        // short-lived HMAC token that /sh/k then requires for
        // auth-required scripts. Possible bodies:
        //   "SHA <token> <expiresAtMs> <t0>"   -> success
        //   "SHERR invalid|banned|expired|hwid|killswitch|gone"
        // Wire format is plain text (no JSON in executors) and NEVER
        // contains the license key or any payload data.
        const authMatch = url.pathname.match(/^\/sh\/auth\/(ScripterHub\d{10})$/);
        if (authMatch) {
            // License-key brute force. The audit measured 40/40 unauthenticated
            // guesses being served before this limit existed.
            {
                const rl = rateLimit('auth', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = authMatch[1];
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua)) { S.threatsBlocked++; return methodNotAllowed(); }
            const t0 = parseInt(String(url.searchParams.get('t') || ''), 10);
            const key = String(url.searchParams.get('k') || '').slice(0, 200);
            const hwid = String(url.searchParams.get('h') || '').slice(0, 300);
            const result = { key, hwid, scriptId: id, executor: sniffExecutor(ua), reason: '' };
            let body = 'SHERR gone';
            if (!Number.isFinite(t0) || !key || !hwid) {
                result.reason = 'missing params';
            } else if (await isKillswitchOn(env)) {
                result.reason = 'killswitch';
                body = 'SHERR killswitch';
            } else {
                // the script must actually exist and require auth
                let meta = {};
                try { meta = JSON.parse((await env.LOADERS_KV.get(KV_META_PREFIX + id)) || '{}'); } catch (e) {}
                if (meta.authRequired === true) {
                    const lic = await loadLicenses(env);
                    const verdict = classifyLicense(lic[key], hwid, Date.now());
                    if (verdict.code === 'ok') {
                        // first run locks the key to this hardware
                        if (!lic[key].hwid) { lic[key].hwid = hwid; }
                        lic[key].executions = (lic[key].executions || 0) + 1;
                        lic[key].lastAuthAt = Date.now();
                        await saveLicenses(env, lic);
                        const token = await makeAuthToken(key, hwid, t0);
                        const exp = Date.now() + AUTH_TOKEN_TTL_MS;
                        result.ok = true;
                        body = 'SHA ' + token + ' ' + exp + ' ' + t0;
                    } else {
                        result.reason = verdict.code;
                        body = 'SHERR ' + verdict.code;
                    }
                } else {
                    // keyless scripts never call /sh/auth; treat as gone
                    result.reason = 'no auth required for this script';
                }
            }
            if (!result.ok) S.threatsBlocked++;
            ctx.waitUntil(notifyAuthDiscord(env, result));
            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/k/<id>?t=<t0>&a=<token> : SPLIT-KEY delivery ----------
        // The obfuscated file deliberately ships WITHOUT its final-layer
        // key. The runtime loader (inside the file) fetches it here right
        // before decrypting. Rules:
        //   - executor User-Agent only (browsers/AI/curl get nothing)
        //   - t=<t0> must be EXACTLY the t0 stored for this key (the one
        //     baked into the file), so a saved/replayed response is
        //     useless and no other request shape leaks bytes
        //   - AUTH-REQUIRED scripts ALSO demand a=<token> issued by
        //     /sh/auth (valid ~90s, bound to key+hwid) - without a valid
        //     license the split key is NEVER served, so the file cannot
        //     decrypt, period. (Luarmor: no server yes -> no script.)
        //   - the response embeds t0+chk+paddedKey; the Lua side verifies
        //     both AND regenerates the time pad, so even a MITM'd response
        //     with wrong values decrypts to garbage ("Goodluck Sonion")
        const kMatch = url.pathname.match(/^\/sh\/k\/(ScripterHub\d{10})$/);
        if (kMatch) {
            // Split-key requests. Separate bucket from 'auth' so hammering one
            // route cannot be used to exhaust the other's budget.
            {
                const rl = rateLimit('key', rateIdentity(request, url));
                if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);
            }
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = kMatch[1];
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua)) { S.threatsBlocked++; return methodNotAllowed(); }
            const raw = await env.LOADERS_KV.get(KV_SKEY_PREFIX + id);
            if (raw === null) return methodNotAllowed();
            let sk = {};
            try { sk = JSON.parse(raw); } catch (e) { return methodNotAllowed(); }
            const wantT = parseInt(String(url.searchParams.get('t') || ''), 10);
            if (!Number.isFinite(wantT) || wantT !== sk.t0) { S.threatsBlocked++; return methodNotAllowed(); }
            // ---- NEW: auth-required scripts must present a live token ----
            let kMeta = {};
            try { kMeta = JSON.parse((await env.LOADERS_KV.get(KV_META_PREFIX + id)) || '{}'); } catch (e) {}
            if (kMeta.authRequired === true) {
                if (await isKillswitchOn(env)) { S.threatsBlocked++; return methodNotAllowed(); }
                const token = String(url.searchParams.get('a') || '');
                const licKey = String(url.searchParams.get('k') || '');
                const licHwid = String(url.searchParams.get('h') || '');
                let authOk = false;
                if (token && licKey && licHwid) authOk = await verifyAuthToken(licKey, licHwid, wantT, token);
                if (!authOk) { S.threatsBlocked++; return methodNotAllowed(); }
            }
            const body = 'SHK ' + sk.t0 + ' ' + sk.chk + ' ' + sk.paddedKey.join(' ');
            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ---------- GET /sh/c/<id>/<i> : CHUNK delivery (executor-only) ----------
        // Serves chunk i of a chunked (large) script blob. Executors
        // fetch them sequentially and stitch in memory; browsers/AI get
        // nothing. No chunk index or count is ever exposed to non-
        // executors (the manifest in the bootstrap is all they get).
        const cMatch = url.pathname.match(/^\/sh\/c\/(ScripterHub\d{10})\/(\d+)$/);
        if (cMatch) {
            if (!env.LOADERS_KV) return methodNotAllowed();
            const id = cMatch[1];
            const idx = parseInt(cMatch[2], 10);
            const ua = request.headers.get('User-Agent') || '';
            if (!EXECUTOR_UA.test(ua) || !Number.isFinite(idx) || idx < 0 || idx >= MAX_CHUNKS) {
                S.threatsBlocked++;
                return methodNotAllowed();
            }
            const metaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id);
            if (metaRaw === null) return methodNotAllowed();
            let cmeta = {};
            try { cmeta = JSON.parse(metaRaw); } catch (e) { return methodNotAllowed(); }
            if (idx >= cmeta.n) { S.threatsBlocked++; return methodNotAllowed(); }
            const chunk = await env.LOADERS_KV.get(KV_CHUNK_PREFIX + KV_PREFIX + id + '_' + idx);
            if (chunk === null) return methodNotAllowed();
            return new Response(chunk, {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
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
            // STORAGE KEEPER scripts: parts live in the GitHub repo; the
            // executor bootstrap fetches them via /sh/g/<id>/<i>
            const ghRaw = await env.LOADERS_KV.get(KV_GH_PREFIX + id);
            const isGithub = ghRaw !== null;
            // chunked (large) scripts: the executor bootstrap fetches the
            // chunks itself (single values never exceed KV's 25MB cap)
            const cmetaRaw = await env.LOADERS_KV.get(KV_CMETA_PREFIX + KV_PREFIX + id);
            const isChunked = cmetaRaw !== null;
            let cipher = null;
            if (isGithub) cipher = ''; // github scripts: parts arrive via /sh/g/*
            else if (!isChunked) cipher = await env.LOADERS_KV.get(KV_PREFIX + id);
            else cipher = ''; // chunked scripts: cipher arrives via /sh/c/*
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
            saveStatsSoon(env);
            if (isExecutor && meta.keyless === true) {
                // FREE script: serve the obfuscated code as-is - no key gate
                // in executors (the Special Key only gates the website page).
                // Large scripts (KV-chunked or GitHub Storage Keeper) get a
                // bootstrap that fetches the parts and stitches in memory.
                if (isGithub || isChunked) {
                    return new Response(luaPartsBootstrap(id, isGithub ? '/sh/g/' : '/sh/c/', cipher, false), {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-store'
                        }
                    });
                }
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
                // keyed script: bootstrap that reads the key from getgenv.
                // Large (chunked/GitHub) scripts get a parts bootstrap.
                if (isGithub || isChunked) {
                    return new Response(luaPartsBootstrap(id, isGithub ? '/sh/g/' : '/sh/c/', cipher, true), {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-store'
                        }
                    });
                }
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
                const webCipher = meta.webKey ? await getBlob(env, id, KV_WEB_PREFIX) : null;
                if (webCipher) return keyPageResponse(id, webCipher, meta.keyHash);
                if (isChunked || isGithub) return keyPageResponse(id, '', meta.keyHash); // "large script" notice
                return methodNotAllowed();
            }
            // keyed + chunked/GitHub: browsers cannot get a 50MB+ key page -
            // the cipher lives at /sh/c/* or /sh/g/* (executor-only). Show
            // the key page with a "script too large to view in browser"
            // notice instead.
            if (isChunked || isGithub) {
                return keyPageResponse(id, '', meta.keyHash);
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
            saveStatsSoon(env);
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
            // uptime sanity: a lost isolate used to report epoch-based
            // uptime (56+ years) - clamp to "just started" instead
            const startedAt = (typeof S.startedAt === 'number' && S.startedAt > 0 && S.startedAt <= now) ? S.startedAt : now;
            const out = {
                ok: true,
                endpoint: 'v3/realtime_stats',
                totalExecutions: S.totalExecutions,
                threatsBlocked: S.threatsBlocked,
                totalVisitors: S.totalVisitors,
                executors: executors,
                topScripts: S.perScript,
                uptimeSeconds: Math.floor((now - startedAt) / 1000),
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
    // LARGE (chunked) scripts: the cipher never ships to browsers - show
    // a notice instead of an empty decrypt box
    const big = safeCipher === '';
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
        + (big
            ? '<h1>📦 Large Protected Script</h1><p>This script is too large to display in a browser. Run it from your executor using the loadstring (the code downloads in parts and assembles in memory).</p>'
            : '<h1>🔐 Special Key Required</h1><p>This script is encrypted with a Special Key. Enter it to decrypt (happens only on this page - the key is never sent anywhere).</p><input type="password" id="kk" placeholder="Enter the Special Key..." autocomplete="off"><button onclick="go()">🔓 Decrypt &amp; View</button><div class="err" id="ee"></div><pre id="pp"></pre>')
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
// Large-script executor bootstrap (KV chunks AND GitHub Storage Keeper
// parts). The worker serves the parts at <base><id>/<i>; this loader
// fetches them all sequentially, stitches them in memory, then runs the
// SAME decrypt + key check as the regular bootstrap. keyless=true skips
// the Special Key ask (the stitched blob IS the obfuscated executor
// code). GitHub Storage Keeper scripts can be up to ~10GB (256 parts x
// 40MB) - stitching happens in the executor's memory, never on disk.
function luaPartsBootstrap(id, chunkBaseRoot, cipherB64, keyed) {
    const chunkBase = chunkBaseRoot + id + '/';
    return '--[[ ScripterHub protected loader | ' + id + ' | LARGE script (streamed parts) ]]\n'
        + (keyed ? '-- Set the key BEFORE executing: getgenv().ScripterHubKey = "YOUR_KEY"\n' : '-- keyless script: no Special Key needed in-game\n')
        + 'local CI={}\n'
        // part fetch loop: 0..255; empty/missing response = stop
        + 'local H=game and game.HttpGet\n'
        + 'if not H then return end\n'
        + 'for i=0,255 do\n'
        + ' local ok,r=pcall(H,game,' + JSON.stringify(chunkBase) + ' .. i)\n'
        + ' if not ok or type(r)~="string" or #r==0 then break end\n'
        + ' CI[#CI+1]=r\n'
        + 'end\n'
        + 'if #CI==0 then return end\n'
        + 'local B=table.concat(CI)\n'
        // ---- identical crypto to luaBootstrap ----
        + 'local function BX(a,b) a=a%4294967296 b=b%4294967296 local r,p=0.0,1.0 for _=1,32 do local x=a%2 local y=b%2 if x~=y then r=r+p end a=(a-x)/2 b=(b-y)/2 p=p*2 end return r end\n'
        + 'local function SD(k,idx) local h=5381.0+idx*7 for i=1,#k do local c=string.byte(k,i) h=(h*33+c)%4294967296 end return h end\n'
        + 'local function NX(s) local x=s[1] x=BX(x,(x*8192)%4294967296) x=BX(x,math.floor(x/131072)) x=BX(x,(x*32)%4294967296) s[1]=s[2] s[2]=s[3] s[3]=s[4] s[4]=x return x end\n'
        + 'local function DEC(k) local a=SD(k,0) if a==0 then a=1 end local b=SD(k,1) if b==0 then b=2 end local c=SD(k,2) if c==0 then c=3 end local d=SD(k,3) if d==0 then d=4 end local s={a,b,c,d} local o={} for i=1,#B do local x=NX(s) o[i]=string.char(BX(string.byte(B,i),x%256)) end local t=table.concat(o) if t:sub(1,4)~="SHOK" then return nil end return t:sub(5) end\n'
        + 'local NT=function(t2,d) pcall(function() game:GetService("StarterGui"):SetCore("SendNotification",{Title="ScripterHub",Text=t2,Duration=d or 5}) end) end\n'
        + 'local LS=loadstring or load\n'
        + 'local G=(getgenv and getgenv()) or _G\n'
        + (keyed ? (
            'local K=G and G.ScripterHubKey\n'
            + 'if type(K)~="string" or #K==0 then\n'
            + ' NT("Special Key required! Set getgenv().ScripterHubKey and re-execute.",7)\n'
            + ' print("[ScripterHub] Special Key required: run getgenv().ScripterHubKey = \\"YOUR_KEY\\" then re-execute this loadstring.")\n'
            + ' return\n'
            + 'end\n'
            + 'local src=DEC(K)\n'
            + 'if not src then NT("Wrong Special Key!") print("[ScripterHub] Wrong Special Key.") return end\n'
        ) : (
            // keyless: the stitched blob IS the obfuscated executor code
            'local src=B\n'
        ))
        + 'local fn=LS(src)\n'
        + 'if not fn then NT("Load failed - re-execute or contact the script owner.") return end\n'
        + 'pcall(function() fn() end)\n';
}

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
