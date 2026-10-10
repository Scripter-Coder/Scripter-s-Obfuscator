// ============ STATE ============
import { applyCustomObfuscator, buildWrappedPayload } from './custom-obfuscator.js';
import { vmSetLuaparse } from './vm-pass.js';
import { vmBCSetLuaparse } from './vm-bytecode.js';
import { initRewards, renderRewardsTab, openCreateRewardUI } from './rewards.js';
import { shEncryptPayload } from './sh-crypto.js';

// VM pass needs a Lua parser. index.html loads vendor/luaparse.js (UMD)
// as a plain script BEFORE this module, which sets window.luaparse -
// works both for the raw source deploy and inside the vite bundle.
vmSetLuaparse(window.luaparse);
vmBCSetLuaparse(window.luaparse);

let currentUser = null;
let isLoggedIn = false;
let users = {};
let selectedUserEmail = null;
let currentProject = null;
let currentScript = null;
let editingScript = null;

// ============ OWNER KEY ============
const OWNER_KEY = 'my_super_secret_key_2024_scripter';

// ============ BLOCKED WORDS ============
// Usernames/emails containing any of these are rejected at signup
// (bot-raid flood patterns). Keep lowercase; add more words here anytime.
const SH_BLOCKED_WORDS = ['raid', 'fuck', 'nigg', 'n1gg', 'scripter 0.'];

// Base path helper: works for root domains (username.github.io),
// repo subfolders (username.github.io/repo/) and local hosting.
function getBasePath() {
    var path = window.location.pathname;
    var lastSlash = path.lastIndexOf('/');
    var dir = path.substring(0, lastSlash + 1);
    return window.location.origin + dir;
}

// ============ PLAN CONFIGURATIONS ============
const PLAN_CONFIGS = {
    // fileSize is in MB. Infinity means unlimited.
    //
    // PLAN NAMES MUST NOT BE RENAMED. Every user record stores `plan` as a
    // string, and an unknown name silently falls back to Basic's limits - so
    // renaming a plan quietly downgrades everyone on it. New plans may be
    // ADDED; existing keys are permanent.
    'Basic': { fileSize: 1, keys: 1000, projects: 20, scripts: 20, visitors: 10000, checkpoints: 10, price: 0, label: 'Basic' },
    'Premium': { fileSize: 5, keys: 5000, projects: 20, scripts: 30, visitors: 16000, checkpoints: 15, price: 5, label: 'Premium' },
    'Advanced': { fileSize: 10, keys: 10000, projects: 20, scripts: 40, visitors: 25000, checkpoints: 20, price: 10, label: 'Advanced' },
    'Pro': { fileSize: 100, keys: 100000, projects: 50, scripts: 200, visitors: 50000, checkpoints: 10, price: 30, label: 'Pro' },
    'God': { fileSize: 1024, keys: Infinity, projects: 200, scripts: 500, visitors: Infinity, checkpoints: 100, price: 50, label: 'God' },
    'Ultimate': { fileSize: 10240, keys: Infinity, projects: 500, scripts: 1000, visitors: Infinity, checkpoints: Infinity, price: 70, label: 'Ultimate' },
    'Enterprise': { fileSize: 102400, keys: Infinity, projects: 1000, scripts: 5000, visitors: Infinity, checkpoints: Infinity, price: 100, label: 'Enterprise' },
    'Custom': { fileSize: Infinity, keys: Infinity, projects: Infinity, scripts: Infinity, visitors: Infinity, checkpoints: Infinity, price: 'Custom', label: 'Custom' }
};
// expose module-scope values for other modules (rewards.js) and inline handlers
window.PLAN_CONFIGS = PLAN_CONFIGS;
window.showNotification = showNotification;

// ============ CLOUDFLARE WORKER STATS ENDPOINT ============
// Deploy "For Cloudflare/worker.js" (see that folder's README), then paste your
// worker URL here. Example: 'https://scripterhub-stats.yourname.workers.dev'
// How long an owner call is given before it is called a failure.
//
// There was no limit at all, and a bare await fetch with no timeout is how "Refreshing..."
// becomes an infinite spinner with no error and no way to tell a slow call from a
// broken one. Measured on the live worker, warm: /sh/health 367ms, /sh/user-login 2147ms,
// /sh/user-sync 6035ms. So 45s is roughly seven times the slowest healthy call -
// generous enough never to fire on a good day, short enough that nobody is left
// wondering whether it is still working.
const SH_OWNER_TIMEOUT_MS = 45000;

const SH_STATS_ENDPOINT = 'https://scripterhub-stats.dubovikstanislav51.workers.dev/';
// The largest base64 image payload the site will store or sync.
//
// Cloudflare KV rejects a value past roughly 2MB, and an image over the cap is
// DROPPED from the sync rather than failing loudly - the local copy keeps working,
// so the user sees a background that saved and then quietly vanished on the next
// device. Checking the size where the omission is at least visible beats finding
// it out later.
//
// This used to be declared as `var SH_IMAGE_CAP = 1900000;` INSIDE shPushUser.
// `var` is function-scoped, so uploadCustomBackground - which needs the same limit
// and sits thousands of lines away - resolved the name to nothing at all and threw
//
//     ReferenceError: SH_IMAGE_CAP is not defined
//
// which rejected the promise chain one line before the save, so the background
// painted, compression succeeded, and the result was thrown away. The user saw
// "Failed to save background: SH_IMAGE_CAP is not defined" and a background that
// vanished on reload. Stacked on top of the dead button, the feature had two
// independent faults and fixing either one changed nothing observable.
//
// One constant, read by every user. A limit that lives inside whichever function
// happens to use it most is a limit that drifts.
const SH_IMAGE_CAP = 1900000;

window.SH_STATS_ENDPOINT = SH_STATS_ENDPOINT;

// ============ HIDDEN RAW PAGE (Loadstring Creator) ============
// Secret page: raw.html?auth=1 — gated by the owner access code.
// The default code is "ScripterHub" (set in the worker). An optional extra
// code can be added via /sh/setcode. It is kept ONLY in sessionStorage
// (this tab, until closed) and sent over HTTPS — the worker stores just
// its SHA-256. Login grants permission to claim loadstrings; it does NOT
// expose scripts (loader links return "Method Not Allowed" in browsers).
const SH_CODE_STORAGE_KEY = 'sh_raw_code';
function shGetRawToken() {
    try { return sessionStorage.getItem('sh_raw_token'); } catch (e) { return null; }
}
// ask the owner for the access code (once per session; cached in sessionStorage)
// ONE modal, ever. A second caller joins the first caller's promise.
//
// Each concurrent caller used to build its own overlay, because the code is
// only cached on Save - so two un-awaited cloud refreshes (opening Users and
// Admin, or either plus Refresh) both found sessionStorage empty and both
// appended a z-index:4000 modal. With sessionStorage unavailable it re-opened
// on every call, forever.
var __shCodePrompt = null;
function shAskForCode() {
    if (__shCodePrompt) return __shCodePrompt;
    var existing = null;
    try { existing = sessionStorage.getItem(SH_CODE_STORAGE_KEY); } catch (e) {}
    if (existing) return Promise.resolve(existing);
    __shCodePrompt = new Promise(function(resolve) {
        var overlay = document.createElement('div');
        shRegisterModal('shCode', overlay);
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '4000';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 520px; padding: 28px; max-height:90vh; overflow-y:auto;">
                <h2 style="font-size:20px; margin:0 0 8px;">🔐 Loadstring Access Code</h2>
                <p style="color:#8888aa; font-size:12px; margin:0 0 14px;">Paste your access code once (this browser tab remembers it until you close it). It is the code set on the hidden raw page. Note: this only lets you claim loadstrings — scripts stay hidden and raw links show "Method Not Allowed" in browsers.</p>
                <textarea id="shCodeInput" placeholder="ScripterHub" spellcheck="false" style="width:100%; min-height:110px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; padding:12px; font-size:12px; font-family:monospace; resize:vertical; box-sizing:border-box;"></textarea>
                <div style="display:flex; gap:10px; margin-top:14px;">
                    <button id="shCodeSaveBtn" class="btn btn-primary" style="flex:1; padding:10px;">Save for this session</button>
                    <button id="shCodeCancelBtn" class="btn btn-close-dropdown" style="flex:1; padding:10px;">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#shCodeSaveBtn').onclick = function() {
            var val = overlay.querySelector('#shCodeInput').value;
            if (!val.trim()) return;
            try { sessionStorage.setItem(SH_CODE_STORAGE_KEY, val); } catch (e) {}
            overlay.remove();
            __shCodePrompt = null;
            resolve(val);
        };
        overlay.querySelector('#shCodeCancelBtn').onclick = function() {
            overlay.remove();
            __shCodePrompt = null;
            resolve(null);
        };
    });
}
// Forget any cached owner access code and ask again.
//
// The automatic recovery on a rejected code is the real fix, but it only helps
// if a prompt is reachable at all. A stale code in sessionStorage - rotated since
// it was set, or mistyped in a tab that has since been forgotten - would
// otherwise leave the owner with no visible way to correct it.
// The Host Announcement feature is gone. Its saved preview is dropped once, so a
// browser that previewed a banner is not left holding a value that nothing reads.
try { localStorage.removeItem('sh_announce_preview'); } catch (e) {}

function shForgetOwnerCode() {
    try {
        sessionStorage.removeItem(SH_CODE_STORAGE_KEY);
        sessionStorage.removeItem('sh_raw_token');
    } catch (e) {}
    shCloseModal('shCode');
    showNotification('Code cleared', 'You will be asked for the owner access code again.', 'info', 4000);
    shLoginRaw();
}

async function shLoginRaw() {
    try {
        const code = await shAskForCode();
        if (!code) return false;
        const res = await fetch(SH_STATS_ENDPOINT + 'sh/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });
        const d = await res.json();
        if (d.ok) {
            try { sessionStorage.setItem('sh_raw_token', d.token); } catch (e) {}
            return true;
        }
        // The server refused this code.
        //
        // It used to be kept and silently reused, so shAskForCode() kept
        // short-circuiting on the cached value, the prompt NEVER appeared again,
        // and the only symptom was "Owner sign-in required". There was no way out
        // short of devtools or a new tab.
        //
        // Cleared here so the prompt can come back. Once - clearing and re-prompting
        // on every attempt would make a wrong code unescapable.
        try { sessionStorage.removeItem(SH_CODE_STORAGE_KEY); } catch (e) {}
        return false;
    } catch (e) {
        return false;
    }
}

// ---- STORAGE KEEPER (GitHub) big-script upload ----
// For obfuscated scripts > ~45MB (KV ceiling). Slices the code into
// 40MB parts, streams each to the worker (which forwards them to the
// private GitHub storage repo), then finalizes. Executors later fetch
// the parts through the worker proxy (/sh/g/*) - GitHub never exposed.
// Hard ceiling: 256 parts x 40MB = ~10GB per script (repo-size guidance
// keeps total usage under ~10GB too).
// A SCRIPT ID IS 10 RANDOM DIGITS, NOT A TIMESTAMP.
//
// It used to be String(Date.now()).slice(-10) - a clock reading, strictly
// increasing, and computable by anyone for any moment they choose. The
// session gate is only as strong as the id space behind it, and a gate in
// front of a guessable door is a gate in front of an open door: with
// timestamp ids an attacker finds a new script within about one request of
// it being published, and a poller that records every id which succeeds ends
// up with a permanent timestamped index of every script ever published. The
// rate limit caps the rate; it cannot un-record what was recorded.
//
// The SHAPE is unchanged - still ScripterHub plus exactly ten digits - so
// every /^ScripterHub[0-9]{6,16}$/ in the worker keeps matching and every id
// already published keeps working. No migration.
//
// Entropy is 10^10, about 33 bits: roughly 5.8 years of guessing at the
// session bucket's 30 per minute, for one script, with no rolling-window
// shortcut. Not 256 bits - widening the shape touches seventeen regexes and
// is a separate change, deliberately not bundled with this one.
//
// crypto.getRandomValues, not Math.random: this must not be predictable from
// observation, and Math.random is not a CSPRNG.
function shNewScriptId() {
    const b = new Uint8Array(8);
    (globalThis.crypto || window.crypto).getRandomValues(b);
    // 8 bytes -> 10 decimal digits via BigInt, so all 10 digits are random
    // rather than a timestamp with noise on the end.
    let v = 0n;
    for (let i = 0; i < b.length; i++) v = (v << 8n) | BigInt(b[i]);
    const digits = (v % 10000000000n).toString().padStart(10, '0');
    return 'ScripterHub' + digits;
}

// Split-key is for PAID builds only. Returns the serverKey options to
// merge in, or an empty object for a keyless one.
//
// A split key keeps a paid script's last layer out of the file; the worker
// hands it over at runtime. A keyless script has no license to gate, so a
// split key there is pure friction - and actively broken, because the SHL
// delivery never carries a key line and the payload's own /sh/k fallback
// needs a live session it does not have. The user saw exactly that:
//
//     [ScripterHub] Key response too short
//     VERDICT: the delivered source COMPILES on this executor
//
// A plain function so tools/keyless_artifact_test.mjs can lift it out of
// this file and assert the decision, instead of only asserting that the
// obfuscator behaves when handed the right options.
function shServerKeyOpts(keyless, wantId) {
    if (keyless) return {};
    return { serverKey: { keyUrl: SH_STATS_ENDPOINT + 'sh/k', scriptRef: wantId } };
}

const SH_KEEPER_PART_SIZE = 40 * 1024 * 1024;
async function shUploadKeeper(o) {
    try {
        const id = shNewScriptId();
        const n = Math.ceil(o.obfCode.length / SH_KEEPER_PART_SIZE);
        if (n > 256) return { ok: false, error: 'script exceeds 10 GB (256 parts). Split it.' };
        // 1) upload parts sequentially (progress via console + optional callback)
        for (let i = 0; i < n; i++) {
            const part = o.obfCode.slice(i * SH_KEEPER_PART_SIZE, (i + 1) * SH_KEEPER_PART_SIZE);
            const res = await fetch(SH_STATS_ENDPOINT + 'sh/kb-put', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: o.token, userToken: o.userToken, id: id, part: i, content: part })
            });
            const d = await res.json();
            if (!d.ok) return { ok: false, error: 'Storage Keeper part ' + (i + 1) + '/' + n + ' failed: ' + (d.error || 'unknown') };
            try { console.log('[Storage Keeper] part ' + (i + 1) + '/' + n + ' uploaded'); } catch (e) {}
            if (typeof window.__shGhProgress === 'function') { try { window.__shGhProgress(i + 1, n); } catch (e) {} }
        }
        // 2) finalize: register loader meta + optional web-view cipher tail
        const fres = await fetch(SH_STATS_ENDPOINT + 'sh/kb-finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: o.token, userToken: o.userToken, id: id, n: n, len: o.obfCode.length,
                name: o.name, user: o.user,
                keyless: !!o.keyless, webKey: !!o.cipher, keyHash: o.keyHash || '',
                authRequired: !!o.requireAuth,
                replaces: o.replaces || '',
                normalCode: (o.normalCode && o.normalCode.length < 7 * 1024 * 1024) ? o.normalCode : ''
            })
        });
        const fd = await fres.json();
        if (!fd.ok) return { ok: false, error: 'Storage Keeper finalize failed: ' + (fd.error || 'unknown') };
        return { ok: true, id: fd.id, loadstring: fd.loadstring, storage: 'keeper', parts: n };
    } catch (e) {
        return { ok: false, error: 'Storage Keeper upload failed: ' + (e && e.message ? e.message : 'network') };
    }
}

// ============ USER SESSION TOKEN (worker /sh/user-login) ============
// Lets ANY registered account claim loadstrings without the owner access
// code. Cached in sessionStorage for 12h. Falls back to the owner flow
// (sh/login raw code) only if the user login is unavailable.
// Session storage first (dies with the tab), then local storage (survives it).
// See the note at the top of this block for why the second store is not a new
// exposure: the base64 of this same password is already in localStorage.
function shGetUserToken() {
    try { var s = sessionStorage.getItem('sh_user_token'); if (s) return s; } catch (e) {}
    try { return localStorage.getItem('sh_user_token'); } catch (e) { return null; }
}

// The ONE place a session token is written. Everything else reads it.
function shSaveUserToken(tok) {
    if (!tok) return "";
    try { sessionStorage.setItem('sh_user_token', tok); } catch (e) {}
    try { localStorage.setItem('sh_user_token', tok); } catch (e) {}
    return tok;
}

// Mint a session token from a password the user just typed.
//
// Called ONLY from the login and signup handlers, because that is the only place
// the raw password exists. Reconstructing it later is not possible: the local
// record holds btoa(password), which the worker will not accept for an account
// whose hash has been migrated to PBKDF2.

// Signing out must revoke the credential client-side. Without this, logout()
// only changed the UI: shGetUserToken() kept returning the previous account's
// session, so the next person to sign in on a shared browser inherited it.
function shClearUserToken() {
    try { sessionStorage.removeItem('sh_user_token'); } catch (e) {}
    try { localStorage.removeItem('sh_user_token'); } catch (e) {}
}
async function shMintUserToken(emailOrUsername, rawPassword) {
    if (!emailOrUsername || !rawPassword) return null;
    async function attempt() {
        try {
            var d = await shApi('sh/user-login', { emailOrUsername: emailOrUsername, password: rawPassword });
            if (d && d.ok && d.token) return shSaveUserToken(d.token);
        } catch (e) {}
        return null;
    }
    var tok = await attempt();
    if (tok) return tok;
    // KV is eventually consistent. A signup that /sh/user-signup has already
    // confirmed can still be invisible to /sh/user-login for a moment, so one
    // retry. Without it a new account silently ends up with no session, and the
    // admin panel then reports a permission problem for an account that was
    // created seconds earlier.
    // 250ms, not 1200. The 1200 was a guess; being early costs a wasted request,
    // whereas being late costs the user a second of staring at a spinner. The retry
    return await attempt();
    await new Promise(function (r) { setTimeout(r, 250); });
    return await attempt();
}
// LAST RESORT ONLY. Prefer the token saved at login.
//
// This replays the locally-stored btoa(password) to /sh/user-login. That works
// only while the worker still holds a LEGACY base64 record: for a PBKDF2 record
// the worker hashes whatever it is given, so a base64 string can never match.
// And the worker migrates legacy records on the first successful login, so this
// path tends to work exactly once per account.
//
// It is kept because a legacy account on a device that already holds the record
// genuinely has no other way in, and because returning null is now a truthful
// answer that the caller reports, rather than a silent undefined.
// Why the last shEnsureUserToken() gave up, so the caller can name WHICH reason
// applied instead of reporting one generic failure.
//
// "Could not sign in to the loadstring service" is what you get for an expired
// token, a rejected password, a rate limit and a missing local record alike -
// and only one of those is fixed by signing in again.
var shEnsureUserTokenReason = '';
async function shEnsureUserToken() {
    var existing = shGetUserToken();
    if (existing) return existing;
    if (!currentUser) { shEnsureUserTokenReason = 'no account is signed in on this device'; return null; }
    var u = users[currentUser.email];
    if (!u || !u.password) { shEnsureUserTokenReason = 'this device holds no stored password for ' + currentUser.email + ' - sign in again'; return null; }
    try {
        var d = await shApi('sh/user-login', { emailOrUsername: currentUser.email, password: u.password });
        if (d && d.ok && d.token) { shEnsureUserTokenReason = ''; return shSaveUserToken(d.token); }
        shEnsureUserTokenReason = 'the server refused the sign-in'
            + (d && d.status ? ' (HTTP ' + d.status + ')' : '')
            + ((d && d.error) ? ': ' + d.error : '');
    } catch (e) { shEnsureUserTokenReason = 'could not reach the sign-in service (' + ((e && e.message) || e) + ')'; }
    return null;
}

// Upload a script to the hidden host; resolves with { ok, loadstring, id }.
// obfResult = the obfuscated code (string) OR { code, splitKey, wantId } from
// obfuscateScriptCode. splitKey (server-key-split mode) = the padded final
// layer key: uploaded to the worker, NEVER inside the file - a static peeler
// always stops one layer short, and the runtime fetch is time-locked.
// specialKey = the owner's per-script Special Key (any length). The script
// is ENCRYPTED IN THIS BROWSER with the key (sh-crypto.js) BEFORE upload —
// the worker only ever receives ciphertext. The loadstring contains NO key;
// users set it BEFORE executing via getgenv().ScripterHubKey (no in-game
// popup GUI ships in the payload - just the getgenv read + notifications).
// KEYLESS MODE (free scripts): the Special Key is REQUIRED here too - it
// gates the WEBSITE key page only. Executors still run the script with NO
// key (the worker serves the executor blob directly), but browsers must
// supply the key to view the code. That makes free scripts much harder to
// rip from the website while keeping them free to execute in-game.
async function shUploadLoader(name, user, obfResult, normalCode, specialKey, replaces, keyless, requireAuth) {
    if (shRateGuard('upload', SH_RATE.upload.max, SH_RATE.upload.window, 'Too Many Uploads')) return;
    try {
        const obfCode = (obfResult && typeof obfResult === 'object') ? obfResult.code : obfResult;
        const splitKey = (obfResult && typeof obfResult === 'object' && obfResult.splitKey) ? obfResult.splitKey : null;
        const wantId = (obfResult && typeof obfResult === 'object' && obfResult.wantId) ? obfResult.wantId : '';
        // auth: prefer the USER session token (no owner code prompt for
        // normal users). Only fall back to the owner access-code flow.
        let token = shGetRawToken();
        let userToken = null;
        if (!token) {
            userToken = await shEnsureUserToken();
            if (!userToken) {
                // logged-in user but the worker rejected the login
                // (offline / password changed on another device) - show a
                // REAL error instead of silently asking for the OWNER
                // access code (users do not have it)
                if (currentUser) {
                    // "Check your internet connection" sent people to the wrong
                    // place: the overwhelmingly common cause was never the
                    // network, it was a device with no session token (see
                    // shApi), and no amount of reconnecting fixes that. Name the
                    // actual remedy instead.
                    return { ok: false, error: 'This browser has no session for your account' + (shEnsureUserTokenReason ? ' (' + shEnsureUserTokenReason + ')' : '') + '. Sign out and sign in again on THIS device, then retry.' };
                }
                const ok = await shLoginRaw();
                if (!ok) return { ok: false, error: 'login failed (could not sign in - re-login on the website and try again)' };
                token = shGetRawToken();
            }
        }
        // keyless scripts ALSO require the Special Key now (website gate)
        if (!specialKey) return { ok: false, error: 'Special Key is required' };
        // normalCode is ONLY used for the Discord attachment (7MB cap).
        // Never ship a giant raw source inside the JSON body.
        if (normalCode && normalCode.length > 7 * 1024 * 1024) normalCode = '';
        // 1) encrypt locally — the key never leaves this browser
        const cipher = shEncryptPayload(obfCode, specialKey);
        const keyHash = await (async () => {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(specialKey));
            return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
        })();
        let payload;
        if (keyless) {
            // free script: executor blob (plainCode, no key needed in-game)
            // + browser view (cipher, Special Key required on the website)
            // `visibility` is sent so the worker's D1 mirror is correct from
            // the first publish. Before Phase 3 it existed only in this
            // browser's localStorage, so a "Private" script's loader URL was
            // byte-identical to an "Anyone" one's and the server had no policy
            // to enforce. Anything unrecognised falls back to 'anyone'
            // server-side, so a malformed value can never over-restrict.
            payload = { token: token, userToken: userToken, name: name, user: user, keyless: true, plainCode: obfCode, cipher: cipher, keyHash: keyHash, replaces: replaces || '', normalCode: normalCode || '', visibility: shServerVisibility() };
        } else {
            payload = { token: token, userToken: userToken, name: name, user: user, cipher: cipher, keyHash: keyHash, replaces: replaces || '', normalCode: normalCode || '', visibility: shServerVisibility() };
            // requireAuth (Luarmor model): the split key is only served
            // after a valid license key + HWID auth against /sh/auth
            if (requireAuth) payload.authRequired = true;
        }
        if (splitKey) {
            // server-key-split: worker holds the missing final-layer key
            payload.wantId = wantId;
            payload.splitKey = splitKey;
        }
        // SIZE PRE-CHECK: KV/JSON path caps at ~50MB (Cloudflare). Larger
        // scripts automatically switch to the GitHub Storage Keeper path
        // below (up to ~10GB). Anything above 10GB cannot be stored.
        const approxBody = (payload.plainCode ? payload.plainCode.length : 0) + (payload.cipher ? payload.cipher.length : 0) + (payload.normalCode ? payload.normalCode.length : 0);
        if (approxBody > 10 * 1024 * 1024 * 1024) {
            return { ok: false, error: 'too large: scripts cap at 10 GB (Storage Keeper repo limit of 256 x 40MB parts). Split the script.' };
        }
        // ---- STORAGE KEEPER (GitHub) path for obfuscated code > ~45MB ----
        // Parts of 40MB stream to the worker (-> private GitHub repo),
        // then one finalize call registers the loader. Small scripts keep
        // the single-request KV path.
        const GH_SWITCH = 45 * 1024 * 1024;
        const obfLen = obfCode.length;
        if (!keyless && obfLen > GH_SWITCH) {
            return await shUploadKeeper({ token, userToken, name, user, obfCode, cipher, keyHash, requireAuth, replaces: replaces || '', normalCode: normalCode || '' });
        }
        if (keyless && obfLen > GH_SWITCH) {
            return await shUploadKeeper({ token, userToken, name, user, obfCode, cipher, keyHash, keyless: true, replaces: replaces || '', normalCode: normalCode || '' });
        }
        const res = await fetch(SH_STATS_ENDPOINT + 'sh/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (!d.ok && /author/i.test(d.error || '')) {
            // token expired -> re-login once, retry (SAME id + flags so
            // the baked-in key URL + auth requirements stay valid)
            sessionStorage.removeItem('sh_raw_token');
            shClearUserToken(); // both stores, not just this tab's
            const ok2 = await shLoginRaw();
            if (ok2) return await shUploadLoader(name, user, obfResult, normalCode, specialKey, replaces, keyless, requireAuth);
            const userToken2 = await shEnsureUserToken();
            if (userToken2) return await shUploadLoader(name, user, obfResult, normalCode, specialKey, replaces, keyless, requireAuth);
        }
        return d;
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ============ CROSS-DEVICE USER SYNC (Cloudflare KV) ============
// The Users/Admin panels used to read only localStorage, so they only
// showed accounts created on the SAME device. Accounts are now mirrored
// to the worker KV, so every device sees every user, and users can log
// in from any device. Local storage stays the working copy (offline
// fallback); cloud is the source of truth for the panels.

// A POST to the worker, with the HTTP STATUS kept on the result.
//
// This used to be `.then(function(r){ return r.json(); })` and nothing else, so
// the resolved object never carried a status. shApiGet below has always attached
// one, and the difference turned out to matter: handleLogin refuses a
// wrong-password sign-in with `d.ok === false && d.status === 401`, and with no
// status that condition could NEVER be true. Every rejection - 401, 429, a 500,
// a Cloudflare HTML error page - silently fell through to the local sign-in
// path, which shows "Logged in successfully!" and saves NO session token.
//
// The user then looks logged in, and every protected action calls
// shEnsureUserToken(), which finds no token, replays the locally stored
// btoa(password) that the worker will not accept for a PBKDF2 record, gets
// nothing, and reports the misleading "Could not sign in to the loadstring
// service... Check your internet connection". That is why this only ever
// affected a user's SECOND device: their first one still had a token in
// localStorage, so it never reached the broken path.
//
// r.json() also throws on an empty body or an HTML error page, and the throw was
// swallowed into a bare {ok:false}, making a Cloudflare error page
// indistinguishable from a rejected password. So: read as TEXT, parse
// defensively, and keep the status. This mirrors shApiGet.
function shApi(endpoint, body) {
    return fetch(SH_STATS_ENDPOINT + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    }).then(function (r) {
        return r.text().then(function (t) {
            var d;
            try { d = t ? JSON.parse(t) : {}; } catch (e) { d = { ok: false, error: 'the server did not return JSON' }; }
            if (d && d.ok === undefined) d.ok = false;
            d.status = r.status;
            return d;
        });
    }).catch(function () { return { ok: false, status: 0, error: 'network' }; });
}

// A GET with query parameters, and a body read as TEXT.
//
// shApi is POST-only, so the token-authenticated /sh/user-me read had nowhere to
// go. Two details matter. r.json() THROWS on an empty body or an HTML error page,
// and the throw used to be swallowed into a bare {ok:false, error:"network"}, which
// made a Cloudflare error page indistinguishable from a rejected password. And the
// status is kept, because 403 (disabled) and 404 (no such account) mean very
// different things and only one of them is a decision the server actually made.
function shApiGet(endpoint, params) {
    var q = [];
    for (var k in (params || {})) {
        if (params[k] === null || params[k] === undefined || params[k] === '') continue;
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
    var url = SH_STATS_ENDPOINT + endpoint + (q.length ? (endpoint.indexOf("?") < 0 ? "?" : "&") + q.join("&") : "");
    return fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } })
        .then(function (r) {
            return r.text().then(function (t) {
                var d;
                try { d = t ? JSON.parse(t) : {}; } catch (e) { d = { ok: false, error: "the server did not return JSON" }; }
                if (d && d.ok === undefined) d.ok = false;
                d.status = r.status;
                return d;
            });
        })
        .catch(function (e) { return { ok: false, status: 0, error: "could not reach the server (" + ((e && e.message) || e) + ")" }; });
}

// owner proof = b64 password of the owner (Scripter) account - lets the
// panels sync (plan changes, deletes) without the raw-page access code
// PHASE 1: ownerProof is GONE from the worker.
//
// It used to be b64(ownerPassword) and was sent as ?ownerProof= in query
// strings, which puts a password-equivalent credential into proxy logs,
// browser history and Referer headers. Owner admin calls now authenticate
// with the real owner session token from /sh/login, sent in the X-SH-Token
// header.
//
// Migration note for the panel: the first owner action will prompt for the
// access code (shLoginRaw) and cache the resulting token in sessionStorage.
// If the site is served over plain http on a non-localhost origin, the
// browser will refuse to attach the header to a cross-origin request and the
// admin panel will appear to fail - deploy the worker behind https.
function shOwnerToken() {
    return shGetRawToken() || '';
}

// True when the current browser session holds a usable owner token.
function shHasOwnerToken() {
    return !!shGetRawToken();
}

// push one local user record to the cloud (public fields only).
 // Proves identity with the account's b64 password from the local db.
 // Oversized images are NOT sent (the field is omitted so the cloud keeps
 // whatever it has) - slicing base64 would corrupt the data URL, and the
 // worker drops whole oversized images anyway. The local copy keeps working.
 function shPushUser(user) {
     if (!user || !user.email) return Promise.resolve({ ok: false });
     var u = users[user.email];
     var proof = (u && u.password) ? u.password : ''; // b64 password
     var profileImage = (typeof user.profileImage === 'string' && user.profileImage.length <= SH_IMAGE_CAP) ? user.profileImage : undefined;
     var bannerImage = (typeof user.bannerImage === 'string' && user.bannerImage.length <= SH_IMAGE_CAP) ? user.bannerImage : undefined;
// Same cap as the other two. A background is the largest of the three (1920px
// wide), so it is the one most likely to hit the worker's ~2MB base64 limit -
// and when it does, it is dropped from the sync rather than failing loudly, so
// the cap is checked here where the omission is at least visible.
var customBackground = (typeof user.customBackground === 'string' && user.customBackground.length <= SH_IMAGE_CAP) ? user.customBackground : undefined;
     var payload = {
         id: user.id, email: user.email, username: user.username,
         plan: user.plan, description: user.description || '',
         createdAt: user.createdAt, theme: user.theme || 'default',
         stats: user.stats, isAdmin: !!user.isAdmin, isScripter: !!user.isScripter,
         disabled: !!user.disabled
     };
     if (profileImage !== undefined) payload.profileImage = profileImage;
     if (bannerImage !== undefined) payload.bannerImage = bannerImage;
     if (customBackground !== undefined) payload.customBackground = customBackground;
     return shApi('sh/user-sync', {
         email: user.email,
    // The base64 password is still sent for older workers, but it is NOT a valid
    // proof: verifyPassword hashes whatever it is given, so a base64 string can
    // never match a PBKDF2 record, and the worker migrates legacy records on
    // first login. That is why a background or banner upload used to look like it
    // did nothing - it painted, then failed to save, so it vanished on reload and
    // never reached another device.
    //
    // The session token is the credential that works, and /sh/user-sync accepts it
    // bound to this exact account.
    password: proof,
    userToken: shGetUserToken() || "",
         user: payload
     });
 }

// full login sync: push the local record, then pull the cloud map
// (only the owner 'Scripter' account gets admin flags preserved)
async function shSyncUsersOnLogin(user, rawPassword) {
    try {
        if (user && user.email && rawPassword) {
            await shApi('sh/user-sync', {
                email: user.email,
                password: rawPassword,
                user: {
                    id: user.id, email: user.email, username: user.username,
                    plan: user.plan, description: user.description || '',
                    createdAt: user.createdAt, profileImage: user.profileImage || '',
                    bannerImage: user.bannerImage || '', theme: user.theme || 'default',
                    stats: user.stats, isAdmin: !!user.isAdmin, isScripter: !!user.isScripter,
                    disabled: !!user.disabled
                }
            });
        }
        if (currentUser && currentUser.username === 'Scripter') {
            var cloudRes = await shPullCloudUsers();
        // shPullCloudUsers now returns {ok, users, reason}. Unwrap it here so
        // the three call sites keep working on a plain map - `for (var k in
        // cloud)` over the envelope would otherwise iterate "ok" and "users".
        var cloud = cloudRes && cloudRes.ok ? cloudRes.users : null;
            if (cloud) {
                // merge cloud into local: cloud is source of truth including deletes
                // also fetch old users - cloud already returns ALL users, so prune locals missing in cloud
                var changed = false;
                for (var k in cloud) { if (shMergeCloudUser(k, cloud[k])) changed = true; }
                // delete locally any user not in cloud (deleted on another device) - keep creator/admin as safety
                // Was: delete every local account missing from this cloud response. That
                // destroyed accounts whose cloud signup had failed, with no warning and no
                // undo. It now only counts and marks them - see shReconcileWithCloud().
                shReconcileWithCloud(cloud);
                if (changed) saveUsers();
            }
        }
    } catch (e) { /* offline: keep working locally */ }
}

// Owner admin call. Authenticates with the real owner session token in the
// X-SH-Token header, and retries once through the access-code prompt if the
// token has expired.
//
// PHASE 1: this replaced ?ownerProof=<base64 password>, which put a
// password-equivalent credential in a URL (proxy logs, browser history,
// Referer). The token goes in a header, so it is not logged as a query param.
// The last few admin calls, verbatim, for the Diagnostics panel.
//
// Every failure of this function used to be a plausible GUESS - "Owner sign-in
// required", "the users database may be too large" - and each guess was wrong,
// because the real status and body were discarded. This keeps them.
var SH_OWNER_LOG = [];

function shLogOwnerCall(entry) {
    SH_OWNER_LOG.push(Object.assign({ at: new Date().toISOString() }, entry));
    if (SH_OWNER_LOG.length > 12) SH_OWNER_LOG.shift();
    var el = document.getElementById('diagLog');
    if (!el) return;
    el.textContent = SH_OWNER_LOG.map(function (e) {
        return e.at + '  ' + e.method + ' ' + e.path + '\n' +
            '    status ' + e.status + (e.ok ? '  ok' : '  FAILED') + '\n' +
            '    ' + (e.body || '(empty body)');
    }).join('\n\n');
}

// Owner admin call. ONE credential: the owner ACCOUNT session.
// The access code is no longer used here. It was a second, invisible secret for
// work the owner can already prove by signing in, and it produced failures whose
// honest symptom was never the one reported: a stale cached code that could not
// be replaced, a refusal with no way out but devtools, and - worst - a client that
// demanded the code BEFORE sending the request, so nothing was sent and no error
// described anything real.
//
// The /sh/login endpoint still exists on the worker for raw.html. Only the
// dashboard stopped using it.
// ============ DIAGNOSTICS ============
// Press Test Connection and read the answer.
//
// This exists because the cause of the admin failures was guessed wrong four times
// in a row - a stale access code, a second sign-in, a missing header, a stack
// overflow - and every one of those guesses was invented rather than observed,
// because the client discarded the HTTP status and the response body and replaced
// them with a sentence. The status and the body are now kept, and shown.
function shDiagnosticsState() {
    var u = currentUser ? users[currentUser.email] : null;
    return [
        'site            ' + location.origin,
        'worker          ' + SH_STATS_ENDPOINT,
        'signed in as    ' + (currentUser ? (currentUser.username || currentUser.email) : 'NOBODY'),
        'plan            ' + (currentUser ? currentUser.plan : '-'),
        'owner account   ' + (currentUser && String(currentUser.email).toLowerCase() === 'dubovikstanislav51@gmail.com' ? 'YES' : 'no'),
        'local users     ' + Object.keys(users).length,
        'user session    ' + (shGetUserToken() ? 'present' : 'MISSING - sign in again'),
        'session id      ' + (shGetUserToken() ? String(shGetUserToken()).slice(0, 18) + '...' : '-'),
        'legacy code tok ' + (shGetRawToken() ? 'present (no longer used)' : 'none')
    ];
}

// Four probes, because "it does not work" has several distinct causes and one
// request cannot tell them apart. Each prints its own real status and body.
async function runDiagnostics() {
    var out = document.getElementById('diagOut');
    if (!out) { showNotification('Diagnostics', 'Open the Admin panel first.', 'warning'); return; }
    out.textContent = 'Testing...';
    // Report the token state AFTER trying to mint one, so the panel shows what the
    // admin panel will actually send rather than what happened to be cached.
    try { await shEnsureUserToken(); } catch (e) {}
    var lines = shDiagnosticsState();
    lines.push('');

    async function probe(label, method, path, body) {
        var tok = shGetUserToken() || '';
        lines.push('--- ' + label + ' ---');
        try {
            // Same credential placement as shOwnerApi: body for POST, query for
            // GET. A probe that authenticates differently from the code it is
            // probing would report on a path the app never takes.
            var full = SH_STATS_ENDPOINT + path + (body ? '' : (tok ? ('?userToken=' + encodeURIComponent(tok)) : ''));
            var res = await fetch(full, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: body === null || body === undefined
                    ? undefined
                    : JSON.stringify(Object.assign({}, body, { userToken: tok }))
            });
            var text = '';
            try { text = await res.text(); } catch (e) { text = ''; }
            lines.push('  status  ' + res.status + ' ' + (res.ok ? '(ok)' : '(FAILED)'));
            lines.push('  body    ' + (text ? text.slice(0, 300) : '(empty)'));
            shLogOwnerCall({ method: method, path: path, status: res.status, ok: res.ok, body: text.slice(0, 300) });
        } catch (e) {
            lines.push('  NETWORK  ' + ((e && e.message) || e));
        }
        lines.push('');
    }

    await probe('health (no auth needed)', 'GET', 'sh/health', null);
    await probe('user-get (is this account on the worker?)', 'POST', 'sh/user-get', { email: currentUser ? currentUser.email : '', password: '' });
    await probe('users (the call Refresh from Cloud makes)', 'GET', 'sh/users', null);
    // the announcement probe is gone with the feature

    out.textContent = lines.join('\n');
    showNotification('Diagnostics', 'Finished - read the report above.', 'info', 3000);
}

