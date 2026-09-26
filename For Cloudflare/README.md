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
        |
        |  the key line is handed to the artifact in a genv slot, so the
        |  obfuscated file makes no second HTTP request
        v
   (large only) GET /sh/c/<id>/<i>?g=&s=   or   /sh/g/<id>/<i>?g=&s=
        one atomic forward step per part; no skip, no replay
```

### Optional hardening

| Variable | Effect | Default |
|---|---|---|
| `SH_ARTIFACT_KEK` | AES-GCM at rest over artifact blobs in KV | off |
| `SH_LEGACY_SPLIT_KEY` | Re-open the old `/sh/k` shape for already-published files | **off** |

`SH_ARTIFACT_KEK` is opt-in and marker-prefixed (`SHKEK1:`), so it can be
turned on for new uploads without touching existing ones, and removing it later
cannot make an existing artifact unreadable. **A marked value with no KEK is
refused, never passed through** — see D18.

`SH_LEGACY_SPLIT_KEY` exists for one deploy only. Off means a hard cutover,
which breaks every require-key script published before Phase 3. On keeps them
working while you migrate, and re-opens token replay, token expiry and offline
token forgery. Bans, expiry and the kill switch keep working either way. See
G23.

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

   > **Note on the KV id.** `wrangler deploy --dry-run` lists
   > `env.LOADERS_KV` even while the `id` line is commented out. A clean
   > dry-run is therefore **not** evidence that KV is configured. Put the real
   > id in before the real deploy.

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

## Deploying without the CLI — the single-file bundle

`wrangler deploy` is the supported path and should be the one you use. This
section exists for the case where you cannot or will not run the CLI, and you
have to paste the worker into the Cloudflare dashboard instead.

### Why the source cannot be pasted

`For Cloudflare/worker.js` imports three sibling modules:

```js
import { createState, run as d1run } from '../server/d1_state.js';
import { deliver, ... }                  from '../server/delivery.js';
import { encryptAtRest, ... }            from '../server/artifact_crypto.js';
```

**The dashboard editor has no filesystem.** It evaluates one pasted string, so a
relative import cannot resolve there — ever. The error is:

```
Uncaught TypeError: Invalid module specifier "../server/d1_state.js".
                    imported from "worker.js".
```

That is not a setting you can change in the dashboard.

> If your editor shows `Cannot find module '../server/d1_state.js'. Did you
> mean to set the 'moduleResolution' option to 'nodenext'...` on those lines,
> that is a **different and harmless** thing: a language-server diagnostic, not
> a runtime error. The repo now has a `jsconfig.json` with
> `moduleResolution: "bundler"`, which clears it. It does **not** make
> dashboard paste work.

### Build it

```bash
npm run build:worker
```

Produces two files:

| File | Size | Use |
|---|---|---|
| `dist/worker.single.js` | ~265 KiB | same code, comments and section headers kept |
| `dist/worker.single.min.js` | ~146 KiB | full-line comments removed — **paste this one** |

The bundler inlines `server/d1_state.js`, `server/artifact_crypto.js`,
`server/delivery.js` and then the worker, in dependency order, and collapses
`import`/`export` into plain declarations. Top-level name collisions across
those four files are a **hard error**, never a silent last-one-wins.

### Paste it

1. Cloudflare dashboard → your worker → **Edit code** / **Code** tab.
2. Select everything, delete it.
3. Open `dist/worker.single.min.js`, copy **the whole file**, paste.
4. **Deploy**.

### Do not skip the test

```bash
npm test
```

The last suite is `tools/single_file_bundle_test.mjs` (13 checks). It is not
ceremony — it exists because this bundler already shipped one real defect:

> The first version recorded the import alias `run as d1run` as a **comment**
> instead of a declaration. The output was 265 KiB of clean, plausible,
> syntactically valid JavaScript that referenced a name nothing declared.
> `node --check` passed, because it validates syntax and not unresolved
> references. Every source-level test passed, because none of them read
> `dist/`. It was caught only by importing the bundle and running the gate and
> benchmark suites against it, which is what B7 does.

Two of its checks are the ones that will save you:

- **B1 — the bundle is not stale.** A bundle that works but is out of date is
  worse than no bundle, because it looks authoritative. If you change the
  worker and forget to rebuild, B1 fails. Run `npm run build:worker`.
- **B2 — no raw control bytes.** This is the bug that made `worker.js`
  itself uncopyable: a literal `0x00` sat inside a string literal where the
  source should have read the escape `\0`. It was semantically identical to
  JavaScript, so **every test passed** — but a raw control byte terminates a
  clipboard selection, so copying the file stopped dead at line 540 and the
  paste arrived truncated to ~500 lines. That looked exactly like an editor
  size limit and sent us hunting for the wrong cause. The same check now runs
  against the artifacts you paste.

### Verify the deployment, not just the paste

```bash
curl https://<your-worker>/sh/health
```

Then confirm the cron trigger survived. Dashboard paste does **not** carry
`wrangler.toml`, so the `17 * * * *` schedule (D19) is configured in the
dashboard under **Triggers → Cron Triggers**. Without it nothing sweeps
expired sessions and the table only grows.

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
npm test                # full suite, including the gates and the benchmark
npm run test:gates      # the gate harness
npm run bench:attacker  # the attacker benchmark
```

`tools/security_gates_test.mjs` is the measuring instrument, and it asserts
*desired* behaviour rather than current behaviour:

```
SECURITY GATES   closed 23/23   holes confirmed 0   deferred 0
```

A non-zero exit means a closed gate regressed. `holes confirmed 0` means every
property the suite knows how to test is actually held. Read the number as work
remaining, not as a score.

`tools/attacker_benchmark.mjs` runs the attacker's toolkit against the real
worker and prints a table — 18 blocked, plus 4 rows deliberately marked
**accepted** because those attacks *do* work. Read the accepted ones first:
an authorised client still receives every byte, so the real cost of getting
your script is capturing a run and devirtualising it. That is the VM layer, and
no amount of session gating changes it.

### Housekeeping

A cron trigger (`17 * * * *`) sweeps expired sessions, orphaned nonces, stale
rate-limit windows and audit rows past 30 days. `GET /sh/health` returns row
counts, so you can see growth before it becomes a problem. Nothing in a user's
run depends on the sweeper having run.
