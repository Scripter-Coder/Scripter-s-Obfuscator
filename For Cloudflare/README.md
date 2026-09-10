# ScripterHub Cloudflare Worker (Stats + HIDDEN Loader Host)

This worker does TWO jobs:

1. **Live Execution stats** - your "Live Executions Chart" shows REAL
   executions from everyone using your scripts.
2. **HIDDEN Loader Host** - the "raw page" system:
   - You upload scripts from the secret page `raw.html?auth=1` (or they
     are auto-uploaded when you create a script in the dashboard),
     logging in with the access code `ScripterHub`.
   - Scripts are **encrypted in your browser with your per-script
     Special Key before upload** - the worker only ever stores
     ciphertext. There is **NO download endpoint** - nobody can ever
     read the source back, not even you. Keep your original file
     yourself!
    - You get a loadstring like:
      `loadstring(game:HttpGet("https://scripterhub-stats.dubovikstanislav51.workers.dev/sh/ScripterHub1234567890"))()`
      — **no key inside**. The served code asks for the Special Key at
      runtime (in-game popup or `getgenv().ScripterHubKey = "KEY"`) and
      decrypts locally. Browsers/curl/AI scrapers that fetch the link
      get a "Special Key required" page (or encrypted bytes only).
    - Keys are stored as SHA-256 hashes, never in plaintext; the key
      itself never leaves the owner's / user's machine.
   - Every created script also sends a notification with BOTH download
     files (normal + obfuscated .lua) to your Discord webhook - so even
     though you can't download from KV, you always have both files in
     your Discord channel.

## Setup (10 minutes, free)

1. Go to https://dash.cloudflare.com and log in
2. **Create the KV namespace** (this stores the hidden scripts AND the
   access-code hash):
   - Left menu: **Storage & Databases** -> **KV** -> **Create namespace**
   - Name: `scripterhub_loaders` -> Create
3. Open your existing worker (or **Workers & Pages** -> **Create Worker**,
   name it `scripterhub-stats` -> Deploy)
4. **Bind the KV** to the worker:
   - Worker -> **Settings** -> **Bindings** -> **Add** -> **KV Namespace**
   - Variable name: `LOADERS_KV` (exactly this!)
   - Namespace: `scripterhub_loaders`
5. **Add the variables** (Worker -> Settings -> **Variables and Secrets**):
   - Secret `SH_SETUP_TOKEN` = any long random password you make up
     (needed ONCE to store your access code — and to change it later)
   - Text `SH_DISCORD_WEBHOOK` = your Discord webhook URL
     (`https://discord.com/api/webhooks/...`)
   - Text `SH_BASE_URL` = `https://scripterhub-stats.dubovikstanislav51.workers.dev`
6. Worker -> **Edit code** -> paste the ENTIRE `worker.js` from this
   folder -> **Deploy**
7. Test: open `https://YOUR-WORKER/sh/health` - it must say
   `"loaders": true`. (If it says false, the KV binding is missing.)

## Special Keys (client-side encryption - the key is in NO url)

A User-Agent header is just a string — anyone (curl, bots, AI tools)
can send `Roblox/WinInet`. And putting a key in the URL means everyone
holding the link holds the key. So neither is the gate. Instead:

**Your script is ENCRYPTED IN YOUR BROWSER with your Special Key before
it is ever uploaded.** The worker only ever stores ciphertext. The
loadstring contains NO key. At runtime the script asks for the key
(in-game popup card, or `getgenv().ScripterHubKey = "..."`) and decrypts
locally. In a browser the link shows a key page that decrypts locally
on the visitor's machine.

- The loadstring is just:
  `loadstring(game:HttpGet("https://.../sh/ScripterHub1234567890"))()`
  — nothing secret in it. Anyone fetching it (Grok, curl, a browser)
  gets the **key-required page / encrypted bootstrap only**.
- The Special Key is any length (emojis OK), set per script in the
  Create/Edit Script form. It is **never sent to the server** (only a
  SHA-256 hash of it, for the browser key page's "wrong key" message).
- Users you want to run the script: give them the loadstring + the key.
  They set `getgenv().ScripterHubKey = "THE_KEY"` before executing, or
  paste it into the popup that appears in game.
- **Losing the key = the script is gone forever.** The key is never
  stored anywhere in plaintext. Keep it safe (the dashboard View modal
  shows it, and your Discord notification has the original file).
- **Rotating a key** (someone leaked it): edit the script in the
  dashboard and set a new Special Key. On save it's re-encrypted in
  your browser, uploaded as a NEW loader, and the old loader id is
  deleted — the old link dies instantly.
- The cipher is a double-safe stream cipher (djb2 seeding + xorshift128
  keystream) implemented identically in JS (`sh-crypto.js`) and in the
  Lua bootstrap — verified byte-exact across both runtimes, and safe
  in Lua 5.1 / Luau / 5.3 (float math only, no bitops required).
- A wrong key can't even produce garbage: a `SHOK` magic header makes
  decryption fail cleanly ("Wrong Special Key!").

## Your access code

The default access code is **`ScripterHub`** — it works out of the box,
no setup needed. It grants permission to claim loadstrings (upload
scripts + receive loadstring links). Script sources stay gated behind
their per-script Special Keys.

Want an extra code too? Codes are never written in any file (the website
is a public repo - anyone could read it from main.js/raw.html!):

1. Open `https://YOUR-SITE/raw.html?auth=1`
2. Log in with `ScripterHub` (or your extra code once set)
3. Optional extra code - call the worker directly:

```js
// paste in browser console (F12) on any page:
await fetch('https://scripterhub-stats.dubovikstanislav51.workers.dev/sh/setcode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ setupToken: 'YOUR_SH_SETUP_TOKEN', code: 'YOUR EXTRA CODE' })
}).then(r => r.json())
```

4. The worker stores ONLY the SHA-256 hash of the extra code in KV.
   Login accepts the default `ScripterHub` OR the extra code. Codes
   themselves are never saved anywhere.

**Removing the extra code later:** delete the KV keys
`sh_access_code` + `sh_code_set_at` in the Cloudflare KV dashboard -
the default `ScripterHub` keeps working.

## In the dashboard (main.js)

The first time a script needs a loadstring, a popup asks you to paste
the access code ONCE per browser session (kept only in sessionStorage,
gone when you close the tab). Then scripts you create/edit get
loadstrings automatically.

## The hidden raw page

- URL: `https://YOUR-SITE/raw.html?auth=1` (the `?auth=1` is the
  secret door; without it the page shows only "Not Allowed")
- Enter the access code -> you see the Create Script form
- Paste/upload Lua -> "Create Script" -> it obfuscates locally, uploads
  ONLY the obfuscated code to the worker, and shows your loadstring
- Discord receives: "User `username` Successfully Created Script" with
  the normal + obfuscated .lua files attached (downloadable)

## Notes

- The old `raw.html?id=...&key=...&loaderKey=...` debug system still
  works unchanged (same-browser only) - the hidden host is a separate,
  much stronger layer.
- Scripts in KV auto-delete after 1 year (`expirationTtl`).
- Executor User-Agent list can be extended in `EXECUTOR_UA` in worker.js.
- Discord attachments are capped at ~7MB each; bigger scripts only get
  the notification embed (no files) - split them or lower obfuscation.
- KV values can be up to 25MB, so even a giant extra code is no problem.
- The login session token is valid 12 hours, then you paste the code
  again.