// Copies the whole report so it can be pasted into a bug report verbatim.
function copyDiagnostics() {
    var out = document.getElementById('diagOut');
    var log = document.getElementById('diagLog');
    if (!out) return;
    var text = '=== DIAGNOSTICS ===\n' + out.textContent +
        '\n\n=== RECENT CALLS ===\n' + (log ? log.textContent : '(none)');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
            showNotification('Copied', 'Diagnostics copied to the clipboard.', 'success', 2500);
        }, function () {
            showNotification('Copy failed', 'Select the text and copy it manually.', 'warning');
        });
    } else {
        showNotification('Copy failed', 'Select the text and copy it manually.', 'warning');
    }
}


async function shOwnerApi(path, body) {
    var isGet = body === null || body === undefined;
    // Mint the session token if this tab does not have one.
    //
    // It used to be read straight out of sessionStorage, which was empty
    // unless this tab had previously uploaded a script - the only two callers of
    // shEnsureUserToken were in the upload path. So an owner who signed in and
    // clicked Refresh sent NO credential, and the worker's 401 "Not authorized."
    // meant something that had nothing to do with authorisation.
    //
    // sessionStorage is per-tab as well, so signing in on one tab and using the
    // admin panel on another hit the same wall. Doing it here makes an
    // unauthenticated admin call impossible to construct.
    var userTok = shGetUserToken() || '';
    if (!userTok) {
        try { userTok = (await shEnsureUserToken()) || ''; }
        catch (e) { userTok = ''; }
    }

    // The credential travels in the BODY for a POST and the QUERY STRING for a
    // GET. It used to travel in an X-SH-Token header, and a custom header is
    // exactly what a browser preflight can reject: the worker's Allow-Headers
    // listed Content-Type only, so the preflight failed and the browser deleted
    // the request before it left the page.
    //
    // From inside the app that appeared as `TypeError: Failed to fetch` - which is
    // not a 401, not a wrong password and not an auth problem - and the old code
    // rendered it as "Owner sign-in required". Four rounds of chasing that were
    // four rounds of chasing the wrong thing, because the real error was only
    // ever visible in the browser console:
    //
    //     Request header field x-sh-token is not allowed by
    //     Access-Control-Allow-Headers in preflight response.
    //
    // Body and query need no preflight beyond Content-Type, so the request
    // survives on the worker that is deployed RIGHT NOW and keeps working once the
    // header is allowed there too. That matters practically: the worker has to be
    // pasted into Cloudflare by hand, and this page should not sit broken until
    // somebody does.
    var url = SH_STATS_ENDPOINT + path;
    if (isGet && userTok) {
        url += (url.indexOf('?') < 0 ? '?' : '&') + 'userToken=' + encodeURIComponent(userTok);
    }
    var payload = Object.assign({}, body || {}, { userToken: userTok });

    var res;
    var text = '';
    try {
        // Aborted, not merely abandoned, so the request stops costing anything and the
        // failure is a real one the caller can report rather than a silent hang.
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctl) ctl.abort(); }, SH_OWNER_TIMEOUT_MS);
        var opts = {
            method: isGet ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: isGet ? undefined : JSON.stringify(payload)
        };
        if (ctl) opts.signal = ctl.signal;
        res = await fetch(url, opts);
        // read as TEXT, then parse. res.json() throws on an empty body or an HTML
        // error page, and the throw used to be swallowed into a bare false with no
        // reason - which is how a Cloudflare page in front of the worker became
        // indistinguishable from a wrong password.
        //
        // ONCE. A Response body is a stream and it can be read exactly one time, so
        // this block appeared here twice and the second read threw
        //
        //     TypeError: Failed to execute 'text' on 'Response':
        //               body stream already read
        //
        // The throw was caught by the very try/catch that was meant to be defensive,
        // which set text back to '' - so a perfectly good 200 with a full users map
        // in it was parsed as an empty body and reported as a failure. Every owner
        // call went through that, which is the whole admin surface.
        //
        // The symptom was "Refreshing..." and then nothing, which is exactly what a
        // hang looks like and the opposite of what was happening. A defensive catch
        // that swallows its own bug is worse than no catch: it converts a loud
        // TypeError into a silent wrong answer.
        try { text = await res.text(); } catch (e) { text = ''; }
        // Cleared only on a completed read. clearTimeout used to sit between the
        // two copies, so after this fix there is exactly one place it belongs, and
        // an aborted request no longer leaves a timer armed against nothing.
        clearTimeout(timer);
    } catch (e) {
        // A fetch that throws with no status never reached the worker. The one
        // cause that actually happens here is a rejected CORS preflight, so it is
        // named rather than left as "Failed to fetch".
        // Cleared here as well as on the success path, or the timer survives to fire
        // against a request that already failed.
        try { clearTimeout(timer); } catch (e2) {}
        var netErr = {
            ok: false,
            status: 0,
            error: ((e && e.name === 'AbortError') || /abort/i.test((e && e.message) || ''))
                ? 'No answer from the cloud within ' + Math.round(SH_OWNER_TIMEOUT_MS / 1000) + ' seconds, so the request was cancelled. That is a SLOW cloud, not a blocked one - the worker is reachable, it just did not reply in time.'
                : 'The browser blocked the request before it reached ' + SH_STATS_ENDPOINT + ' (' + ((e && e.message) || e) + '). That is almost always a CORS preflight: the worker must list every header this page sends in Access-Control-Allow-Headers. The exact reason is in the browser console.'
        };
        shLogOwnerCall({ method: isGet ? 'GET' : 'POST', path: path, status: 0, ok: false, body: netErr.error });
        return netErr;
    }

    var d;
    try { d = text ? JSON.parse(text) : {}; }
    catch (e) { d = { ok: false, error: 'the server did not return JSON' }; }
    if (d && d.ok === undefined) d.ok = false;

    shLogOwnerCall({ method: isGet ? 'GET' : 'POST', path: path, status: res.status, ok: !!d.ok, body: text.slice(0, 400) });

    if (d && d.ok) return d;

    // Report the REAL answer: status, path, and the server's own words. A bare
    // "not authorised" cannot be acted on and this has been guessed at enough
    // times already.
    var why = (d && d.error) || ('the server returned no reason');
    var extra = '';
    if (res.status >= 500) {
        // A 5xx on an admin route is the signature of a worker that predates the
        // auth-argument fix, where the GET credential path threw
        // ReferenceError: request is not defined. Worth naming, because the fix
        // is a redeploy and not anything the user can do from the page.
        extra = '  The worker looks OLDER than this page. Its owner routes need the' +
            ' current worker.js pasted into Cloudflare and redeployed.';
    } else if (res.status === 401 || res.status === 403) {
        extra = userTok
            ? '  The account session was sent but the worker did not accept it as' +
              ' the owner. Sign in as the owner account on THIS tab.'
            : '  No account session was sent. Sign in as the owner account first.';
    } else if (!userTok) {
        extra = '  (no account session was sent - sign in as the owner account)';
    }
    return {
        ok: false,
        status: res.status,
        error: 'HTTP ' + res.status + ' from ' + path + ': ' + why + extra
    };
}

// owner pull of all cloud users -> { email: user } (no passwords).
// ============ CLOUD RECONCILE (never destructive) ============
// Merges a cloud map into the local one WITHOUT deleting anything.
//
// This replaces three prune loops that read:
//
//     for (var k in users) {
//         if (!cloud.hasOwnProperty(k) && k !== '<owner email>') {
//             delete users[k];
//
// and which destroyed any local account missing from one cloud response. A new
// account whose cloud signup failed - 429 on the 10/min or 120/hour caps, a 500,
// or simply being offline - looked real to the user and was then deleted by the
// next boot or Refresh, with no warning and no undo. Only two hardcoded email
// addresses were protected, so the owner's own alt account had the same exposure
// as anyone else's.
//
// It could also destroy accounts that WERE on the cloud, because the same
// condition fires on any partial read - a truncated KV value, a failed write the
// emergency repair shrank, or a pull that failed partway.
//
// So a local account the cloud does not know about is KEPT and MARKED. Deletion
// stays an explicit owner action, and those buttons already exist. What is lost is
// automatic propagation of a delete made on another device - the right trade,
// because an irreversible delete triggered by a network read is worse than a
// stale row.
//
// Returns how many local accounts are not yet on the cloud, so the panel can say
// that plainly instead of leaving a bare number to be read as a cap.
// ============ DELETION TOMBSTONES ============
// Accounts the owner has explicitly removed from this site.
//
// Deleting a user only removed the LOCAL record. The cloud delete was
// fire-and-forget and its errors were swallowed, so whenever the worker
// refused - which it did whenever the owner call was not authorised - the
// account survived on the server. Four separate sync loops then re-add any
// cloud account missing locally, so the next Refresh brought the bot straight
// back. Deleting could never win against a rule that adds unconditionally.
//
// A tombstone inverts that: the removal is recorded somewhere durable and
// local, and every pull from the cloud skips it. The cloud delete is still
// attempted and still matters for other devices, but the two are no longer
// coupled, so a failed cloud delete can no longer resurrect the account.
const SH_TOMBSTONES_KEY = 'sh_removed_accounts';
const SH_NEVER_REMOVE = ['dubovikstanislav51@gmail.com', 'admin@example.com'];

function shTombstones() {
    try {
        var v = JSON.parse(localStorage.getItem(SH_TOMBSTONES_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}

// True for an account that must never be tombstoned: the owner, the admin, and
// the person currently signed in. Checked when writing, not when reading, so a
// tampered local list cannot be used to lock the owner out of their own site.
function shIsNeverRemovable(email) {
    var e = String(email || '').toLowerCase();
    if (!e) return true;
    for (var i = 0; i < SH_NEVER_REMOVE.length; i++) {
        if (SH_NEVER_REMOVE[i].toLowerCase() === e) return true;
    }
    if (currentUser && String(currentUser.email || '').toLowerCase() === e) return true;
    return false;
}

function shIsRemoved(email) {
    var e = String(email || '').toLowerCase();
    if (!e) return false;
    var t = shTombstones();
    for (var i = 0; i < t.length; i++) {
        if (String(t[i]).toLowerCase() === e) return true;
    }
    return false;
}

// Records the removal. Returns false - and writes nothing - for an account that
// is not allowed to be removed.
function shTombstone(email) {
    if (shIsNeverRemovable(email)) return false;
    var e = String(email || '').toLowerCase();
    var t = shTombstones();
    var seen = false;
    for (var i = 0; i < t.length; i++) { if (String(t[i]).toLowerCase() === e) { seen = true; break; } }
    if (!seen) t.push(e);
    try { localStorage.setItem(SH_TOMBSTONES_KEY, JSON.stringify(t)); } catch (err) {}
    return true;
}

// Un-remove. Present so a mistaken removal is reversible, because a tombstone
// with no way back is a foot-gun and not a feature.
function shUntombstone(email) {
    var e = String(email || '').toLowerCase();
    var t = shTombstones().filter(function (x) { return String(x).toLowerCase() !== e; });
    try { localStorage.setItem(SH_TOMBSTONES_KEY, JSON.stringify(t)); } catch (err) {}
}

// True when a cloud record must be skipped because it was removed on purpose.
function shSkipRemoved(rec) {
    return !!(rec && rec.email && shIsRemoved(rec.email));
}

// Merge ONE cloud record into users[key]. Returns true if the local record
// changed. This is the ONLY place that does it - there used to be four separate
// hand-written merge loops (boot, reconcile, panel refresh, manual refresh) and
// they had drifted: three of the four restored profileImage and bannerImage but
// NOT customBackground.
//
// That is the same defect the worker has a whole test written about (W18): a field
// accepted on one path and silently dropped on another. It fails quietly and
// completely - the feature works on the device that set it and never appears on
// any other one, with no error anywhere to point at.
//
// It became load-bearing rather than theoretical when the listing started
// omitting image fields to keep the response small. A record that arrives with no
// customBackground is no longer a rare edge case, it is EVERY record, every
// refresh - and a loop that forgets the field deletes the user's background on
// this device and reports "Users list is up to date".
//
// One function, one field list, four call sites that cannot disagree.
function shMergeCloudUser(key, cloudRec) {
    var cu = cloudRec;
    var lu = users[key];
    if (!lu) {
        if (shSkipRemoved(cu)) return false;
        users[key] = cu;
        return true;
    }
    if (JSON.stringify(lu) === JSON.stringify(cu)) return false;
    // the cloud never returns a password, and it must never be allowed to blank an
    // image the cloud has not seen - either would silently undo local state on
    // every single sync
    if (lu.password && !cu.password) cu.password = lu.password;
    if (!cu.profileImage && lu.profileImage) cu.profileImage = lu.profileImage;
    if (!cu.bannerImage && lu.bannerImage) cu.bannerImage = lu.bannerImage;
    if (!cu.customBackground && lu.customBackground) cu.customBackground = lu.customBackground;
    users[key] = cu;
    return true;
}

function shReconcileWithCloud(cloud) {
    if (!cloud || typeof cloud !== 'object') return 0;
    var changed = false;
    var localOnly = 0;
    for (var ck in cloud) {
        // clear the marker: this account IS on the cloud now
        if (users[ck] && users[ck].notOnCloud) { delete users[ck].notOnCloud; changed = true; }
        if (shMergeCloudUser(ck, cloud[ck])) {
            changed = true;
            if (users[ck].notOnCloud) delete users[ck].notOnCloud;
        }
    }
    // MARK, never delete
    for (var k in users) {
        if (cloud.hasOwnProperty(k)) continue;
        localOnly++;
        if (!users[k].notOnCloud) { users[k].notOnCloud = true; changed = true; }
    }
    if (changed) saveUsers();
    return localOnly;
}

async function shPullCloudUsers() {
    try {
        var d = await shOwnerApi('sh/users', null);
        if (d.ok && d.users) {
            // re-attach local passwords where we have them (panels need them
            // for delete/edit flows; cloud never stores them in responses)
            for (var k in d.users) {
                if (users[k] && users[k].password) d.users[k].password = users[k].password;
            }
            // The image fields are ABSENT from the listing, not empty, and that is
            // deliberate (see the worker). A record that arrives without them must
            // not be written over the local one: users[k] is the copy the whole UI
            // renders, so letting the listing's blank version win here is how an
            // avatar or a full-page background disappears from the dashboard on the
            // device that has it.
            for (var k2 in d.users) {
                if (users[k2]) {
                    var lu = users[k2];
                    if (!d.users[k2].profileImage && lu.profileImage) d.users[k2].profileImage = lu.profileImage;
                    if (!d.users[k2].bannerImage && lu.bannerImage) d.users[k2].bannerImage = lu.bannerImage;
                    if (!d.users[k2].customBackground && lu.customBackground) d.users[k2].customBackground = lu.customBackground;
                }
            }
            return { ok: true, users: d.users, count: (typeof d.count === 'number' ? d.count : Object.keys(d.users).length) };
        }
        // An HTTP error still RESOLVES, so it arrives here as data rather than
        // as a throw. Returning null on both paths is what let the caller render
        // a hardcoded "503, the users database may be too large" for any failure
        // at all - an owner token that has not loaded, a worker that is not
        // deployed, an offline client, a 401. The reason is carried through now.
        return { ok: false, reason: (d && d.error) || 'the cloud returned no users and no error' };
    } catch (e) {
        return { ok: false, reason: 'could not reach the cloud: ' + ((e && e.message) || e) };
    }
}

// owner upsert/delete of cloud user records (plan changes, deletes)
async function shPushCloudUserUpdate(email, userRecord) {
    try {
        return await shOwnerApi('sh/users', { token: shOwnerToken(), email: email, user: userRecord });
    } catch (e) { return { ok: false }; }
}

async function shDeleteCloudUser(email) {
    try {
        return await shOwnerApi('sh/users-delete', { token: shOwnerToken(), email: email });
    } catch (e) { return { ok: false }; }
}

async function shClearCloudUsers(keepEmails) {
    try {
        return await shOwnerApi('sh/users-clear', { token: shOwnerToken(), keep: (keepEmails || []).join(',') });
    } catch (e) { return { ok: false }; }
}

// ============ LICENSE SYNC (server-side auth, Luarmor model) ============
// Mirrors the local Users Keys into the worker's sh_licenses KV map, so
// /sh/auth validates license keys + HWID SERVER-SIDE. Records keep the
// key string as the map index (the worker needs the raw key to compute
// the HMAC token - never stored in any script file).
async function shSyncLicenses() {
    try {
        const keyData = loadKeys();
        const licenses = {};
        for (const k of (keyData.keys || [])) {
            licenses[k.key] = {
                hwid: k.hwid || '',
                expiresAt: k.expires || 0,
                banned: !!k.banned,
                banReason: k.banReason || '',
                discordId: k.discordId || '',
                note: k.note || '',
                hwidResets: k.hwidResets || 0,
                executions: k.executions || 0
            };
        }
        return await shOwnerApi('sh/licenses', { token: shOwnerToken(), licenses: licenses });
    } catch (e) { return { ok: false, error: 'network' }; }
}
window.shSyncLicenses = shSyncLicenses;

// owner-only: flip the global kill-switch (every auth fails instantly)
async function shSetKillswitch(on) {
    try {
        return await shOwnerApi('sh/killswitch', { token: shOwnerToken(), on: !!on });
    } catch (e) { return { ok: false, error: 'network' }; }
}
window.shSetKillswitch = shSetKillswitch;

// ============ PLAN LIMIT ENFORCEMENT ============
function checkPlanLimit(kind, extraCount, extraBytes) {
    if (!currentUser) return null;
    var plan = PLAN_CONFIGS[currentUser.plan] || PLAN_CONFIGS['Basic'];
    var stats = computeStats(currentUser);
    if (kind === 'projects' && plan.projects !== Infinity && stats.projects.used + (extraCount || 1) > plan.projects) {
        return 'You reached your Projects limit (' + stats.projects.used + '/' + plan.projects + ') on the ' + currentUser.plan + ' plan. Upgrade to create more!';
    }
    if (kind === 'scripts' && plan.scripts !== Infinity && stats.scripts.used + (extraCount || 1) > plan.scripts) {
        return 'You reached your Scripts limit (' + stats.scripts.used + '/' + plan.scripts + ') on the ' + currentUser.plan + ' plan. Upgrade to create more!';
    }
    if (kind === 'keys' && plan.keys !== Infinity && stats.keys.used + (extraCount || 1) > plan.keys) {
        return 'You reached your Keys limit (' + stats.keys.used + '/' + plan.keys + ') on the ' + currentUser.plan + ' plan. Upgrade to create more!';
    }
    if (kind === 'storage' && plan.fileSize !== Infinity) {
        var newMB = stats.storage.usedMB + (extraBytes || 0) / (1024 * 1024);
        if (newMB > plan.fileSize) {
            return 'Not enough storage space on your plan (' + formatSizeMB(stats.storage.usedMB) + ' used, limit ' + formatSizeMB(plan.fileSize) + '). Remove some stuff or upgrade to a better plan!';
        }
    }
    return null;
}

// ============ SESSION PERSISTENCE ============
function saveSession(user) {
    try {
        sessionStorage.setItem('session_user', JSON.stringify(user));
        localStorage.setItem('currentUser', JSON.stringify(user));
    } catch (e) {}
}

function restoreSession() {
    try {
        var sessionData = sessionStorage.getItem('session_user');
        if (sessionData) return JSON.parse(sessionData);
        var localData = localStorage.getItem('currentUser');
        if (localData) return JSON.parse(localData);
    } catch (e) {}
    return null;
}

function clearSession() {
    sessionStorage.removeItem('session_user');
    localStorage.removeItem('currentUser');
}

// ============ DATABASE FUNCTIONS ============
function loadUsers() {
    try {
        const data = localStorage.getItem('users');
        if (data) {
            users = JSON.parse(data);
        } else {
            // start with NO seeded accounts (the demo Admin/DemoUser
            // examples used to come back on every storage clear - the
            // owner logs in via the cloud and real users sign up)
            users = {};
            saveUsers();
        }
    } catch (error) {
        console.error('Error loading users:', error);
        users = {};
    }
}

function saveUsers() {
    try { localStorage.setItem('users', JSON.stringify(users)); } catch (error) { console.error('Error saving users:', error); }
}

function getCurrentUser() {
    try { const data = localStorage.getItem('currentUser'); return data ? JSON.parse(data) : null; } catch (error) { return null; }
}

function setCurrentUser(user) {
    try { saveSession(user); } catch (error) { console.error('Error saving current user:', error); }
}

function clearCurrentUser() { clearSession(); }

// ============ THEME SYSTEM ============
//
// Each theme is six values, and every one of them is read somewhere:
//
//   primary    --primary-color:    the accent colour
//   secondary  --secondary-color:  the far end of every gradient
//   bg         --bg-color:         the page behind everything
//   card       --card-color:       panel surfaces
//   text       --text-color:       body text
//   accent     --accent-color:     muted highlights
//   onPrimary  button label colour ON a primary->secondary gradient
//
// onPrimary is the seventh and it is not optional. The gradient on a primary button
// is white text over `primary` at the left, so a light primary (yellow, gold, mint,
// aqua, white) renders white-on-near-white at one end of the button: unreadable, and
// invisible on the lightest themes without it. It is written to the button colour in
// applyTheme rather than left to the stylesheet, because the gradient is an inline
// style and inline wins.
//
// Every one of the fifteen clears WCAG AA (4.5:1) against its own ink at EVERY
// point of its gradient, not merely at both ends - a 135deg gradient passes through
// every blend between them, and the mid-point is usually the worst. Each gradient
// runs in the direction its ink requires: dark ink lightens, light ink darkens,
// because that is the direction that increases the contrast instead of eating it.
// Measured by tools/themes_test.mjs, which uses the real ratio - a difference in
// luminance disagrees with a ratio exactly in the mid-tones, which is where these
// colours are.
//
// `default` is kept as an internal alias for purple. It was the original default and
// is still stored on accounts created before this list existed, so deleting the KEY
// would reset those users' saved theme to nothing on every load. It is deliberately
// NOT in the picker - purple is the same colour and is offered instead, so the list
// holds one entry per colour rather than two names for one of them.
const SH_THEME_FALLBACK = 'purple';

const themes = {
    //           primary    secondary   bg          card                  text       accent     onPrimary
    red:      { primary: '#c81e3f', secondary: '#9e1330', bg: '#14050a', card: 'rgba(38,12,22,0.8)', text: '#ffffff', accent: '#ff8fa3', onPrimary: '#ffffff' },
    orange:   { primary: '#ff7a00', secondary: '#ff9d42', bg: '#150c04', card: 'rgba(40,24,10,0.8)', text: '#ffffff', accent: '#ffb366', onPrimary: '#101014' },
    yellow:   { primary: '#ffd60a', secondary: '#ffe14a', bg: '#141203', card: 'rgba(38,32,8,0.8)', text: '#ffffff', accent: '#ffdb4d', onPrimary: '#101014' },
    green:    { primary: '#00cc44', secondary: '#42d975', bg: '#000a05', card: 'rgba(10,35,18,0.8)', text: '#ffffff', accent: '#66ff99', onPrimary: '#101014' },
    cyan:     { primary: '#00c2d1', secondary: '#42d2dd', bg: '#001214', card: 'rgba(8,34,38,0.8)', text: '#ffffff', accent: '#4de8f5', onPrimary: '#101014' },
    blue:     { primary: '#2563eb', secondary: '#1d4ed8', bg: '#00051a', card: 'rgba(12,20,44,0.8)', text: '#ffffff', accent: '#6688ff', onPrimary: '#ffffff' },
    purple:   { primary: '#7c3aed', secondary: '#5c2baf', bg: '#0a001a', card: 'rgba(24,12,42,0.8)', text: '#ffffff', accent: '#c08cff', onPrimary: '#ffffff' },
    brown:    { primary: '#8b5a2b', secondary: '#674320', bg: '#120c07', card: 'rgba(34,24,16,0.8)', text: '#ffffff', accent: '#c08a52', onPrimary: '#ffffff' },
    black:    { primary: '#1c1c1c', secondary: '#45454f', bg: '#000000', card: 'rgba(20,20,20,0.9)', text: '#ffffff', accent: '#5c5c5c', onPrimary: '#ffffff' },
    white:    { primary: '#f2f2f5', secondary: '#d5d5da', bg: '#16161a', card: 'rgba(38,38,44,0.8)', text: '#ffffff', accent: '#a8a8b4', onPrimary: '#101014' },
    pink:     { primary: '#ff5fa2', secondary: '#ff89ba', bg: '#16050e', card: 'rgba(40,14,28,0.8)', text: '#ffffff', accent: '#ff8cba', onPrimary: '#101014' },
    amethyst: { primary: '#8b3fc7', secondary: '#6a2f9b', bg: '#0d0418', card: 'rgba(30,14,44,0.8)', text: '#ffffff', accent: '#c88ff0', onPrimary: '#ffffff' },
    mint:     { primary: '#00e5a0', secondary: '#42ecb9', bg: '#00140e', card: 'rgba(8,38,28,0.8)', text: '#ffffff', accent: '#5cffc9', onPrimary: '#101014' },
    gold:     { primary: '#ffc107', secondary: '#ffd147', bg: '#141004', card: 'rgba(40,32,8,0.8)', text: '#ffffff', accent: '#ffdb5c', onPrimary: '#101014' },
    aqua:     { primary: '#00d4ff', secondary: '#42dfff', bg: '#00141a', card: 'rgba(8,34,42,0.8)', text: '#ffffff', accent: '#6aeaff', onPrimary: '#101014' }
};

// purple is also the fallback, under the name older records still carry.
themes.default = themes.purple;

// Shown in the <select> and as the preview dots, in this order. A separate list
// rather than Object.keys(themes) so the alias is not offered twice and the
// presentation order is a decision instead of an accident of insertion order.
const SH_THEME_PICKER = [
    { name: 'red', label: '🔴 Red' },
    { name: 'orange', label: '🟠 Orange' },
    { name: 'yellow', label: '🟡 Yellow' },
    { name: 'green', label: '🟢 Green' },
    { name: 'cyan', label: '🩵 Cyan' },
    { name: 'blue', label: '🔵 Blue' },
    { name: 'purple', label: '🟣 Purple' },
    { name: 'brown', label: '🟤 Brown' },
    { name: 'black', label: '⚫ Black' },
    { name: 'white', label: '⚪ White' },
    { name: 'pink', label: '🩷 Pink' },
    { name: 'amethyst', label: '💜 Amethyst' },
    { name: 'mint', label: '🍃 Mint' },
    { name: 'gold', label: '🥇 Gold' },
    { name: 'aqua', label: '🌊 Aqua' }
];

// A custom colour is stored as `custom:#rrggbb`.
//
// A string, not an object, and that is load-bearing. The record syncs to the worker
// as JSON, and the worker hard-codes `if (theme.length > 30) theme = 'default'` - so
// anything longer is silently reset on every sync, from every other device. A
// structured theme would have to survive that. `custom:#6c3bff` is 14 characters.
const SH_CUSTOM_THEME_PREFIX = 'custom:';
const SH_CUSTOM_THEME_MAX = 30;   // the worker's cap, restated so the client can refuse before it is told

// Reads any stored theme name and returns a theme object.
//
// This is the ONLY way a theme name becomes a theme. There were three
// `themes[name] || themes.default` lookups, and a custom colour is not a key in
// themes at all - so each of them independently had to learn about it, and a fourth
// place would have too. One resolver, so an unknown name and a custom colour are
// the same question asked in one spot.
function shResolveTheme(themeName) {
    var name = String(themeName == null ? '' : themeName);
    if (name.indexOf(SH_CUSTOM_THEME_PREFIX) === 0) {
        var hex = shNormalizeHex(name.slice(SH_CUSTOM_THEME_PREFIX.length));
        if (hex) return shThemeFromHex(hex);
    }
    if (themes[name]) return themes[name];
    return themes[SH_THEME_FALLBACK];
}

// "#abc" | "abc" | "#aabbcc" | "AABBCC" -> "#rrggbb", or '' if it is not a colour.
function shNormalizeHex(v) {
    var s = String(v == null ? '' : v).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return /^[0-9a-f]{6}$/i.test(s) ? ('#' + s.toLowerCase()) : '';
}

// Build a whole theme from one chosen colour.
//
// The other six values are DERIVED rather than asked for, because a colour picker
// returns one colour and a theme needs six - and a user who picks "aqua" from the
// wheel should not then be asked what card colour they would like. Two rules do all
// of it:
//
//   * the background is the chosen hue taken almost to black, so the page keeps the
//     theme's identity instead of being 15 near-identical dark panels
//   * the surfaces are that same hue, lightened slightly
//
// and the contrast rules are not left to chance: a light primary gets dark button
// text and a dark card, a dark primary gets light text. getLuminance is the same
// relative-luminance formula used for accessibility, so the switch happens where
// the text actually becomes readable rather than at an arbitrary midpoint.
function shThemeFromHex(hex) {
    var h = shNormalizeHex(hex) || '#7c3aed';
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);

    // WCAG relative luminance, 0 (black) to 1 (white).
    function channel(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var lum = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    var light = lum > 0.45;

    function mix(target, amount) {
        return 'rgb(' + Math.round(r + (target - r) * amount) + ',' +
            Math.round(g + (target - g) * amount) + ',' +
            Math.round(b + (target - b) * amount) + ')';
    }
    function tint(a) { return 'rgba(' + Math.round(r * 0.28 + a * 0.10) + ',' + Math.round(g * 0.28 + a * 0.10) + ',' + Math.round(b * 0.28 + a * 0.10) + ',0.8)'; }

    return {
        primary: h,
        // the gradient's far end: light themes lighten, dark themes lift
        secondary: light ? mix(255, 0.45) : mix(255, 0.30),
        // the chosen hue at a low mix into near-black, so the page is recognisably
        // this colour and not a generic dark panel
        bg: light ? mix(16, 0.90) : mix(10, 0.92),
        card: tint(light ? 26 : 14),
        text: '#ffffff',
        accent: light ? mix(255, 0.35) : mix(255, 0.42),
        // dark ink on a light gradient, light ink on a dark one
        onPrimary: light ? '#101014' : '#ffffff'
    };
}

// Validates a name before it is stored. Returns '' for anything unusable, so the
// caller stores nothing rather than storing a value the worker will reset.
function shValidateThemeName(name) {
    var s = String(name == null ? '' : name);
    if (s.indexOf(SH_CUSTOM_THEME_PREFIX) === 0) {
        return shNormalizeHex(s.slice(SH_CUSTOM_THEME_PREFIX.length)) ? s : '';
    }
    return (s === 'default' || isOfferedTheme(s)) ? s : '';
}

// True for a name the picker offers. A membership question about the LIST, which is
// not the same as resolving a saved name to a theme object - that is
// shResolveTheme's job, and the two are kept apart on purpose.
function isOfferedTheme(name) {
    for (var i = 0; i < SH_THEME_PICKER.length; i++) {
        if (SH_THEME_PICKER[i].name === name) return true;
    }
    return false;
}

// Writes the inline background on the four selectors that are themed that way.
//
// INLINE on purpose - that is how these elements have always been themed, and
// changing the mechanism is a larger change than it needs to be. The important
// part is that there is exactly ONE function doing it, called from both
// applyTheme and shRefreshCardTint, so a change to the surface colour cannot
// land in one path and not the other.
function shApplySurfaceTints(theme) {
    document.querySelectorAll('.plan-card, .stat-card, .dashboard-header, .modal').forEach(function (el) {
        el.style.background = SH_CUSTOM_BG_ACTIVE
            ? shWithAlpha(theme.card, SH_BACKDROP_CARD_ALPHA)
            : theme.card;
        el.style.borderColor = theme.primary + '40';
    });
}

function applyTheme(themeName) {
    const theme = shResolveTheme(themeName);
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--secondary-color', theme.secondary);
    root.style.setProperty('--bg-color', theme.bg);
    // A backdrop in play needs translucent surfaces, so this is not a constant. See
    // shRefreshCardTint, which also explains why it cannot be done in CSS: this is
    // an inline style and would beat any rule.
    root.style.setProperty('--card-color', SH_CUSTOM_BG_ACTIVE ? shWithAlpha(theme.card, SH_BACKDROP_CARD_ALPHA) : theme.card);
    root.style.setProperty('--text-color', theme.text);
    root.style.setProperty('--accent-color', theme.accent);
    // With a custom backdrop active the body must stay transparent, or this
            // opaque colour covers it. Without one, this is the normal theme colour.
            document.body.style.background = SH_CUSTOM_BG_ACTIVE ? 'transparent' : theme.bg;
    if (currentUser) {
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].theme = themeName;
                saveUsers();
                break;
            }
        }
    }
    // Extracted so the backdrop can re-apply it. The inline write is stale the
    // moment applyTheme finishes, because the variable and the stylesheet are set
    // here but the inline style on each element is not - and inline wins.
    shApplySurfaceTints(theme);
    document.querySelectorAll('.btn-primary').forEach(function(el) {
        el.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
        // the label colour, for the same reason the gradient is here: inline beats
        // the stylesheet, so a light theme needs its ink set here or the label is
        // white on white. Defaulted, because a theme object from an older cached
        // record may not have the field.
        el.style.color = theme.onPrimary || '#ffffff';
    });
    var brand = document.querySelector('.navbar-brand');
    if (brand) {
        brand.style.background = 'linear-gradient(135deg, ' + theme.primary + ', ' + theme.secondary + ')';
        brand.style.webkitBackgroundClip = 'text';
        brand.style.webkitTextFillColor = 'transparent';
    }
}

// ============ MODAL REGISTRY ============
// Modals used to be found by their z-index:
//
//     document.querySelector('.modal-overlay[style*="z-index: 4000"]')
//
// which returns the FIRST match in document order, not the modal the caller
// opened. confirmDeleteAllBots() did the worst thing with that - see the comment
// on it. Z-index is presentation; it must never be identity.
var __shModals = {};
function shRegisterModal(key, el) { __shModals[key] = el; return el; }
function shGetModal(key) { return __shModals[key] || null; }
function shCloseModal(key) {
    var el = __shModals[key];
    if (el && el.parentNode) el.remove();
    delete __shModals[key];
}

// ============ RULES CHECK (client mirror) ============
// The same rules the worker enforces, so the reason is given before the form is
// submitted. The worker is the authority; this is a courtesy, and it is kept
// deliberately in step with ruleCheck() in the worker - worker.test.mjs W17
// asserts the worker's behaviour, and if the two drift the user is told one
// thing and then blocked for another, which is worse than being told late.
//
// Returns a human-readable reason, or '' when the text is clean.
var SH_RULE_SWEAR = [
    'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'whore', 'slut',
    'nigger', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'coon'
];

