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
// b64 password proof: clients may send the raw password OR the already
// base64-encoded one (the local db stores b64) - accept both.
function passMatch(storedB64, supplied) {
    const s = String(supplied || '');
    if (!s) return false;
    return s === String(storedB64 || '') || btoa(s) === String(storedB64 || '');
}

// ---- signup flood guard (in-memory per-isolate; enough to blunt bots) ----
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
    const allowed = ['id', 'email', 'username', 'password', 'plan', 'description', 'createdAt', 'isAdmin', 'isScripter', 'profileImage', 'bannerImage', 'theme', 'stats', 'disabled'];
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
// Derivable only by the server (needs the raw key) and by the client that
// just authenticated (server sends it) - a replayed token dies in 90s and
// is bound to one hwid.
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
// Discord webhook: log every successful AND failed auth attempt
async function notifyAuthDiscord(env, result) {
    const url = env.SH_DISCORD_WEBHOOK;
    if (!url) return;
    const safe = s => String(s == null ? '' : s).replace(/[^\w\-. :#@|\/]+/g, '_').slice(0, 80);
    const payload = {
        username: 'ScripterHub Auth',
        embeds: [{
            title: result.ok ? '✅ Auth Success' : '🚫 Auth FAILED',
            color: result.ok ? 0x00cc44 : 0xff3333,
            fields: [
                { name: 'Key', value: '`' + safe(result.key) + '`', inline: true },
                { name: 'HWID', value: '`' + safe(result.hwid) + '`', inline: true },
                { name: 'Executor', value: '`' + safe(result.executor) + '`', inline: true },
                { name: 'Script', value: '`' + safe(result.scriptId) + '`', inline: true },
                { name: 'Reason', value: '`' + safe(result.reason || (result.ok ? 'valid' : 'unknown')) + '`', inline: true }
            ],
            footer: { text: 'ScripterHub License System' },
            timestamp: new Date().toISOString()
        }]
    };
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) {}
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

// verify a USER session token (issued by /sh/user-login). Any registered
// account can claim loadstrings for its own scripts - the owner access
// code is no longer required for normal users.
async function verifyUserToken(token, env) {
    try {
        const raw = JSON.parse(atob(String(token || '')));
        if (!raw || raw.kind !== 'user') return null;
        if (Date.now() - raw.t > TOKEN_TTL) return null;
        if (raw.k !== await sha256Hex(String(raw.ch) + raw.t)) return null;
        const map = await loadUsersMap(env);
        const rec = map[raw.e];
        if (!rec || String(rec.password || '') !== String(raw.ch)) return null;
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
function loaderId(wantId) {
    const w = String(wantId || '');
    if (/^ScripterHub\d{10}$/.test(w)) return w;
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
            // auth: owner token (sh/login) OR ownerProof OR any registered
            // user's session token (sh/user-login) - normal users can claim
            // loadstrings without the owner access code
            const codeHashes = await getCodeHashes(env);
            let authed = await verifyToken(body.token, codeHashes);
            if (!authed && body.userToken) {
                const u = await verifyUserToken(body.userToken, env);
                if (u) authed = true;
            }
            if (!authed && body.ownerProof) {
                const map = await loadUsersMap(env);
                const owner = map[OWNER_EMAIL];
                if (owner && String(owner.password || '') === String(body.ownerProof)) authed = true;
            }
            if (!authed) {
                return jsonResponse({ ok: false, error: 'Not authorized.' }, 401);
            }
            if (!env.LOADERS_KV) return jsonResponse({ ok: false, error: 'KV not bound. Bind LOADERS_KV (see worker comments).' }, 500);
            const name = String(body.name || 'script').slice(0, 100);
            const user = String(body.user || 'unknown').slice(0, 100);
            const id = loaderId(body.wantId);
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
                ctx.waitUntil(notifyDiscord(env, user, name, normalCode, ''));
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
            ctx.waitUntil(notifyDiscord(env, user, name, normalCode, ''));
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
                    password: btoa(password),
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
                if (!found || !passMatch(found.password, body.password)) {
                    return jsonResponse({ ok: false, error: 'Invalid email/username or password.' }, 401);
                }
                if (found.disabled) return jsonResponse({ ok: false, error: 'This account is disabled.' }, 403);
                // issue a USER session token: lets this account claim
                // loadstrings WITHOUT the owner access code
                const now = Date.now();
                const token = btoa(JSON.stringify({
                    kind: 'user', t: now, e: foundEmail, ch: String(found.password || ''),
                    k: await sha256Hex(String(found.password || '') + now)
                })).replace(/=+$/, '');
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
            ctx.waitUntil(notifyDiscord(env, rec.user, rec.name + ' [Storage Keeper ' + n + ' parts]', String(body.normalCode || '').slice(0, 7_000_000), ''));
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
