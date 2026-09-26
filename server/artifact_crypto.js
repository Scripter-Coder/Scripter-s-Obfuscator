// ===========================================================================
// At-rest encryption for the artifact store (Phase 4)
// ===========================================================================
//
// WHAT THIS IS FOR, PRECISELY
//
// The artifact in KV is already ciphertext: the owner's browser encrypted it
// with the per-script Special Key before upload, and the worker never sees
// that key. So this is NOT about protecting the artifact from the worker, and
// claiming otherwise would be a category error.
//
// What it IS about is a narrower and real threat: the KV namespace is one flat
// readable store that also holds sh_licenses, sh_users_db, sh_meta_ and the
// split keys. Anyone who can read the namespace — a leaked credential, a
// misconfigured binding, a backup, an insider — currently reads the artifact
// bytes directly, with no second factor. `SH_ARTIFACT_KEK` adds one: a key
// that lives only in the Worker's secret store, so the ciphertext sitting in
// KV is inert on its own.
//
// It does NOT protect against the worker itself being compromised. The KEK is
// in the same process. It narrows the blast radius of "the KV store leaked",
// which is the realistic case, and it is honest about that rather than
// overselling.
//
// ---------------------------------------------------------------------------
// WHY IT IS OPT-IN AND MARKER-PREFIXED
// ---------------------------------------------------------------------------
//
// Two reasons, and the second is the important one.
//
// 1. Cost. AES-GCM over a 30MB artifact per delivery is real CPU on a Worker.
//     An operator who does not need it should not pay for it.
//
// 2. A rollout that cannot be reversed. If the KEK is set and the namespace is
//     already full of plaintext artifacts, then un-setting the KEK makes every
//     one of them permanently unreadable. That is data loss, not a security
//     downgrade, and it would happen silently.
//
// So every value carries a marker:
//
//     SHKEK1:<base64 iv>:<base64 ciphertext+tag>
//
// A value WITHOUT the marker is plaintext and is served as-is; a value WITH it
// needs the KEK. That makes the two states unambiguous, makes a partial
// rollout safe in both directions, and means this can be switched on for new
// uploads without touching existing ones.
//
// A missing KEK on a marked value is a REFUSAL, never a pass-through. Serving
// the raw marked bytes would hand the caller a string starting "SHKEK1:" and
// they would conclude the script is corrupt rather than that the operator
// misconfigured something. Failing loudly is the only safe direction.
// ===========================================================================

const KEK_MARKER = 'SHKEK1:';

// Cached per isolate: the deriveKey call is not free and a secret does not
// change while an isolate is alive, so re-deriving on every request is waste.
//
// KEYED ON THE KEK, and that is load-bearing rather than tidiness.
//
// The first version cached a single derived key with nothing on the entry. It
// looked correct — one Worker, one env, one secret — and it was, right up
// until two different KEKs existed in one module instance. Then the cache
// handed back the PREVIOUS key and the new one silently failed to decrypt.
// tools/artifact_crypto_test.mjs caught it by encrypting with one KEK and
// decrypting with another in the same process.
//
// Not purely theoretical: `wrangler dev` reloads the module with different
// vars, a preview and a production env can share an isolate locally, and any
// future multi-tenant shape would do it in anger. The failure mode is data
// loss reported as a wrong-key error — an operator rotates a secret and every
// script breaks, which is the worst possible moment to discover it.
//
// The cache key is a SHA-256 of the secret, not the secret, so the raw KEK is
// never parked in a module-level variable for a heap dump or a stray log to
// find. Bounded so a pathological number of distinct secrets cannot grow it
// without limit; insertion order is the eviction order.
let kekCache = new Map();   // sha256(secret) -> { raw: ArrayBuffer, at: number }
const KEK_CACHE_MS = 60 * 1000;
const KEK_CACHE_MAX = 8;

function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export function kekConfigured(env) {
    return !!(env && env.SH_ARTIFACT_KEK && String(env.SH_ARTIFACT_KEK).length >= 16);
}

export function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(KEK_MARKER);
}

function hex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
}

async function getKek(env) {
    if (!kekConfigured(env)) return null;
    const secret = String(env.SH_ARTIFACT_KEK);
    const tag = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))));
    const now = Date.now();
    const hit = kekCache.get(tag);
    if (hit && now - hit.at < KEK_CACHE_MS) return hit.raw;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('SHKEK::' + secret));
    if (kekCache.size >= KEK_CACHE_MAX) {
        const oldest = kekCache.keys().next().value;
        if (oldest !== undefined) kekCache.delete(oldest);
    }
    kekCache.set(tag, { raw: digest, at: now });
    return digest;
}

// Test seam: the cache is module-level, so a test that flips the env var
// between cases would otherwise read the previous case's key.
export function _resetKekCache() { kekCache = new Map(); }

// ---------------------------------------------------------------------------
// Encrypt / decrypt
// ---------------------------------------------------------------------------

export async function encryptAtRest(env, text) {
    const kek = await getKek(env);
    if (!kek) return text;                       // opt-in: no KEK, no change
    const key = await crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, ['encrypt']);
    // 12 bytes is the GCM standard nonce length. Random per encryption, which
    // is what stops two identical artifacts producing identical ciphertext.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
    );
    return KEK_MARKER + b64(iv) + ':' + b64(new Uint8Array(ct));
}

// Returns the plaintext, or throws. Callers MUST NOT fall back to the raw
// value on failure — see the module header on why that direction is unsafe.
export async function decryptAtRest(env, value) {
    if (!isEncrypted(value)) return value;        // legacy plaintext
    const kek = await getKek(env);
    if (!kek) {
        throw new Error('artifact is at-rest encrypted but SH_ARTIFACT_KEK is not set');
    }
    const rest = value.slice(KEK_MARKER.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) throw new Error('corrupt at-rest envelope');
    const iv = unb64(rest.slice(0, sep));
    const ct = unb64(rest.slice(sep + 1));
    const key = await crypto.subtle.importKey('raw', kek, { name: 'AES-GCM' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
}

// Non-throwing probe for call sites that want to distinguish "not set up" from
// "corrupt", e.g. to answer a health check.
export async function tryDecryptAtRest(env, value) {
    try { return { ok: true, text: await decryptAtRest(env, value) }; }
    catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
}