function shRulesCheck(name, extra) {
    // automated / bulk names
    var t = String(name || '').trim();
    if (t && (/^\d{1,3}$/.test(t) || /[{}<>|~`^\\]/.test(t) || /^(.)\1{7,}$/.test(t) || /\b(user|admin|test|bot)[-_]?\d{2,}\b/i.test(t))) {
        return 'That looks like an automated or bulk account name, which is not allowed.';
    }
    // swearing, matched as a whole word OR as a prefix of the whole string
    var folded = String(name || '').toLowerCase()
        .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/[3]/g, 'e')
        .replace(/[5$]/g, 's').replace(/[7]/g, 't');
    var ex = String(extra || '').toLowerCase();
    for (var i = 0; i < SH_RULE_SWEAR.length; i++) {
        var w = SH_RULE_SWEAR[i];
        var re = new RegExp('(?:^|[^a-z])' + w + '(?:[^a-z]|$)', 'i');
        if (re.test(folded) || folded.indexOf(w) === 0) {
            return 'No swearing, please. Your username contains a blocked word ("' + w + '").';
        }
        if (ex && (re.test(ex) || ex.indexOf(w) === 0)) {
            return 'No swearing, please. Your description contains a blocked word ("' + w + '").';
        }
    }
    return '';
}

// ============ CLIENT RATE LIMITING ============
// Nothing guarded these actions. handleLogin, handleSignup, confirmCreateProject
// and the key creators had no throttle, so a double-click fired one request per
// event. The server does have buckets, but hitting one yields a 429 that most of
// these paths discard - shApi resolves, the response is never read, and the user
// sees nothing happen. A client-side limit makes the refusal legible BEFORE the
// request goes out.
//
// The window lives in localStorage, not a variable, so reopening the tab does not
// hand back a fresh budget.
var SH_RATE_KEY = 'sh_rate_limits';
function shRateLoad() {
    try { return JSON.parse(localStorage.getItem(SH_RATE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function shRateSave(m) {
    try { localStorage.setItem(SH_RATE_KEY, JSON.stringify(m)); } catch (e) {}
}
// "12 Seconds" / "3 Minutes" / "2 Hours" - whichever reads best for the wait.
function shRateHuman(ms) {
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + ' Second' + (s === 1 ? '' : 's');
    var mnt = Math.ceil(s / 60);
    if (mnt < 60) return mnt + ' Minute' + (mnt === 1 ? '' : 's');
    var h = Math.ceil(mnt / 60);
    return h + ' Hour' + (h === 1 ? '' : 's');
}
// null when allowed, or the message to show when it is not.
function shRateLimit(action, max, windowMs) {
    var now = Date.now();
    var all = shRateLoad();
    var hits = (all[action] || []).filter(function (x) { return now - x < windowMs; });
    if (hits.length >= max) {
        var waitMs = windowMs - (now - hits[0]);
        return 'You are rate limited. Please wait ' + shRateHuman(waitMs) + ' before retrying.';
    }
    hits.push(now);
    all[action] = hits;
    shRateSave(all);
    return null;
}
function shRateGuard(action, max, windowMs, title) {
    var msg = shRateLimit(action, max, windowMs);
    if (!msg) return false;
    showNotification(title || 'Slow Down', msg, 'error', 7000);
    return true;
}
var SH_RATE = {
    signup:   { max: 5, window: 10 * 60 * 1000 },
    login:    { max: 8, window: 5 * 60 * 1000 },
    project:  { max: 6, window: 60 * 1000 },
    script:   { max: 6, window: 60 * 1000 },
    key:      { max: 8, window: 60 * 1000 },
    keymass:  { max: 3, window: 60 * 1000 },
    useradd:  { max: 5, window: 10 * 60 * 1000 },
    upload:   { max: 8, window: 60 * 1000 },
    password: { max: 4, window: 10 * 60 * 1000 }
};

// ============ NOTIFICATION SYSTEM ============
function showNotification(title, message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var container = document.getElementById('notificationContainer');
    if (!container) return;
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var notif = document.createElement('div');
    notif.className = 'notification ' + type;
    var iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = icons[type] || 'ℹ️';
    var contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    var titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = title;
    var messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = message;
    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(messageDiv);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = function() {
        notif.classList.add('hiding');
        setTimeout(function() { if (notif.parentNode) notif.remove(); }, 300);
    };
    notif.appendChild(iconSpan);
    notif.appendChild(contentDiv);
    notif.appendChild(closeBtn);
    container.appendChild(notif);
    if (duration > 0) {
        setTimeout(function() {
            notif.classList.add('hiding');
            setTimeout(function() { if (notif.parentNode) notif.remove(); }, 300);
        }, duration);
    }
}

// ============ DATE & TIME ============
function updateDateTime() {
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var dateEl = document.getElementById('currentDate');
    var timeEl = document.getElementById('currentTime');
    if (dateEl) dateEl.textContent = dateStr;
    if (timeEl) timeEl.textContent = timeStr;
}
updateDateTime();
setInterval(updateDateTime, 1000);

// ============ MODAL CONTROLS ============
function openModal(type) {
    var modal = document.getElementById(type + 'Modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(type) {
    var modal = document.getElementById(type + 'Modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

document.querySelectorAll('.modal-overlay').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(function(modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
});

// ============ LEGACY SCRIPT STORAGE (REMOVED) ============
// The old raw/local loader system stored full obfuscated code copies in
// localStorage ('scriptStore' / 'scriptNames' / 'loaderStore') — this
// blew past the browser storage quota on every "Create Script" and
// served no purpose anymore (raw hosting + loadstrings now live on the
// hidden Cloudflare worker host). These are no-op stubs so old callers
// don't break, and they purge any leftover data to free the quota.
function purgeLegacyScriptStores() {
    try { localStorage.removeItem('scriptStore'); } catch (e) {}
    try { localStorage.removeItem('scriptNames'); } catch (e) {}
    try { localStorage.removeItem('loaderStore'); } catch (e) {}
}
purgeLegacyScriptStores();

function storeScriptForRawAccess(scriptId, code, scriptName) { /* removed: see purgeLegacyScriptStores */ }

function getScriptForRawAccess(scriptId) { return null; }

// ============ SCRIPT LOADER SYSTEM (legacy local loader — removed) ============
function storeScriptForLoader(scriptId, scriptCode, scriptName, loaderKey) { /* removed: see purgeLegacyScriptStores */ }

function getScriptForLoader(scriptId) { return null; }

// ============ GENERATE KEY ============
// 30 characters with Uppercase + Lowercase + Numbers + Symbols
// (safe symbols only - no quotes/backslash so keys work inside Lua strings)
function generateKey() {
    var upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    var lower = 'abcdefghijkmnpqrstuvwxyz';
    var digits = '23456789';
    var symbols = '!@#$%^&*()-_=+?';
    var all = upper + lower + digits + symbols;
    // guarantee at least one of each category, then fill randomly, then shuffle
    var chars = [
        upper.charAt(Math.floor(Math.random() * upper.length)),
        lower.charAt(Math.floor(Math.random() * lower.length)),
        digits.charAt(Math.floor(Math.random() * digits.length)),
        symbols.charAt(Math.floor(Math.random() * symbols.length))
    ];
    for (var i = chars.length; i < 30; i++) {
        chars.push(all.charAt(Math.floor(Math.random() * all.length)));
    }
    for (var i = chars.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join('');
}

// ============ KEYS SYSTEM ============
function loadKeys() {
    try {
        var data = localStorage.getItem('keys_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : { keys: [], used: 0 };
    } catch (e) { return { keys: [], used: 0 }; }
}

function saveKeys(keyData) {
    try {
        localStorage.setItem('keys_' + (currentUser ? currentUser.id : ''), JSON.stringify(keyData));
    } catch (e) { console.error('Error saving keys:', e); }
    // mirror to the worker's license DB (server-side auth). Fire-and-
    // forget; /sh/auth only works once this sync has landed. The owner
    // (Scripter) owns the licenses - everyone else stays local-only.
    try {
        if (currentUser && (currentUser.username === 'Scripter' || currentUser.isAdmin)) {
            shSyncLicenses();
        }
    } catch (e) {}
}

function createKey(scriptId, keyType, expiresDays) {
    if (shRateGuard('key', SH_RATE.key.max, SH_RATE.key.window, 'Too Many Keys')) return;
    var limitErr = checkPlanLimit('keys');
    if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return null; }
    var keyData = loadKeys();
    var expires = null;
    var days = parseInt(expiresDays, 10);
    if (!isNaN(days) && days > 0) {
        expires = Date.now() + days * 86400000;
    }
    var newKey = normalizeKey({
        id: 'key_' + Date.now(),
        key: generateKey(),
        scriptId: scriptId,
        type: expires ? 'premium' : 'lifetime',
        expires: expires,
        days: (!isNaN(days) && days > 0) ? days : null,
        used: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date().toISOString()
    });
    keyData.keys.push(newKey);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    showNotification('Key Created', expires
        ? 'Key active for ' + days + ' day(s): ' + newKey.key
        : 'Unlimited key created: ' + newKey.key, 'success', 6000);
    renderKeys();
    refreshStatsUI();
    return newKey;
}

// ============ CREATE KEY UI ============
function openCreateKeyUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 460px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">🔑 Create Key</h2>
            <p class="sub">Generate a new key for your scripts</p>
            <div class="form-group">
                <label>Active For (Days)</label>
                <input type="number" id="keyDaysInput" min="0" placeholder="e.g. 3 for 3 days" style="width:100%;">
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">Enter the number of days the key stays active. Set <strong style="color:#66ff66;">0</strong> or leave empty for <strong style="color:#66ff66;">Unlimited</strong> (never expires).</div>
            </div>
            <div class="form-group">
                <label style="cursor:pointer;"><input type="checkbox" id="keyUnlimited"> ♾️ Unlimited (overrides days)</label>
            </div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="confirmCreateKeyUI()" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">🔑 Create Key</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var daysInput = overlay.querySelector('#keyDaysInput');
    if (daysInput) daysInput.focus();
    var unlimitedToggle = overlay.querySelector('#keyUnlimited');
    if (unlimitedToggle) {
        unlimitedToggle.addEventListener('change', function() {
            daysInput.disabled = this.checked;
            if (this.checked) daysInput.value = '';
        });
    }
}

function confirmCreateKeyUI() {
    var unlimited = document.getElementById('keyUnlimited').checked;
    var daysRaw = document.getElementById('keyDaysInput').value.trim();
    var days = unlimited ? 0 : (daysRaw === '' ? 0 : parseInt(daysRaw, 10));
    if (isNaN(days) || days < 0) {
        showNotification('Error', 'Please enter a valid number of days (0 or empty = Unlimited).', 'error');
        return;
    }
    createKey('all', days > 0 ? 'premium' : 'lifetime', days > 0 ? days : null);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
}

function deleteKey(keyId) {
    if (!confirm('Delete this key?')) return;
    var keyData = loadKeys();
    keyData.keys = keyData.keys.filter(k => k.id !== keyId);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    renderKeys();
    refreshStatsUI();
    showNotification('Deleted', 'Key deleted.', 'warning');
}

function verifyKey(key) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].key === key) {
            if (keyData.keys[i].used) {
                return { valid: false, message: 'Key already used.' };
            }
            if (keyData.keys[i].expires && keyData.keys[i].expires < Date.now()) {
                return { valid: false, message: 'Key has expired.' };
            }
            return { valid: true, keyData: keyData.keys[i] };
        }
    }
    return { valid: false, message: 'Invalid key.' };
}

function useKey(key) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].key === key) {
            keyData.keys[i].used = true;
            keyData.keys[i].usedBy = currentUser ? currentUser.id : 'unknown';
            keyData.keys[i].usedAt = new Date().toISOString();
            keyData.used = keyData.keys.filter(k => k.used).length;
            saveKeys(keyData);
            return true;
        }
    }
    return false;
}

function copyText(text) {
    if (!text) { showNotification('Error', 'Nothing to copy.', 'error'); return; }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function() {
            showNotification('Copied!', 'Copied to clipboard!', 'success');
        }).catch(function() { fallbackCopy(text); });
    } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
    try {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        var ok = document.execCommand('copy');
        textarea.remove();
        if (ok) showNotification('Copied!', 'Copied to clipboard!', 'success');
        else throw new Error('execCommand failed');
    } catch (e) {
        // last resort: prompt
        try { window.prompt('Copy this loadstring:', text); } catch(e2){}
        showNotification('Copy', 'Press Ctrl+C to copy, then Enter.', 'info', 8000);
    }
}

// ============ RENDER KEYS ============
// ============ USERS KEYS PAGE ============
var userKeysState = { search: '', page: 0, pageSize: 100, listVisible: true };

function keyStatusOf(k) {
    if (k.banned) return { text: '⛔ Banned', color: '#ff4444' };
    if (k.expires && k.expires < Date.now()) return { text: '⏰ expired', color: '#ffc800' };
    if (k.used) return { text: '❌ Used', color: '#ff6b6b' };
    return { text: '✅ active', color: '#66ff66' };
}

function normalizeKey(k) {
    if (k.note === undefined) k.note = '';
    if (k.discordId === undefined) k.discordId = '';
    if (k.hwid === undefined) k.hwid = '';
    if (k.hwidResets === undefined) k.hwidResets = 0;
    if (k.executions === undefined) k.executions = 0;
    if (k.banned === undefined) k.banned = false;
    if (k.banReason === undefined) k.banReason = '';
    if (k.redeemed === undefined) k.redeemed = false;
    return k;
}

function userKeysFiltered() {
    var keyData = loadKeys();
    var q = userKeysState.search.toLowerCase();
    var list = keyData.keys;
    if (q) {
        list = list.filter(function(k) {
            normalizeKey(k);
            return (k.key || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.note || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.discordId || '').toLowerCase().indexOf(q) !== -1 ||
                   (k.hwid || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    // newest first
    list = list.slice().sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return list;
}

function renderKeys() {
    var container = document.getElementById('keysList');
    if (!container) return;
    var list = userKeysFiltered();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / userKeysState.pageSize));
    if (userKeysState.page >= pages) userKeysState.page = pages - 1;
    if (userKeysState.page < 0) userKeysState.page = 0;
    var start = userKeysState.page * userKeysState.pageSize;
    var slice = list.slice(start, start + userKeysState.pageSize);
    var rangeEl = document.getElementById('userKeysRange');
    if (rangeEl) rangeEl.textContent = total === 0 ? '0-0' : (start + 1) + '-' + Math.min(start + userKeysState.pageSize, total);
    if (!userKeysState.listVisible) {
        container.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">Click "✏️ Edit Users Keys" to show the keys list.</p>';
        return;
    }
    if (total === 0) {
        container.innerHTML = '<p style="color:#8888aa; text-align:center; padding:30px 0;">No keys yet. Use "➕ Add User" to create one.</p>';
        return;
    }
    var html = '<div class="keys-table">' +
        '<div class="keys-table-header">' +
        '<span></span><span>🔑 User Key</span><span>Discord ID</span><span>Status</span><span>Note</span><span>Executions</span><span>HWID Resets</span><span>Days</span><span>Ban</span><span>Reason</span><span>Actions</span>' +
        '</div>';
    for (var i = 0; i < slice.length; i++) {
        var k = normalizeKey(slice[i]);
        var st = keyStatusOf(k);
        var daysText = k.banned ? '-' : (k.expires ? Math.max(0, Math.ceil((k.expires - Date.now()) / 86400000)) : '∞');
        html += '<div class="keys-table-row">' +
            '<span><button onclick="copyText(\'' + k.key + '\')" class="btn-sm btn-sm-primary" title="Copy Key">📋 Copy</button></span>' +
            '<span style="font-family:monospace; word-break:break-all;">' + k.key + '</span>' +
            '<span>' + (k.discordId || 'Nothing') + '</span>' +
            '<span style="color:' + st.color + ';">' + st.text + '</span>' +
            '<span>' + (k.note || '-') + '</span>' +
            '<span>' + (k.executions || 0) + '</span>' +
            '<span>' + (k.hwidResets || 0) + '</span>' +
            '<span>' + daysText + '</span>' +
            '<span>' + (k.banned ? 'Yes' : 'N/A') + '</span>' +
            '<span>' + (k.banReason || '-') + '</span>' +
            '<span style="display:flex; gap:4px;"><button onclick="openKeySettingsUI(\'' + k.id + '\')" class="btn-sm btn-sm-edit">⚙️ Settings</button><button onclick="deleteKey(\'' + k.id + '\')" class="btn-sm btn-sm-danger">🗑️ Delete</button></span>' +
            '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function userKeysDoSearch() {
    var inp = document.getElementById('userKeysSearch');
    userKeysState.search = inp ? inp.value.trim() : '';
    userKeysState.page = 0;
    renderKeys();
}

function userKeysPage(dir) {
    userKeysState.page += dir;
    if (userKeysState.page < 0) userKeysState.page = 0;
    renderKeys();
}

function toggleUserKeysList() {
    userKeysState.listVisible = !userKeysState.listVisible;
    var btn = document.getElementById('editUserKeysBtn');
    if (btn) btn.textContent = userKeysState.listVisible ? '✏️ Edit Users Keys' : '👁️ Show Users Keys';
    renderKeys();
}

// ---- Add User ----
function openAddUserUI() {
    if (shRateGuard('useradd', SH_RATE.useradd.max, SH_RATE.useradd.window, 'Too Many Users')) return;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 460px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">➕ Add User</h2>
            <p class="sub">Everything is optional - a key is generated automatically</p>
            <div class="form-group"><label>User Note</label><input type="text" id="addUserNote" placeholder="Reminder note (optional)"><div class="field-hint">e.g. Ad Reward, Friend, Buyer...</div></div>
            <div class="form-group"><label>Discord ID</label><input type="text" id="addUserDiscord" placeholder="Discord ID (optional)"><div class="field-hint">Needed for /resethwid command (bot coming soon). User can also link their discord with /redeem [code]</div></div>
            <div class="form-group"><label>Identifier (HWID)</label><input type="text" id="addUserHwid" placeholder="HWID (optional)"><div class="field-hint">If no hwid specified, it will automatically get assigned when executed with the key.</div></div>
            <div class="form-group"><label>Days</label><input type="number" id="addUserDays" min="0" placeholder="Days (optional)"><div class="field-hint">Days will start running out once the key has been redeemed. Leave blank for infinite days.</div></div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="confirmAddUserUI()" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">➕ Add User</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmAddUserUI() {
    var limitErr = checkPlanLimit('keys');
    if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return; }
    var note = document.getElementById('addUserNote').value.trim();
    var discordId = document.getElementById('addUserDiscord').value.trim();
    var hwid = document.getElementById('addUserHwid').value.trim();
    var daysRaw = document.getElementById('addUserDays').value.trim();
    var days = daysRaw === '' ? null : parseInt(daysRaw, 10);
    if (days !== null && (isNaN(days) || days < 0)) { showNotification('Error', 'Invalid days.', 'error'); return; }
    var keyData = loadKeys();
    var newKey = normalizeKey({
        id: 'key_' + Date.now(),
        key: generateKey(),
        scriptId: 'all',
        type: days ? 'premium' : 'lifetime',
        expires: days ? Date.now() + days * 86400000 : null,
        days: days,
        note: note, discordId: discordId, hwid: hwid,
        used: false, usedBy: null, usedAt: null, redeemed: false,
        createdAt: new Date().toISOString()
    });
    keyData.keys.push(newKey);
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    userKeysState.listVisible = true;
    refreshStatsUI();
    renderKeys();
    showNotification('User Added', 'Key created: ' + newKey.key, 'success', 6000);
}

// ---- Users Keys Settings (mass ops) ----
function openUserKeysSettingsUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 620px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">⚙️ Users Keys Settings</h2>
            <div class="settings-block">
                <h3>📦 Mass Generate Keys</h3>
                <div class="field-hint">You can bulk generate keys at once</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                    <input class="sh-input" type="number" id="massGenAmount" min="1" max="1000" placeholder="Amount (1-1000)" style="flex:1; min-width:120px;">
                    <input class="sh-input" type="number" id="massGenDays" min="0" placeholder="Days (Optional)" style="flex:1; min-width:120px;">
                </div>
                <input class="sh-input" type="text" id="massGenNote" placeholder="Note (Optional)" style="width:100%; margin-top:8px;">
                <button onclick="massGenerateKeys()" class="btn btn-primary" style="margin-top:10px; width:100%;">⚡ Generate</button>
            </div>
            <div class="settings-block">
                <h3>📥 Download keys</h3>
                <div class="field-hint">Useful for sellix / shoppy or any 'serial keys'. It's recommended to use JSON for import/exporting users to migrate.</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button onclick="downloadKeysTxt()" class="btn btn-close-dropdown" style="flex:1;">📄 Download TXT</button>
                    <button onclick="exportKeysJson()" class="btn btn-close-dropdown" style="flex:1;">🗄️ Export JSON</button>
                    <button onclick="deleteUnusedKeys()" class="btn btn-danger" style="flex:1;">🗑️ Delete Unused</button>
                </div>
            </div>
            <div class="settings-block">
                <h3>📤 Import Users</h3>
                <div class="field-hint">If you're migrating from another whitelist service, you can easily import your users.</div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <input type="file" id="importUsersFile" accept=".json" style="flex:1;">
                    <button onclick="importUsersFile()" class="btn btn-primary">Confirm</button>
                </div>
            </div>
            <div class="settings-block">
                <h3>💗 Mass compensate / Mass resethwid</h3>
                <div class="field-hint">Mass compensate days for all of your users - useful if your script was unusable for some time. Mass reset HWID is useful when there's a new executor out.</div>
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <input class="sh-input" type="number" id="massCompDays" min="1" placeholder="Days" style="flex:1; min-width:80px;">
                    <button onclick="massCompensateDays()" class="btn btn-close-dropdown" style="flex:1;">➕ Add Days</button>
                    <button onclick="resetAllHwids()" class="btn btn-danger" style="flex:1;">🔄 Reset All HWIDS</button>
                </div>
            </div>
            <div class="settings-block">
                <h3>🛡️ Server Auth Controls (Luarmor model)</h3>
                <div class="field-hint">License keys + HWID are checked SERVER-SIDE on every execution (your worker must be deployed). The kill-switch instantly fails every auth for every script - use it if a loader leaks.</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button onclick="shLicenseSyncNow(this)" class="btn btn-close-dropdown" style="flex:1;">☁️ Sync Licenses Now</button>
                    <button onclick="toggleKillswitch(this)" class="btn btn-danger" style="flex:1;">🛑 Kill-Switch: OFF</button>
                </div>
            </div>
            <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="width:100%; margin-top:8px;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function shLicenseSyncNow(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing...'; }
    shSyncLicenses().then(function(d) {
        if (btn) { btn.disabled = false; btn.textContent = '☁️ Sync Licenses Now'; }
        showNotification(d && d.ok ? 'Licenses Synced' : 'Sync Failed', d && d.ok ? ((d.count || 0) + ' license(s) now enforced server-side.') : ((d && d.error) || 'Deploy the worker + log in as the owner first.'), d && d.ok ? 'success' : 'warning', 6000);
    });
}
window.shLicenseSyncNow = shLicenseSyncNow;

function toggleKillswitch(btn) {
    var on = !/ON/.test(btn.textContent);
    shSetKillswitch(on).then(function(d) {
        if (d && d.ok) {
            btn.textContent = on ? '🛑 Kill-Switch: ON (every auth fails - click to disable)' : '🛑 Kill-Switch: OFF';
            showNotification('Kill-Switch ' + (on ? 'ARMED' : 'Disarmed'), on ? 'Every license auth now fails instantly. All protected loaders are dead.' : 'License auth works again.', on ? 'warning' : 'success', 7000);
        } else {
            showNotification('Failed', (d && d.error) || 'Owner-only control (log in as Scripter, worker deployed).', 'error', 6000);
        }
    });
}
window.toggleKillswitch = toggleKillswitch;

function massGenerateKeys() {
    if (shRateGuard('keymass', SH_RATE.keymass.max, SH_RATE.keymass.window, 'Too Many Key Batches')) return;
    var amount = parseInt(document.getElementById('massGenAmount').value, 10);
    var daysRaw = document.getElementById('massGenDays').value.trim();
    var note = document.getElementById('massGenNote').value.trim();
    if (isNaN(amount) || amount < 1 || amount > 1000) { showNotification('Error', 'Amount must be between 1 and 1000.', 'error'); return; }
    var limitErr = checkPlanLimit('keys', amount);
    if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return; }
    var days = daysRaw === '' ? null : parseInt(daysRaw, 10);
    var keyData = loadKeys();
    for (var i = 0; i < amount; i++) {
        keyData.keys.push(normalizeKey({
            id: 'key_' + Date.now() + '_' + i,
            key: generateKey(),
            scriptId: 'all',
            type: days ? 'premium' : 'lifetime',
            expires: days ? Date.now() + days * 86400000 : null,
            days: days, note: note,
            used: false, usedBy: null, usedAt: null, redeemed: false,
            createdAt: new Date().toISOString()
        }));
    }
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    refreshStatsUI();
    renderKeys();
    showNotification('Generated', amount + ' key(s) generated' + (days ? ' (' + days + ' day(s) each)' : ' (unlimited)'), 'success');
}

function downloadKeysTxt() {
    var keyData = loadKeys();
    var lines = keyData.keys.map(function(k) { return k.key; });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scripterhub_keys.txt';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
    showNotification('Downloaded', lines.length + ' key(s) saved to scripterhub_keys.txt', 'success');
}

function exportKeysJson() {
    var keyData = loadKeys();
    var blob = new Blob([JSON.stringify(keyData.keys, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scripterhub_users.json';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
    showNotification('Exported', keyData.keys.length + ' user(s) exported to scripterhub_users.json', 'success');
}

function deleteUnusedKeys() {
    if (!confirm('Delete ALL unused keys? This cannot be undone!')) return;
    var keyData = loadKeys();
    var before = keyData.keys.length;
    keyData.keys = keyData.keys.filter(function(k) { return k.used || k.banned; });
    keyData.used = keyData.keys.filter(k => k.used).length;
    saveKeys(keyData);
    refreshStatsUI();
    renderKeys();
    showNotification('Deleted', (before - keyData.keys.length) + ' unused key(s) deleted.', 'warning');
}

function importUsersFile() {
    var input = document.getElementById('importUsersFile');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select a JSON file first.', 'error'); return; }
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Not a valid users array');
            var limitErr = checkPlanLimit('keys', imported.length);
            if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return; }
            var keyData = loadKeys();
            var added = 0;
            for (var i = 0; i < imported.length; i++) {
                var k = imported[i];
                if (!k || !k.key) continue;
                keyData.keys.push(normalizeKey({
                    id: k.id || ('key_' + Date.now() + '_' + i),
                    key: k.key,
                    scriptId: k.scriptId || 'all',
                    type: k.type || 'lifetime',
                    expires: k.expires || null,
                    days: k.days || null,
                    note: k.note || '', discordId: k.discordId || '', hwid: k.hwid || '',
                    hwidResets: k.hwidResets || 0, executions: k.executions || 0,
                    banned: !!k.banned, banReason: k.banReason || '',
                    used: !!k.used, usedBy: k.usedBy || null, usedAt: k.usedAt || null, redeemed: !!k.redeemed,
                    createdAt: k.createdAt || new Date().toISOString()
                }));
                added++;
            }
            keyData.used = keyData.keys.filter(k => k.used).length;
            saveKeys(keyData);
            refreshStatsUI();
            renderKeys();
            showNotification('Imported', added + ' user(s) imported.', 'success');
        } catch (err) {
            showNotification('Error', 'Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function massCompensateDays() {
    var days = parseInt(document.getElementById('massCompDays').value, 10);
    if (isNaN(days) || days < 1) { showNotification('Error', 'Enter a valid number of days (min 1).', 'error'); return; }
    if (!confirm('Add ' + days + ' day(s) to ALL users?')) return;
    var keyData = loadKeys();
    var count = 0;
    for (var i = 0; i < keyData.keys.length; i++) {
        var k = normalizeKey(keyData.keys[i]);
        if (k.banned) continue;
        if (k.expires) {
            var base = Math.max(k.expires, Date.now());
            k.expires = base + days * 86400000;
        } else {
            k.expires = Date.now() + days * 86400000;
        }
        count++;
    }
    saveKeys(keyData);
    renderKeys();
    showNotification('Compensated', days + ' day(s) added to ' + count + ' user(s).', 'success');
}

function resetAllHwids() {
    if (!confirm('Reset HWID for ALL users?')) return;
    var keyData = loadKeys();
    var count = 0;
    for (var i = 0; i < keyData.keys.length; i++) {
        var k = normalizeKey(keyData.keys[i]);
        if (k.hwid) { k.hwid = ''; k.hwidResets = (k.hwidResets || 0) + 1; count++; }
    }
    saveKeys(keyData);
    renderKeys();
    showNotification('HWIDs Reset', count + ' user(s) HWID reset.', 'success');
}

// ---- Per-key Settings ----
function findKeyById(keyId) {
    var keyData = loadKeys();
    for (var i = 0; i < keyData.keys.length; i++) {
        if (keyData.keys[i].id === keyId) return { data: keyData, key: normalizeKey(keyData.keys[i]) };
    }
    return null;
}

function openKeySettingsUI(keyId) {
    var found = findKeyById(keyId);
    if (!found) { showNotification('Error', 'Key not found.', 'error'); return; }
    var k = found.key;
    var expiryDate = k.expires ? new Date(k.expires) : null;
    var dateVal = expiryDate ? expiryDate.getFullYear() + '-' + String(expiryDate.getMonth() + 1).padStart(2, '0') + '-' + String(expiryDate.getDate()).padStart(2, '0') : '';
    var timeVal = expiryDate ? String(expiryDate.getHours()).padStart(2, '0') + ':' + String(expiryDate.getMinutes()).padStart(2, '0') : '';
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 560px; padding: 28px; max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h2 style="font-size:20px; margin:0;">✏️ Edit User Key Details</h2>
                <div style="display:flex; gap:8px;">
                    <button onclick="saveKeySettings('${keyId}')" class="btn btn-primary" style="padding:8px 18px;">💾 Save</button>
                    <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="padding:8px 18px;">Cancel</button>
                </div>
            </div>
            <div style="display:flex; gap:14px; align-items:center; background:rgba(20,20,35,0.6); border-radius:12px; padding:14px; margin-bottom:14px;">
                <div class="credit-avatar-wrap" style="width:64px; height:64px; margin:0;"><div class="credit-avatar-fallback" style="font-size:22px;">?</div></div>
                <div>
                    <div style="color:#fff; font-weight:600; font-size:15px;">Unknown User</div>
                    <div style="color:#66ccff; font-family:monospace; font-size:12px; word-break:break-all; margin-top:4px;">Key: ${k.key}</div>
                </div>
            </div>
            <div class="form-group" style="display:flex; gap:16px;">
                <span style="color:#8888aa; font-size:13px; flex:1;">Total HWID Resets: <strong style="color:#fff;">${k.hwidResets || 0}</strong></span>
                <span style="color:#8888aa; font-size:13px; flex:1;">Total Executions: <strong style="color:#fff;">${k.executions || 0}</strong></span>
            </div>
            <div class="form-group"><label>Expiry (date + time, empty = never)</label>
                <div style="display:flex; gap:8px;">
                    <input type="date" id="keyExpiryDate" value="${dateVal}" style="flex:1;">
                    <input class="sh-input" type="time" id="keyExpiryTime" value="${timeVal}" style="flex:1;">
                </div>
            </div>
            <div class="form-group"><label>Note</label><input type="text" id="keyNote" value="${(k.note || '').replace(/"/g, '&quot;')}" placeholder="Just a plain text (optional)"></div>
            <div class="form-group"><label>Discord ID</label><input type="text" id="keyDiscordId" value="${k.discordId || ''}" placeholder="Discord ID (optional)"></div>
            <div class="form-group"><label>HWID</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="keyHwid" value="${k.hwid || ''}" placeholder="HWID (optional)" style="flex:1;">
                    <button onclick="resetOneHwid('${keyId}')" class="btn btn-close-dropdown">🔄 Reset</button>
                </div>
            </div>
            <div class="form-group"><label>⛔ Blacklist User - Reason:</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="keyBanReason" value="${(k.banReason || '').replace(/"/g, '&quot;')}" placeholder="Blacklist reason (optional)" style="flex:1;">
                    <button onclick="blacklistKey('${keyId}')" class="btn btn-danger">${k.banned ? 'Unban' : 'Blacklist'}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function saveKeySettings(keyId) {
    var found = findKeyById(keyId);
    if (!found) { showNotification('Error', 'Key not found.', 'error'); return; }
    var k = found.key;
    k.note = document.getElementById('keyNote').value.trim();
    k.discordId = document.getElementById('keyDiscordId').value.trim();
    k.hwid = document.getElementById('keyHwid').value.trim();
    var d = document.getElementById('keyExpiryDate').value;
    var t = document.getElementById('keyExpiryTime').value || '00:00';
    if (d) {
        var dt = new Date(d + 'T' + t);
        k.expires = isNaN(dt.getTime()) ? null : dt.getTime();
    } else {
        k.expires = null;
    }
    saveKeys(found.data);
    renderKeys();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Saved', 'Key details updated.', 'success');
}

function resetOneHwid(keyId) {
    var found = findKeyById(keyId);
    if (!found) return;
    var doLocal = function() {
        found.key.hwid = '';
        found.key.hwidResets = (found.key.hwidResets || 0) + 1;
        saveKeys(found.data);
        var inp = document.getElementById('keyHwid');
        if (inp) inp.value = '';
        renderKeys();
        showNotification('HWID Reset', 'HWID cleared. Resets: ' + found.key.hwidResets, 'success');
    };
    // server-side reset first (enforces the 24h cooldown on /sh/auth),
    // then mirror locally. Offline/local-only keys fall back to local.
    shOwnerApi('sh/license-reset', { token: shOwnerToken(), key: found.key.key }).then(function(d) {
        if (d && d.ok) doLocal();
        else showNotification('HWID Reset Blocked', (d && d.error) || 'Server rejected the reset (is this a cloud-synced key?). Reset locally?', 'warning', 6000);
    }).catch(function() { doLocal(); });
}

function blacklistKey(keyId) {
    var found = findKeyById(keyId);
    if (!found) return;
    var reason = document.getElementById('keyBanReason') ? document.getElementById('keyBanReason').value.trim() : '';
    var ban = !found.key.banned;
    var doLocal = function() {
        if (ban) {
            found.key.banned = true;
            found.key.banReason = reason || 'No reason provided';
            showNotification('Blacklisted', 'User blacklisted: ' + found.key.banReason, 'warning');
        } else {
            found.key.banned = false;
            found.key.banReason = '';
            showNotification('Unbanned', 'User unbanned.', 'success');
        }
        saveKeys(found.data);
        renderKeys();
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        openKeySettingsUI(keyId);
    };
    // server ban first so /sh/auth rejects the key on the next run
    shOwnerApi('sh/license-ban', { token: shOwnerToken(), key: found.key.key, banned: ban, reason: reason }).then(function(d) {
        if (d && d.ok) doLocal();
        else doLocal(); // local ban still applies (sync mirrors it later)
    }).catch(function() { doLocal(); });
}

// ============ UI UPDATE ============
function updateUIForUser(user) {
    if (!user) return;
    isLoggedIn = true;
    currentUser = user;
    window.currentUser = user;
    setCurrentUser(user);
    // Establish the cloud session token as soon as someone is signed in, rather
    // than waiting for the first upload. Every owner panel call authenticates
    // with it, so a missing token reads as a permission problem when it is
    // really a session that was never started. Fire-and-forget: signing in must
    // not block on the network.
    try { shEnsureUserToken(); } catch (e) {}
    var signupBtn = document.getElementById('signupBtn');
    var loginBtn = document.getElementById('loginBtn');
    var navbarUser = document.getElementById('navbarUser');
    var adminBtn = document.getElementById('adminBtn');
    var usersBtn = document.getElementById('usersBtn');
    if (signupBtn) signupBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'none';
    if (navbarUser) navbarUser.classList.add('show');
    var avatar = document.getElementById('userAvatar');
    var userName = document.getElementById('userName');
    var userPlan = document.getElementById('userPlan');
    if (avatar) {
        if (user.profileImage) {
            avatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }
    }
    if (userName) userName.textContent = user.username;
    if (userPlan) userPlan.textContent = user.plan || 'Basic';
    if (adminBtn && user.username === 'Scripter') {
        adminBtn.style.display = 'inline-block';
    } else if (adminBtn) {
        adminBtn.style.display = 'none';
    }
    if (usersBtn && user.username === 'Scripter') {
        usersBtn.style.display = 'inline-block';
    } else if (usersBtn) {
        usersBtn.style.display = 'none';
    }
    if (user.theme) {
        applyTheme(user.theme);
        // the picker reads the SAVED theme, which is the same value - but it also
        // builds the options on first run, and it is what makes a custom colour
        // selectable. Setting `select.value` here left the control blank on a saved
        // custom theme, because no option had that value.
        shRenderThemePicker();
    }
    // The custom backdrop is applied on every UI refresh, not just after an
    // upload, so it survives a page reload and a cross-device sync. The theme is
    // applied ABOVE it and the two do not interact - the backdrop is a separate
    // feature, not a repurpose of the banner.
    applyCustomBackground(
        (typeof user.customBackground === 'string' && user.customBackground) ? user.customBackground : null
    );
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    if (homePage) homePage.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    dashboard.classList.add('show');
    if (plansSection) plansSection.style.display = 'none';
    showTabs();
    var dashUsername = document.getElementById('dashUsername');
    var dashEmail = document.getElementById('dashEmail');
    var dashPlan = document.getElementById('dashPlan');
    var dashAvatar = document.getElementById('dashAvatar');
    var dashBanner = document.getElementById('dashBanner');
    var dashUsername2 = document.getElementById('dashUsername2');
    var dashPlan2 = document.getElementById('dashPlan2');
    if (dashUsername) dashUsername.textContent = user.username;
    setDashEmail(user.email);
    if (dashPlan) dashPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (dashUsername2) dashUsername2.textContent = user.username;
    if (dashPlan2) dashPlan2.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (dashAvatar) {
        if (user.profileImage) {
            dashAvatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            dashAvatar.textContent = user.username.charAt(0).toUpperCase();
            dashAvatar.style.display = 'flex';
            dashAvatar.style.alignItems = 'center';
            dashAvatar.style.justifyContent = 'center';
            dashAvatar.style.fontSize = '40px';
            dashAvatar.style.fontWeight = 'bold';
        }
    }
    if (dashBanner && user.bannerImage) {
        dashBanner.style.backgroundImage = 'url(' + user.bannerImage + ')';
        dashBanner.style.display = 'block';
    } else if (dashBanner) {
        dashBanner.style.display = 'none';
    }
    refreshStatsUI();
    initRewards();
    console.log('✅ Dashboard shown for user:', user.username);
}

// ============ EMAIL HIDE/SHOW ============
function setDashEmail(email) {
    document.querySelectorAll('#dashEmail').forEach(function(el) {
        if (el.dataset.hidden === '1') {
            el.dataset.email = email;
        } else {
            el.textContent = email;
        }
    });
}

function toggleEmail(btn) {
    var span = btn.parentElement.querySelector('#dashEmail');
    if (!span) return;
    if (span.dataset.hidden === '1') {
        span.textContent = span.dataset.email || '';
        delete span.dataset.hidden;
        delete span.dataset.email;
        btn.textContent = 'Hide';
    } else {
        span.dataset.email = span.textContent;
        span.dataset.hidden = '1';
        span.textContent = '🔒';
        btn.textContent = 'Show';
    }
}

// ============ REAL STATS (computed from actual data) ============
function normalizeMax(v) {
    if (v === null || v === undefined || v === Infinity) return Infinity;
    var n = Number(v);
    return isNaN(n) ? Infinity : n;
}

function formatSizeMB(mb) {
    if (mb === Infinity) return '∞';
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    var v = mb < 0.01 ? 0.01 : mb;
    return parseFloat(v.toFixed(2)) + ' MB';
}

function computeStats(user) {
    var plan = PLAN_CONFIGS[user && user.plan] || PLAN_CONFIGS['Basic'];
    var projects = loadProjects();
    var scriptsCount = 0;
    var storageBytes = 0;
    for (var i = 0; i < projects.length; i++) {
        var scripts = projects[i].scripts || [];
        scriptsCount += scripts.length;
        for (var j = 0; j < scripts.length; j++) {
            storageBytes += ((scripts[j].code || '').length + (scripts[j].originalCode || '').length);
        }
    }
    var keyData = loadKeys();
    var storageMaxMB = normalizeMax(plan.fileSize);
    var storageUsedMB = storageBytes / (1024 * 1024);
    return {
        projects: { used: projects.length, max: normalizeMax(plan.projects) },
        keys: { used: keyData.keys.length, max: normalizeMax(plan.keys) },
        scripts: { used: scriptsCount, max: normalizeMax(plan.scripts) },
        storage: { usedMB: storageUsedMB, maxMB: storageMaxMB }
    };
}

function setStatValue(root, name, usedText, maxText) {
    var usedEl = root.querySelector('#' + name + 'Used');
    var maxEl = root.querySelector('#' + name + 'Max');
    if (usedEl) usedEl.textContent = usedText;
    if (maxEl) maxEl.textContent = maxText;
}

function setStatBar(root, name, used, max) {
    var bar = root.querySelector('#' + name + 'Bar');
    if (!bar) return;
    var pct = 0;
    if (max > 0 && max !== Infinity) pct = (used / max) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
    bar.className = 'fill';
    if (pct > 90) bar.classList.add('danger');
    else if (pct > 70) bar.classList.add('warning');
}

function refreshStatsUI() {
    if (!currentUser) return;
    var stats = computeStats(currentUser);
    // main dashboard + cloned tab dashboard both carry the same ids
    document.querySelectorAll('.dashboard, #tab-dashboard').forEach(function(root) {
        setStatValue(root, 'projects', stats.projects.used, stats.projects.max === Infinity ? '∞' : stats.projects.max);
        setStatValue(root, 'keys', stats.keys.used, stats.keys.max === Infinity ? '∞' : stats.keys.max);
        setStatValue(root, 'scripts', stats.scripts.used, stats.scripts.max === Infinity ? '∞' : stats.scripts.max);
        setStatValue(root, 'storage', formatSizeMB(stats.storage.usedMB), stats.storage.maxMB === Infinity ? '∞' : formatSizeMB(stats.storage.maxMB));
        setStatBar(root, 'projects', stats.projects.used, stats.projects.max);
        setStatBar(root, 'keys', stats.keys.used, stats.keys.max);
        setStatBar(root, 'scripts', stats.scripts.used, stats.scripts.max);
        setStatBar(root, 'storage', stats.storage.usedMB, stats.storage.maxMB);
    });
    refreshAnalyticsUI();
}
var analyticsState = { execRange: 'all', obfRange: 'all' };

function loadAnalytics() {
    try {
        var data = localStorage.getItem('sh_analytics_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : { executions: [], obfuscations: [], threats: [], daily: {} };
    } catch (e) { return { executions: [], obfuscations: [], threats: [], daily: {} }; }
}

function saveAnalytics(a) {
    try { localStorage.setItem('sh_analytics_' + (currentUser ? currentUser.id : ''), JSON.stringify(a)); } catch (e) {}
}

// recordExecution() USED TO BE HERE, and it was the only writer of a.daily -
// which is what the Executor Statistics panel read. Nothing ever called it: the
// obfuscated payload posts to the worker's /track, not back to this page, so it
// could not. a.daily was therefore permanently {} and the panel permanently
// rendered five rows of "-" and 0 while looking like real data.
//
// It is removed rather than left in place, because a function whose name
// promises to record something, sitting next to a panel it used to feed and
// which nothing calls, is exactly the kind of thing that makes the next person
// believe the numbers are real. The panel now reads the worker's 60-second
// window instead (see renderExecutorDailyStats).
//
// If execution counting is ever wanted on the page, it has to come from a real
// call site - the site cannot observe an executor running a script, because the
// script runs in Roblox, not here.

function recordObfuscation() {
    var a = loadAnalytics();
    a.obfuscations.push({ t: Date.now() });
    if (a.obfuscations.length > 5000) a.obfuscations = a.obfuscations.slice(-5000);
    saveAnalytics(a);
}

function recordThreat(reason) {
    var a = loadAnalytics();
    a.threats.push({ t: Date.now(), reason: reason || 'bypass attempt' });
    if (a.threats.length > 5000) a.threats = a.threats.slice(-5000);
    saveAnalytics(a);
}

function rangeStartMs(range) {
    var now = new Date();
    if (range === 'day') { var d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return d.getTime(); }
    if (range === 'week') return now.getTime() - 7 * 86400000;
    if (range === 'month') return now.getTime() - 30 * 86400000;
    if (range === 'year') return now.getTime() - 365 * 86400000;
    return 0;
}

function countSince(list, range) {
    var since = rangeStartMs(range);
    var n = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].t >= since) n++; }
    return n;
}

function setExecRange(range, btn) {
    analyticsState.execRange = range;
    if (btn) btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    refreshAnalyticsUI();
}

function setObfRange(range, btn) {
    analyticsState.obfRange = range;
    if (btn) btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    refreshAnalyticsUI();
}

function setAnalyticsValue(id, text) {
    document.querySelectorAll('#' + id).forEach(function(el) { el.textContent = text; });
}

function refreshAnalyticsUI() {
    if (!currentUser) return;
    var a = loadAnalytics();
    var localThreats = 0;
    try { localThreats = (JSON.parse(localStorage.getItem('sh_threats_local') || '[]')).length; } catch (e) {}
    setAnalyticsValue('totalExecutions', countSince(a.executions, analyticsState.execRange));
    setAnalyticsValue('totalObfuscations', countSince(a.obfuscations, analyticsState.obfRange));
    setAnalyticsValue('totalThreats', a.threats.length + localThreats);
    // The endpoint label that used to live here is gone with the Live
        // Executions Chart. This comment is load-bearing: the previous line was
        //
        //     if (ep && !ep.textContent) ep.textContent = ...
        //
        // and its DECLARATION (`var ep = document.getElementById(...)`) had been
        // deleted with the chart while the USE was left behind. `ep` was therefore an
        // undeclared identifier and this function threw a ReferenceError on every
        // call.
        //
        // That is much worse than a broken label. updateUIForUser() calls this, and
        // handleSignup() calls updateUIForUser() BEFORE mirroring the new account to
        // the cloud - so the throw propagated out, the mirror never ran, the account
        // was never created server-side, no user token was ever issued, and nothing
        // could be uploaded. Reported as "people cannot do anything". The existing
        // account was unaffected, which is why it read as a new-user problem.
        //
        // tools/bundle_smoke_test.mjs now executes the built bundle so a reference
        // with no declaration cannot pass unnoticed again.
}

function executorColor(i) {
    var cols = ['#6c3bff', '#00bfff', '#66ff66', '#ff66cc', '#ffd700', '#ff8844', '#00ccaa', '#ff4444'];
    return cols[i % cols.length];
}

function updateDashboardTab(user) {
    var tabDashboard = document.getElementById('tab-dashboard');
    if (!tabDashboard) return;
    var tabUsername = tabDashboard.querySelector('#dashUsername');
    var tabPlan = tabDashboard.querySelector('#dashPlan');
    var tabAvatar = tabDashboard.querySelector('#dashAvatar');
    var tabBanner = tabDashboard.querySelector('#dashBanner');
    var tabUsername2 = tabDashboard.querySelector('#dashUsername2');
    var tabPlan2 = tabDashboard.querySelector('#dashPlan2');
    if (tabUsername) tabUsername.textContent = user.username;
    if (tabPlan) tabPlan.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (tabUsername2) tabUsername2.textContent = user.username;
    if (tabPlan2) tabPlan2.textContent = '📊 Current Plan: ' + (user.plan || 'Basic');
    if (tabAvatar) {
        if (user.profileImage) {
            tabAvatar.innerHTML = '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            tabAvatar.textContent = user.username.charAt(0).toUpperCase();
            tabAvatar.style.display = 'flex';
            tabAvatar.style.alignItems = 'center';
            tabAvatar.style.justifyContent = 'center';
            tabAvatar.style.fontSize = '40px';
            tabAvatar.style.fontWeight = 'bold';
        }
    }
    if (tabBanner && user.bannerImage) {
        tabBanner.style.backgroundImage = 'url(' + user.bannerImage + ')';
        tabBanner.style.display = 'block';
    } else if (tabBanner) {
        tabBanner.style.display = 'none';
    }
    setDashEmail(user.email);
    refreshStatsUI();
}

function updateTabBar(container, name, used, max) {
    var bar = container.querySelector('#' + name + 'Bar');
    if (!bar) return;
    var percentage = 0;
    if (max > 0 && max !== Infinity) { percentage = (used / max) * 100; }
    bar.style.width = Math.min(percentage, 100) + '%';
    bar.className = 'fill';
    if (percentage > 90) { bar.classList.add('danger'); } else if (percentage > 70) { bar.classList.add('warning'); }
}

function updateBar(name, used, max) {
    var bar = document.getElementById(name + 'Bar');
    if (!bar) return;
    var percentage = 0;
    if (max > 0 && max !== Infinity) { percentage = (used / max) * 100; }
    bar.style.width = Math.min(percentage, 100) + '%';
    bar.className = 'fill';
    if (percentage > 90) { bar.classList.add('danger'); } else if (percentage > 70) { bar.classList.add('warning'); }
}

// ============ AUTH FUNCTIONS ============
function logout() {
    // Before anything else: clear the credential, so no request made after this
    // point can still be authenticated as whoever was signed in before.
    shClearUserToken();
    isLoggedIn = false;
    currentUser = null;
    window.currentUser = null;
    clearCurrentUser();
    var signupBtn = document.getElementById('signupBtn');
    var loginBtn = document.getElementById('loginBtn');
    var navbarUser = document.getElementById('navbarUser');
    var adminBtn = document.getElementById('adminBtn');
    var usersBtn = document.getElementById('usersBtn');
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    var tabsNav = document.getElementById('tabsNav');
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (navbarUser) navbarUser.classList.remove('show');
    if (adminBtn) adminBtn.style.display = 'none';
    if (usersBtn) usersBtn.style.display = 'none';
    if (tabsNav) tabsNav.style.display = 'none';
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    dashboard.style.display = 'none';
    if (plansSection) plansSection.style.display = 'block';
    var tabDashboard = document.getElementById('tab-dashboard');
    if (tabDashboard) tabDashboard.innerHTML = '';
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) { contents[i].style.display = 'none'; }
    showNotification('Logged Out', 'You have been logged out successfully.', 'info');
    console.log('👋 Logged out');
}

function handleSignup(event) {
    if (shRateGuard('signup', SH_RATE.signup.max, SH_RATE.signup.window, 'Too Many Signup Attempts')) return;
    event.preventDefault();
    var email = document.getElementById('signupEmail').value.trim();
    var username = document.getElementById('signupUsername').value.trim();
    var password = document.getElementById('signupPassword').value;
    var description = document.getElementById('signupDescription').value.trim();
    if (!email || !username || !password) {
        showNotification('Error', 'Please fill in all required fields.', 'error');
        return;
    }
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Error', 'Please enter a valid email address.', 'error');
        return;
    }
    // blocked words (bot raid floods) - check username + email together
    var shCombined = (username + ' ' + email).toLowerCase();
    for (var bw = 0; bw < SH_BLOCKED_WORDS.length; bw++) {
        if (shCombined.indexOf(SH_BLOCKED_WORDS[bw]) !== -1) {
            showNotification('Error', 'This username or email is not allowed.', 'error');
            return;
        }
    }
    // RULES: the same check the worker runs, so the person finds out before the
    // form is submitted rather than after. The worker is the authority - this is
    // only here to save a pointless round trip and to say why.
    // The rules are published in Settings > Rules, and every penalty is a
    // temporary block; nothing here deletes anything.
    var shRuleHit = shRulesCheck(username, description);
    if (shRuleHit) {
        showNotification('Not allowed', shRuleHit, 'error', 9000);
        return;
    }
    if (password.length < 6) {
        showNotification('Error', 'Password must be at least 6 characters.', 'error');
        return;
    }
    if (users[email]) {
        showNotification('Error', 'An account with this email already exists.', 'error');
        return;
    }
    for (var key in users) {
        if (users[key].username.toLowerCase() === username.toLowerCase()) {
            showNotification('Error', 'This username is already taken.', 'error');
            return;
        }
    }
    var user = {
        id: 'user_' + Date.now(),
        email: email,
        username: username,
        password: btoa(password),
        plan: 'Basic',
        description: description || '',
        createdAt: new Date().toISOString(),
        isAdmin: false,
        isScripter: false,
        profileImage: '',
        bannerImage: '',
        theme: 'default',
        stats: { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } }
    };
    users[email] = user;
    saveUsers();
    closeModal('signup');
    showNotification('Success!', 'Account created successfully! Welcome ' + username, 'success');
    // Mirror the account to the cloud so it shows on every device.
    //
    // This used to be:
    //
    //     shApi('sh/user-signup', {...}).catch(function() {});
    //
    // The response was never inspected, so a FAILED cloud signup - 429 on the
    // 10/minute or 120/hour caps, a 500, or simply being offline - was
    // indistinguishable from success. The account existed only in this browser,
    // the user was told it was created, and the old reconcile then DELETED it on
    // the next boot or Refresh. That whole chain is what made alt accounts vanish.
    //
    // Now the result is checked, and a failure is stated rather than swallowed.
    // The local record is kept either way - it is the only copy there is.
    var mirrorPayload = {
        email: email, username: username, password: password,
        description: description || '', id: user.id, createdAt: user.createdAt
    };
    function reportMirrorFailure(reason) {
        showNotification('Saved on this device only',
            'Your account was created here but NOT on the server: ' + reason +
                + ' Everything you do will work on this device, but it will not appear on your other devices '
                + ' Everything you do will work on this device, but it will not appear on your other '
                + 'devices until it syncs. Retrying automatically in a few seconds - if it still fails, '
                + 'check your connection and sign in again.', 'warning', 12000);
    }
    // ONE in-flight signup, shared by every caller.
    //
    // This used to fire twice within a few milliseconds: once fire-and-forget
    // here, and again further down to mint the session token. The worker refuses
    // a duplicate email with 409 "An account with this email already exists.", so
    // the SECOND call - the one whose response decides whether the token is saved
    // - always came back not-ok, and reportMirrorFailure() then told the user
    // "Saved on this device only ... will not appear on your other devices" about
    // an account that had just been created on the server.
    //
    // Deduplicating fixes the false alarm and the wasted round trip. The promise
    // is cleared once it settles, so the retry below is still a real retry.
    var cloudPush = null;
    function pushToCloud() {
        if (cloudPush) return cloudPush;
        cloudPush = shApi('sh/user-signup', mirrorPayload).then(function (d) {
    // The RESPONSE is returned, not just a verdict. /sh/user-signup issues a
    // session token, and the caller needs it - fetching one separately costs a
    // second PBKDF2 over the same password.
    if (d && d.ok) return d;
            reportMirrorFailure((d && d.error) || 'the server did not confirm it');
            return null;
        }).catch(function (e) {
            reportMirrorFailure('could not reach the server (' + ((e && e.message) || e) + ')');
            return null;
        }).then(function (r) {
            cloudPush = null;
            return r;
        });
        return cloudPush;
    }
    // One automatic retry, because a transient failure is the common case and a
    // silent half-created account is not a helpful outcome. cloudPush has settled
    // by now, so this is a genuine new attempt rather than a duplicate.
    setTimeout(function() {
        if (!users[email] || !users[email].notOnCloud) return;
        pushToCloud();
    }, 4000);
    document.getElementById('signupForm').reset();
    var userData = { ...user };
    delete userData.password;
    // A new account is signed in immediately, and the admin panel, the users list
    // and the cloud sync all authenticate with a session token. Start it now, while
    // the password is in hand, instead of leaving it to be re-derived later.
    // Chained off the mirror, NOT fired alongside it. /sh/user-login cannot
    // authenticate an account /sh/user-signup has not finished writing, so
    // minting here raced the mirror and lost every time.
    pushToCloud().then(function (d) {
        // The worker signs a token during signup, so this is normally free. Against
        // an older worker there is no token in the response and the login call is
        // still needed - so the fallback stays, and is only ever paid once.
        if (d && d.token) { shSaveUserToken(d.token); return; }
        shMintUserToken(email, password);
    });
    updateUIForUser(userData);
    console.log('✅ User signed up and logged in:', username);
}

function handleLogin(event) {
    if (shRateGuard('login', SH_RATE.login.max, SH_RATE.login.window, 'Too Many Login Attempts')) return;
    event.preventDefault();
    var emailOrUsername = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!emailOrUsername || !password) {
        showNotification('Error', 'Please fill in all fields.', 'error');
        return;
    }
    var foundUser = null;
    var foundKey = null;
    for (var key in users) {
        if (key === emailOrUsername || users[key].username.toLowerCase() === emailOrUsername.toLowerCase()) {
            foundUser = users[key];
            foundKey = key;
            break;
        }
    }
    if (!foundUser || btoa(password) !== foundUser.password) {
        // not in this device's storage -> try the cloud (cross-device login)
        shApi('sh/user-login', { emailOrUsername: emailOrUsername, password: password }).then(function(d) {
            if (d.ok && d.user) {
                users[d.user.email] = d.user;
                users[d.user.email].password = btoa(password);
                // The worker just issued a session token and this threw it away.
                // Every owner panel call authenticates with it, so discarding it is
                // what left the panel with no credential and no honest error.
                shSaveUserToken(d.token);
                saveUsers();
                closeModal('login');
                showNotification('Welcome Back!', 'Logged in successfully!', 'success');
                document.getElementById('loginForm').reset();
                var cloudData = { ...d.user };
                delete cloudData.password;
                updateUIForUser(cloudData);
                shSyncUsersOnLogin(d.user, password);
                console.log('✅ User logged in (cloud):', d.user.username);
            } else {
                showNotification('Error', 'Invalid email/username or password.', 'error');
            }
        });
        return;
    }
    // The password matched what THIS DEVICE has stored. The old code signed them
    // straight in and made no server call at all.
    //
    // That is how a device ends up holding a password the server disagrees with: the
    // local copy is a cache, it goes stale after a change on another device, and the
    // old reset wrote it first and fired the server call without awaiting it - so a
    // refused change left the local copy moved and the server unmoved. From then on
    // you are signed in with a credential the server never accepted, every protected
    // action fails, and a password change is refused with "Current password is
    // incorrect" - which is the server correctly saying "that is not the password I
    // have", and unfixable, because the device is holding the wrong one.
    //
    // So confirm it with the server. Offline still works: a NETWORK failure is not a
    // rejection, and only a real 401 refuses the sign-in.
    shApi('sh/user-login', { emailOrUsername: emailOrUsername, password: password })
        .then(function (d) {
            if (d && d.ok === false && d.status === 401) {
                showNotification('Sign-in Failed',
                    'That is not the password this account has. If you are certain it is right, this device is holding an older copy - sign out and sign in again, or try a different browser.',
                    'error', 10000);
                return;
            }
            // Any other server-side refusal is NOT a sign-in, and it is NOT
            // offline either. 429 (rate limited) and 5xx used to fall through to
            // the local sign-in below, which announced success, saved no token,
            // and left the account looking logged in while every protected
            // action failed later. Say what actually happened instead.
            if (d && d.ok === false && d.status >= 400) {
                showNotification('Sign-in Failed',
                    d.status === 429
                        ? 'Too many sign-in attempts from this device. Wait a minute, then try again.'
                        : 'The server could not complete the sign-in (HTTP ' + d.status + '). Nothing was changed - try again in a moment.',
                    'error', 10000);
                return;
            }
            // Keep a token if the worker issued one, so nothing has to mint a second.
            if (d && d.token) shSaveUserToken(d.token);
            shFinishLocalLogin(foundUser, password);
        })
        .catch(function () {
            // Unreachable server. Sign in locally rather than locking the user out of
            // an account that demonstrably exists on this device.
            shFinishLocalLogin(foundUser, password);
        });
    return;
}

// The sign-in steps, shared by the confirmed path and the offline path, so there is
// one copy of them rather than two that can drift.
function shFinishLocalLogin(foundUser, password) {
    closeModal('login');
    showNotification('Welcome Back!', 'Logged in successfully!', 'success');
    document.getElementById('loginForm').reset();
    var userData = { ...foundUser };
    delete userData.password;
    updateUIForUser(userData);
    // cross-device: push this login to the cloud + pull all users (owner)
    shSyncUsersOnLogin(foundUser, password);
    console.log('✅ User logged in:', userData.username);
}



// ============ ACCOUNT SETTINGS (disable / enable / delete) ============
function disableAccount() {
    if (!currentUser) return;
    if (!confirm('Disable your account? Your account is kept, but all your projects/scripts/keys will be disabled until you enable it again.')) return;
    for (var key in users) {
        if (users[key].id === currentUser.id) { users[key].disabled = true; shPushUser(users[key]); break; }
    }
    saveUsers();
    showNotification('Account Disabled', 'All your projects, scripts and keys are now disabled. Use "Enable Account" to restore.', 'warning', 6000);
}

function enableAccount() {
    if (!currentUser) return;
    var wasDisabled = false;
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            wasDisabled = !!users[key].disabled;
            users[key].disabled = false;
            shPushUser(users[key]);
            break;
        }
    }
    saveUsers();
    showNotification(wasDisabled ? 'Account Enabled' : 'Already Active', wasDisabled ? 'All your projects, scripts and keys are active again!' : 'Your account was already active.', 'success');
}

function openDeleteAccountUI() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 440px; padding: 32px; text-align:center;">
            <div style="font-size:52px; line-height:1;">⚠️</div>
            <h2 style="font-size:20px; margin:14px 0 8px 0; color:#ff4444;">Are you sure you wanna do this?</h2>
            <p style="color:#8888aa; font-size:13px; line-height:1.6;">You will lose everything included plans bought/projects/scripts/keys and more.</p>
            <div style="display:flex; gap:12px; margin-top:22px;">
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">No</button>
                <button onclick="confirmDeleteAccount()" class="btn btn-danger" style="flex:1; padding:12px; font-size:15px;">Yes</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmDeleteAccount() {
    if (!currentUser) return;
    var selfEmail = currentUser.email;
    var selfId = currentUser.id;
    // remove user + all their data
    for (var key in users) {
        if (users[key].id === selfId) { delete users[key]; break; }
    }
    saveUsers();
    // remove from the cloud too so the account is gone everywhere
    var selfRec = users[selfEmail];
    if (selfEmail && selfRec && selfRec.password) {
        shApi('sh/user-delete', { email: selfEmail, password: selfRec.password }).catch(function() {});
    }
    try { localStorage.removeItem('projects_' + selfId); } catch (e) {}
    try { localStorage.removeItem('keys_' + selfId); } catch (e) {}
    try { localStorage.removeItem('sh_analytics_' + selfId); } catch (e) {}
    try { localStorage.removeItem('sh_rewards_' + selfId); } catch (e) {}
    clearCurrentUser();
    location.reload();
}

// ============ RESET PASSWORD ============
function openResetPasswordUI() {
    if (!currentUser) { showNotification('Error', 'Please log in first.', 'error'); return; }
    openModal('resetPassword');
    setTimeout(function(){ var el=document.getElementById('resetCurrentPassword'); if(el) el.focus(); }, 100);
}
function handleResetPassword(event) {
    if (shRateGuard('password', SH_RATE.password.max, SH_RATE.password.window, 'Too Many Password Changes')) return;
    event.preventDefault();
    if (!currentUser) return;
    var cur = document.getElementById('resetCurrentPassword').value;
    var nw = document.getElementById('resetNewPassword').value;
    var cf = document.getElementById('resetConfirmPassword').value;
    if (!cur || !nw || !cf) { showNotification('Error', 'Fill all fields.', 'error'); return; }
    var rec = users[currentUser.email];
    if (!rec) { showNotification('Error', 'Account not found.', 'error'); return; }
    // NOT compared against the local record.
    //
    // This used to be `btoa(cur) !== rec.password`, refused BEFORE the server was
    // asked. The server holds the real hash and can verify a password properly;
    // the local copy is a cache that diverges. It is empty whenever the cloud
    // returned a record without a password, and stale when the password was
    // changed on another device - so it rejects CORRECT passwords and can never
    // catch a wrong one that the server would have rejected anyway.
    // A local pre-check here can only produce false refusals.
    if (nw.length < 6) { showNotification('Error', 'New password must be at least 6 chars.', 'error'); return; }
    if (nw !== cf) { showNotification('Error', 'New passwords do not match.', 'error'); return; }
    if (btoa(nw) === rec.password) { showNotification('Error', 'New password must be different.', 'error'); return; }
    // ASK THE SERVER FIRST, AND WAIT FOR IT.
    //
    // This used to update the local record, fire sh/user-password and
    // shPushUser without awaiting either, discard both responses, and then show
    // an unconditional success. A 401/404/429/500 resolves normally through a
    // .catch that only catches network errors, so the user was told the password
    // had changed while the cloud still held the old one - and because the LOCAL
    // copy had moved, the old password stopped working on this device and the
    // new one worked nowhere. The account looked broken rather than unchanged.
    //
    // Order matters: the server is the authority, and the local record is only
    // touched once it has confirmed. If they are updated in the other order the
    // two stores can diverge, and that is the bug.
    shApi('sh/user-password', { email: rec.email, oldPassword: cur, newPassword: nw })
        .then(function(d) {
            if (!d || d.ok !== true) {
                showNotification('Password Not Changed',
                    'The server refused the change: ' + ((d && d.error) || 'unknown error') +
                    '\nYour password is unchanged.', 'error', 9000);
                return;
            }
            // confirmed - now the local copy
            rec.password = btoa(nw);
            users[currentUser.email] = rec;
            saveUsers();
            try { document.getElementById('resetPasswordForm').reset(); } catch (e) {}
            closeModal('resetPassword');
            showNotification('Password Updated', 'Your password has been changed successfully.', 'success', 6000);
        })
        .catch(function(e) {
            showNotification('Password Not Changed',
                'Could not reach the server: ' + (e && e.message ? e.message : e) +
                '\nYour password is unchanged.', 'error', 9000);
        });
    // (success and failure are now reported from the .then above)
}

// ============ USERS PANEL ============
function openUsersPanel() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can access the users panel.', 'error');
        return;
    }
    var overlay = document.getElementById('usersPanelOverlay');
    if (!overlay) {
        createUsersPanel();
        overlay = document.getElementById('usersPanelOverlay');
    }
    overlay.classList.add('active');
    selectedUserEmail = null;
    renderUsersList();
    updatePanelButtons();
    document.body.style.overflow = 'hidden';
    // refresh from the cloud (all devices' users), then re-render
    shRefreshUsersListFromCloud();
}

// pull cloud users and re-render the open panels with the merged list
// also fetches old users (cloud returns ALL) and prunes deleted ones so deletes sync across devices
async function shRefreshUsersListFromCloud() {
    var cloudRes = await shPullCloudUsers();
    // shPullCloudUsers returns {ok, users, reason} now. Unwrapped so the merge
    // below still works on a plain map of user records - `for (var k in cloud)`
    // over the envelope would iterate "ok" and "users".
    var cloud = cloudRes && cloudRes.ok ? cloudRes.users : null;
    if (!cloud) return null;
    var changed = false;
    var selfChanged = null;
    for (var k in cloud) {
        var cu = cloud[k];
        if (shMergeCloudUser(k, cu)) changed = true;
        if (currentUser && cu.id === currentUser.id) selfChanged = users[k];
    }
    // prune locally users deleted on another device (missing in cloud) - keeps creator/admin
    // Was: delete every local account missing from this cloud response. That
    // destroyed accounts whose cloud signup had failed, with no warning and no
    // undo. It now only counts and marks them - see shReconcileWithCloud().
    shReconcileWithCloud(cloud);
    if (changed) saveUsers();
    // if current user was deleted on another device (e.g. Jsowjshow on phone), log out to signup/login
    if (currentUser && !users[currentUser.email]) {
        showNotification('Logged Out', 'Your account was removed from this device. Returning to home.', 'warning', 8000);
        try { logout(); } catch(e) { clearSession(); location.reload(); }
        return cloud;
    }
    // if the owner changed OUR own record via another panel/device,
    // refresh the session + dashboard so the plan badge updates live
    if (selfChanged) {
        var userData = { ...selfChanged };
        delete userData.password;
        saveSession(userData);
        updateUIForUser(userData);
    }
    renderUsersList();
    renderAdminUserListFull();
    // Same split as the manual button: the list is on screen, the images follow in
    // pages. Opening the panel used to wait on the entire users table plus every
    // image on the site before drawing anything.
    shPullCloudImages();
    return cloud;
}

// The avatars and backgrounds the cloud is holding, fetched a page at a time.
//
// WHY THIS IS SEPARATE FROM THE LISTING
//
// GET /sh/users used to return every user WITH their base64 images inline. A
// record carries up to three - profile, banner, and a full-page customBackground
// that is routinely 1-2MB of base64 - and the whole users table is a single KV
// entry, so there is nowhere to fetch one image from on its own. The response was
// therefore the sum of every image on the site, and the page could not draw a
// single row until all of it had arrived and been parsed.
//
// The listing is now metadata only, which is fast, and this puts the pixels back
// in bounded pages. The panel is already rendered when this runs, so each avatar
// appears as its page lands instead of the panel waiting on all of them.
//
// A failed page is not fatal and is not retried. The rows are already on screen
// with their names, emails and plans - the only loss is that batch's avatars,
// which fall back to the initial letter. Retrying a failed page would re-arm the
// exact "spins and never finishes" behaviour this was written to remove.
var shImagePageBusy = false;
async function shPullCloudImages() {
    if (shImagePageBusy) return;
    shImagePageBusy = true;
    try {
        var PAGE = 8;
        var offset = 0;
        var total = Infinity;
        var painted = 0;
        var selfPainted = false;
        while (offset < total) {
            var d = await shOwnerApi('sh/user-images?offset=' + offset + '&limit=' + PAGE, null);
            if (!d || !d.ok || !d.users) break;
            total = (typeof d.total === 'number') ? d.total : offset;
            for (var k in d.users) {
                var rec = d.users[k];
                if (!users[k]) continue;
                var touched = false;
                if (rec.profileImage && !users[k].profileImage) { users[k].profileImage = rec.profileImage; touched = true; }
                if (rec.bannerImage && !users[k].bannerImage) { users[k].bannerImage = rec.bannerImage; touched = true; }
                if (rec.customBackground && !users[k].customBackground) { users[k].customBackground = rec.customBackground; touched = true; }
                if (touched) painted++;
                if (touched && currentUser && k === currentUser.email) selfPainted = true;
            }
            offset += PAGE;
            if (d.users && Object.keys(d.users).length === 0) break;
        }
        if (painted) {
            saveUsers();
            renderUsersList();
            renderAdminUserListFull();
            // The signed-in user's own backdrop is applied by updateUIForUser, not
            // by the list render, so if THEIR background is what just arrived it
            // has to go back through that path or it stays invisible until the next
            // page load.
            if (selfPainted && currentUser && users[currentUser.email]) {
                var me = { ...users[currentUser.email] };
                delete me.password;
                updateUIForUser(me);
            }
        }
    } catch (e) {
        // Deliberately silent, and that is a decision rather than an omission.
        // Everything above the list is already correct: names, emails, plans, roles
        // and deletes have all been applied and rendered. This phase only adds
        // pictures. A toast here would report a refresh failure that did not happen,
        // which is the one thing worse than a missing avatar - it would train the
        // owner to ignore the refresh result.
        //
        // The rows keep working: renderUsersList falls back to the initial letter for
        // any record with no image, so a dead image page costs pictures and nothing
        // else.
    } finally {
        shImagePageBusy = false;
    }
}

// manual refresh of the cloud users list (admin). Useful when the first
// fetch hit the 503 throttle (burstable KV reads) - a second click usually
// succeeds and re-renders every users panel.
async function refreshUsersList() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can refresh the users list.', 'error'); return; }
    showNotification('Refreshing', 'Fetching the latest users from the cloud...', 'info', 3000);
    // Timed, so the success message can say HOW LONG it took. "Refreshing..."
    // followed by silence is indistinguishable from a hang, and the one thing that
    // makes a slow call diagnosable is knowing whether it was slow or stuck.
    var startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var cloudRes = await shPullCloudUsers();
    var elapsed = Math.max(0, Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startedAt));
    // shPullCloudUsers returns {ok, users, reason} so a failure can say what
    // actually went wrong. Unwrapped here so the merge below still works on a
    // plain map - `for (var k in cloud)` over the envelope would iterate "ok"
    // and "users" instead of the user records.
    var cloud = cloudRes && cloudRes.ok ? cloudRes.users : null;
    if (cloud) {
        var changed = false;
        for (var k in cloud) { if (shMergeCloudUser(k, cloud[k])) changed = true; }
        // also fetch old users and prune deleted ones - ensures refresh shows same as cloud on phone/other device
        // Was: delete every local account missing from this cloud response. That
        // destroyed accounts whose cloud signup had failed, with no warning and no
        // undo. It now only counts and marks them - see shReconcileWithCloud().
        shReconcileWithCloud(cloud);
        if (changed) saveUsers();
        // if the current account was deleted elsewhere (e.g. phone as Jsowjshow), force logout
        if (currentUser && !users[currentUser.email]) {
            showNotification('Logged Out', 'Your account was deleted by admin.', 'warning', 8000);
            try { logout(); } catch(e) { clearSession(); location.reload(); }
            return;
        }
        renderUsersList();
        renderAdminUserListFull();
        // The list is on screen. The images come after, in pages, so this reports
        // success for what actually finished instead of waiting on the largest
        // response the site makes.
        shPullCloudImages();
        showNotification('Refreshed', 'Users list is up to date (' + Object.keys(users).length + ' total, ' + elapsed + ' ms).', 'success', 3000);
    } else {
        var why = (cloudRes && cloudRes.reason) || 'the cloud did not answer';
        showNotification('Refresh Failed', why + '  (' + elapsed + ' ms)', 'error', 12000);
    }
}

function closeUsersPanel() {
    var overlay = document.getElementById('usersPanelOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    selectedUserEmail = null;
}

function createUsersPanel() {
    var overlay = document.createElement('div');
    overlay.className = 'users-panel-overlay';
    overlay.id = 'usersPanelOverlay';
    overlay.innerHTML = `
        <div class="users-panel">
            <div class="panel-header"><h2>👥 Users List</h2><button class="panel-close" onclick="closeUsersPanel()">✕</button></div>
            <div class="panel-search">
                <select id="panelSearchType" onchange="renderUsersList()">
                    <option value="username">Search by Username</option>
                    <option value="email">Search by Gmail</option>
                </select>
                <input class="sh-input" type="text" id="panelSearchQuery" placeholder="Search users..." oninput="renderUsersList()">
            </div>
            <div class="panel-list" id="panelUserList"></div>
            <div class="panel-status" id="panelStatus"></div>
            <div class="panel-actions">
                <button class="btn btn-primary" onclick="refreshUsersList()">🔄 Refresh from Cloud</button>
                <button class="btn btn-close-dropdown" onclick="shForgetOwnerCode()" title="Forget the saved owner access code and ask again">🔑 Re-enter Owner Code</button>
                <button class="btn btn-danger" id="panelDeleteBtn" onclick="panelDeleteUser()" disabled>🗑️ Remove User</button>
                <button class="btn btn-primary" id="panelPlanBtn" onclick="panelChangePlan()" disabled>📊 Change Plan</button>
                <button class="btn btn-close-dropdown" onclick="closeUsersPanel()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === this) closeUsersPanel(); });
}

function renderUsersList() {
    var container = document.getElementById('panelUserList');
    var statusEl = document.getElementById('panelStatus');
    if (!container) return;
    var searchType = document.getElementById('panelSearchType') ? document.getElementById('panelSearchType').value : 'username';
    var searchQuery = document.getElementById('panelSearchQuery') ? document.getElementById('panelSearchQuery').value.toLowerCase() : '';
    var html = '';
    var count = 0;
    var filteredUsers = {};
    for (var key in users) {
        var user = users[key];
        var match = false;
        if (searchQuery === '') { match = true; } else if (searchType === 'username' && user.username.toLowerCase().includes(searchQuery)) { match = true; } else if (searchType === 'email' && user.email.toLowerCase().includes(searchQuery)) { match = true; }
        if (match) { filteredUsers[key] = user; }
    }
    for (var key in filteredUsers) {
        count++;
        var user = filteredUsers[key];
        var isAdmin = user.isAdmin ? 'tag-admin' : 'tag-user';
        var isScripter = user.isScripter ? 'tag-creator' : '';
        var roleText = user.isScripter ? '⭐ Creator' : (user.isAdmin ? '👑 Admin' : '👤 User');
        var isSelected = (selectedUserEmail === key) ? 'selected' : '';
        var avatarLetter = user.username.charAt(0).toUpperCase();
        var safeKey = key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += `
            <div class="user-list-item ${isSelected}" onclick="selectUser('${safeKey}')">
                <div class="user-info">
                    <div class="user-avatar">${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : avatarLetter}</div>
                    <div class="user-details"><div class="name">${user.username}</div><div class="email">${user.email}</div></div>
                </div>
                <div class="user-tags">
                    <span class="tag tag-plan">${user.plan}</span>
                    <span class="tag ${isAdmin} ${isScripter}">${roleText}</span>
                </div>
            </div>
        `;
    }
    if (count === 0) { html = '<div style="text-align: center; color: #8888aa; padding: 40px 0;">No users found.</div>'; }
    container.innerHTML = html;
    // Says WHICH count, because a bare "17 users found" reads as a cap and there
    // is no maximum: the server-side caps are 10 signups/minute per IP and 120 per
    // hour, both about SIGNUP rate, never about how many accounts may exist.
    //
    // Local-only accounts are listed because they are the ones a user cannot
    // otherwise account for - they exist on this device and not yet on the server.
    if (statusEl) {
        var localOnly = 0;
        for (var lk in users) if (users[lk] && users[lk].notOnCloud) localOnly++;
        statusEl.textContent = count + (count === 1 ? ' user' : ' users') +
            ' on the server' +
            (localOnly ? '  |  ' + localOnly + ' only on this device (not synced yet)' : '') +
            '  |  no account limit';
    }
    updatePanelButtons();
}

function selectUser(email) {
    selectedUserEmail = email;
    renderUsersList();
    updatePanelButtons();
}

function updatePanelButtons() {
    var deleteBtn = document.getElementById('panelDeleteBtn');
    var planBtn = document.getElementById('panelPlanBtn');
    var isSelected = selectedUserEmail !== null;
    var user = isSelected ? users[selectedUserEmail] : null;
    var canDelete = isSelected && user && !user.isScripter;
    if (deleteBtn) { deleteBtn.disabled = !canDelete; deleteBtn.style.opacity = canDelete ? '1' : '0.3'; }
    if (planBtn) { planBtn.disabled = !isSelected; planBtn.style.opacity = isSelected ? '1' : '0.3'; }
}

function panelDeleteUser() {
    if (!selectedUserEmail) { showNotification('Error', 'Please select a user first.', 'error'); return; }
    var email = selectedUserEmail;
    var user = users[email];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    if (user.isScripter) { showNotification('Error', 'Cannot delete the creator account.', 'error'); return; }
    if (shIsNeverRemovable(email)) {
        showNotification('Error', 'That account cannot be removed.', 'error'); return;
    }
    if (!confirm('Are you sure you want to remove ' + user.username + '?\n\nThis cannot be undone, and it will stay removed on this device even if the server copy cannot be reached.')) return;
    // Record the removal FIRST. It is the part that must not fail and the part
    // that decides whether the account comes back, so it happens before anything
    // that can fail.
    if (!shTombstone(email)) {
        showNotification('Error', 'That account cannot be removed.', 'error'); return;
    }
    delete users[email];
    saveUsers();
    selectedUserEmail = null;
    renderUsersList();
    updatePanelButtons();
    renderAdminUserListFull();
    // Now try the server, and say what happened. The old code fired this and
    // ignored the result, so "Deleted" was shown whether or not anything had
    // actually occurred anywhere.
    shDeleteCloudUser(email).then(function (d) {
        if (d && d.ok) {
            showNotification('Removed', user.username + ' has been removed from this site.', 'success');
        } else {
            showNotification('Removed Here Only',
                user.username + ' is gone from this device and will not come back on refresh.\n' +
                'The server copy could not be deleted: ' + ((d && d.error) || 'no reason given') +
                '\nIt may still exist on the server until the worker is updated.',
                'warning', 11000);
        }
    }).catch(function (e) {
        showNotification('Removed Here Only',
            user.username + ' is gone from this device and will not come back on refresh.\n' +
            'The server could not be reached: ' + ((e && e.message) || e),
            'warning', 11000);
    });
}

function panelChangePlan() {
    if (!selectedUserEmail) { showNotification('Error', 'Please select a user first.', 'error'); return; }
    var user = users[selectedUserEmail];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    changeUserPlan(selectedUserEmail);
}

// ============ ADMIN FUNCTIONS ============
function openAdminPanel() {
    if (!currentUser || currentUser.username !== 'Scripter') {
        showNotification('Access Denied', 'Only Scripter can access the admin panel.', 'error');
        return;
    }
    openModal('admin');
    renderAdminUserListFull();
    // refresh from the cloud (all devices' users), then re-render
    shRefreshUsersListFromCloud();
}

function renderAdminUserListFull() {
    var container = document.getElementById('userList');
    if (!container) return;
    var html = '';
    var count = 0;
    for (var key in users) {
        count++;
        var user = users[key];
        var createdDate = new Date(user.createdAt).toLocaleDateString();
        var isAdmin = user.isAdmin ? '👑 Admin' : '👤 User';
        var isScripter = user.isScripter ? '⭐ Creator' : '';
        html += `
            <div class="user-item" style="background: rgba(20,20,35,0.6); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: #fff; overflow: hidden;">
                            ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : user.username.charAt(0).toUpperCase()}
                        </div>
                        <div><strong style="color: #ffffff;">${user.username}</strong><span style="color: #8888aa; font-size: 13px; margin-left: 8px;">${user.email}</span></div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        ${isScripter ? '<span style="background: rgba(255,215,0,0.2); color: #ffd700; padding: 2px 12px; border-radius: 12px; font-size: 11px;">⭐ Creator</span>' : ''}
                        <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${user.plan}</span>
                        <span style="background: rgba(255,255,255,0.05); color: #8888aa; padding: 2px 12px; border-radius: 12px; font-size: 11px;">${isAdmin}</span>
                        <span style="color: #555577; font-size: 11px;">Joined: ${createdDate}</span>
                        ${!user.isAdmin && !user.isScripter ? '<button onclick="deleteUser(\'' + key + '\')" style="background: rgba(255,50,50,0.2); color: #ff6b6b; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">🗑️</button>' : ''}
                        <button onclick="changeUserPlan(\'' + key + '\')" style="background: rgba(108,59,255,0.2); color: #8a6bff; border: none; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">📊</button>
                    </div>
                </div>
            </div>
        `;
    }
    if (count === 0) { html = '<p style="color: #8888aa; text-align: center; padding: 40px 0;">No users registered yet.</p>'; } else { html = '<div style="margin-bottom: 12px; color: #8888aa; font-size: 13px;">Total Users: ' + count + '</div>' + html; }
    container.innerHTML = html;
}

function deleteUser(email) {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can delete users.', 'error'); return; }
    if (email === 'dubovikstanislav51@gmail.com') { showNotification('Error', 'Cannot delete the creator account.', 'error'); return; }
    if (confirm('Are you sure you want to delete ' + email + '? This cannot be undone!')) {
        delete users[email];
        saveUsers();
        // remove from the cloud too so it disappears from every device -
        // report the REAL result (a silent 401 used to fake success here)
        shDeleteCloudUser(email).then(function(d) {
            if (d && d.ok) {
                showNotification('Deleted', 'User deleted on every device.', 'success');
            } else {
                showNotification('Deleted Locally Only', 'Cloud delete failed: ' + ((d && d.error) || 'not authorized') + '. Log out and log back in as the owner, then delete again so it disappears on other devices.', 'warning', 8000);
            }
            renderAdminUserListFull();
        });
        showNotification('Deleted', 'User deleted successfully!', 'success');
        renderAdminUserListFull();
    }
}

function deleteAllUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can delete all users.', 'error'); return; }
    if (confirm('⚠️ Are you sure you want to delete ALL users? This cannot be undone!\n\n(Scripter account will be kept)')) {
        var scripterAccount = users['dubovikstanislav51@gmail.com'];
        var adminAccount = users['admin@example.com'];
        users = {};
        if (scripterAccount) { users['dubovikstanislav51@gmail.com'] = scripterAccount; }
        if (adminAccount) { users['admin@example.com'] = adminAccount; }
        saveUsers();
        // clear the cloud list too (keeps the creator + admin accounts)
        shClearCloudUsers(['dubovikstanislav51@gmail.com', 'admin@example.com']);
        showNotification('Cleared', 'All users have been deleted.', 'warning');
        renderAdminUserListFull();
    }
}

// ---- Delete All Bot Users (admin) ----
// Flags every account that looks bot-generated (random usernames/emails,
// junk dates, raid-flood patterns) and deletes them in ONE cloud call
// (sh/users-clear, a single KV write) instead of thousands of per-user
// deletes. The owner + any human account is always kept.
var SH_BOT_EXEMPT = {}; // populated from local keep on first run
function buildBotExempt() {
    if (!SH_BOT_EXEMPT._done) {
        SH_BOT_EXEMPT._done = true;
        SH_BOT_EXEMPT['dubovikstanislav51@gmail.com'] = true;
        try {
            var localKeep = JSON.parse(localStorage.getItem('sh_keep_emails') || '[]');
            for (var i = 0; i < localKeep.length; i++) SH_BOT_EXEMPT[localKeep[i]] = true;
        } catch (e) {}
    }
}
function looksBotUser(email, u) {
    buildBotExempt();
    if (SH_BOT_EXEMPT[email]) return false;
    if (!u) return true;
    if (u.isAdmin || u.isScripter) return false;
    var un = String(u.username || '');
    // numeric-only usernames 1..999 (bulk-created test/bot rows)
    if (/^\d{1,3}$/.test(un)) return true;
    // 'scripter 0.xxx' junk
    if (/^scripter 0\.\d+/.test(un)) return true;
    // keyboard-mash usernames (curly braces are never typed by humans)
    if (/[{}]/.test(un) || /[{}]/.test(email)) return true;
    // junk dates (bot floods used fake 1987 timestamps)
    if (String(u.createdAt || '').startsWith('1987')) return true;
    // blocked words (raid floods etc.)
    var lower = (un + ' ' + email).toLowerCase();
    for (var i = 0; i < SH_BLOCKED_WORDS.length; i++) {
        if (lower.indexOf(SH_BLOCKED_WORDS[i]) !== -1) return true;
    }
    // random-char email local part: 8+ chars with mixed case + digits
    // AND at least 3 digits (humans rarely write emails like kO8dx4d1U9)
    var local = String(email).split('@')[0];
    if (local.length >= 8 && /[A-Z]/.test(local) && /[a-z]/.test(local)) {
        var dig = (local.match(/\d/g) || []).length;
        if (dig >= 3) return true;
    }
    // super-short junk emails (no TLD, 'a', 'noob', ...)
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return true;
    return false;
}

function deleteAllBotUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can delete bot users.', 'error'); return; }
    // Registered so confirmDeleteAllBots() can resolve THIS modal by name. It
    // used to hunt for z-index 4000, which the access-code dialog also uses.
    buildBotExempt();
    var keep = {}, bots = [];
    for (var key in users) {
        if (looksBotUser(key, users[key])) { bots.push({ email: key, username: (users[key] && users[key].username) || '' }); }
        else { keep[key] = users[key]; SH_BOT_EXEMPT[key] = true; }
    }
    if (bots.length === 0) { showNotification('No Bots Found', 'Every account looks human - nothing to delete.', 'info', 5000); return; }
    var listItems = bots.map(function(b) {
        return '<div style="padding:4px 0; font-family:monospace; font-size:12px; color:#ff6b6b;">' +
            escapeHtml(b.username || '(no name)') + ' &middot; ' + escapeHtml(b.email) + '</div>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '4000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 600px; max-height: 80vh; padding: 24px; display:flex; flex-direction:column;">
            <h2 style="font-size:20px; margin:0 0 8px;">🤖 Delete All Bot Users?</h2>
            <p style="color:#8888aa; font-size:13px; margin:0 0 14px;">Found <strong style="color:#ff6b6b;">${bots.length}</strong> account(s) that look bot-generated. Real accounts are kept. Scroll to review the list.</p>
            <div style="flex:1; overflow-y:auto; background:rgba(20,20,35,0.6); border-radius:10px; padding:10px; margin-bottom:14px; border:1px solid rgba(255,255,255,0.06);">
                ${listItems}
            </div>
            <div style="display:flex; gap:10px;">
                <button onclick="confirmDeleteAllBots()" class="btn btn-danger" style="flex:1; padding:10px;">🗑️ Delete ${bots.length} Bots</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:10px;">Cancel</button>
            </div>
        </div>
    `;
    // stash the computed lists for the confirm handler
    overlay.__keep = keep;
    overlay.__bots = bots;
    document.body.appendChild(overlay);
}

function confirmDeleteAllBots() {
    // Resolved BY NAME, not by z-index.
    //
    // It used to do querySelector('.modal-overlay[style*="z-index: 4000"]'),
    // and shAskForCode uses the same 4000. querySelector returns the FIRST match
    // in document order, not the modal that was opened - so with the access-code
    // dialog on screen this grabbed THAT. overlay.__keep was undefined, so
    // keep = {}, and the next lines ran `users = {}; saveUsers()`.
    //
    // That deleted every account on the device, and it only needed the code
    // dialog to be open first.
    var overlay = shGetModal('deleteAllBots');
    if (!overlay) { showNotification('Error', 'That dialog is no longer open.', 'error'); return; }
    var keep = overlay.__keep || {};
    var bots = overlay.__bots || [];
    overlay.remove();
    users = keep;
    saveUsers();
    selectedUserEmail = null;
    renderUsersList();
    renderAdminUserListFull();
    var keepEmails = Object.keys(keep);
    shClearCloudUsers(keepEmails).then(function(d) {
        if (d && d.ok) {
            showNotification('Bots Deleted', bots.length + ' bot account(s) removed on every device. Kept ' + keepEmails.length + ' real account(s).', 'success', 8000);
        } else {
            showNotification('Deleted Locally Only', 'Cloud cleanup failed: ' + ((d && d.error) || 'not authorized') + '. Re-login as the owner and try again so bots disappear on other devices.', 'warning', 10000);
        }
        renderUsersList();
        renderAdminUserListFull();
    });
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

function filterUsers() { renderUsersList(); }

// ============ CHANGE USER PLAN ============
function changeUserPlan(email) {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can change user plans.', 'error'); return; }
    var user = users[email];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var planOptions = '';
    for (var plan in PLAN_CONFIGS) {
        var config = PLAN_CONFIGS[plan];
        var isCurrent = user.plan === plan ? '✅ ' : '';
        var priceDisplay = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
        planOptions += '<option value="' + plan + '" ' + (user.plan === plan ? 'selected' : '') + '>' + isCurrent + plan + ' - ' + priceDisplay + '</option>';
    }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 480px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; overflow: hidden; flex-shrink: 0;">
                    ${user.profileImage ? '<img src="' + user.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : user.username.charAt(0).toUpperCase()}
                </div>
                <div><h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Plan</h2><p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">${user.username} · Current: <strong style="color: #8a6bff;">${user.plan}</strong></p></div>
            </div>
            <div class="form-group"><label style="font-size: 14px;">Select New Plan</label><select id="newPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">${planOptions}</select></div>
            <div id="planPreviewCard" style="margin-top: 16px; padding: 16px 20px; background: rgba(20,20,35,0.6); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; font-size: 16px; color: #ffffff;" id="previewPlanName">Basic</span>
                    <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 14px; border-radius: 12px; font-size: 13px;" id="previewPlanPrice">$0/month</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 13px; color: #8888aa;">
                    <span>📁 Projects: <strong style="color: #ffffff;" id="previewProjects">0</strong></span>
                    <span>🔑 Keys: <strong style="color: #ffffff;" id="previewKeys">0</strong></span>
                    <span>📜 Scripts: <strong style="color: #ffffff;" id="previewScripts">0</strong></span>
                    <span>💾 Storage: <strong style="color: #ffffff;" id="previewStorage">0</strong> MB</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="confirmChangePlan('${email}')" class="btn btn-primary" style="flex:1; padding: 12px; font-size: 15px;">✅ Confirm Change</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding: 12px; font-size: 15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var select = overlay.querySelector('#newPlanSelect');
    select.addEventListener('change', function() { updatePlanPreviewGUI(this.value); });
    updatePlanPreviewGUI(select.value);
}

function updatePlanPreviewGUI(planName) {
    var config = PLAN_CONFIGS[planName];
    if (!config) return;
    document.getElementById('previewPlanName').textContent = planName;
    document.getElementById('previewPlanPrice').textContent = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
    document.getElementById('previewProjects').textContent = config.projects === Infinity ? '∞' : config.projects;
    document.getElementById('previewKeys').textContent = config.keys === Infinity ? '∞' : config.keys;
    document.getElementById('previewScripts').textContent = config.scripts === Infinity ? '∞' : config.scripts;
    document.getElementById('previewStorage').textContent = config.fileSize === Infinity ? '∞' : config.fileSize;
}

function confirmChangePlan(email) {
    var select = document.getElementById('newPlanSelect');
    var newPlan = select.value;
    if (!newPlan) { showNotification('Error', 'Please select a plan.', 'error'); return; }
    var user = users[email];
    if (!user) { showNotification('Error', 'User not found.', 'error'); return; }
    var config = PLAN_CONFIGS[newPlan];
    if (!config) { showNotification('Error', 'Invalid plan selected.', 'error'); return; }
    if (user.plan === newPlan) { showNotification('Info', 'User already has this plan.', 'info'); return; }
    if (!confirm('Are you sure you want to change ' + user.username + '\'s plan from ' + user.plan + ' to ' + newPlan + '?')) return;
    user.plan = newPlan;
    if (!user.stats) user.stats = { projects: { used: 0, max: 1 }, keys: { used: 0, max: 2 }, scripts: { used: 0, max: 3 }, fileSize: { used: 0, max: 5 } };
    if (!user.stats.projects) user.stats.projects = { used: 0, max: 1 };
    if (!user.stats.keys) user.stats.keys = { used: 0, max: 2 };
    if (!user.stats.scripts) user.stats.scripts = { used: 0, max: 3 };
    if (!user.stats.fileSize) user.stats.fileSize = { used: 0, max: 5 };
    user.stats.projects.max = config.projects;
    user.stats.keys.max = config.keys;
    user.stats.scripts.max = config.scripts;
    user.stats.fileSize.max = config.fileSize;
    saveUsers();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Plan Updated', user.username + '\'s plan changed to ' + newPlan + '!', 'success');
    renderUsersList();
    renderAdminUserListFull();
    if (currentUser && currentUser.id === user.id) {
        var userData = { ...user };
        delete userData.password;
        updateUIForUser(userData);
    }
    // sync the plan change to the cloud (every other device). AWAITED with
    // error reporting - a silent 401 here used to mean nobody ever got
    // their plan (the old bug).
    var btnText = 'Plan synced to the cloud ✓';
    shPushCloudUserUpdate(email, { ...user }).then(function(d) {
        if (d && d.ok) {
            showNotification('Cloud Synced', btnText, 'success', 4000);
        } else {
            showNotification('Cloud Sync Failed', (d && d.error) || 'Plan saved locally but NOT synced to other devices. Check the worker deployment / owner password.', 'warning', 8000);
        }
    });
}

// ============ CHANGE OWN PLAN ============
function changeOwnPlan() {
    if (!currentUser) { showNotification('Error', 'Please login first.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var planOptions = '';
    for (var plan in PLAN_CONFIGS) {
        var config = PLAN_CONFIGS[plan];
        var isCurrent = currentUser.plan === plan ? '✅ ' : '';
        var priceDisplay = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
        planOptions += '<option value="' + plan + '" ' + (currentUser.plan === plan ? 'selected' : '') + '>' + isCurrent + plan + ' - ' + priceDisplay + '</option>';
    }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 480px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #6c3bff, #00bfff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; overflow: hidden; flex-shrink: 0;">
                    ${currentUser.profileImage ? '<img src="' + currentUser.profileImage + '" style="width:100%;height:100%;object-fit:cover;">' : currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div><h2 style="font-size: 22px; margin: 0; color: #ffffff;">Change Your Plan</h2><p style="color: #8888aa; margin: 2px 0 0; font-size: 14px;">Current: <strong style="color: #8a6bff;">${currentUser.plan}</strong></p></div>
            </div>
            <div class="form-group"><label style="font-size: 14px;">Select New Plan</label><select id="ownPlanSelect" style="width:100%; padding: 12px 16px; background: #0a0a15; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #fff; font-size: 14px; cursor: pointer;">${planOptions}</select></div>
            <div id="ownPlanPreviewCard" style="margin-top: 16px; padding: 16px 20px; background: rgba(20,20,35,0.6); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; font-size: 16px; color: #ffffff;" id="ownPreviewPlanName">Basic</span>
                    <span style="background: rgba(108,59,255,0.2); color: #8a6bff; padding: 2px 14px; border-radius: 12px; font-size: 13px;" id="ownPreviewPlanPrice">$0/month</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 13px; color: #8888aa;">
                    <span>📁 Projects: <strong style="color: #ffffff;" id="ownPreviewProjects">0</strong></span>
                    <span>🔑 Keys: <strong style="color: #ffffff;" id="ownPreviewKeys">0</strong></span>
                    <span>📜 Scripts: <strong style="color: #ffffff;" id="ownPreviewScripts">0</strong></span>
                    <span>💾 Storage: <strong style="color: #ffffff;" id="ownPreviewStorage">0</strong> MB</span>
                </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="confirmOwnPlanChange()" class="btn btn-primary" style="flex:1; padding: 12px; font-size: 15px;">✅ Confirm Change</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding: 12px; font-size: 15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var select = overlay.querySelector('#ownPlanSelect');
    select.addEventListener('change', function() { updateOwnPlanPreviewGUI(this.value); });
    updateOwnPlanPreviewGUI(select.value);
}

function updateOwnPlanPreviewGUI(planName) {
    var config = PLAN_CONFIGS[planName];
    if (!config) return;
    document.getElementById('ownPreviewPlanName').textContent = planName;
    document.getElementById('ownPreviewPlanPrice').textContent = config.price === 'Custom' ? 'Custom' : '$' + config.price + '/month';
    document.getElementById('ownPreviewProjects').textContent = config.projects === Infinity ? '∞' : config.projects;
    document.getElementById('ownPreviewKeys').textContent = config.keys === Infinity ? '∞' : config.keys;
    document.getElementById('ownPreviewScripts').textContent = config.scripts === Infinity ? '∞' : config.scripts;
    document.getElementById('ownPreviewStorage').textContent = config.fileSize === Infinity ? '∞' : config.fileSize;
}

function confirmOwnPlanChange() {
    var select = document.getElementById('ownPlanSelect');
    var newPlan = select.value;
    if (!newPlan) { showNotification('Error', 'Please select a plan.', 'error'); return; }
    var config = PLAN_CONFIGS[newPlan];
    if (!config) { showNotification('Error', 'Invalid plan selected.', 'error'); return; }
    if (currentUser.plan === newPlan) { showNotification('Info', 'You already have this plan.', 'info'); return; }
    if (!confirm('Are you sure you want to change your plan from ' + currentUser.plan + ' to ' + newPlan + '?')) return;
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            users[key].plan = newPlan;
            users[key].stats.projects.max = config.projects;
            users[key].stats.keys.max = config.keys;
            users[key].stats.scripts.max = config.scripts;
            users[key].stats.fileSize.max = config.fileSize;
            break;
        }
    }
    saveUsers();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Plan Updated', 'Your plan changed to ' + newPlan + '!', 'success');
    var userData = { ...currentUser };
    userData.plan = newPlan;
    userData.stats.projects.max = config.projects;
    userData.stats.keys.max = config.keys;
    userData.stats.scripts.max = config.scripts;
    userData.stats.fileSize.max = config.fileSize;
    delete userData.password;
    updateUIForUser(userData);
}

// ============ IMAGE UPLOAD FUNCTIONS ============
// The dashboard is cloned into the tab view, so two inputs share the same
// id. getElementById returns the FIRST (hidden) one - the file the user
// picked lives in the VISIBLE clone. Search all matches and use the one
// that actually has a file (or is visible).
function findImageInput(id) {
    var inputs = document.querySelectorAll('input[type="file"]#' + id);
    var fallback = null;
    for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (el.files && el.files.length > 0) return el;
        var visible = !!(el.offsetParent || el.getClientRects().length);
        if (visible && !fallback) fallback = el;
        if (!fallback) fallback = el;
    }
    return fallback;
}

// compress an image file in the browser (canvas resize + re-encode).
// Keeps base64 data URLs small (~100-300KB) so cloud sync never drops
// them and the users KV value stays far below Cloudflare's per-value cap
// (banners/profiles used to ride at up to 5MB and got stripped server-side,
// which is why the banner "never saved").
function compressImageFile(file, maxDim, quality) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            // GIF/SVG keep the original if small (animation/vector is lost by canvas)
            if ((file.type === 'image/gif' || file.type === 'image/svg+xml') && file.size <= 800 * 1024) {
                resolve(dataUrl);
                return;
            }
            var img = new Image();
            img.onload = function() {
                try {
                    var w = img.width || 1, h = img.height || 1;
                    var scale = Math.min(1, maxDim / Math.max(w, h));
                    var cw = Math.max(1, Math.round(w * scale));
                    var ch = Math.max(1, Math.round(h * scale));
                    var canvas = document.createElement('canvas');
                    canvas.width = cw; canvas.height = ch;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    var out = canvas.toDataURL('image/webp', quality || 0.82);
                    // browsers without webp encode fall back to png automatically
                    if (!/^data:image\/(webp|png)/.test(out)) out = canvas.toDataURL('image/jpeg', quality || 0.82);
                    resolve(out);
                } catch (err) { resolve(dataUrl); }
            };
            img.onerror = function() { resolve(dataUrl); };
            img.src = dataUrl;
        };
        reader.onerror = function() { reject(new Error('Failed to read image file.')); };
        reader.readAsDataURL(file);
    });
}

function uploadProfileImage() {
    var input = findImageInput('profileImageInput');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select an image file first.', 'error'); return; }
    var file = input.files[0];
    if (file.size > 10 * 1024 * 1024) { showNotification('Error', 'Profile image is too large (max 10MB).', 'error'); return; }
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) { showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error'); return; }
    showNotification('Saving', 'Processing image...', 'info', 1500);
    compressImageFile(file, 800, 0.82).then(function(imageData) {
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].profileImage = imageData;
                saveUsers();
                shPushUser(users[key]); // sync to cloud (all devices)
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                showNotification('Success', 'Profile image updated successfully!', 'success');
                input.value = '';
                break;
            }
        }
    }).catch(function(error) { showNotification('Error', 'Failed to save image: ' + error.message, 'error'); });
}

function uploadBannerImage() {
    var input = findImageInput('bannerImageInput');
    if (!input || !input.files || input.files.length === 0) { showNotification('Error', 'Please select an image file first.', 'error'); return; }
    var file = input.files[0];
    if (file.size > 10 * 1024 * 1024) { showNotification('Error', 'Banner image is too large (max 10MB).', 'error'); return; }
    var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) { showNotification('Error', 'Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).', 'error'); return; }
    showNotification('Saving', 'Processing image...', 'info', 1500);
    compressImageFile(file, 1280, 0.82).then(function(imageData) {
        for (var key in users) {
            if (users[key].id === currentUser.id) {
                users[key].bannerImage = imageData;
                saveUsers();
                shPushUser(users[key]); // sync to cloud (all devices)
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                showNotification('Success', 'Banner image updated successfully!', 'success');
                input.value = '';
                break;
            }
        }
    }).catch(function(error) { showNotification('Error', 'Failed to save banner: ' + error.message, 'error'); });
}

// ============ CUSTOM BACKGROUND (item 6) ============
// A full-page backdrop behind the whole app. This is a DIFFERENT feature from
// the Banner Image, which is a strip in the profile header - they are stored in
// separate fields and neither touches the other.
//
// It lives in users[email].customBackground, and the server knows about it in
// TWO separate allowlists: sanitizeUserRecord and the /sh/user-sync merge list.
// Miss the second and it works on the device that set it and never appears
// anywhere else, with no error anywhere - which is exactly the failure this
// comment exists to prevent.

// The primary colour of each offered theme, in the SAME order as SH_THEME_PICKER.
//
// Derived from `themes` rather than written out, because a hand-kept copy of the
// palette is a second list to drift - and this one HAD drifted: it still held the
// old pre-contrast hexes, so an uploaded backdrop was matched to a colour the site
// no longer ships. Reading them off the theme objects makes that impossible.
var SH_THEME_RGB = (function () {
    var out = {};
    for (var i = 0; i < SH_THEME_PICKER.length; i++) {
        var name = SH_THEME_PICKER[i].name;
        var t = themes[name];
        if (!t) continue;
        out[name] = [
            parseInt(t.primary.slice(1, 3), 16),
            parseInt(t.primary.slice(3, 5), 16),
            parseInt(t.primary.slice(5, 7), 16)
        ];
    }
    return out;
})();

// Nearest existing theme to a sampled colour, by squared distance in RGB.
// Chosen from the image rather than asked for, so the backdrop and the accent
// colour cannot end up fighting each other.
//
// The nearest is picked among the PICKER themes, so a backdrop never lands the user
// on the `default` alias - which is not an offered theme, and would put the select
// on a different entry than the one that is active.
function shNearestTheme(rgb) {
    var best = SH_THEME_FALLBACK, bestD = Infinity;
    for (var i = 0; i < SH_THEME_PICKER.length; i++) {
        var name = SH_THEME_PICKER[i].name;
        var c = SH_THEME_RGB[name];
        var dr = c[0] - rgb[0], dg = c[1] - rgb[1], db = c[2] - rgb[2];
        var d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = name; }
    }
    return best;
}

// Average the image on a canvas and return the dominant-ish colour.
//
// A plain average is not "dominant" - one bright logo pixel in a dark image
// moves the mean a long way. So pixels are bucketed into a coarse grid and the
// fullest bucket wins, which is what actually picks the backdrop colour. The
// average of that bucket is then used, so the result is a colour that is really
// present in the picture rather than a blend of two things that are not.
function shSampleImageTheme(src) {
    return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
            try {
                var N = 48;
                var cv = document.createElement('canvas');
                cv.width = N; cv.height = N;
                var ctx = cv.getContext('2d', { willReadFrequently: true });
                if (!ctx) { resolve('default'); return; }
                ctx.drawImage(img, 0, 0, N, N);
                var data;
                try { data = ctx.getImageData(0, 0, N, N).data; }
                catch (e) { resolve('default'); return; }   // tainted canvas - not expected here, but must not throw

                var buckets = {};
                for (var i = 0; i < data.length; i += 4) {
                    var a = data[i + 3];
                    if (a < 125) continue;                    // ignore transparent pixels
                    var r = data[i], g = data[i + 1], b = data[i + 2];
                    // near-transparent pixels dilute the result, so weight them
                    // down by only counting reasonably solid ones
                    if (a < 200) continue;
                    var key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                    var bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
                    bk.n++; bk.r += r; bk.g += g; bk.b += b;
                }
                var top = null;
                for (var k in buckets) if (!top || buckets[k].n > top.n) top = buckets[k];
                // an all-transparent image: keep it subtle. 'black' is the name -
                // the old 'dark' key is gone, and an unknown name silently resolved
                // to purple, so a transparent PNG quietly turned a black page violet.
                if (!top || !top.n) { resolve('black'); return; }
                resolve(shNearestTheme([top.r / top.n, top.g / top.n, top.b / top.n]));
            } catch (e) { resolve('default'); }
        };
        img.onerror = function() { resolve('default'); };
        img.src = src;
    });
}
// True while a custom backdrop is painted. applyTheme() reads it, because
// applyTheme is what sets the OPAQUE body background that would otherwise hide
// the backdrop - so changing the theme must not silently switch it off.
var SH_CUSTOM_BG_ACTIVE = false;

// Paints the backdrop on the ROOT element, not as a separate fixed div.
//
// The root element's background is used for the canvas by definition, so it is
// always behind all content and always visible - no dependence on z-index and
// none on whether some wrapper happens to be opaque.
// How much backdrop is left visible once the dim and the cards are on top of it.
//
// At 0.74 and 0.8 the product is 0.26 x 0.20 = about 5% of the image, visible only
// in the gaps between cards - which reads as a stray band in the wrong place, not
// as a background. These two values are the whole difference between a backdrop
// and a border.
const SH_BACKDROP_DIM = 0.42;   // was 0.74
const SH_BACKDROP_CARD_ALPHA = 0.62;  // was 0.8

// Rewrites a theme card colour to a chosen alpha.
//
// The theme values are all rgba(R,G,B,A), so the alpha is the last component and
// a regex can do it without pulling in a colour parser. Anything unrecognised is
// returned untouched rather than mangled - a wrong colour here would be a blank
// panel, which is a far worse outcome than a slightly too opaque one.
function shWithAlpha(colour, alpha) {
    var c = String(colour || '').trim();
    var m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(c);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
    if (/^#[0-9a-f]{6}$/i.test(c)) {
        return 'rgba(' + parseInt(c.slice(1, 3), 16) + ',' + parseInt(c.slice(3, 5), 16) + ',' +
            parseInt(c.slice(5, 7), 16) + ',' + alpha + ')';
    }
    if (/^#[0-9a-f]{3}$/i.test(c)) {
        return 'rgba(' + parseInt(c[1] + c[1], 16) + ',' + parseInt(c[2] + c[2], 16) + ',' +
            parseInt(c[3] + c[3], 16) + ',' + alpha + ')';
    }
    return c;
}

// Re-applies --card-color for the current theme, translucent when a backdrop is up.
// Called by applyTheme, and again whenever the backdrop is added or removed, so the
// two can never disagree about which state they are in.
function shRefreshCardTint() {
    // resolved once and reused by both halves below
    var t = shResolveTheme(currentUser && users[currentUser.email] && users[currentUser.email].theme);
    try {
        document.documentElement.style.setProperty('--card-color',
            SH_CUSTOM_BG_ACTIVE ? shWithAlpha(t.card, SH_BACKDROP_CARD_ALPHA) : t.card);
    } catch (e) {}
    // The variable is not the only thing that has to be refreshed.
    //
    // These four selectors are written with an INLINE style, which beats the
    // variable and the stylesheet alike. Set at signup with no backdrop up, they
    // stayed opaque when one was added - which is why --card-color read 0.62 while
    // .stat-card still computed to 0.8, and the dashboard looked unmoved.
    //
    // So both are done here. One function, so the two cannot disagree.
    try {
        shApplySurfaceTints(t);
    } catch (e) {}
}

function applyCustomBackground(dataUrl) {
    if (!dataUrl) { clearCustomBackground(); return; }
    var root = document.documentElement;
    var old = document.getElementById('shCustomBg');
    if (old) old.remove();
    var mark = document.createElement('div');
    mark.id = 'shCustomBg';
    // A 1px marker, and the diagnostic: with no custom background this element
    // is absent, so its PRESENCE is proof the feature actually ran. That is what
    // makes "does nothing" distinguishable from "did not run".
    mark.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(mark);
    var dim = 'rgba(8,8,18,' + SH_BACKDROP_DIM + ')';
    root.style.backgroundImage = 'linear-gradient(' + dim + ', ' + dim + '), url("' + dataUrl + '")';
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center top';
    root.style.backgroundRepeat = 'no-repeat';
    root.style.backgroundAttachment = 'fixed';
    // the opaque body background from applyTheme is what hid the backdrop
    document.body.style.background = 'transparent';
    SH_CUSTOM_BG_ACTIVE = true;
    shRefreshCardTint();
}

// Removing the backdrop restores the theme by RE-APPLYING it rather than
// writing a background colour back by hand. applyTheme owns that value, and a
// second copy of it here is how the two drift apart.
function clearCustomBackground() {
    var old = document.getElementById('shCustomBg');
    if (old) old.remove();
    var root = document.documentElement;
    root.style.backgroundImage = '';
    root.style.backgroundSize = '';
    root.style.backgroundPosition = '';
    root.style.backgroundRepeat = '';
    root.style.backgroundAttachment = '';
    SH_CUSTOM_BG_ACTIVE = false;
    shRefreshCardTint();
    try { applyTheme((currentUser && users[currentUser.email] && users[currentUser.email].theme) || 'default'); } catch (e) {}

    // Forget the stored value too, or it comes straight back on the next
    // refresh and on every other device - the user presses Remove, reloads, and
    // it is there again with no explanation. Painted state and saved state are
    // two different things and both have to be undone.
    try {
        for (var key in users) {
            if (users[key].id === currentUser.id && users[key].customBackground) {
                users[key].customBackground = '';
                saveUsers();
                shPushUser(users[key]);
                var cleanUser = { ...users[key] };
                delete cleanUser.password;
                updateUIForUser(cleanUser);
                break;
            }
        }
    } catch (e) {}
    var bgInput = document.getElementById('customBackgroundInput');
    if (bgInput) bgInput.value = '';
}

function uploadCustomBackground() {
    var input = findImageInput('customBackgroundInput');
    if (!input || !input.files || input.files.length === 0) {
        showNotification('Error', 'Please select an image file first.', 'error');
        return;
    }
    var file = input.files[0];
    if (file.size > 10 * 1024 * 1024) { showNotification('Error', 'Background is too large (max 10MB).', 'error'); return; }
    var validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showNotification('Error', 'Please upload a PNG, JPG or WEBP file.', 'error');
        return;
    }
    showNotification('Saving', 'Processing background...', 'info', 1500);
    // Wider and taller than the banner: this one covers the whole viewport.
    compressImageFile(file, 1920, 0.72).then(function(imageData) {
        if (typeof imageData === 'string' && imageData.length > SH_IMAGE_CAP) {
            throw new Error('that image is still too large after compression - try a smaller one');
        }
        return shSampleImageTheme(imageData).then(function(theme) {
            for (var key in users) {
                if (users[key].id === currentUser.id) {
                    users[key].customBackground = imageData;
                    // the theme follows the picture, so the two cannot clash
                    if (theme && users[key].theme !== theme) {
                        users[key].theme = theme;
                        applyTheme(theme);
                        // the select and the dots are rebuilt, not patched: the picker's
                        // state is a function of the saved theme, and a direct
                        // `sel.value = theme` cannot add the "custom" row or correct
                        // a name that is no longer in the list.
                        shRenderThemePicker();
                    }
                    saveUsers();
                    shPushUser(users[key]);   // sync to cloud, all devices
                    var userData = { ...users[key] };
                    delete userData.password;
                    updateUIForUser(userData);
                    applyCustomBackground(imageData);
                    showNotification('Success', 'Background updated. Theme set to ' + (theme || 'default') + ' to match it.', 'success', 5000);
                    input.value = '';
                    break;
                }
            }
        });
    }).catch(function(error) {
        showNotification('Error', 'Failed to save background: ' + (error && error.message ? error.message : error), 'error');
    });
}

function changeTheme(themeName) {
    if (!currentUser) return;
    // Validate before storing, not after. applyTheme() falls back to purple for an
    // unknown name, so an unchecked value would LOOK applied while the record held
    // something the worker resets to its own default on the next sync - a theme
    // that works on this device and nowhere else. That is the two-allowlist bug
    // again, on a third field.
    var name = shValidateThemeName(themeName);
    if (!name) {
        showNotification('Theme', 'That is not a usable theme name.', 'error', 3000);
        shRenderThemePicker();
        return;
    }
    for (var key in users) {
        if (users[key].id === currentUser.id) {
            users[key].theme = name;
            saveUsers();
            shPushUser(users[key]); // sync to cloud (all devices)
            applyTheme(name);
            shRenderThemePicker();
            showNotification('Theme Changed', shThemeLabel(name) + ' applied.', 'success', 1500);
            break;
        }
    }
}

// A human label for any stored theme name, including a custom colour.
function shThemeLabel(name) {
    var s = String(name == null ? '' : name);
    if (s.indexOf(SH_CUSTOM_THEME_PREFIX) === 0) return 'Custom colour ' + s.slice(SH_CUSTOM_THEME_PREFIX.length);
    for (var i = 0; i < SH_THEME_PICKER.length; i++) {
        if (SH_THEME_PICKER[i].name === s) return SH_THEME_PICKER[i].label;
    }
    // the 'default' alias, or anything else: purple, which is what it renders as
    return SH_THEME_PICKER.filter(function (t) { return t.name === SH_THEME_FALLBACK; })[0].label;
}

// Applies a colour the user picked. The stored value is the hex, so the theme is
// identical on every other device without any extra sync field.
function applyCustomThemeColor(hex) {
    var clean = shNormalizeHex(hex);
    if (!clean) {
        showNotification('Theme', 'That is not a colour the page can use - expected something like #7c3aed.', 'error', 4000);
        return;
    }
    changeTheme(SH_CUSTOM_THEME_PREFIX + clean);
}

// Builds the <select> options, the preview dots, and the swatch row.
//
// RENDERED, NOT HAND-WRITTEN. The markup used to list eight themes twice - once as
// <option> and once as a .color-dot div - and those two lists were already out of
// step with each other and with the themes object. Fifteen entries written out
// twice by hand is thirty places to forget one. Generated from one list, the select
// and the dots cannot disagree, and adding a theme is one entry in SH_THEME_PICKER.
function shRenderThemePicker() {
    var sel = document.getElementById('themeSelect');
    var dots = document.getElementById('themeDots');
    var swatch = document.getElementById('customThemeSwatch');
    if (!sel && !dots) return;

    var current = (currentUser && users[currentUser.email] && users[currentUser.email].theme) || '';
    var isCustom = current.indexOf(SH_CUSTOM_THEME_PREFIX) === 0;

    if (sel) {
        // the select is rebuilt only when the option set is wrong, so a theme change
        // does not fight the user mid-interaction
        var have = sel.querySelectorAll('option[data-sh-theme]').length;
        if (have !== SH_THEME_PICKER.length) {
            var opts = '';
            for (var i = 0; i < SH_THEME_PICKER.length; i++) {
                opts += '<option value="' + SH_THEME_PICKER[i].name + '" data-sh-theme="1">' + SH_THEME_PICKER[i].label + '</option>';
            }
            // The custom entry carries the CURRENT colour in its own text, so the
            // select shows which colour is live even though its value is the
            // sentinel. A fixed label would say "Custom" and hide the answer.
            opts += '<option value="' + SH_CUSTOM_THEME_PREFIX + 'custom" data-sh-theme="1" id="shCustomThemeOption">🎨 Custom colour…</option>';
            sel.innerHTML = opts;
        }
        // an unknown saved name still has to select SOMETHING, or the control shows
        // blank on a page that is visibly themed
        var isListed = false;
        for (var j = 0; j < SH_THEME_PICKER.length; j++) if (SH_THEME_PICKER[j].name === current) isListed = true;
        sel.value = isListed ? current : (isCustom ? SH_CUSTOM_THEME_PREFIX + 'custom' : SH_THEME_FALLBACK);
        var co = document.getElementById('shCustomThemeOption');
        if (co) co.textContent = isCustom ? '🎨 Custom colour ' + current.slice(SH_CUSTOM_THEME_PREFIX.length) : '🎨 Custom colour…';
    }

    if (dots) {
        var html = '';
        for (var d = 0; d < SH_THEME_PICKER.length; d++) {
            var t = SH_THEME_PICKER[d];
            // through the resolver, not themes[name]: the dot must show exactly the
            // colour applyTheme would use, or the swatch and the page disagree
            var tObj = shResolveTheme(t.name);
            var on = (t.name === current) ? ' sh-dot-on' : '';
            html += '<button type="button" class="color-dot' + on + '" style="background:' + tObj.primary + ';"' +
                ' onclick="changeTheme(\'' + t.name + '\')" title="' + t.label + '" aria-label="' + t.label + '"></button>';
        }
        // the live custom colour, so a custom theme is visible as a swatch and not
        // only as text in the select
        if (isCustom) {
            html += '<button type="button" class="color-dot sh-dot-on" style="background:' + current.slice(SH_CUSTOM_THEME_PREFIX.length) + ';"' +
                ' onclick="openCustomThemePicker()" title="Your custom colour" aria-label="Your custom colour"></button>';
        }
        dots.innerHTML = html;
    }

    if (swatch) {
        // the colour input is seeded with what is already applied, so re-opening the
        // picker starts from the current theme rather than resetting it
        swatch.value = isCustom ? current.slice(SH_CUSTOM_THEME_PREFIX.length) : (shResolveTheme(current).primary || '#7c3aed');
    }
}

// The colour input is always in the markup, hidden, and revealed by the button.
// A hidden <input type=color> cannot be styled, so "styled" here means the TRIGGER
// is a real button in the theme's own colours and the input is the OS picker behind
// it - which is the only way to get the platform's own colour wheel.
function openCustomThemePicker() {
    var wrap = document.getElementById('customThemeWrap');
    var input = document.getElementById('customThemeSwatch');
    if (wrap) wrap.classList.add('sh-open');
    if (!input) return;
    // seeded from what is already applied, so opening the picker and picking the
    // colour you already have is a no-op rather than a reset to purple
    shRenderThemePicker();
    try { input.click(); } catch (e) {}
}

// The select's own onchange. Split out from changeTheme because the custom row
// carries the SENTINEL value "custom:custom", not a colour: the real hex is in the
// colour input. Sending the sentinel to changeTheme would store a theme that renders
// as purple, because shNormalizeHex("custom") is not a colour - the page would look
// like the button worked and the theme would be wrong.
function shOnThemeSelect(value) {
    if (String(value).indexOf(SH_CUSTOM_THEME_PREFIX) === 0) {
        shRenderThemePicker();
        openCustomThemePicker();
        return;
    }
    changeTheme(value);
}

// Live preview while the wheel is being dragged: the CSS variables and the tinted
// surfaces are written immediately, but NOTHING is saved.
//
// A drag emits an input event per movement, so persisting and syncing on each one
// would fire a POST /sh/user-sync per pixel - a rate-limit throttle at best and a
// quota burn at worst. change() fires once, when the picker closes, and that is
// where the save and the cloud push happen. The preview is what makes the choice
// feel like a preview instead of a guess.
function shOnCustomThemeInput(hex) {
    var clean = shNormalizeHex(hex);
    if (!clean) return;
    var t = shThemeFromHex(clean);
    var root = document.documentElement;
    root.style.setProperty('--primary-color', t.primary);
    root.style.setProperty('--secondary-color', t.secondary);
    root.style.setProperty('--bg-color', t.bg);
    root.style.setProperty('--card-color', SH_CUSTOM_BG_ACTIVE ? shWithAlpha(t.card, SH_BACKDROP_CARD_ALPHA) : t.card);
    root.style.setProperty('--text-color', t.text);
    root.style.setProperty('--accent-color', t.accent);
    document.body.style.background = SH_CUSTOM_BG_ACTIVE ? 'transparent' : t.bg;
    shApplySurfaceTints(t);
    document.querySelectorAll('.btn-primary').forEach(function (el) {
        el.style.background = 'linear-gradient(135deg, ' + t.primary + ', ' + t.secondary + ')';
        el.style.color = t.onPrimary;
    });
    var brand = document.querySelector('.navbar-brand');
    if (brand) {
        brand.style.background = 'linear-gradient(135deg, ' + t.primary + ', ' + t.secondary + ')';
        brand.style.webkitBackgroundClip = 'text';
        brand.style.webkitTextFillColor = 'transparent';
    }
}

// Fired once, when the colour picker is closed. This is the only place a custom
// colour is committed.
function shCommitCustomTheme() {
    var input = document.getElementById('customThemeSwatch');
    if (!input) return;
    var clean = shNormalizeHex(input.value);
    if (!clean) return;
    var current = (currentUser && users[currentUser.email] && users[currentUser.email].theme) || '';
    // Already applied: do nothing. Otherwise closing the picker after a preview that
    // ended where it started would still push a sync to the cloud.
    if (current === SH_CUSTOM_THEME_PREFIX + clean) { shRenderThemePicker(); return; }
    applyCustomThemeColor(clean);
}

function exportUsers() {
    if (!currentUser || currentUser.username !== 'Scripter') { showNotification('Access Denied', 'Only Scripter can export users.', 'error'); return; }
    var exportData = {};
    for (var key in users) {
        var user = { ...users[key] };
        delete user.password;
        exportData[key] = user;
    }
    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'users_export_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported', 'User data exported successfully!', 'success');
}

// ============ PROJECTS SYSTEM ==========
function loadProjects() {
    try {
        var data = localStorage.getItem('projects_' + (currentUser ? currentUser.id : ''));
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function saveProjects(projects) {
    try {
        // LURAPH FIX: avoid double-notification cascade. If we already warned
        // about storage in the last 4s, don't warn again (prevents 3-at-once spam
        // when Re-Obfuscating + Storage Note + Special Key fire together).
        var _lastNote = window._shLastStorageNote || 0;
        var _now = Date.now();
        localStorage.setItem('projects_' + (currentUser ? currentUser.id : ''), JSON.stringify(projects));
    } catch (e) {
        // localStorage quota (~5-10MB) exceeded - usually a HUGE obfuscated
        // script. Degrade gracefully: strip the bulky code fields from the
        // OLDEST scripts until it fits, keeping every script entry + the
        // newest code. The loadstring stays functional (the worker holds
        // the real copy); only the local "view code" needs re-obfuscation.
        console.error('Error saving projects:', e);
        try {
            var trimmed = JSON.parse(JSON.stringify(projects));
            var idx = 0;
            while (idx < trimmed.length) {
                var freed = false;
                if (trimmed[idx].scripts) {
                    for (var si = 0; si < trimmed[idx].scripts.length; si++) {
                        var sc = trimmed[idx].scripts[si];
                        if (sc.code && sc.code.length > 200000) { sc.code = ''; sc.codeStripped = true; freed = true; }
                    }
                }
                try {
                    localStorage.setItem('projects_' + (currentUser ? currentUser.id : ''), JSON.stringify(trimmed));
                    if (freed || idx === trimmed.length - 1) {
                        // debounce: don't spam Storage Note if we just showed it
                        if (Date.now() - (window._shLastStorageNote || 0) > 4000) {
                            window._shLastStorageNote = Date.now();
                            showNotification('Storage Note', 'Local storage was full - old scripts\' obfuscated code was trimmed locally (loadstrings keep working; re-obfuscate from Settings if you need the local copy).', 'warning', 8000);
                        }
                        return;
                    }
                } catch (e2) { idx++; }
            }
        } catch (e3) { /* give up silently - in-memory state still works */ }
    }
}

// ============ SHOW TABS ============
function showTabs() {
    var tabsNav = document.getElementById('tabsNav');
    if (tabsNav) { tabsNav.style.display = 'flex'; }
    var dashboardContent = document.getElementById('dashboard');
    var tabDashboard = document.getElementById('tab-dashboard');
    if (dashboardContent && tabDashboard) {
        if (!tabDashboard.hasChildNodes() || tabDashboard.children.length === 0) {
            var clone = dashboardContent.cloneNode(true);
            clone.style.display = 'block';
            tabDashboard.appendChild(clone);
        }
        dashboardContent.style.display = 'none';
    }
    if (currentUser) { updateDashboardTab(currentUser); }
    switchTab('dashboard');
}

function switchTab(tabName) {
    var btns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (btns[i].dataset.tab === tabName) { btns[i].classList.add('active'); }
    }
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) { contents[i].style.display = 'none'; }
    var target = document.getElementById('tab-' + tabName);
    if (target) { target.style.display = 'block'; }
    if (tabName === 'dashboard') { if (currentUser) { refreshStatsUI(); } }
    if (tabName === 'scripts') { renderProjects(); }
    if (tabName === 'keys') { renderKeys(); }
    if (tabName === 'rewards') { renderRewardsTab(); }
}

// ============ CREATE PROJECT ==========
function openCreateProject() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 540px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size: 22px;">📁 Create Project</h2>
            <p class="sub">Fill in the details to create a new project</p>
            <div class="form-group"><label>Project Name <span class="required">*</span></label><input type="text" id="projectName" placeholder="Enter project name" required></div>
            <div class="form-group"><label>Project Description <span style="color:#555577;">(optional)</span></label><textarea id="projectDescription" placeholder="Describe your project..."></textarea></div>
            <div class="form-group"><label>Logs Webhook <span style="color:#555577;">(optional)</span></label><input type="text" id="projectLogsWebhook" placeholder="https://discord.com/api/webhooks/..."><div class="field-hint">Successful executions will be sent to this webhook</div></div>
            <div class="form-group"><label>Alert Webhook <span style="color:#555577;">(optional)</span></label><input type="text" id="projectAlertWebhook" placeholder="https://discord.com/api/webhooks/..."><div class="field-hint">Crack attempts and bans will be reported to this webhook</div></div>
            <div class="form-group"><label>HWID Cooldown Reset <span style="color:#555577;">(optional)</span></label><input type="number" id="projectHwidCooldown" min="0" placeholder="Days"><div class="field-hint">Number of days user will need to wait before resetting HWID</div></div>
            <div class="form-group"><label>Visibility</label><select id="projectVisibility"><option value="anyone">Anyone</option><option value="friends">Friends (Soon...)</option><option value="private">Private</option></select></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectBlockIncognito"> Block Incognito Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectBlockVPN"> Block VPN</label>
            </div>
            <div class="form-group"><label>Type Of Project</label><select id="projectType"><option value="free">Free</option><option value="key">Key Required</option><option value="paid">Paid</option></select></div>
            <div class="form-group" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAllowHwidReset"> Allow HWID Reset</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAutoDeleteExpired"> Auto Delete Expired Users</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="projectAllowClonedSharing"> Allow HWID Cloned Key Sharing</label>
            </div>
            <div class="field-hint" style="margin-bottom:8px;">Cloned Key Sharing = one key on different computers with same HWID (useful for server hopping scripts with multi instance on VPSes). Auto Delete runs every 15 minutes.</div>
            <button onclick="confirmCreateProject()" class="btn btn-primary" style="width:100%; margin-top:8px; padding:12px;">✅ Create Project</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmCreateProject() {
    if (shRateGuard('project', SH_RATE.project.max, SH_RATE.project.window, 'Too Many Projects')) return;
    var name = document.getElementById('projectName').value.trim();
    var description = document.getElementById('projectDescription').value.trim();
    var logsWebhook = document.getElementById('projectLogsWebhook').value.trim();
    var alertWebhook = document.getElementById('projectAlertWebhook').value.trim();
    var hwidCooldown = document.getElementById('projectHwidCooldown').value;
    var visibility = document.getElementById('projectVisibility').value;
    var blockIncognito = document.getElementById('projectBlockIncognito').checked;
    var blockVPN = document.getElementById('projectBlockVPN').checked;
    var type = document.getElementById('projectType').value;
    var allowHwidReset = document.getElementById('projectAllowHwidReset').checked;
    var autoDeleteExpired = document.getElementById('projectAutoDeleteExpired').checked;
    var allowClonedSharing = document.getElementById('projectAllowClonedSharing').checked;
    if (!name) { showNotification('Error', 'Project name is required.', 'error'); return; }
    var limitErr = checkPlanLimit('projects');
    if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return; }
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'A project with this name already exists. Choose a different name.', 'error');
            return;
        }
    }
    var project = { id: 'proj_' + Date.now(), name: name, description: description, logsWebhook: logsWebhook, alertWebhook: alertWebhook, hwidCooldownDays: hwidCooldown ? parseInt(hwidCooldown, 10) : null, visibility: visibility, blockIncognito: blockIncognito, blockVPN: blockVPN, type: type, allowHwidReset: allowHwidReset, autoDeleteExpired: autoDeleteExpired, allowClonedSharing: allowClonedSharing, createdAt: new Date().toISOString(), scripts: [] };
    projects.push(project);
    saveProjects(projects);
    refreshStatsUI();
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Success', 'Project "' + name + '" created!', 'success');
    renderProjects();
}

function renderProjects() {
    var container = document.getElementById('projectsList');
    if (!container) return;
    var projects = loadProjects();
    if (projects.length === 0) {
        container.innerHTML = '<p style="color:#8888aa; grid-column:1/-1; text-align:center; padding:40px 0;">No projects yet. Create your first project!</p>';
        return;
    }
    var html = '';
    for (var i = 0; i < projects.length; i++) {
        var project = projects[i];
        var scriptCount = project.scripts ? project.scripts.length : 0;
        var visibilityLabel = project.visibility === 'anyone' ? '🌐 Anyone' : (project.visibility === 'friends' ? '👥 Friends' : '🔒 Private');
        html += `
            <div class="project-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:0;">
                        <div class="project-name">${project.name}</div>
                        <div class="project-desc">${project.description || 'No description'}</div>
                        <div class="project-tags">
                            <span class="tag tag-visibility">${visibilityLabel}</span>
                            <span class="tag tag-type">${project.type.toUpperCase()}</span>
                            <span class="tag tag-scripts">📜 ${scriptCount} scripts</span>
                        </div>
                    </div>
                    <div class="project-actions">
                        <button onclick="viewProject('${project.id}')" class="btn-sm btn-sm-primary">📜 View Scripts</button>
                        <button onclick="openCreateScript('${project.id}')" class="btn-sm btn-sm-primary">➕ New Script</button>
                        <button onclick="editProject('${project.id}')" class="btn-sm btn-sm-edit">✏️ Edit</button>
                        <button onclick="deleteProject('${project.id}')" class="btn-sm btn-sm-danger">🗑️ Delete</button>
                    </div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ============ VIEW PROJECT ==========
function viewProject(projectId) {
    var projects = loadProjects();
    var project = null;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var scriptsHtml = '';
    if (project.scripts && project.scripts.length > 0) {
        for (var i = 0; i < project.scripts.length; i++) {
            var script = project.scripts[i];
            var obfType = script.obfuscationType || 'custom';
            var obfDisplay = obfType === 'aegis' ? 'Aegis Obfuscator' : (OBFUSCATION_TYPES[obfType] || 'Default Obfuscator');
            var obfBadgeClass = 'obf-badge' + (obfType === 'aegis' ? ' obf-badge-aegis' : ' obf-badge-custom');
            var status = script.freeForEveryone ? '🌐 Free' : (script.requireKey ? '🔑 Key Required' : (project.type === 'paid' ? '💰 Paid' : '🌐 Free'));
            var statusColor = script.requireKey ? '#ffd700' : '#66ff66';
            scriptsHtml += `
                <div class="script-item">
                    <div class="script-info">
                        <div class="name">${script.name} <span style="font-size:11px; color:#555577;">${versionLabel(script)}</span></div>
                        <div class="desc">${script.description || 'No description'}</div>
                        <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                            <span class="${obfBadgeClass}">🔐 ${obfDisplay}</span>
                            <span style="font-size:11px; color:${statusColor}; background:rgba(255,255,255,0.05); padding:2px 10px; border-radius:10px;">${status}</span>
                            <span style="font-size:11px; color:#8888aa;">🕒 ${timeAgo(script.updatedAt || script.createdAt)}</span>
                        </div>
                    </div>
                    <div class="script-actions">
                        <button onclick="editScript('${project.id}','${script.id}')" class="btn-sm btn-sm-edit">✏️ Edit</button>
                        <button onclick="openScriptSettings('${project.id}','${script.id}')" class="btn-sm btn-sm-edit">⚙️ Settings</button>
                        <button onclick="deleteScript('${project.id}','${script.id}')" class="btn-sm btn-sm-danger">🗑️ Delete</button>
                    </div>
                </div>
            `;
        }
    } else { scriptsHtml = '<p style="color:#8888aa; text-align:center; padding:20px 0;">No scripts in this project yet.</p>'; }
    overlay.innerHTML = `
        <div class="modal" style="max-width: 650px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <div><h2 style="font-size:22px; margin:0; color:#fff;">📜 ${project.name}</h2><p style="color:#8888aa; margin:4px 0 0; font-size:13px;">${project.description || 'No description'}</p></div>
                <button onclick="openCreateScript('${project.id}')" class="btn btn-primary" style="padding:8px 16px;">➕ Create Script</button>
            </div>
            <div style="max-height:400px; overflow-y:auto;">${scriptsHtml}</div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============ OBFUSCATION ENGINE ============
const OBFUSCATION_TYPES = {
    'custom': 'Custom Obfuscator [Unreadable Source]',
    'allinone': 'All In One [Recommended]',
    'ironbrew': 'IronBrew',
    'moonveil': 'MoonVeiL',
    'prometheus': 'Prometheus',
    'luaobfuscator': 'LuaObfuscator',
    'moonsec': 'Moonsec',
    'luraph_normal': 'Luraph Normal [Best]',
    'luraph_v15': 'Luraph V15 [Best]'
};

function applyObfuscation(code, type, options) {
    switch(type) {
        case 'custom': return applyCustomObfuscator(code, options || {});
        case 'allinone': return applyAllInOne(code, options);
        case 'ironbrew': return applyIronBrew(code);
        case 'moonveil': return applyMoonVeiL(code);
        case 'prometheus': return applyPrometheus(code);
        case 'luaobfuscator': return applyLuaObfuscator(code);
        case 'moonsec': return applyMoonsec(code);
        case 'luraph_normal': return applyLuraph(code, 'normal');
        case 'luraph_v15': return applyLuraph(code, 'v15');
        default: return code;
    }
}

// All In One now uses the REAL custom engine at maximum power
function applyAllInOne(code, options) {
    var opts = options || {};
    opts.intensity = 10;
    opts.antiTamper = opts.antiTamper !== false;
    opts.antiSkid = opts.antiSkid !== false;
    return applyCustomObfuscator(code, opts);
}

function applyIronBrew(code) {
    var lines = code.split('\n');
    var stringMap = {};
    var stringCounter = 0;
    var varMap = {};
    var varCounter = 0;
    var result = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 1 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 5);
                    stringCounter++;
                }
            }
        }
        var varMatches = line.match(/local\s+(\w+)/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace('local ', '');
                if (!varMap[varName] && varName !== 'function' && varName !== 'if' && varName !== 'then') {
                    varMap[varName] = '_v' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 5);
                    varCounter++;
                }
            }
        }
    }
    result.push('local _strings = {');
    for (var str in stringMap) {
        var encrypted = '';
        for (var k = 0; k < str.length; k++) { encrypted += (str.charCodeAt(k) + 5) + ','; }
        encrypted = encrypted.slice(0, -1);
        result.push('  ["' + str + '"] = {' + encrypted + '},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t do s=s..string.char(t[i]-5) end;return s end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_strings["' + str + '"])');
        }
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

function applyMoonVeiL(code) {
    var lines = code.split('\n');
    var result = [];
    var junkCounter = 0;
    var junkFunctions = [
        'local function _j' + junkCounter + '() local a=0;for i=1,100 do a=a+i end;return a end',
        'local function _j' + (junkCounter+1) + '() local b=2;local c=3;return b*c end',
        'local function _j' + (junkCounter+2) + '() local d={};for i=1,50 do d[i]=i end;return #d end',
        'local function _j' + (junkCounter+3) + '() local e="";for i=1,20 do e=e..string.char(65+i) end;return e end',
        'local function _j' + (junkCounter+4) + '() local f=0;for i=1,200 do f=f+i/2 end;return math.floor(f) end'
    ];
    result.push(junkFunctions.join('\n'));
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.match(/^\s*if\s+.*\s+then/)) {
            var condition = line.replace(/^\s*if\s+/, '').replace(/\s+then$/, '');
            var junkCall = '_j' + (junkCounter % 5) + '()';
            result.push('local _c = ' + condition);
            result.push('if _c then');
            result.push('  ' + junkCall);
        } else if (line.match(/^\s*\w+\(/)) {
            result.push(line);
            result.push('  _j' + ((junkCounter + 1) % 5) + '()');
        } else if (line.match(/^\s*local\s+\w+\s*=/)) {
            result.push(line);
            result.push('  _j' + ((junkCounter + 2) % 5) + '()');
        } else { result.push(line); }
    }
    return result.join('\n');
}

function applyPrometheus(code) {
    var lines = code.split('\n');
    var varMap = {};
    var varCounter = 0;
    var result = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_p' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local function _m(a,b) return a+b end');
    result.push('local function _s(a,b) return a-b end');
    result.push('local function _mul(a,b) return a*b end');
    result.push('local function _d(a,b) return a/b end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        line = line.replace(/(\w+)\s*\+\s*(\w+)/g, '_m($1, $2)');
        line = line.replace(/(\w+)\s*\-\s*(\w+)/g, '_s($1, $2)');
        line = line.replace(/(\w+)\s*\*\s*(\w+)/g, '_mul($1, $2)');
        line = line.replace(/(\w+)\s*\/\s*(\w+)/g, '_d($1, $2)');
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

function applyLuaObfuscator(code) {
    var lines = code.split('\n');
    var result = [];
    var stringMap = {};
    var stringCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 1 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36);
                    stringCounter++;
                }
            }
        }
    }
    result.push('local _s = {');
    for (var str in stringMap) {
        var encoded = '';
        for (var k = 0; k < str.length; k++) { encoded += str.charCodeAt(k) + ','; }
        encoded = encoded.slice(0, -1);
        result.push('  ["' + str + '"] = {' + encoded + '},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t do s=s..string.char(t[i]) end;return s end');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        line = line.replace(/--.*$/, '');
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_s["' + str + '"])');
        }
        line = line.trim();
        if (line.length > 0) { result.push(line); }
    }
    return result.join('\n');
}

function applyMoonsec(code) {
    var lines = code.split('\n');
    var result = [];
    var varMap = {};
    var varCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_m' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local function _antiDebug()');
    result.push('  local t = debug and debug.getinfo or nil');
    result.push('  if t then');
    result.push('    error("Debugging detected")');
    result.push('  end');
    result.push('end');
    result.push('_antiDebug()');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.match(/^\s*function\s+/)) {
            result.push('local _s = pcall(function() return debug and debug.getinfo end)');
            result.push('if _s then error("Security violation") end');
            result.push(line);
        } else {
            for (var varName in varMap) {
                var regex = new RegExp('\\b' + varName + '\\b', 'g');
                line = line.replace(regex, varMap[varName]);
            }
            if (line.match(/^\s*local\s+\w+\s*=/)) {
                result.push(line);
                result.push('  _antiDebug()');
            } else { result.push(line); }
        }
    }
    return result.join('\n');
}

function applyLuraph(code, version) {
    var lines = code.split('\n');
    var result = [];
    var stringMap = {};
    var stringCounter = 0;
    var varMap = {};
    var varCounter = 0;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var strMatches = line.match(/["']([^"']*)["']/g);
        if (strMatches) {
            for (var j = 0; j < strMatches.length; j++) {
                var str = strMatches[j];
                var content = str.substring(1, str.length - 1);
                if (content.length > 2 && !stringMap[content]) {
                    stringMap[content] = '_s' + stringCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    stringCounter++;
                }
            }
        }
        var varMatches = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g);
        if (varMatches) {
            for (var j = 0; j < varMatches.length; j++) {
                var varName = varMatches[j].replace(/\s*=$/, '').trim();
                if (!varMap[varName] && varName !== 'local' && varName !== 'function') {
                    varMap[varName] = '_l' + varCounter.toString(36) + '_' + Math.random().toString(36).substring(2, 4);
                    varCounter++;
                }
            }
        }
    }
    result.push('local _strings = {');
    for (var str in stringMap) {
        var encrypted = '';
        var key = Math.floor(Math.random() * 255) + 1;
        for (var k = 0; k < str.length; k++) { encrypted += (str.charCodeAt(k) ^ key) + ','; }
        encrypted = encrypted.slice(0, -1);
        result.push('  ["' + str + '"] = {key=' + key + ', data={' + encrypted + '}},');
    }
    result.push('}');
    result.push('local function _d(t) local s="";for i=1,#t.data do s=s..string.char(bit32.bxor(t.data[i], t.key)) end;return s end');
    if (version === 'v15') {
        result.push('-- Luraph V15: Advanced control flow');
        result.push('local function _v15() local a={} for i=1,1000 do a[i]=i end return #a end');
        result.push('local _v15_check = pcall(function() return debug and debug.getinfo end)');
        result.push('if _v15_check then error("Security violation") end');
    } else {
        result.push('-- Luraph Normal: Standard obfuscation');
        result.push('local function _ln() local a=0;for i=1,500 do a=a+i end;return a end');
    }
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var str in stringMap) {
            var regex = new RegExp('["\']' + str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
            line = line.replace(regex, '_d(_strings["' + str + '"])');
        }
        for (var varName in varMap) {
            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            line = line.replace(regex, varMap[varName]);
        }
        result.push(line);
    }
    return result.join('\n');
}

// ============ CREATE SCRIPT ==========
function openCreateScript(projectId) {
    var projects = loadProjects();
    var project = null;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    editingScript = null;
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 600px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">➕ Create Script</h2>
            <p class="sub">Create a new script for "<strong style="color:#8a6bff;">${project.name}</strong>"</p>
            <div class="form-group"><label>Script Name <span class="required">*</span></label><input type="text" id="scriptName" placeholder="Enter script name" required></div>
            <div class="form-group"><label>Your Special Key</label><input type="text" id="scriptSpecialKey" placeholder="Any length — required (protects the website page)">
                <div style="margin-top:4px; font-size:11px; color:#8888aa;">🔐 Your script is ENCRYPTED with this key in YOUR browser before upload. The loadstring does NOT contain it. <strong style="color:#66ff66;">Free For Everyone:</strong> anyone can execute it in-game with NO key - the key only gates the website key page (so people can't rip your code from the browser). <strong style="color:#ff9999;">Paid:</strong> users must set the key BEFORE executing via <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> (no in-game popup). It is NEVER sent to the server; losing it = the script is gone forever.</div>
            </div>
            <div class="form-group"><label>Script Description <span style="color:#555577;">(optional)</span></label><textarea id="scriptDescription" placeholder="Describe your script..."></textarea></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptAntiTamper" checked> 🛡️ Anti Tampering</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptAntiSkid" checked> 🔒 Anti Skidding</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptEnvLogging"> 📡 Environment Logging</label>
                <label style="margin:0; cursor:pointer;" title="Compiles to the custom bytecode VM - every protection layer runs inside it, and it is the strongest obfuscation. Untick only to confirm the VM is what is breaking a script: the script will run, but it ships un-obfuscated."><input type="checkbox" id="scriptBytecodeVM" checked onchange="shBytecodeVMNote()"> 🧠 Bytecode VM</label>
                <label style="margin:0; cursor:pointer;${project.type === 'key' ? '' : ' display:none;'}"><input type="checkbox" id="scriptRequireKey"> 🔑 Require Key</label>
            </div>
            <div class="form-group" id="scriptBytecodeVMInfo" style="display:none; margin-top:-4px; font-size:11px; color:#ffaa44; line-height:1.5;">
                ⚠️ <strong>Bytecode VM is OFF — this script ships essentially UNOBFUSCATED.</strong> Every protection layer (string encryption, control flow, number obfuscation) runs inside the VM, so unticking it does not select a lighter protection, it selects none: your source goes out in readable form. Leave it on unless you are diagnosing a script that will not run — if a script works with this unticked and fails with it ticked, the VM is the cause.
            </div>
            <div class="form-group" id="scriptKeyGateInfo" style="display:none;">
                <div style="padding:10px 14px; background:rgba(108,59,255,0.1); border:1px solid rgba(108,59,255,0.25); border-radius:10px; font-size:12px; color:#8888aa;">
                    🔑 <strong style="color:#8a6bff;">Key System:</strong> All your <strong>active keys from the Keys tab</strong> get embedded (hashed, never readable) into the script. Users must enter a valid key (popup key card or <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>) before the script runs. Expired/used keys are rejected automatically.
                </div>
            </div>
            <div class="form-group" id="scriptWebhookGroup" style="display:none;">
                <label>📡 Logging Webhook URL <span style="color:#555577;">(Discord webhook or API endpoint)</span></label>
                <input type="text" id="scriptWebhookUrl" placeholder="https://discord.com/api/webhooks/...">
                <div style="margin-top:4px; font-size:11px; color:#8888aa;">Runs, usernames, executor, HWID, place ID etc. of everyone executing your script will be sent to this webhook and saved to their scripterhub/ log file.</div>
            </div>
            <div class="form-group">
                <label>Max Timer Of Keys</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" id="scriptKeyTime" placeholder="Amount" style="flex:1; min-width:0;">
                    <select id="scriptKeyUnit" style="flex:1; min-width:0;">
                        <option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option>
                        <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option>
                        <option value="years">Years</option><option value="unlimited">Unlimited</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>Upload .txt/.lua File <span style="color:#555577;">(optional)</span></label><input type="file" id="scriptFile" accept=".txt,.lua"></div>
            <div class="form-group"><label>Paste .txt/.lua Code <span class="required">*</span></label><textarea id="scriptCode" placeholder="-- Paste your Lua code here..." style="min-height:150px; font-family:monospace; font-size:13px;"></textarea></div>
            <div class="form-group">
                <label>💎 Choose Obfuscator</label>
                <select id="scriptObfuscatorEngine" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" selected>Default Obfuscator (Recommended)</option>
                    <option value="aegis">Aegis Obfuscator</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">💎 <strong style="color:#ff66cc;">Default</strong>: multi-layer encryption + Anti-Tampering / Anti-Skidding / Anti-Logger (detects loggers, spies & hooks → game:Shutdown()). ⚔️ <strong style="color:#00ccaa;">Aegis</strong>: external Aegis engine (custom ISA + polymorphic VM) - your source is sent to the Aegis API to be obfuscated.</div>
            </div>
            <div class="form-group" style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptFreeForEveryone" ${project.type === 'free' ? 'checked' : ''}> 🌐 Free For Everyone</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptSilentMode"> 🔇 Silent Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptHeartbeat" checked> 💓 Heartbeat</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptLightningMode"> ⚡ Lightning Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="scriptSecurityUpdates" checked> 🔄 Enable Security Updates</label>
            </div>
            <div class="field-hint" style="margin-bottom:10px;">🌐 Free For Everyone = anyone can execute (NO key in executors - the Special Key only gates the website page). 🔇 Silent = no console outputs (not recommended). 💓 Heartbeat = more secure (recommended). ⚡ Lightning = faster but removes some inline security checks. 🔄 Security Updates = stores your raw script encrypted for automated updates (recommended).</div>
            ${project.type === 'key' ? `
            <div class="form-group">
                <label>🔑 Choose How Key Works</label>
                <select id="scriptKeyMode" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" selected>Default (Roblox Core Notification)</option>
                    <option value="custom">Custom (You Make It)</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;" id="scriptKeyModeHint">🔑 <strong style="color:#8a6bff;">Default</strong>: ScripterHub shows Roblox notifications ("Key required!", "Invalid key!", "Key accepted!") and a popup key card. Your users set <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>.</div>
            </div>` : ''}
            <div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="scriptHWIDReset"> 🔄 HWID Reset (Allow device change)</label></div>
            <div class="form-group">
                <label>Game Link/ID <span style="color:#555577;">(optional)</span></label>
                <input type="text" id="scriptGameId" placeholder="e.g. 1234567890 or roblox.com/games/1234567890">
                <div id="gameThumbWrap" style="display:none; margin-top:10px; align-items:center; gap:14px;">
                    <img id="gameThumbImg" style="width:96px; height:96px; border-radius:14px; object-fit:cover; border:2px solid rgba(255,255,255,0.1);" alt="Game icon">
                    <div>
                        <div id="gameThumbName" style="color:#fff; font-weight:600; font-size:14px;"></div>
                        <div id="gameThumbMeta" style="color:#8888aa; font-size:12px; margin-top:4px;"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:12px; margin-top:12px;">
                <button onclick="confirmCreateScript('${projectId}')" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">✅ Create Script</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var envLogToggle = document.getElementById('scriptEnvLogging');
    var webhookGroup = document.getElementById('scriptWebhookGroup');
    if (envLogToggle && webhookGroup) {
        envLogToggle.addEventListener('change', function() {
            webhookGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
    var requireKeyToggle = document.getElementById('scriptRequireKey');
    var keyGateInfo = document.getElementById('scriptKeyGateInfo');
    if (requireKeyToggle && keyGateInfo) {
        if (currentProject && currentProject.type === 'key') requireKeyToggle.checked = true;
        keyGateInfo.style.display = requireKeyToggle.checked ? 'block' : 'none';
        requireKeyToggle.addEventListener('change', function() {
            keyGateInfo.style.display = this.checked ? 'block' : 'none';
        });
    }
    var fileInput = document.getElementById('scriptFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('scriptCode').value = e.target.result;
                showNotification('File Loaded', 'Loaded ' + file.name, 'success', 2000);
            };
            reader.onerror = function() { showNotification('Error', 'Failed to read file.', 'error'); };
            reader.readAsText(file);
        });
    }
    // key mode hint switcher
    var keyModeSel = document.getElementById('scriptKeyMode');
    var keyModeHint = document.getElementById('scriptKeyModeHint');
    if (keyModeSel && keyModeHint) {
        keyModeSel.addEventListener('change', function() {
            keyModeHint.innerHTML = this.value === 'custom'
                ? '🛠️ <strong style="color:#00ccaa;">Custom</strong>: no built-in UI - you make your OWN key GUI! The script waits silently and exposes API globals: <code style="color:#66ff66;">ScripterHubKeyValid</code>, <code style="color:#66ff66;">ScripterHubKeyIncorrect</code>, <code style="color:#66ff66;">ScripterHubKeyExpired</code>, <code style="color:#66ff66;">ScripterHubKeyStatus</code>. Your GUI sets <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> when ready (see APIs in the Users Keys tab).'
                : '🔑 <strong style="color:#8a6bff;">Default</strong>: ScripterHub shows Roblox notifications ("Key required!", "Invalid key!", "Key accepted!") and a popup key card. Your users set <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code>.';
        });
    }
    // Roblox game thumbnail preview from Game Link/ID
    var gameIdInput = document.getElementById('scriptGameId');
    if (gameIdInput) {
        gameIdInput.addEventListener('input', function() { fetchGamePreview(this.value.trim()); });
        gameIdInput.addEventListener('change', function() { fetchGamePreview(this.value.trim()); });
    }
}

// ============ ROBLOX GAME PREVIEW (thumbnail + name from place id/url) ============
function extractPlaceId(input) {
    if (!input) return null;
    var m = input.match(/games\/(\d+)/) || input.match(/placeid[=/](\d+)/i) || input.match(/(\d{6,})/);
    return m ? m[1] : null;
}

var gamePreviewCache = {};
function fetchGamePreview(input) {
    var wrap = document.getElementById('gameThumbWrap');
    if (!wrap) return;
    var placeId = extractPlaceId(input);
    if (!placeId) { wrap.style.display = 'none'; return; }
    if (gamePreviewCache[placeId]) { renderGamePreview(gamePreviewCache[placeId]); return; }
    wrap.style.display = 'flex';
    var img = document.getElementById('gameThumbImg');
    if (img) { img.src = 'https://www.roblox.com/asset-thumbnail/image?assetId=' + placeId + '&width=420&height=420&format=png'; img.style.opacity = '0.5'; }
    var nameEl = document.getElementById('gameThumbName');
    var metaEl = document.getElementById('gameThumbMeta');
    if (nameEl) nameEl.textContent = 'Loading game info...';
    if (metaEl) metaEl.textContent = 'Place ID: ' + placeId;
    fetch('https://games.roblox.com/v1/games/multiget-place-details?placeIds=' + placeId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var info = (data && data[0]) || null;
            var cached = { placeId: placeId, name: info && info.name ? info.name : 'Unknown Game', creator: info && info.creatorName ? 'by ' + info.creatorName : '', playing: info && info.playing ? info.playing : null, url: info && info.gameId ? 'https://www.roblox.com/games/' + placeId : null };
            gamePreviewCache[placeId] = cached;
            renderGamePreview(cached);
        })
        .catch(function () {
            var cached = { placeId: placeId, name: 'Game', creator: '', playing: null, url: null };
            gamePreviewCache[placeId] = cached;
            renderGamePreview(cached);
        });
}

function renderGamePreview(info) {
    var wrap = document.getElementById('gameThumbWrap');
    if (!wrap) return;
    wrap.style.display = 'flex';
    var img = document.getElementById('gameThumbImg');
    if (img) {
        img.src = 'https://www.roblox.com/asset-thumbnail/image?assetId=' + info.placeId + '&width=420&height=420&format=png';
        img.style.opacity = '1';
    }
    var nameEl = document.getElementById('gameThumbName');
    var metaEl = document.getElementById('gameThumbMeta');
    if (nameEl) nameEl.textContent = info.name || 'Game';
    if (metaEl) metaEl.textContent = 'Place ID: ' + info.placeId + (info.creator ? ' | ' + info.creator : '') + (info.playing ? ' | 👥 ' + info.playing + ' playing' : '');
}

// ============ CONFIRM CREATE SCRIPT ============
function confirmCreateScript(projectId) {
    if (shRateGuard('script', SH_RATE.script.max, SH_RATE.script.window, 'Too Many Scripts')) return;
    var name = document.getElementById('scriptName').value.trim();
    var specialKey = document.getElementById('scriptSpecialKey') ? document.getElementById('scriptSpecialKey').value : '';
    var description = document.getElementById('scriptDescription').value.trim();
    var antiTamper = document.getElementById('scriptAntiTamper').checked;
    var antiSkid = document.getElementById('scriptAntiSkid').checked;
    var envLogging = document.getElementById('scriptEnvLogging') ? document.getElementById('scriptEnvLogging').checked : false;
    // default TRUE: the VM has always been on, and silently turning it off would
    // change what every existing publish produces.
    var vmPass = document.getElementById('scriptBytecodeVM') ? document.getElementById('scriptBytecodeVM').checked : true;
    var webhookUrl = document.getElementById('scriptWebhookUrl') ? document.getElementById('scriptWebhookUrl').value.trim() : '';
    var requireKey = document.getElementById('scriptRequireKey') ? document.getElementById('scriptRequireKey').checked : false;
    var keyMode = document.getElementById('scriptKeyMode') ? document.getElementById('scriptKeyMode').value : 'default';
    var obfuscatorEngine = document.getElementById('scriptObfuscatorEngine') ? document.getElementById('scriptObfuscatorEngine').value : 'default';
    var freeForEveryone = document.getElementById('scriptFreeForEveryone') ? document.getElementById('scriptFreeForEveryone').checked : false;
    var silentMode = document.getElementById('scriptSilentMode') ? document.getElementById('scriptSilentMode').checked : false;
    var heartbeat = document.getElementById('scriptHeartbeat') ? document.getElementById('scriptHeartbeat').checked : true;
    var lightningMode = document.getElementById('scriptLightningMode') ? document.getElementById('scriptLightningMode').checked : false;
    var securityUpdates = document.getElementById('scriptSecurityUpdates') ? document.getElementById('scriptSecurityUpdates').checked : true;
    var keyTime = document.getElementById('scriptKeyTime').value;
    var keyUnit = document.getElementById('scriptKeyUnit').value;
    var code = document.getElementById('scriptCode').value.trim();
    // LURAPH V15 BALANCED: 6 VM layers + bytecode mutation - adaptive to keep storage sane.
    // Small scripts (<5k) get max protection (12 layers + LPH double VM); large scripts (>50k)
    // are capped at 6 layers with bigger stride to stay under plan limits (friend's 40 MB fix).
    var _codeLen = code.length;
    var obfuscationIntensity;
    if (_codeLen < 5000) obfuscationIntensity = 6;
    else if (_codeLen < 20000) obfuscationIntensity = 6;
    else if (_codeLen < 50000) obfuscationIntensity = 5;
    else obfuscationIntensity = 5;
    var obfuscationType = obfuscatorEngine === 'aegis' ? 'aegis' : 'custom';
    var hwidReset = document.getElementById('scriptHWIDReset').checked;
    var gameId = document.getElementById('scriptGameId').value.trim();
    var placeIdOnly = extractPlaceId(gameId) || gameId;
    if (!name) { showNotification('Error', 'Script name is required.', 'error'); return; }
    // The Special Key is ALWAYS required now - for paid scripts it decrypts
    // the payload in executors; for FREE scripts it gates the WEBSITE key
    // page only (executors run free scripts with no key, but the code can
    // only be VIEWED on the website with the key).
    var isKeyless = freeForEveryone;
    if (!specialKey) { showNotification('Error', 'Your Special Key is required. For free scripts it protects the website page - executors still run it with NO key.', 'error', 7000); return; }
    if (!code) { showNotification('Error', 'Please paste your Lua code or upload a file.', 'error'); return; }
    // ---- BIG-SCRIPT GUARD: validate + size feedback BEFORE the heavy work
    // (100k+ line scripts used to freeze the tab with zero feedback)
    var codeLines = code.split('\n').length;
    // LURAPH V15: accurate estimate - 8x for 12 layers, 6x for 6 layers (was 40x ultra bloat)
    var _estFactor = (obfuscationIntensity >= 12) ? 10 : (obfuscationIntensity >= 8 ? 7 : 6);
    var estObf = code.length * _estFactor; // balanced: no more x2 storage shock
    if (window.luaparse) {
        try {
            window.luaparse.parse(code, { luaVersion: '5.1' });
        } catch (e) {
            showNotification('Syntax Error', 'Your script has a syntax error and cannot be obfuscated: ' + String(e.message || e), 'error', 12000);
            return;
        }
    }
    // FRIEND FIX (40 MB limit): warn early, plan-aware, with storage + time context.
    // Threshold is the LOWER of 8 MB or 70% of the plan's fileSize - so a 40 MB friend gets
    // warned at ~28 MB, not at 45 MB after the tab already froze. Confirm shows real MB.
    var _planLim = (currentUser && PLAN_CONFIGS[currentUser.plan]) ? PLAN_CONFIGS[currentUser.plan].fileSize : 10;
    var _warnAt = Math.min(8 * 1024 * 1024, (_planLim * 1024 * 1024 * 0.7));
    if (_planLim === Infinity) _warnAt = 8 * 1024 * 1024;
    if (estObf > _warnAt) {
        var _estMB = (estObf / 1024 / 1024).toFixed(1);
        var _msg = 'This script is large (' + codeLines + ' lines, ~' + _estMB + ' MB obfuscated, ~' + _estFactor + 'x).\n'
            + 'Obfuscation may take 10-30 seconds and will use ~' + _estMB + ' MB of your ' + formatSizeMB(_planLim) + ' storage.\n'
            + 'If it is too big, try splitting the script.\n\nContinue?';
        if (!confirm(_msg)) return;
    }
    var projects = loadProjects();
    var projectIndex = -1;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { projectIndex = i; break; } }
    if (projectIndex === -1) { showNotification('Error', 'Project not found.', 'error'); return; }
    // duplicate name check (within this project)
    var existing = projects[projectIndex].scripts || [];
    for (var si = 0; si < existing.length; si++) {
        if (existing[si].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'A script with this name already exists in this project. Choose a different name.', 'error');
            return;
        }
    }
    if (envLogging && !webhookUrl) {
        showNotification('Warning', 'Environment Logging enabled without webhook URL - logs will only be saved locally on the executor.', 'warning');
    }
    // plan limit pre-checks (accurate factor, no more x2 shock)
    var limitErr = checkPlanLimit('scripts') || checkPlanLimit('storage', 0, code.length * _estFactor);
    if (limitErr) { showNotification('🚫 Limit Reached', limitErr, 'error', 6000); return; }
    // collect active keys for the key gate
    var keyGateKeys = [];
    if (requireKey) {
        var kd = loadKeys();
        var units = { seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800, months: 2592000, years: 31536000 };
        var capSec = 0;
        if (keyTime && keyUnit && keyUnit !== 'unlimited' && units[keyUnit]) {
            capSec = Math.floor(Date.now() / 1000) + parseInt(keyTime) * units[keyUnit];
        }
        for (var ki = 0; ki < kd.keys.length; ki++) {
            var kk = kd.keys[ki];
            if (kk.used) continue;
            if (kk.banned) continue;
            if (kk.expires && kk.expires < Date.now()) continue;
            var expMs = kk.expires || null;
            if (capSec > 0) {
                var capped = Math.min(expMs ? Math.floor(expMs / 1000) : capSec, capSec);
                expMs = capped * 1000;
            }
            keyGateKeys.push({ key: kk.key, expires: expMs });
        }
        if (keyGateKeys.length === 0) {
            showNotification('Warning', 'Require Key is ON but you have no active keys! Generate keys in the Users Keys tab first - the script will reject everyone.', 'warning', 6000);
        }
    }
    var obfOptions = {
        intensity: obfuscationIntensity,
        ultra: true,
        antiTamper: antiTamper,
        vmPass: vmPass,
        antiSkid: antiSkid,
        hwidLock: true,
        envLogging: envLogging,
        webhookUrl: webhookUrl,
        keyGate: requireKey ? { keys: keyGateKeys, mode: keyMode } : null,
        statsEndpoint: SH_STATS_ENDPOINT || null,
        silentMode: silentMode,
        scriptName: name,
        scriptId: 'script_' + Date.now(),
        owner: currentUser ? currentUser.username : 'unknown',
    // WITHOUT THIS, options.keyless is undefined inside obfuscateScriptCode,
    // shServerKeyOpts treats undefined as falsy, and a FREE script ships
    // with the /sh/k fetch baked in - which then fails at runtime with
    // "Key response too short" and the script silently does nothing.
    keyless: isKeyless,
    };
    // async: obfuscation of huge scripts takes a while - show progress on
    // the button for BOTH engines (the tab used to look frozen on 100k+
    // line scripts)
    var btnEl = document.querySelector('.modal-overlay[style*="z-index: 2000"] .btn-primary');
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = obfuscatorEngine === 'aegis' ? '⚔️ Obfuscating with Aegis...' : '💎 Obfuscating ' + codeLines + ' lines...';
        // let the browser paint the button state before the heavy sync work
        setTimeout(function() { proceedCreate(); }, 30);
    } else {
        proceedCreate();
    }
    function proceedCreate() {
    obfuscateScriptCode(code, obfuscatorEngine, obfOptions).then(function(result) {
        // result: plain string (legacy/aegis) or { code, splitKey, wantId }
        var obfuscatedCode = (result && typeof result === 'object') ? result.code : result;
        // exact storage check with the real obfuscated size
        var exactErr = checkPlanLimit('storage', 0, code.length + obfuscatedCode.length);
        if (exactErr) {
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✅ Create Script'; }
            showNotification('🚫 Limit Reached', exactErr, 'error', 6000);
            return;
        }
        var loaderKey = 'loader_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        var script = {
            id: 'script_' + Date.now(),
            name: name,
            description: description,
            antiTamper: antiTamper,
            vmPass: vmPass,
            antiSkid: antiSkid,
        hwidLock: true,
            envLogging: envLogging,
            webhookUrl: webhookUrl,
            requireKey: requireKey,
            keyMode: requireKey ? keyMode : null,
            serverAuth: !!(requireKey && obfuscatorEngine !== 'aegis' && obfOptions.keyGate),
            obfuscatorEngine: obfuscatorEngine,
            freeForEveryone: freeForEveryone,
            silentMode: silentMode,
            heartbeat: heartbeat,
            lightningMode: lightningMode,
            securityUpdates: securityUpdates,
            keyTime: keyTime || 'unlimited',
            keyUnit: keyUnit || 'unlimited',
            code: obfuscatedCode,
            originalCode: code,
            obfuscationType: obfuscationType,
            obfuscationintensity: obfuscationIntensity,
        ultra: true,
            specialKey: specialKey,
            keyless: isKeyless,
            // server-key-split: the file ships WITHOUT the final layer key
            // (worker holds it; runtime fetch is executor-only + time-locked)
            serverKeySplit: !!(result && typeof result === 'object' && result.splitKey),
            splitKeyData: (result && typeof result === 'object' && result.splitKey) ? result.splitKey : null,
            version: 1,
            hwidReset: hwidReset,
            gameId: placeIdOnly,
            visibility: 'anyone',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            loaderId: 'ScripterHubOfficial_' + Math.random().toString(36).substring(2, 15),
            loaderKey: loaderKey
        };
        if (!projects[projectIndex].scripts) { projects[projectIndex].scripts = []; }
        projects[projectIndex].scripts.push(script);
        saveProjects(projects);
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        recordObfuscation();
        refreshStatsUI();
        showNotification('Success', 'Script "' + name + '" created with ' + (obfuscatorEngine === 'aegis' ? '⚔️ Aegis Obfuscator' : '💎 Default Obfuscator') + '!', 'success');
        // also push to the hidden loader host (loadstring system) — silent, non-blocking
        shUploadLoader(name, currentUser ? currentUser.username : 'unknown', result, code, specialKey, '', isKeyless, requireKey).then(function(d) {
            if (d.ok) {
                try {
                    var projects = loadProjects();
                    outer: for (var pi = 0; pi < projects.length; pi++) {
                        if (projects[pi].id === projectId && projects[pi].scripts) {
                            for (var sj = 0; sj < projects[pi].scripts.length; sj++) {
                                if (projects[pi].scripts[sj].id === script.id) {
                                    projects[pi].scripts[sj].loaderUrl = d.loadstring;
                                    projects[pi].scripts[sj].loaderId = d.id;
                                    break outer;
                                }
                            }
                        }
                    }
                    saveProjects(projects);
                    showNotification('Loadstring Ready', (isKeyless ? 'Keyless loadstring generated for "' + name + '" - anyone can execute it, NO key needed.' : 'Loader link generated for "' + name + '" - see the script Settings modal.'), 'success', 6000);
                } catch (e) {}
            } else {
                var failMsg = d.error || 'unknown';
                // translate worker size errors into the plan-limit UX
                if (/too large|413/i.test(failMsg)) {
                    failMsg = 'Script too large for the cloud host (max ~50MB obfuscated - Cloudflare KV/request caps). Remove some code or split the script into parts.';
                }
                showNotification('Loadstring Warning', 'Hidden host upload failed: ' + failMsg + ' (deploy the worker + KV first)', 'warning', 9000);
            }
        });
        renderProjects();
    }).catch(function(e) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '✅ Create Script'; }
        showNotification('Obfuscation Failed', e.message, 'error', 9000);
    });
    }
}

// ============ AEGIS (via the worker proxy) ============
// Resolves with the obfuscated Luau source, or rejects with a message worth
// reading.
//
// Large sources come back QUEUED rather than finished: Aegis runs anything over
// 150 KB as a background job, and the job takes 1-2 minutes. The worker waits
// about 30 seconds for it and hands the jobId back if it is not done, so this
// loops rather than reporting a failure the user cannot act on. Each round trip
// is one worker request, which also means a queued script survives a page reload
// in the sense that the loop keeps running until the server answers.
function shAegis(source, name) {
    var token = shOwnerToken ? shOwnerToken() : '';
    var attempt = 0;
    function send(job) {
        return shApi('/sh/aegis', {
            token: token,
            source: source,
            name: name,
            job: job || ''
        });
    }
    function step(job) {
        return send(job).then(function(d) {
            if (!d) throw new Error('Aegis: the worker did not answer');
            if (d.ok && d.code) return d.code;
            if (d.ok && d.queued) {
                attempt++;
                if (attempt > 40) throw new Error('Aegis is still working on this source after 40 checks. It is a large script - try again in a minute, or use the Default engine.');
                return new Promise(function(res) { setTimeout(res, 3000); }).then(function() { return step(d.job); });
            }
            throw new Error('Aegis: ' + ((d && d.error) || 'no reason given'));
        });
    }
    return step('');
}

// ============ OBFUSCATE (Default engine or Aegis API) ============
// Resolves with either a plain string (legacy) or an object
// { code, splitKey } when the server-key-split mode is used.
// splitKey = the padded final-layer key the worker must hold; the file
// itself ships without it, so static peelers always stop one layer short.
// Shows/hides the "Bytecode VM is OFF" warning. It is a function rather than an
// inline handler body so both modals can call the same one.
function shBytecodeVMNote() {
    var info = document.getElementById("scriptBytecodeVMInfo");
    var box = document.getElementById("scriptBytecodeVM") || document.getElementById("editScriptBytecodeVM");
    if (info && box) info.style.display = box.checked ? "none" : "block";
}

function obfuscateScriptCode(code, engine, options) {
    return new Promise(function(resolve, reject) {
        try {
            if (engine === 'aegis') {
                // Aegis obfuscates the wrapped payload (key gate + protections + source)
                var payload = buildWrappedPayload(code, options, null);
                // Through OUR worker, not straight to Aegis.
                //
                // This used to fetch api.aegis-obfuscater.cc.cd from the browser
                // with only a Content-Type header. Aegis is API v4 and every
                // programmatic call needs an admin-issued X-Api-Key, so the option
                // returned 401 every time - "Aegis fails". Putting the key in the
                // bundle would publish it to every visitor, and the key carries a
                // 20-minute-per-day processing budget.
                //
                // The worker holds the key, spends it only for owner requests, and
                // also handles the 202 queued-job path that the old code read as if
                // it were a file - which is why sources over 150 KB used to produce
                // a "script" that was really a JSON job object.
                shAegis(payload, options.scriptName || 'script').then(function(txt) {
                    resolve('-- Obfuscated with Aegis Obfuscator via ScripterHub | ' + new Date().toISOString() + ' | DO NOT EDIT\n' + txt);
                }).catch(function(err) { reject(err); });
            } else {
                // Default engine: SPLIT-KEY mode - the last layer key never
                // ships inside the file. The worker serves it at runtime
                // (executor-only, time-locked). Loader id is generated HERE
                // so the baked-in key URL matches the id /sh/upload will use.
                var dbgInfo = {};
                var wantId = shNewScriptId();
                // A KEYLESS SCRIPT GETS NO SPLIT KEY.
                //
                // A split key is the protection for a PAID build: the last layer never
                // ships in the file and the worker hands it over at runtime. A keyless
                // script has no license to gate, so there was nothing for it to protect -
                // it was pure friction, and actively broken:
                //
                //   * the delivery is SHL, and the keyless branch of the loader is
                //     body:sub(5) - it never expects a key line, which is precisely what
                //     the envelope bug (fixed two commits ago) was violating;
                //   * the payload fallback fetch in custom-obfuscator.js is a plain GET
                //     to /sh/k with no session, and /sh/k requires a live session. It
                //     gets a refusal, the reply holds fewer than three numbers, and the
                //     payload bails at the `#PT < 3` check.
                //
                // The user saw exactly that, on a script whose gate and whose Lua were
                // both provably fine:
                //
                //     [ScripterHub] Key response too short
                //     VERDICT: the delivered source COMPILES on this executor
                //
                // The dashboard already promises "anyone can execute it, NO key needed"
                // for a keyless script. This makes the code agree with that promise.
                //
                // The obfuscator emits no key-fetch code at all without serverKey, so the
                // artifact is self-contained: still fully obfuscated, still only ever
                // reachable through a minted single-use session.
                //
                // Server-side behaviour is deliberately UNCHANGED. authtest A8 uploads a
                // keyless script WITH a split key and asserts /sh/k still gates it. This
                // is only about what the client generates.
                var withServerKey = Object.assign({}, options, shServerKeyOpts(options.keyless, wantId));
                var out = applyCustomObfuscator(code, withServerKey, dbgInfo);
                if (dbgInfo.splitKey && dbgInfo.splitKey.paddedKey) {
                    resolve({ code: out, splitKey: dbgInfo.splitKey, wantId: wantId });
                } else {
                    resolve(out);
                }
            }
        } catch (e) { reject(e); }
    });
}

