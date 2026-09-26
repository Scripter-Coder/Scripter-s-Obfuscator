# ScripterHub — Cloudflare Worker (session-gated delivery)

This worker does four jobs:

1. **Live execution stats** — the "Live Executions Chart" shows real executions.
2. **Hidden loader host** — you publish scripts from the secret page
   `raw.html?auth=1`; the worker holds only ciphertext.
3. **Server-side license auth** — bans, expiry and HWID locks are enforced
   **on the server**, instantly, for every existing loader.
4. **Session-gated delivery (Phase 3)** — the artifact is not on any public
   route. It is released once per short-lived, single-use, server-verified
   session.

---

## THE DELIVERY MODEL

```
   public site                GET /sh/ScripterHub##########
   (metadata, loader URL)         |
                                  v
                          BOOTSTRAP  - contains NO script material.
                          Identical for every script except the id
                          and base URL. Opens in a browser, a scraper
                          or an executor, it reveals nothing.
                                  |
                                  v
   POST /sh/session            authenticate: license + HWID + killswitch
   { id, k, h }   <----------  + server-side visibility
        |                      |
        |  "SHS <sid> <nonce> <exp>"
        |                      |  proof, not payload
        v                      v
   GET /sh/a/<id>?s=&n=       THE GATE
        |                      consume nonce  (atomic UPDATE)
        |                      consume session (atomic UPDATE, re-checks
        |                        license + HWID + account live)
        |                      |
        |  "SHL\n<blob>"                   small: inline, one response
        |  "SHK\n<key>\n<blob>"            keyed: inline, one response
        |  "SHG <n> <root> <grant>\n..."    large: opens a forward-only chain
        v
   (large only) GET /sh/c/<id>/<i>?g=&s=   or   /sh/g/<id>/<i>?g=&s=
        one atomic forward step per part; no skip, no replay
```

### The properties this buys

| Attack | Result |
|---|---|
| Open the loader URL in a browser | Metadata only. No ciphertext, no key, no decryptor |
| View the website HTML | No artifact |
| Crawl public endpoints | No artifact on any route |
| Scrape `/sh/c/*` or `/sh/g/*` with a fake executor UA | 405 — a grant from the gate is required |
| Replay a session or nonce | Rejected — `changes() === 1`, once |
| Present an expired session | Rejected server-side, not on an advisory timestamp |
| Use a license banned *after* minting | Rejected at delivery, next attempt, no window |
| Present a self-computed credential | Rejected — sid/nonce come from `crypto.getRandomValues()` |
| Rotate a license to other hardware mid-session | The live session dies (G22) |
| Capture an authorized run | **Possible.** Devirtualizing it is a separate cost |
| Devirtualize a captured runtime | Expensive — that is the VM's job, not this layer's |

### What is deliberately NOT claimed

The loader URL is public and permanent. That is a fact of the design and it is
not going to change. What changed is that it carries no authorization value on
its own: anyone can open it, nobody can extract anything from it. See D6 in
`docs/DECISIONS.md`.

A legitimate client still receives every byte. Someone who watches one
authorized run can reconstruct the artifact — that is accepted, and the chain
(D11) limits the blast radius rather than pretending to prevent it.

---

## Setup (first deploy)

The order matters. Steps 1–5 change nothing about how the worker serves
traffic.

1. Install and authenticate:
   ```bash
   npm i -g wrangler
   wrangler login
   ```

2. **Create the D1 database.** This is new in Phase 3 and it is not optional.
   ```bash
   wrangler d1 create scripterhub
   ```
   Paste the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.

3. **Apply the schema.**
   ```bash
   wrangler d1 execute scripterhub --file=migrations/0001_init.sql
   ```

4. **Set the secrets.**
   ```bash
   wrangler secret put SH_SETUP_TOKEN      # bootstrap/admin token
   wrangler secret put SH_SESSION_SECRET   # 32+ random bytes
   wrangler secret put SH_KDF_PEPPER       # 32+ random bytes
   ```
   Generate values with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   `SH_SESSION_SECRET` signs owner/user session tokens **and** the multi-part
   delivery grants. Without it the worker derives a fallback from
   `SH_SETUP_TOKEN`, which means anyone who knows one value can forge sessions.

5. **Set the webhook** (see the next section) and `SH_BASE_URL`.

6. Fill in `account_id`, `name` and the KV namespace id in `wrangler.toml`, then:
   ```bash
   wrangler deploy
   ```

7. **Claim the owner access code, once.**
   ```bash
   curl -X POST https://<your-worker>/sh/owner-claim \
        -H 'Content-Type: application/json' \
        -d '{"setupToken":"<the SH_SETUP_TOKEN you set>"}'
   ```
   The code comes back ONCE and is deliberately **not** written to the worker
   logs. Save it somewhere safe. Afterwards you can delete the route; rotate
   later with `/sh/setcode`.

8. **Verify.**
   ```bash
   curl https://<your-worker>/sh/health
   ```
   You want:
   ```json
   { "ok": true, "loaders": true, "stateLayer": true,
     "delivery": "session-gated", "webhook": true }
   ```

   **`"stateLayer": false` means every delivery route is refusing.** That is
   D9: the gate fails closed rather than falling back to KV, because a fallback
   would silently restore every hole this phase closes. Bind `SH_DB` and apply
   the migration.

---

## YOUR WEBHOOK — where to change it

There are **two** different webhooks. Neither is security; both are telemetry.

