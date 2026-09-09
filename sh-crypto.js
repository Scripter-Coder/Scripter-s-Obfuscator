// ============ SPECIAL-KEY PAYLOAD ENCRYPTION (shared browser/test) ============
// Double-safe stream cipher: djb2-style seeding (h*33+b, exact < 2^53) +
// xorshift128 keystream (shifts/xor only, no big multiplies). The SAME
// algorithm runs in Lua inside the worker-served bootstrap, so a key
// entered at runtime decrypts the payload client-side. The key NEVER
// appears in the loadstring URL and never reaches the server.

// djb2-style 32-bit hash of a string (UTF-8 bytes), variant by index.
// h = init + idx*7; for each byte: h = (h*33 + b) % 2^32  (exact in doubles)
function shSeed(key, idx) {
    const bytes = new TextEncoder().encode(key);
    let h = (5381 + idx * 7) >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h = (h * 33 + bytes[i]) % 4294967296;
    }
    return h >>> 0;
}

// one step of xorshift128 (all ops double-safe: only *8192, /131072, *32)
function xs128Next(s) {
    let x = s[0] >>> 0;
    x = (x ^ ((x * 8192) % 4294967296)) >>> 0;
    x = (x ^ Math.floor(x / 131072)) >>> 0;
    x = (x ^ ((x * 32) % 4294967296)) >>> 0;
    s[0] = s[1]; s[1] = s[2]; s[2] = s[3]; s[3] = x;
    return x >>> 0;
}

function keyState(key) {
    const s = [shSeed(key, 0), shSeed(key, 1), shSeed(key, 2), shSeed(key, 3)];
    if (s[0] === 0) s[0] = 1;
    if (s[1] === 0) s[1] = 2;
    if (s[2] === 0) s[2] = 3;
    if (s[3] === 0) s[3] = 4;
    return s;
}

// encrypt UTF-8 text -> base64 ciphertext ("SHOK" magic prepended so a
// wrong key is detectable before loadstring/compile)
function shEncryptPayload(text, key) {
    const state = keyState(key);
    const bytes = new TextEncoder().encode('SHOK' + text);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ (xs128Next(state) & 0xFF);
    }
    let bin = '';
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return btoa(bin);
}

// decrypt base64 ciphertext -> UTF-8 text (browser key page parity).
// Returns null if the "SHOK" magic is missing (wrong key).
function shDecryptPayload(b64, key) {
    const bin = atob(b64);
    const state = keyState(key);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i) ^ (xs128Next(state) & 0xFF);
    }
    const dec = new TextDecoder('utf-8', { fatal: false });
    const txt = dec.decode(out);
    if (txt.substring(0, 4) !== 'SHOK') return null;
    return txt.substring(4);
}

const exp = { shEncryptPayload, shDecryptPayload, shSeed, xs128Next, keyState };
if (typeof window !== 'undefined') window.ShPayloadCrypto = exp;
if (typeof globalThis !== 'undefined') globalThis.ShPayloadCrypto = exp;
export { shEncryptPayload, shDecryptPayload, shSeed, xs128Next, keyState };