// ============ OPEN SCRIPT RAW (removed) ============
// The Raw button was removed from script cards (it just opened the hidden
// loadstring creator page, which was confusing). Loadstrings live in the
// script View/Edit modal and the hidden raw page directly.
function openScriptRaw(loaderId) { /* removed */ }

// ============ GENERATE LOADSTRING (on demand for older scripts) ============
function generateLoadstring(projectId, scriptId) {
    var projects = loadProjects();
    var script = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId && projects[i].scripts) {
            for (var j = 0; j < projects[i].scripts.length; j++) {
                if (projects[i].scripts[j].id === scriptId) { script = projects[i].scripts[j]; break; }
            }
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    // code may have been trimmed by the localStorage-quota fallback. The
    // loadstring only needs the CLOUD copy: if we still have the original
    // (unobfuscated) code, re-obfuscate on the fly; if we have neither,
    // tell the user instead of a vague "no code" error.
    if (!script.code && !script.originalCode) {
        showNotification('Error', 'This script\'s code was trimmed from local storage (it was too big). Re-create the script or edit it and re-paste the code to generate a loadstring.', 'error', 9000);
        return;
    }
    if (!script.code && script.originalCode) {
        showNotification('Re-Obfuscating', 'The local obfuscated copy was trimmed (storage limits). Re-obfuscating from the saved source...', 'info', 6000);
        obfuscateScriptCode(script.originalCode, script.obfuscatorEngine === 'aegis' ? 'aegis' : 'default', {
            intensity: script.obfuscationIntensity || 10,
            antiTamper: script.antiTamper !== false,
            // read from the stored record, NOT the create-modal local: this function
            // re-obfuscates a script that was saved earlier, and there is no modal
            // open. `vmPass: vmPass` here is a ReferenceError, because the only
            // `var vmPass` declarations live in confirmCreateScript and
            // confirmEditScript.
            vmPass: script.vmPass !== false,
            antiSkid: script.antiSkid !== false,
            envLogging: !!script.envLogging,
            webhookUrl: script.webhookUrl || '',
            keyGate: null,
            statsEndpoint: SH_STATS_ENDPOINT || null,
            scriptName: script.name,
            scriptId: script.id,
            owner: currentUser ? currentUser.username : 'unknown',
            keyless: !!script.keyless || !!script.freeForEveryone
        }).then(function(result) {
            script.code = (result && typeof result === 'object') ? result.code : result;
            if (result && typeof result === 'object' && result.splitKey) script.splitKeyData = result.splitKey;
            proceedWithGenerate(projectId, script);
        }).catch(function(e) {
            showNotification('Error', 'Re-obfuscation failed: ' + e.message, 'error', 7000);
        });
        return;
    }
    proceedWithGenerate(projectId, script);
    function proceedWithGenerate(projectId, script) {
    var isKeyless = !!script.keyless || !!script.freeForEveryone;
    if (!script.specialKey) {
        showNotification('Special Key Needed', 'This script has no Special Key yet. Edit the script and set one - it encrypts the script (paid) or gates the website page (free).', 'warning', 7000);
        return;
    }
    showNotification('Uploading...', 'Generating a loadstring for "' + script.name + '"...', 'info', 4000);
    // server-key-split scripts: pass the stored split-key data. The ID
    // must be the one the OBFUSCATED FILE references - the baked-in
    // key-fetch URL points at the id the ORIGINAL obfuscation used.
    // Re-uploading under a fresh id would serve a key the file never
    // asks for -> undecryptable script (the old bug: "loadstring
    // generated but script never runs").
    var uploadArg;
    if (script.splitKeyData) {
        var bakedId = script.loaderId && /^ScripterHub[0-9]{6,16}$/.test(script.loaderId) ? script.loaderId : '';
        if (!bakedId) {
            // legacy record without the matching loader id: the split-key
            // URL in the file is unknown -> the worker key can never be
            // matched. Re-obfuscate from source instead of shipping a
            // guaranteed-dead loadstring.
            showNotification('Re-Obfuscating', 'This script was created before a loadstring fix. Re-obfuscating from the saved source to generate a working loadstring...', 'info', 8000);
            obfuscateScriptCode(script.originalCode || script.code, script.obfuscatorEngine === 'aegis' ? 'aegis' : 'default', {
                intensity: script.obfuscationIntensity || 10,
                antiTamper: script.antiTamper !== false,
                // from the stored record - see the note on the sibling call above
                vmPass: script.vmPass !== false,
                antiSkid: script.antiSkid !== false,
                envLogging: !!script.envLogging,
                webhookUrl: script.webhookUrl || '',
                keyGate: null,
                statsEndpoint: SH_STATS_ENDPOINT || null,
                scriptName: script.name,
                scriptId: script.id,
                owner: currentUser ? currentUser.username : 'unknown',
                keyless: !!script.keyless || !!script.freeForEveryone
            }).then(function(fresh) {
                var freshCode = (fresh && typeof fresh === 'object') ? fresh.code : fresh;
                var projectsX = loadProjects();
                outerX: for (var px = 0; px < projectsX.length; px++) {
                    if (projectsX[px].id === projectId && projectsX[px].scripts) {
                        for (var sx = 0; sx < projectsX[px].scripts.length; sx++) {
                            if (projectsX[px].scripts[sx].id === scriptId) {
                                projectsX[px].scripts[sx].code = freshCode;
                                projectsX[px].scripts[sx].splitKeyData = (fresh && typeof fresh === 'object' && fresh.splitKey) ? fresh.splitKey : null;
                                break outerX;
                            }
                        }
                    }
                }
                saveProjects(projectsX);
                // LURAPH FIX: carry over specialKey + identity fields so the synthetic
                // re-obfuscation does NOT trigger a spurious "Special Key Needed" even
                // though the original script HAS a key (the old bug made loadstring stall).
                var _orig = script;
                var _synth = {
                    id: _orig.id, name: _orig.name, code: freshCode,
                    originalCode: _orig.originalCode || _orig.code,
                    specialKey: _orig.specialKey, keyless: !!_orig.keyless || !!_orig.freeForEveryone,
                    requireKey: !!_orig.requireKey, splitKeyData: (fresh && typeof fresh === 'object' && fresh.splitKey) ? fresh.splitKey : null,
                    loaderId: (fresh && typeof fresh === 'object' && fresh.wantId) ? fresh.wantId : _orig.loaderId,
                    obfuscatorEngine: _orig.obfuscatorEngine, obfuscationIntensity: _orig.obfuscationIntensity,
                    antiTamper: _orig.antiTamper, antiSkid: _orig.antiSkid, envLogging: !!_orig.envLogging, webhookUrl: _orig.webhookUrl || ''
                };
                // also handle the object-form that shUploadLoader expects: {code, splitKey, wantId}
                _synth.splitKey = _synth.splitKeyData; _synth.wantId = _synth.loaderId;
                proceedWithGenerate(projectId, _synth);
            }).catch(function(e) {
                showNotification('Error', 'Re-obfuscation failed: ' + e.message, 'error', 7000);
            });
            return;
        }
        uploadArg = { code: script.code, splitKey: script.splitKeyData, wantId: bakedId };
    } else {
        uploadArg = script.code;
    }
    shUploadLoader(script.name, currentUser ? currentUser.username : 'unknown', uploadArg, script.originalCode || '', script.specialKey, '', isKeyless, !!script.requireKey).then(function(d) {
        if (!d.ok) {
            showNotification('Loadstring Failed', d.error || 'Upload failed. Is the worker + KV deployed?', 'error', 7000);
            return;
        }
        // save onto the script record
        var projects2 = loadProjects();
        outer: for (var pi = 0; pi < projects2.length; pi++) {
            if (projects2[pi].id === projectId && projects2[pi].scripts) {
                for (var sj = 0; sj < projects2[pi].scripts.length; sj++) {
                    if (projects2[pi].scripts[sj].id === scriptId) {
                        projects2[pi].scripts[sj].loaderUrl = d.loadstring;
                        projects2[pi].scripts[sj].loaderId = d.id;
                        break outer;
                    }
                }
            }
        }
        saveProjects(projects2);
        showNotification('Loadstring Ready', 'Copy it from the script Settings modal.', 'success', 5000);
        // re-open the settings modal with the fresh loadstring
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        openScriptSettings(projectId, scriptId);
    });
    }
}

