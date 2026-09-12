# Storage Keeper — 10 GB per-script uploads (GitHub-backed)

Cloudflare KV caps scripts at ~50 MB (25 MB per KV value). **Storage
Keeper** lifts that to **~10 GB per script** by storing the parts in
your **private** GitHub repository:

```
https://github.com/Scripter-Coder/Storage-Keeper-1
```

Executors never talk to GitHub — the Cloudflare worker proxies every
part (`/sh/g/<id>/<i>`), so the repo stays private and your token never
leaves the worker. The parts are the same obfuscated/encrypted
ciphertext as normal scripts: GitHub never sees plaintext.

## How it works

```
owner's browser ──POST /sh/gh-put (40MB part)──▶ worker ──▶ GitHub repo
owner's browser ──POST /sh/gh-finalize────────▶ worker: register loader

executor ──loadstring /sh/<id>──▶ worker: parts bootstrap (tiny)
executor ──GET /sh/g/<id>/<i>───▶ worker ──▶ GitHub ──▶ stitched in
                                       memory ──▶ decrypt ──▶ run
```

- Scripts ≤ ~45 MB: unchanged single-request KV path (fast)
- Scripts > ~45 MB: automatic Storage Keeper path (256 × 40 MB parts max
  = **10 GB hard ceiling per script**)
- Plan limits are enforced **before** upload: *"Not enough storage space
  on your plan (X used, limit Y). Remove some stuff or upgrade to a
  better plan!"*

## One-time setup (5 minutes)

1. **Create a GitHub fine-grained PAT** (keep it secret):
   - github.com → Settings → Developer settings → Fine-grained tokens →
     Generate new token
   - Repository access: **Only select repositories** →
     `Scripter-Coder/Storage-Keeper-1`
   - Permissions: **Contents → Read and write** (nothing else)
   - Copy the token (`github_pat_...`)

2. **Add the secrets to your Cloudflare worker** (scripterhub-stats →
   Settings → Variables and Secrets → Add):

   | Type   | Name         | Value                                    |
   |--------|--------------|------------------------------------------|
   | Secret | `SH_GH_TOKEN`| `github_pat_...` (the token from step 1) |
   | Text   | `SH_GH_REPO` | `Scripter-Coder/Storage-Keeper-1`        |

3. **Re-deploy the worker** (paste the updated `For Cloudflare/worker.js`)
   and make sure the repo has at least one commit (e.g. add a README via
   the GitHub web UI) so the `main` branch exists.

4. **Verify**: open `status.html` below (or call `/sh/gh-status`) —
   it must say `configured: true`.

## Files

- `status.html` — owner dashboard page: checks the worker config, shows
  stored scripts, total bytes, largest script, and the part ceiling.
  Open it locally or host it anywhere; it only talks to your worker.

## Endpoints (all owner-gated except the executor proxy)

| Endpoint            | Method | What it does                                  |
|---------------------|--------|-----------------------------------------------|
| `/sh/gh-put`        | POST   | Upload one 40 MB part (`{ id, part, content }`) |
| `/sh/gh-finalize`   | POST   | Commit + register the loader (makes `/sh/<id>` live) |
| `/sh/gh-delete`     | POST   | Delete a script's parts + loader meta        |
| `/sh/gh-status`     | POST   | Usage summary (scripts, bytes, limits)       |
| `/sh/g/<id>/<i>`    | GET    | **Executor-only** part proxy (browsers → 405) |

## Limits (GitHub, free tier)

| Limit                        | Amount                              |
|------------------------------|--------------------------------------|
| Single file via API          | 100 MB (we use 40 MB parts → safe)  |
| Per-script ceiling           | 256 parts × 40 MB = **~10 GB**      |
| Whole storage repo           | keep total under ~10 GB (soft guide) |
| Browser upload (web UI)      | 25 MB — irrelevant, API is used      |

If a user truly needs > 10 GB in one script, split it into modules —
no platform can serve that as a single Roblox loadstring anyway
(executor memory is the real bottleneck long before ours).