### 1. The worker log webhook (this is the one that "doesn't work")

**Location:** Cloudflare dashboard → your worker → **Settings** →
**Variables and Secrets** → add a **Text** variable:

| Name | Value |
|---|---|
| `SH_DISCORD_WEBHOOK` | `https://discord.com/api/webhooks/…/…` |

Notes:

- It must be a **Text** variable, not a Secret — either works, but Secrets are
  redacted in the dashboard, which makes a typo hard to spot.
- The URL must be the *full* webhook URL including the trailing token.
- Regenerate it in Discord with **Server Settings → Integrations → Webhooks →
  your webhook → Copy Webhook URL**. Discord has invalidated old URLs on some
  channels, which is the most common cause of "it stopped working".
- **Phase 3 change:** the worker used to `catch (e) {}` on this fetch, so every
  failure was silent and undiagnosable. It now logs the HTTP status Discord
  returned. If events stop arriving, open the worker's **Logs** tab
  (Observability → enable, or `wrangler tail`) and you will see either
  `telemetry webhook returned HTTP <status>` or
  `telemetry webhook unreachable`. That line tells you which of the three
  failure modes you have: variable not set, URL revoked (401/404), or Discord
  rate-limiting you (429).
- To check it without waiting for an event: create a script, or run a license
  auth. Both emit `script.published` / `auth.ok`.

From the CLI instead of the dashboard:

```bash
wrangler secret put SH_DISCORD_WEBHOOK
```

or in `wrangler.toml`:

```toml
[vars]
SH_DISCORD_WEBHOOK = "https://discord.com/api/webhooks/…/…"
```

**The webhook carries metadata only.** There is no code path that can put your
source, a license key, a Special Key or artifact bytes into it — the event
builder takes a fixed field allowlist and refuses an event carrying anything
denied. Pinned by gate G15.

### 2. Per-script webhooks (different feature)

Set per script in the dashboard: script Settings → Alert/Logs webhook. These are
your own channels, unrelated to the worker's log webhook.

---

## Special Keys

**Your script is encrypted in your browser with your per-script Special Key
before it is ever uploaded.** The worker only ever stores ciphertext. The
loadstring contains no key.

- The key is any length (emojis OK). It is **never sent to the server** — only
  a SHA-256 hash, for validation.
- At runtime the script reads it from `getgenv().ScripterHubKey` (or the
  per-script hash it baked in). Wrong key = a failed magic check, not garbage.
- **Losing the key = the script is gone forever.** Keep your original file; the
  worker cannot hand the source back.
- **Rotating a key:** edit the script and set a new Special Key. On save it
  re-encrypts and uploads as a NEW loader, and the old loader id dies instantly.

### The browser key page is gone

There used to be a page where you typed the Special Key and read the script in
your browser. **That has been removed** and cannot be brought back: the page
had to embed the ciphertext, which is exactly what made it a hole (G03).
`/sh/<id>` in a browser now shows the script's name and id and nothing else.
See D15.

---

## Endpoint reference

### Delivery (Phase 3)

| Route | Purpose |
|---|---|
| `GET /sh/<id>` | Public loader. Bootstrap or metadata. **No artifact.** |
| `POST\|GET /sh/session` | Mint. `{id, k, h}` → `SHS <sid> <nonce> <exp>` |
| `GET\|POST /sh/a/<id>` | **The gate.** `?s=&n=` → artifact or a chain |
| `GET /sh/k/<id>` | Legacy split-key, hardened. Needs a live session now |
| `GET /sh/c/<id>/<i>` | KV chunk, chain-gated, forward-only |
| `GET /sh/g/<id>/<i>` | GitHub part, chain-gated, forward-only |
| `GET /sh/health` | Reports `stateLayer` and `delivery` |

### Auth / license (owner, unless noted)

`/sh/login` · `/sh/user-signup` · `/sh/user-login` · `/sh/user-get` ·
`/sh/user-sync` · `/sh/user-delete` · `/sh/user-password` · `/sh/users` ·
`/sh/users-delete` · `/sh/users-clear` · `/sh/licenses` · `/sh/license-delete` ·
`/sh/license-reset` · `/sh/license-ban` · `/sh/killswitch` · `/sh/setcode` ·
`/sh/owner-claim` · `/sh/visibility`

### Publishing

`/sh/upload` · `/sh/gh-put` · `/sh/gh-finalize` · `/sh/gh-delete` ·
`/sh/gh-status`

### Stats

`/track` · `/threat` · `/visitor` · `/v3/realtime_stats`

---

## Two things that will surprise you

1. **Free scripts need an account.** `anonymous → artifact` would make "no
   public artifact endpoint" false for the free tier, so keyless scripts
   require a free login. This is D1 in `docs/DECISIONS.md` and it is the
   decision most likely to annoy you.

2. **Visibility is server-side now.** "Private" used to be a label in one
   browser's localStorage. It is enforced at the gate. If you change it, the
   dashboard pushes it to the worker; if that push fails you are told, because a
   silently-failed visibility change is the bug this replaced.

---

## Verifying the deployment

```bash
npm test              # full suite, including the security gates
npm run test:gates    # just the gate harness
```

The gate harness is the measuring instrument, and it asserts *desired*
behaviour rather than current behaviour:

```
SECURITY GATES   closed 21/21   holes confirmed 0   deferred 1
```

A non-zero exit means a closed gate regressed. `holes confirmed 0` means every
property the suite knows how to test is actually held. Read the number as work
remaining, not as a score.