// ============ VIEW SCRIPT (removed - the View button was deleted; the loadstring + Special Key now live in the Script Settings modal) ============
// ============ EDIT PROJECT ============
function editProject(projectId) {
    var projects = loadProjects();
    var project = null;
    var projectIndex = -1;
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { project = projects[i]; projectIndex = i; break; } }
    if (!project) { showNotification('Error', 'Project not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 500px; padding: 32px;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">✏️ Edit Project</h2>
            <div class="form-group"><label>Project Name <span class="required">*</span></label><input type="text" id="editProjectName" value="${project.name}" required></div>
            <div class="form-group"><label>Project Description <span style="color:#555577;">(optional)</span></label><textarea id="editProjectDescription">${project.description || ''}</textarea></div>
            <div class="form-group"><label>Visibility</label><select id="editProjectVisibility"><option value="anyone" ${project.visibility === 'anyone' ? 'selected' : ''}>Anyone</option><option value="friends" ${project.visibility === 'friends' ? 'selected' : ''}>Friends (Soon...)</option><option value="private" ${project.visibility === 'private' ? 'selected' : ''}>Private</option></select></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editProjectBlockIncognito" ${project.blockIncognito ? 'checked' : ''}> Block Incognito Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editProjectBlockVPN" ${project.blockVPN ? 'checked' : ''}> Block VPN</label>
            </div>
            <div class="form-group"><label>Type Of Project</label><select id="editProjectType"><option value="free" ${project.type === 'free' ? 'selected' : ''}>Free</option><option value="key" ${project.type === 'key' ? 'selected' : ''}>Key Required</option><option value="paid" ${project.type === 'paid' ? 'selected' : ''}>Paid</option></select></div>
            <button onclick="confirmEditProject('${projectId}')" class="btn btn-primary" style="width:100%; margin-top:8px; padding:12px;">💾 Update Project</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmEditProject(projectId) {
    var name = document.getElementById('editProjectName').value.trim();
    var description = document.getElementById('editProjectDescription').value.trim();
    var visibility = document.getElementById('editProjectVisibility').value;
    var blockIncognito = document.getElementById('editProjectBlockIncognito').checked;
    var blockVPN = document.getElementById('editProjectBlockVPN').checked;
    var type = document.getElementById('editProjectType').value;
    if (!name) { showNotification('Error', 'Project name is required.', 'error'); return; }
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id !== projectId && projects[i].name.toLowerCase() === name.toLowerCase()) {
            showNotification('Error', 'Another project with this name already exists.', 'error');
            return;
        }
        if (projects[i].id === projectId) {
            projects[i].name = name;
            projects[i].description = description;
            projects[i].visibility = visibility;
            projects[i].blockIncognito = blockIncognito;
            projects[i].blockVPN = blockVPN;
            projects[i].type = type;
            break;
        }
    }
    saveProjects(projects);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();
    showNotification('Success', 'Project updated!', 'success');
    renderProjects();
}

// ============ DELETE PROJECT ==========
function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project and all its scripts?')) return;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) { if (projects[i].id === projectId) { projects.splice(i, 1); break; } }
    saveProjects(projects);
    refreshStatsUI();
    showNotification('Deleted', 'Project deleted.', 'warning');
    renderProjects();
}

// ============ EDIT SCRIPT ==========
function editScript(projectId, scriptId) {
    var projects = loadProjects();
    var project = null;
    var script = null;
    var projectIndex = -1;
    var scriptIndex = -1;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            project = projects[i];
            projectIndex = i;
            if (project.scripts) {
                for (var j = 0; j < project.scripts.length; j++) {
                    if (project.scripts[j].id === scriptId) {
                        script = project.scripts[j];
                        scriptIndex = j;
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    editingScript = { projectId: projectId, scriptId: scriptId, projectIndex: projectIndex, scriptIndex: scriptIndex };
    currentProject = project;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var keyTime = script.keyTime === 'unlimited' || script.keyUnit === 'unlimited' ? '' : script.keyTime;
    var keyUnit = script.keyUnit === 'unlimited' || script.keyUnit === 'unlimited' ? 'unlimited' : (script.keyUnit || 'hours');
    var isKeyProject = project && project.type === 'key';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 600px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">✏️ Edit Script</h2>
            <p class="sub">Update script details</p>
            <div class="form-group"><label>Script Name <span class="required">*</span></label><input type="text" id="editScriptName" value="${script.name}" required></div>
            <div class="form-group"><label>Your Special Key</label><input type="text" id="editScriptSpecialKey" value="${(script.specialKey || '').replace(/"/g, '&quot;')}" placeholder="Any length — required (protects the website page)">
                <div style="margin-top:4px; font-size:11px; color:#8888aa;">🔐 The script is re-encrypted with this key in your browser on save. The loadstring does NOT contain it. <strong style="color:#66ff66;">Free For Everyone:</strong> anyone can execute in-game with NO key - the key only gates the website key page. <strong style="color:#ff9999;">Paid:</strong> users set the key BEFORE executing via <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> (no in-game popup). It is NEVER sent to the server.</div>
            </div>
            <div class="form-group"><label>Script Description <span style="color:#555577;">(optional)</span></label><textarea id="editScriptDescription">${script.description || ''}</textarea></div>
            <div class="form-group" style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptAntiTamper" ${script.antiTamper ? 'checked' : ''}> 🛡️ Anti Tampering</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptAntiSkid" ${script.antiSkid ? 'checked' : ''}> 🔒 Anti Skidding</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptEnvLogging" ${script.envLogging ? 'checked' : ''}> 📡 Environment Logging</label>
                <label style="margin:0; cursor:pointer;" title="Compiles to the custom bytecode VM - every protection layer runs inside it, and it is the strongest obfuscation. Untick only to confirm the VM is what is breaking a script: the script will run, but it ships un-obfuscated."><input type="checkbox" id="editScriptBytecodeVM" ${script.vmPass === false ? '' : 'checked'} onchange="shBytecodeVMNote()"> 🧠 Bytecode VM</label>
                <label style="margin:0; cursor:pointer;${isKeyProject ? '' : ' display:none;'}"><input type="checkbox" id="editScriptRequireKey" ${script.requireKey ? 'checked' : ''}> 🔑 Require Key</label>
            </div>
            <div class="form-group" id="editScriptKeyGateInfo" style="display:${script.requireKey && isKeyProject ? 'block' : 'none'};">
                <div style="padding:10px 14px; background:rgba(108,59,255,0.1); border:1px solid rgba(108,59,255,0.25); border-radius:10px; font-size:12px; color:#8888aa;">
                    🔑 <strong style="color:#8a6bff;">Key System:</strong> All active keys from the Keys tab get re-embedded (hashed) when you save.
                </div>
            </div>
            <div class="form-group" id="editScriptWebhookGroup" style="display:${script.envLogging ? 'block' : 'none'};">
                <label>📡 Logging Webhook URL <span style="color:#555577;">(Discord webhook or API endpoint)</span></label>
                <input type="text" id="editScriptWebhookUrl" value="${script.webhookUrl || ''}" placeholder="https://discord.com/api/webhooks/...">
            </div>
            <div class="form-group">
                <label>Max Timer Of Keys</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" id="editScriptKeyTime" placeholder="Amount" value="${keyTime}" style="flex:1; min-width:0;">
                    <select id="editScriptKeyUnit" style="flex:1; min-width:0;">
                        <option value="seconds" ${keyUnit === 'seconds' ? 'selected' : ''}>Seconds</option>
                        <option value="minutes" ${keyUnit === 'minutes' ? 'selected' : ''}>Minutes</option>
                        <option value="hours" ${keyUnit === 'hours' ? 'selected' : ''}>Hours</option>
                        <option value="days" ${keyUnit === 'days' ? 'selected' : ''}>Days</option>
                        <option value="weeks" ${keyUnit === 'weeks' ? 'selected' : ''}>Weeks</option>
                        <option value="months" ${keyUnit === 'months' ? 'selected' : ''}>Months</option>
                        <option value="years" ${keyUnit === 'years' ? 'selected' : ''}>Years</option>
                        <option value="unlimited" ${keyUnit === 'unlimited' ? 'selected' : ''}>Unlimited</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>💎 Choose Obfuscator</label>
                <select id="editScriptObfuscatorEngine" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" ${script.obfuscatorEngine !== 'aegis' ? 'selected' : ''}>Default Obfuscator (Recommended)</option>
                    <option value="aegis" ${script.obfuscatorEngine === 'aegis' ? 'selected' : ''}>Aegis Obfuscator</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">⚔️ Aegis sends your source to the external Aegis API to obfuscate (max 6 requests/min).</div>
            </div>
            <div class="form-group" style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptFreeForEveryone" ${script.freeForEveryone ? 'checked' : ''}> 🌐 Free For Everyone</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptSilentMode" ${script.silentMode ? 'checked' : ''}> 🔇 Silent Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptHeartbeat" ${script.heartbeat !== false ? 'checked' : ''}> 💓 Heartbeat</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptLightningMode" ${script.lightningMode ? 'checked' : ''}> ⚡ Lightning Mode</label>
                <label style="margin:0; cursor:pointer;"><input type="checkbox" id="editScriptSecurityUpdates" ${script.securityUpdates !== false ? 'checked' : ''}> 🔄 Enable Security Updates</label>
            </div>
            ${isKeyProject ? `
            <div class="form-group">
                <label>🔑 Choose How Key Works</label>
                <select id="editScriptKeyMode" style="width:100%; padding:12px 16px; background:#0a0a15; border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#fff; font-size:14px; cursor:pointer;">
                    <option value="default" ${script.keyMode !== 'custom' ? 'selected' : ''}>Default (Roblox Core Notification)</option>
                    <option value="custom" ${script.keyMode === 'custom' ? 'selected' : ''}>Custom (You Make It)</option>
                </select>
                <div style="margin-top:6px; font-size:12px; color:#8888aa;">🛠️ Custom = build your own key GUI with ScripterHubKeyValid / ScripterHubKeyStatus APIs (see Users Keys tab).</div>
            </div>` : ''}
            <div class="form-group"><label>Paste .txt/.lua Code</label><textarea id="editScriptCode" style="min-height:150px; font-family:monospace; font-size:13px;">${script.originalCode || script.code || ''}</textarea></div>
            <div class="form-group"><label style="cursor:pointer;"><input type="checkbox" id="editScriptHWIDReset" ${script.hwidReset ? 'checked' : ''}> 🔄 HWID Reset</label></div>
            <div class="form-group">
                <label>Game Link/ID <span style="color:#555577;">(optional)</span></label>
                <input type="text" id="editScriptGameId" value="${script.gameId || ''}" placeholder="e.g. 1234567890">
                <div id="gameThumbWrap" style="display:none; margin-top:10px; align-items:center; gap:14px;">
                    <img id="gameThumbImg" style="width:96px; height:96px; border-radius:14px; object-fit:cover; border:2px solid rgba(255,255,255,0.1);" alt="Game icon">
                    <div>
                        <div id="gameThumbName" style="color:#fff; font-weight:600; font-size:14px;"></div>
                        <div id="gameThumbMeta" style="color:#8888aa; font-size:12px; margin-top:4px;"></div>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:12px; margin-top:12px;">
                <button onclick="confirmEditScript('${projectId}','${scriptId}')" class="btn btn-primary" style="flex:1; padding:12px; font-size:15px;">💾 Update Script</button>
                <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="flex:1; padding:12px; font-size:15px;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    var editEnvLogToggle = document.getElementById('editScriptEnvLogging');
    var editWebhookGroup = document.getElementById('editScriptWebhookGroup');
    if (editEnvLogToggle && editWebhookGroup) {
        editEnvLogToggle.addEventListener('change', function() {
            editWebhookGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
    var editRequireKeyToggle = document.getElementById('editScriptRequireKey');
    var editKeyGateInfo = document.getElementById('editScriptKeyGateInfo');
    if (editRequireKeyToggle && editKeyGateInfo) {
        editRequireKeyToggle.addEventListener('change', function() {
            editKeyGateInfo.style.display = this.checked ? 'block' : 'none';
        });
    }
    var editGameIdInput = document.getElementById('editScriptGameId');
    if (editGameIdInput) {
        if (editGameIdInput.value.trim()) fetchGamePreview(editGameIdInput.value.trim());
        editGameIdInput.addEventListener('input', function() { fetchGamePreview(this.value.trim()); });
        editGameIdInput.addEventListener('change', function() { fetchGamePreview(this.value.trim()); });
    }
}

// ============ CONFIRM EDIT SCRIPT ============
function confirmEditScript(projectId, scriptId) {
    var name = document.getElementById('editScriptName').value.trim();
    var specialKey = document.getElementById('editScriptSpecialKey') ? document.getElementById('editScriptSpecialKey').value : '';
    var description = document.getElementById('editScriptDescription').value.trim();
    var antiTamper = document.getElementById('editScriptAntiTamper').checked;
    var antiSkid = document.getElementById('editScriptAntiSkid').checked;
    var envLogging = document.getElementById('editScriptEnvLogging') ? document.getElementById('editScriptEnvLogging').checked : false;
    var vmPass = document.getElementById('editScriptBytecodeVM') ? document.getElementById('editScriptBytecodeVM').checked : true;
    var webhookUrl = document.getElementById('editScriptWebhookUrl') ? document.getElementById('editScriptWebhookUrl').value.trim() : '';
    var requireKey = document.getElementById('editScriptRequireKey') ? document.getElementById('editScriptRequireKey').checked : false;
    var keyMode = document.getElementById('editScriptKeyMode') ? document.getElementById('editScriptKeyMode').value : 'default';
    var obfuscatorEngine = document.getElementById('editScriptObfuscatorEngine') ? document.getElementById('editScriptObfuscatorEngine').value : 'default';
    var freeForEveryone = document.getElementById('editScriptFreeForEveryone') ? document.getElementById('editScriptFreeForEveryone').checked : false;
    var silentMode = document.getElementById('editScriptSilentMode') ? document.getElementById('editScriptSilentMode').checked : false;
    var heartbeat = document.getElementById('editScriptHeartbeat') ? document.getElementById('editScriptHeartbeat').checked : true;
    var lightningMode = document.getElementById('editScriptLightningMode') ? document.getElementById('editScriptLightningMode').checked : false;
    var securityUpdates = document.getElementById('editScriptSecurityUpdates') ? document.getElementById('editScriptSecurityUpdates').checked : true;
    var keyTime = document.getElementById('editScriptKeyTime').value;
    var keyUnit = document.getElementById('editScriptKeyUnit').value;
    var code = document.getElementById('editScriptCode').value.trim();
    // LURAPH V15 BALANCED: same adaptive as create (was fixed 22 -> x2 bloat)
    var _eLen = code.length;
    var obfuscationIntensity;
    if (_eLen < 5000) obfuscationIntensity = 6;
    else if (_eLen < 20000) obfuscationIntensity = 6;
    else if (_eLen < 50000) obfuscationIntensity = 5;
    else obfuscationIntensity = 5;
    var obfuscationType = obfuscatorEngine === 'aegis' ? 'aegis' : 'custom';
    var hwidReset = document.getElementById('editScriptHWIDReset').checked;
    var gameId = document.getElementById('editScriptGameId').value.trim();
    var placeIdOnly = extractPlaceId(gameId) || gameId;
    if (!name) { showNotification('Error', 'Script name is required.', 'error'); return; }
    // The Special Key is ALWAYS required (paid: decrypts in executors;
    // free: gates the website page only - executors run it keyless)
    var isKeyless = freeForEveryone;
    if (!specialKey) { showNotification('Error', 'Your Special Key is required. For free scripts it protects the website page - executors still run it with NO key.', 'error', 7000); return; }
    if (!code) { showNotification('Error', 'Please paste your Lua code.', 'error'); return; }
    // syntax-check BEFORE the heavy re-obfuscation work
    if (window.luaparse) {
        try {
            window.luaparse.parse(code, { luaVersion: '5.1' });
        } catch (e) {
            showNotification('Syntax Error', 'Your script has a syntax error and cannot be obfuscated: ' + String(e.message || e), 'error', 12000);
            return;
        }
    }
    var projects = loadProjects();
    // duplicate name check (within project, excluding this script)
    for (var pi = 0; pi < projects.length; pi++) {
        if (projects[pi].id === projectId && projects[pi].scripts) {
            for (var pj = 0; pj < projects[pi].scripts.length; pj++) {
                if (projects[pi].scripts[pj].id !== scriptId && projects[pi].scripts[pj].name.toLowerCase() === name.toLowerCase()) {
                    showNotification('Error', 'Another script with this name already exists in this project.', 'error');
                    return;
                }
            }
        }
    }
    // find current script (for version increment)
    var prevScript = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId && projects[i].scripts) {
            for (var j = 0; j < projects[i].scripts.length; j++) {
                if (projects[i].scripts[j].id === scriptId) { prevScript = projects[i].scripts[j]; break; }
            }
        }
    }
    var keyGateKeys = [];
    if (requireKey) {
        var kd = loadKeys();
        for (var ki = 0; ki < kd.keys.length; ki++) {
            var kk = kd.keys[ki];
            if (kk.used) continue;
            if (kk.banned) continue;
            if (kk.expires && kk.expires < Date.now()) continue;
            keyGateKeys.push({ key: kk.key, expires: kk.expires || null });
        }
        if (keyGateKeys.length === 0) {
            showNotification('Warning', 'Require Key is ON but you have no active keys! Generate keys in the Users Keys tab first.', 'warning', 6000);
        }
    }
    var obfOptions = {
        intensity: obfuscationIntensity,
        ultra: true,
        antiTamper: antiTamper,
        vmPass: vmPass,
        antiSkid: antiSkid,
        hwidLock: true,
        envLogging: envLogging,
        webhookUrl: webhookUrl,
        keyGate: requireKey ? { keys: keyGateKeys, mode: keyMode } : null,
        statsEndpoint: SH_STATS_ENDPOINT || null,
        silentMode: silentMode,
        scriptName: name,
        scriptId: scriptId,
        owner: currentUser ? currentUser.username : 'unknown',
    // WITHOUT THIS, options.keyless is undefined inside obfuscateScriptCode,
    // shServerKeyOpts treats undefined as falsy, and a FREE script ships
    // with the /sh/k fetch baked in - which then fails at runtime with
    // "Key response too short" and the script silently does nothing.
    keyless: isKeyless,
    };
    var btnEl = document.querySelector('.modal-overlay[style*="z-index: 2000"] .btn-primary');
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = obfuscatorEngine === 'aegis' ? '⚔️ Obfuscating with Aegis...' : '💎 Obfuscating...';
    }
    obfuscateScriptCode(code, obfuscatorEngine, obfOptions).then(function(result) {
        // result: plain string (legacy/aegis) or { code, splitKey, wantId }
        var obfuscatedCode = (result && typeof result === 'object') ? result.code : result;
        // storage delta check (only if the script grew)
        var oldBytes = ((prevScript && prevScript.code ? prevScript.code.length : 0) + (prevScript && prevScript.originalCode ? prevScript.originalCode.length : 0));
        var newBytes = code.length + obfuscatedCode.length;
        if (newBytes > oldBytes) {
            var storageErr = checkPlanLimit('storage', 0, newBytes - oldBytes);
            if (storageErr) {
                if (btnEl) { btnEl.disabled = false; btnEl.textContent = '💾 Update Script'; }
                showNotification('🚫 Limit Reached', storageErr, 'error', 6000);
                return;
            }
        }
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                if (projects[i].scripts) {
                    for (var j = 0; j < projects[i].scripts.length; j++) {
                        if (projects[i].scripts[j].id === scriptId) {
                            projects[i].scripts[j].name = name;
                            projects[i].scripts[j].description = description;
                            projects[i].scripts[j].antiTamper = antiTamper;
                            projects[i].scripts[j].antiSkid = antiSkid;
                            projects[i].scripts[j].envLogging = envLogging;
                            projects[i].scripts[j].webhookUrl = webhookUrl;
                            projects[i].scripts[j].requireKey = requireKey;
                            projects[i].scripts[j].keyMode = requireKey ? keyMode : null;
                            projects[i].scripts[j].serverAuth = !!(requireKey && obfuscatorEngine !== 'aegis' && obfOptions.keyGate);
                            projects[i].scripts[j].obfuscatorEngine = obfuscatorEngine;
                            projects[i].scripts[j].freeForEveryone = freeForEveryone;
                            projects[i].scripts[j].silentMode = silentMode;
                            projects[i].scripts[j].heartbeat = heartbeat;
                            projects[i].scripts[j].lightningMode = lightningMode;
                            projects[i].scripts[j].securityUpdates = securityUpdates;
                            projects[i].scripts[j].keyTime = keyTime || 'unlimited';
                            projects[i].scripts[j].keyUnit = keyUnit || 'unlimited';
                            projects[i].scripts[j].code = obfuscatedCode;
                            projects[i].scripts[j].originalCode = code;
                            projects[i].scripts[j].obfuscationType = obfuscationType;
                            projects[i].scripts[j].obfuscationIntensity = obfuscationIntensity;
                            projects[i].scripts[j].specialKey = specialKey;
                            projects[i].scripts[j].keyless = isKeyless;
                            projects[i].scripts[j].serverKeySplit = !!(result && typeof result === 'object' && result.splitKey);
                            projects[i].scripts[j].splitKeyData = (result && typeof result === 'object' && result.splitKey) ? result.splitKey : null;
                            projects[i].scripts[j].version = (prevScript && prevScript.version ? prevScript.version : 1) + 1;
                            projects[i].scripts[j].hwidReset = hwidReset;
                            projects[i].scripts[j].gameId = placeIdOnly;
                            projects[i].scripts[j].updatedAt = new Date().toISOString();
                            break;
                        }
                    }
                }
                break;
            }
        }
        saveProjects(projects);
        var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
        if (modal) modal.remove();
        recordObfuscation();
        refreshStatsUI();
        showNotification('Success', 'Script "' + name + '" updated to ' + versionLabel({ version: (prevScript && prevScript.version ? prevScript.version : 1) + 1 }) + ' with ' + (obfuscatorEngine === 'aegis' ? '⚔️ Aegis' : '💎 Default') + ' Obfuscator!', 'success');
        // refresh the hidden-host loader: encrypt with the (new) special key
        // (or upload keyless), kill the old loader link (replaces) so old
        // ids stop working
        var oldLoaderId = prevScript && prevScript.loaderId ? prevScript.loaderId : '';
        shUploadLoader(name, currentUser ? currentUser.username : 'unknown', result, code, specialKey, oldLoaderId, isKeyless, requireKey).then(function(d) {
            if (d.ok) {
                var projects2 = loadProjects();
                outer2: for (var pi2 = 0; pi2 < projects2.length; pi2++) {
                    if (projects2[pi2].id === projectId && projects2[pi2].scripts) {
                        for (var sj2 = 0; sj2 < projects2[pi2].scripts.length; sj2++) {
                            if (projects2[pi2].scripts[sj2].id === scriptId) {
                                projects2[pi2].scripts[sj2].loaderUrl = d.loadstring;
                                projects2[pi2].scripts[sj2].loaderId = d.id;
                                break outer2;
                            }
                        }
                    }
                }
                saveProjects(projects2);
                showNotification('Loadstring Updated', isKeyless ? 'Keyless loadstring regenerated - anyone can execute it, NO key needed.' : 'Loader link regenerated (new code now served).', 'success', 6000);
            }
        });
        renderProjects();
    }).catch(function(e) {
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = '💾 Update Script'; }
        showNotification('Obfuscation Failed', e.message, 'error', 9000);
    });
}

// ============ DELETE SCRIPT ==========
function deleteScript(projectId, scriptId) {
    if (!confirm('Are you sure you want to delete this script?')) return;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        projects[i].scripts.splice(j, 1);
                        break;
                    }
                }
            }
            break;
        }
    }
    saveProjects(projects);
    refreshStatsUI();
    showNotification('Deleted', 'Script deleted.', 'warning');
    renderProjects();
}

// ============ SCRIPT SETTINGS ==========
function toggleCreditMore(btn) {
    // only clicked card expands; close others so 2 infos don't appear at same time
    var el = btn.nextElementSibling;
    if (!el || !el.classList.contains('credit-more')) {
        el = btn.parentElement.querySelector('.credit-more');
    }
    if (!el) return;
    var willOpen = !el.classList.contains('open');
    // close any other open panels
    var openPanels = document.querySelectorAll('.credit-more.open');
    for (var i = 0; i < openPanels.length; i++) {
        if (openPanels[i] !== el) {
            openPanels[i].classList.remove('open');
            var card = openPanels[i].closest ? openPanels[i].closest('.credit-card') : openPanels[i].parentElement;
            var b = card ? card.querySelector('.btn-credit-more') : null;
            if (b) b.textContent = '+ More';
        }
    }
    el.classList.toggle('open', willOpen);
    btn.textContent = willOpen ? '- Less' : '+ More';
}

// ============ TIME AGO HELPER ============
function timeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
        var then = new Date(dateStr).getTime();
        if (isNaN(then)) return 'Unknown';
        var s = Math.floor((Date.now() - then) / 1000);
        if (s < 5) return 'Right Now';
        if (s < 60) return s + (s === 1 ? ' Second' : ' Seconds') + ' ago';
        var m = Math.floor(s / 60);
        if (m < 60) return m + (m === 1 ? ' Minute' : ' Minutes') + ' ago';
        var h = Math.floor(m / 60);
        if (h < 24) return h + (h === 1 ? ' Hour' : ' Hours') + ' ago';
        var d = Math.floor(h / 24);
        if (d < 7) return d + (d === 1 ? ' Day' : ' Days') + ' ago';
        var w = Math.floor(d / 7);
        if (w < 5) return w + (w === 1 ? ' Week' : ' Weeks') + ' ago';
        var mo = Math.floor(d / 30);
        if (mo < 12) return mo + (mo === 1 ? ' Month' : ' Months') + ' ago';
        var y = Math.floor(d / 365);
        return y + (y === 1 ? ' Year' : ' Years') + ' ago';
    } catch (e) { return 'Unknown'; }
}

function versionLabel(script) {
    var v = script.version || 1;
    return 'V. 0.0.0.' + v;
}

// ============ SCRIPT SETTINGS ==========
function openScriptSettings(projectId, scriptId) {
    var projects = loadProjects();
    var script = null;
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        script = projects[i].scripts[j];
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!script) { showNotification('Error', 'Script not found.', 'error'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '2000';
    var loaderUrl = script.loaderUrl || '';
    var isKeyless = !!script.keyless || !!script.freeForEveryone;
    var loadstringHtml = loaderUrl ? (
        '<div style="margin-top:12px; background:rgba(0,204,68,0.07); border:1px solid rgba(0,204,68,0.3); border-radius:10px; padding:12px;">'
        + '<p style="color:#66ff66; font-size:13px; margin:0 0 6px 0; font-weight:600;">📜 Loadstring (share this with users):</p>'
        + '<code id="shLoadstringBox" style="color:#66ff66; font-size:12px; display:block; padding:8px; background:rgba(0,0,0,0.4); border-radius:6px; word-break:break-all;">' + loaderUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>'
        + '<div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">'
        + '<button type="button" data-loadstring="' + loaderUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" onclick="copyText(this.getAttribute(\'data-loadstring\'))" class="btn-sm btn-sm-primary">📋 Copy Loadstring</button>'
        + '</div>'
        + (isKeyless
            ? '<p style="color:#555577; font-size:11px; margin:8px 0 0 0;">🌐 FREE script: anyone can execute this loadstring directly - NO key needed in executors. The Special Key is only needed to VIEW the code on the website (the key page). The code is obfuscated.</p>'
            : '<p style="color:#555577; font-size:11px; margin:8px 0 0 0;">The script is served ENCRYPTED - users must set the Special Key BEFORE executing via <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> (no popup). The loadstring itself contains NO key.</p>')
        + '</div>'
    ) : (
        '<div style="margin-top:12px; background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.15); border-radius:10px; padding:12px;">'
        + '<p style="color:#8888aa; font-size:12px; margin:0 0 8px 0;">📜 No loadstring yet. Re-save the script (Edit) or generate one:</p>'
        + '<button onclick="generateLoadstring(\'' + projectId + '\',\'' + scriptId + '\')" class="btn-sm btn-sm-edit">⚡ Generate Loadstring</button>'
        + '</div>'
    );
    var specialKeyHtml = script.specialKey ? (
        '<div style="margin-top:12px; background:rgba(108,59,255,0.08); border:1px solid rgba(108,59,255,0.3); border-radius:10px; padding:12px;">'
        + '<p style="color:#8a6bff; font-size:13px; margin:0 0 6px 0; font-weight:600;">🔐 Special Key (decrypts the script - NEVER in the loadstring):</p>'
        + '<code style="color:#66ccff; font-size:12px; display:block; padding:8px; background:rgba(0,0,0,0.4); border-radius:6px; word-break:break-all;">' + script.specialKey.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>'
        + '<p style="color:#555577; font-size:11px; margin:6px 0 0 0;">' + (isKeyless
            ? 'FREE script: the key is only needed to view the code on the <strong>website</strong> key page - executors run the script with NO key.'
            : 'Users must set this key BEFORE executing via <code style="color:#66ccff;">getgenv().ScripterHubKey = "KEY"</code> - there is no popup. Share it only with people who should run the script.') + '</p>'
        + '</div>'
    ) : (
        '<div style="margin-top:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:12px;">'
        + '<p style="color:#8888aa; font-size:12px; margin:0;">⚠️ No Special Key on this script. Edit the script and set one (paid: decrypts in executors; free: gates the website page).</p>'
        + '</div>'
    );
    var keyInfoHtml = script.requireKey ? (
        '<div style="margin-top:12px; background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.3); border-radius:10px; padding:12px;">'
        + '<p style="color:#ffd700; font-size:13px; margin:0 0 6px 0; font-weight:600;">🔑 This script requires a License Key (server-side auth):</p>'
        + (script.serverAuth
            ? '<p style="color:#66ff66; font-size:12px; margin:0 0 6px 0;">🛡️ Luarmor-model auth: the script is ONLY delivered after your user\'s key + HWID pass a live check against your worker. Keys sync automatically from the Users Keys tab (bans, expiry, HWID lock all enforced server-side).</p>'
            : '<p style="color:#8888aa; font-size:12px; margin:0 0 6px 0;">⚠️ Local gate only (aegis engine or no key sync). Re-save with the Default engine for server-side auth.</p>')
        + '<p style="color:#8888aa; font-size:12px; margin:0 0 6px 0;">Users must add this line <strong style="color:#66ccff;">before</strong> their loadstring:</p>'
        + '<code style="color:#66ff66; font-size:12px; display:block; padding:8px; background:rgba(0,0,0,0.4); border-radius:6px; word-break:break-all;">getgenv().ScripterHubKey = "YOUR_USERS_KEY_HERE"</code>'
        + '</div>'
    ) : '';
    overlay.innerHTML = `
        <div class="modal" style="max-width: 500px; padding: 32px; max-height:90vh; overflow-y:auto;">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            <h2 style="font-size:22px;">⚙️ Script Settings</h2>
            <p class="sub">Manage "${script.name}"</p>
            ${loadstringHtml}
            ${specialKeyHtml}
            ${keyInfoHtml}
            <div class="form-group"><label>Visibility</label><select id="scriptVisibility"><option value="anyone" ${script.visibility === 'anyone' ? 'selected' : ''}>Anyone</option><option value="friends" ${script.visibility === 'friends' ? 'selected' : ''}>Friends (Soon...)</option><option value="private" ${script.visibility === 'private' ? 'selected' : ''}>Private</option></select></div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button onclick="updateScriptVisibility('${projectId}','${scriptId}')" class="btn btn-primary" style="flex:1;">💾 Update Visibility</button>
                <button onclick="deleteScript('${projectId}','${scriptId}')" class="btn btn-danger" style="flex:1;">🗑️ Delete Script</button>
            </div>
            <button onclick="this.closest('.modal-overlay').remove()" class="btn btn-close-dropdown" style="width:100%; margin-top:8px;">Close</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Map the dashboard's 3-value visibility onto the server's 3-value model.
//
// 'friends' has no server equivalent — there is no friends graph on the worker
// to authorise against — so it degrades to 'account', which is the honest
// meaning of "not everyone": some account is required. Defaulting to 'anyone'
// instead would silently turn a restricted script into an unrestricted one,
// which is the exact failure this whole change exists to stop.
function shServerVisibility() {
    var v = document.getElementById('scriptVisibility');
    var raw = v ? v.value : (document.getElementById('editScriptVisibility') ? document.getElementById('editScriptVisibility').value : 'anyone');
    if (raw === 'private') return 'private';
    if (raw === 'friends') return 'account';
    return 'anyone';
}

// The published loader id for a dashboard script, or '' if it has never been
// published.
//
// Shape-checked against /sh/(ScripterHub[0-9]{6,16})$ because that is the only
// thing the worker will accept, and a stale value from an older schema (the
// old default project still carries 'ScripterHubOfficial_...') must be treated
// as "not published" rather than sent to the API and rejected.
function shLoaderIdFor(projectId, scriptId) {
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id !== projectId) continue;
        if (!projects[i].scripts) return '';
        for (var j = 0; j < projects[i].scripts.length; j++) {
            if (projects[i].scripts[j].id === scriptId) {
                var id = projects[i].scripts[j].loaderId || '';
                return /^ScripterHub[0-9]{6,16}$/.test(id) ? id : '';
            }
        }
    }
    return '';
}

// PHASE 3: visibility is now SERVER-SIDE state, not a localStorage label.
//
// It used to be written here and nowhere else, so the worker never heard about
// it and "Private" produced a loader URL identical to "Anyone" — the setting
// was decoration. The delivery gate consults scripts.visibility (KV meta + D1),
// so a change has to reach the worker or it does not exist.
//
// The local copy is still written, so the UI renders correctly offline and on
// the next load, but it is a CACHE of the server's answer rather than the
// source of truth. A failure here is surfaced rather than swallowed, because a
// silently-failed visibility change is exactly the bug this fixes.
function updateScriptVisibility(projectId, scriptId) {
    var visibility = document.getElementById('scriptVisibility').value;
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
            if (projects[i].scripts) {
                for (var j = 0; j < projects[i].scripts.length; j++) {
                    if (projects[i].scripts[j].id === scriptId) {
                        projects[i].scripts[j].visibility = visibility;
                        break;
                    }
                }
            }
            break;
        }
    }
    saveProjects(projects);
    var modal = document.querySelector('.modal-overlay[style*="z-index: 2000"]');
    if (modal) modal.remove();

    // push to the worker. The map from the dashboard's 3-value model to the
    // server's 3-value model is 1:1; 'friends' is not a server concept (there
    // is no friends graph to authorise against) so it degrades to 'account',
    // which is the honest meaning: some account required.
    var serverVisibility = visibility === 'private' ? 'private'
        : (visibility === 'friends' ? 'account' : 'anyone');
    var loaderId = shLoaderIdFor(projectId, scriptId);
    if (!loaderId) {
        showNotification('Visibility', 'Saved locally, but this script has no published loader yet.', 'warning');
        renderProjects();
        return;
    }
    // Prefer the USER session token (normal users have no owner access code);
    // fall back to the owner token. Mirrors shUploadLoader's own auth order.
    var payload = { id: loaderId, visibility: serverVisibility };
    payload.userToken = shGetUserToken();
    if (!payload.userToken) payload.token = shOwnerToken();
    fetch(SH_STATS_ENDPOINT + 'sh/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
          if (res.d && res.d.ok) {
              showNotification('Success', 'Visibility updated on the server.', 'success');
          } else {
              showNotification('Visibility',
                  'Saved in this browser only. The server refused: ' + ((res.d && res.d.error) || ('HTTP ' + res.status)),
                  'error');
          }
          renderProjects();
      }).catch(function (e) {
          showNotification('Visibility', 'Could not reach the server: ' + e.message, 'error');
      });
}

// ============ AUTO-LOGIN CHECK ============
function checkAuth() {
    loadUsers();
    var savedUser = null;
    try {
        var sessionData = sessionStorage.getItem('session_user');
        if (sessionData) { savedUser = JSON.parse(sessionData); }
    } catch (e) {}
    if (!savedUser) {
        try {
            var localData = localStorage.getItem('currentUser');
            if (localData) { savedUser = JSON.parse(localData); }
        } catch (e) {}
    }
    if (savedUser) {
        var userExists = false;
        for (var key in users) {
            if (users[key].id === savedUser.id) {
                userExists = true;
                var userData = { ...users[key] };
                delete userData.password;
                updateUIForUser(userData);
                // refresh this user's record from the cloud (plan changes
                // made by the owner on another device show up on refresh)
                shRefreshOwnCloudRecord(users[key]);
                break;
            }
        }
        if (!userExists) {
            clearCurrentUser();
            showHomePage();
        }
    } else {
        showHomePage();
    }
}

// pull the logged-in user's fresh cloud record (plan, profile, bans...).
// Needs the stored b64 password as proof. On success the local users db,
// the session, and the whole UI get updated. If cloud says Invalid/disabled
// the account was deleted by admin on another device -> log out here.
// Pull the logged-in user's fresh cloud record (plan, profile, images).
//
// Authenticated with the SESSION TOKEN via GET /sh/user-me.
//
// It used to POST /sh/user-get with `localRecord.password`, which is
// btoa(password). The worker hashes whatever it is given, so a base64 string
// can never match a PBKDF2 record - the call failed 100% of the time for every
// account whose hash had been upgraded, which is every account in real use,
// because the worker migrates legacy records on first login.
//
// The 401 that followed was then read as "the account was deleted": the local
// record was deleted, the user was logged out, and the notification said the
// account had been removed by an admin. It had not. Nothing had been deleted
// anywhere; a credential had simply failed.
//
// So: a session token is used, and a failed refresh does NOTHING destructive.
// Not a 401, not a 404, not a network error. The only signal that may act is an
// explicit `disabled`, which is an administrative decision the server made and
// said out loud. A stale local profile is cosmetic; deleting the account and
// signing the user out is not recoverable by the person it happens to.
// Which fields the cloud OWNS on a refresh, and which it does not.
// Mixing these up is how a profile edit silently undoes itself on the next load.
const PLAN_FIELDS = ['plan', 'planExpires', 'credits', 'compensatedUntil',
    'disabled', 'moderated', 'isScripter', 'admin'];
const IMAGE_FIELDS = ['profileImage', 'bannerImage', 'customBackground'];

async function shRefreshOwnCloudRecord(localRecord) {
    try {
        if (!localRecord || !localRecord.email) return;
        const tok = shGetUserToken() || "";
        // No token means this device never established a session. That is not a
        // reason to touch the account - it is a reason to do nothing.
        if (!tok) return;
        const d = await shApiGet('sh/user-me', { userToken: tok });
        // Any failure at all: keep the local record, keep the session, stay quiet.
        // A worker that has not been redeployed answers 404 here, and that must
        // not look like anything worse than a feature that is not live yet.
        if (!d || !d.ok || !d.user) {
            if (d && d.disabled === true) {
                showNotification('Account Disabled',
                    'An administrator disabled this account. Your account and its scripts are still here and can be re-enabled.',
                    'warning', 9000);
            }
            return;
        }
        const cloud = d.user;
        const email = localRecord.email;
        const lu = users[email];
        if (!lu) return;
        let changed = false;
        // Plan and administrative flags are the server's to decide, so they are
        // taken from it. Images are merged the other way: the cloud has not seen
        // this device's upload yet, and blanking it would undo a save the user
        // just made and watched succeed.
        for (const f of PLAN_FIELDS) {
            if (cloud[f] !== undefined && lu[f] !== cloud[f]) { lu[f] = cloud[f]; changed = true; }
        }
        for (const f of IMAGE_FIELDS) {
            if (cloud[f] && !lu[f]) { lu[f] = cloud[f]; changed = true; }
        }
        if (changed) {
            users[email] = lu;
            try { saveUsers(); } catch (e) {}
            if (currentUser && currentUser.email === email) {
                const shown = { ...lu };
                delete shown.password;
                updateUIForUser(shown);
            }
        }
    } catch (e) {
        // Swallowed on purpose. A refresh is a convenience; it has no business
        // being able to end a session.
    }
}


// keep the logged-in user's plan/profile in sync: poll the cloud every
// 60s and whenever the tab regains focus, so plan changes made by the
// owner land on every device WITHOUT a manual page refresh.
setInterval(function() {
    if (!currentUser || !currentUser.email) return;
    var lu = users[currentUser.email];
    if (lu && lu.email) shRefreshOwnCloudRecord(lu);
}, 60000);
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && currentUser && currentUser.email) {
        var lu = users[currentUser.email];
        if (lu && lu.email) shRefreshOwnCloudRecord(lu);
    }
});

function showHomePage() {
    var homePage = document.getElementById('homePage');
    var dashboard = document.getElementById('dashboard');
    var plansSection = document.querySelector('.plans-section');
    if (homePage) homePage.style.display = 'block';
    if (dashboard) dashboard.classList.remove('show');
    dashboard.style.display = 'none';
    if (plansSection) plansSection.style.display = 'block';
}

// The navbar brand has carried onclick="showPage('home')" since the first commit,
// and showPage did not exist. Like every inline handler on a <script
// type="module"> page, it resolved in global scope and threw ReferenceError on
// each click - a dead link on the most-clicked element in the header.
//
// Defined here rather than by editing the markup, so the name the HTML has always
// used is a real entry point. `home` is the only page there is; anything else
// falls back to it rather than throwing, because a navigation helper that can
// throw is worse than one that is boring.
function showPage(page) {
showHomePage();
if (page === 'home' || !page) return;
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Streaming Obfuscation System loaded');
    checkAuth();
    var signupForm = document.getElementById('signupForm');
    if (signupForm) { signupForm.addEventListener('submit', handleSignup); }
    var loginForm = document.getElementById('loginForm');
    if (loginForm) { loginForm.addEventListener('submit', handleLogin); }
    var adminBtn = document.getElementById('adminBtn');
    if (adminBtn) { adminBtn.addEventListener('click', openAdminPanel); }
    var usersBtn = document.getElementById('usersBtn');
    if (usersBtn) { usersBtn.addEventListener('click', openUsersPanel); }
    console.log('📊 Users loaded:', Object.keys(users).length);
});

(function() {
    var savedUser = getCurrentUser();
    if (savedUser) { console.log('🔄 Session found, restoring...'); }
})();

// ============ EXPOSE FUNCTIONS TO GLOBAL ============
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.openAdminPanel = openAdminPanel;
window.openUsersPanel = openUsersPanel;
window.closeUsersPanel = closeUsersPanel;
window.renderUsersList = renderUsersList;
window.selectUser = selectUser;
window.panelDeleteUser = panelDeleteUser;
window.panelChangePlan = panelChangePlan;
window.renderAdminUserListFull = renderAdminUserListFull;
window.deleteUser = deleteUser;
window.deleteAllUsers = deleteAllUsers;
window.deleteAllBotUsers = deleteAllBotUsers;
window.confirmDeleteAllBots = confirmDeleteAllBots;
window.refreshUsersList = refreshUsersList;
window.filterUsers = filterUsers;
window.uploadProfileImage = uploadProfileImage;
window.uploadBannerImage = uploadBannerImage;
window.changeTheme = changeTheme;
window.shBytecodeVMNote = shBytecodeVMNote;
window.exportUsers = exportUsers;
window.changeUserPlan = changeUserPlan;
window.changeOwnPlan = changeOwnPlan;
window.confirmChangePlan = confirmChangePlan;
window.confirmOwnPlanChange = confirmOwnPlanChange;
window.loadProjects = loadProjects;
window.saveProjects = saveProjects;
window.switchTab = switchTab;
window.showTabs = showTabs;
window.openCreateProject = openCreateProject;
window.confirmCreateProject = confirmCreateProject;
window.renderProjects = renderProjects;
window.viewProject = viewProject;
window.openCreateScript = openCreateScript;
window.confirmCreateScript = confirmCreateScript;
window.editProject = editProject;
window.confirmEditProject = confirmEditProject;
window.deleteProject = deleteProject;
window.editScript = editScript;
window.confirmEditScript = confirmEditScript;
window.deleteScript = deleteScript;
window.openScriptSettings = openScriptSettings;
window.updateScriptVisibility = updateScriptVisibility;
window.copyText = copyText;
window.storeScriptForLoader = storeScriptForLoader;
window.storeScriptForRawAccess = storeScriptForRawAccess;
window.getScriptForLoader = getScriptForLoader;
window.getScriptForRawAccess = getScriptForRawAccess;
window.createKey = createKey;
window.deleteKey = deleteKey;
window.generateKey = generateKey;
window.renderKeys = renderKeys;
window.verifyKey = verifyKey;
window.useKey = useKey;
window.loadKeys = loadKeys;
window.saveKeys = saveKeys;
window.openCreateKeyUI = openCreateKeyUI;
window.confirmCreateKeyUI = confirmCreateKeyUI;
window.toggleEmail = toggleEmail;
window.toggleCreditMore = toggleCreditMore;
window.refreshStatsUI = refreshStatsUI;
window.setExecRange = setExecRange;
window.setObfRange = setObfRange;
window.userKeysDoSearch = userKeysDoSearch;
window.userKeysPage = userKeysPage;
window.toggleUserKeysList = toggleUserKeysList;
window.openAddUserUI = openAddUserUI;
window.confirmAddUserUI = confirmAddUserUI;
window.openUserKeysSettingsUI = openUserKeysSettingsUI;
window.massGenerateKeys = massGenerateKeys;
window.downloadKeysTxt = downloadKeysTxt;
window.exportKeysJson = exportKeysJson;
window.deleteUnusedKeys = deleteUnusedKeys;
window.importUsersFile = importUsersFile;
window.massCompensateDays = massCompensateDays;
window.resetAllHwids = resetAllHwids;
window.openKeySettingsUI = openKeySettingsUI;
window.saveKeySettings = saveKeySettings;
window.resetOneHwid = resetOneHwid;
window.blacklistKey = blacklistKey;
window.disableAccount = disableAccount;
window.enableAccount = enableAccount;
window.openDeleteAccountUI = openDeleteAccountUI;
window.confirmDeleteAccount = confirmDeleteAccount;
window.openResetPasswordUI = openResetPasswordUI;
window.handleResetPassword = handleResetPassword;
window.openScriptRaw = openScriptRaw;
window.generateLoadstring = generateLoadstring;
window.shUploadLoader = shUploadLoader;
window.recordThreat = recordThreat;
// Test hooks for the cloud reconcile.
//
// shReconcileWithCloud is the one function in this file that can remove user
// records, and a destructive rule with no test is precisely what caused this: a
// prune loop deleted any local account missing from a cloud response, which is how
// alt accounts disappeared. tools/reconcile_test.mjs asserts that a local-only
// account now SURVIVES and is marked instead.
//
// __shUsersRef returns the LIVE map, not a copy: `users` is reassigned wholesale
// in a couple of places, so a snapshot taken at load time would go stale and the
// test would pass against a map the app is not using.
window.shReconcileWithCloud = shReconcileWithCloud;
window.__shUsersRef = function () { return users; };
// Exported because the users panel's inline onclick= needs a global, and because
// the escape hatch for a stale owner code should be reachable from a test.
window.shForgetOwnerCode = shForgetOwnerCode;
window.shOwnerApi = shOwnerApi;
window.runDiagnostics = runDiagnostics;
window.shMintUserToken = shMintUserToken;
window.shSaveUserToken = shSaveUserToken;
window.shClearUserToken = shClearUserToken;
window.copyDiagnostics = copyDiagnostics;
// Reachable from inline onclick/onerror handlers.
//
// main.js is a <script type="module">, so its top-level declarations are NOT on
// window. An inline handler resolves in global scope, so any function named in
// index.html and not listed here throws ReferenceError and the control does
// nothing at all - silently, with no request and no error. These were all
// missing:
//
//   showPage                  - a dead navigation button
//   uploadCustomBackground    - the "background changer does nothing" report
//   clearCustomBackground     - Remove did nothing either
//   openCreateRewardUI        - see rewards.js: the file was never loaded, and as
//                             a module its exports are never global anyway
//   shImgErr                  - a false alarm: it lives in index.html's own
//                             inline classic script, so it was always global
//   shImgErr                  - a broken image threw on every load
//
// The announcement handlers were also here and are gone with the feature.
// tools/inline_handlers_test.mjs diffs every handler in index.html against this
// list, so the next omission fails the build instead of the UI.
window.showPage = showPage;
window.changeTheme = changeTheme;
window.openCustomThemePicker = openCustomThemePicker;
window.shOnThemeSelect = shOnThemeSelect;
window.shOnCustomThemeInput = shOnCustomThemeInput;
window.shCommitCustomTheme = shCommitCustomTheme;
window.uploadCustomBackground = uploadCustomBackground;
window.clearCustomBackground = clearCustomBackground;
window.applyCustomBackground = applyCustomBackground;
window.applyTheme = applyTheme;
