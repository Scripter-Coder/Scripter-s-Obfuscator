# Storage Keeper — your PC as ScripterHub's storage

Generated scripts are stored on **your Windows PC**, not in Cloudflare KV. Cloudflare
keeps only the metadata the website needs (id, name, visibility, who owns it); the
obfuscated bytes live in `Storage Keeper/data/scripts/`.

```
browser ──POST /sh/upload──▶ Cloudflare worker ──PUT /v1/objects/<id>──▶ this PC
                                                                       (Python)
executor ──/sh/<id>───────▶ Cloudflare worker ──GET /v1/objects/<id>──▶ this PC
```

The worker stays the only thing an executor ever talks to. All license gates, HWID
locks, killswitches and session grants keep working exactly as before — only the bytes
move. **Nothing about the obfuscator changed.**

## Starting it

Loopback only — good for testing, useless for delivery, since nothing outside your PC can
reach `127.0.0.1`.

```powershell
py "Storage Keeper/run.py"
```

For real use, put it behind a tunnel instead — see
[The part that needs a decision from you](#the-part-that-needs-a-decision-from-you).

It prints the URL it bound to. If `SH_STORE_TOKEN` is unset it generates one and shows
it once — set it yourself so it survives a restart:

```powershell
$env:SH_STORE_TOKEN = "pick-something-long"
$env:SH_STORE_PORT  = 8787
py "Storage Keeper/run.py"
```

| Variable | Default | Meaning |
|---|---|---|
| `SH_STORE_TOKEN` | generated | bearer token for every request |
| `SH_STORE_ROOT` | `./Storage Keeper/data` | where files live |
| `SH_STORE_HOST` | `127.0.0.1` | bind address |
| `SH_STORE_PORT` | `8787` | bind port |
| `SH_STORE_MAX_OBJECT_BYTES` | 64 MiB | per-object ceiling |
| `SH_STORE_CLEANUP_SECONDS` | `300` | sweep interval |

Stdlib only — no pip install, no dependencies.

## What actually got bigger

Worth being precise, because "100 GB free" and "bigger scripts" are two different
things and only the first one is unlimited.

**Total capacity is now your disk.** KV has a namespace ceiling as well as a per-value
one; that ceiling is gone. Publish as many scripts as your drive holds and the only
thing that ever runs out is space you actually own.

**Per-script size is NOT your disk.** It is 64 MiB by default
(`SH_STORE_MAX_OBJECT_BYTES`), and raising it costs RAM, not storage — the service
buffers a whole object in memory on the way in and again on the way out. The real
ceiling on any single script is whichever runs out first:

- the service's RAM while buffering a 500 MB object (plus the worker holding the same
  text as a JS string on the other end, and Cloudflare's own per-request limits);
- your patience tuning all three.

The old KV ceiling was ~50 MB/script (20 chunks × ~25 MB). So the honest summary is
that the per-script number moved from 50 MB to 64 MB and is now *yours to set* — the
unbounded part was always aggregate capacity, and that part is fixed. Raising the cap
for genuinely huge scripts is an env var and nothing else, but a script big enough to
need it was probably better split up.

## Turning it on in the worker

Two variables, nothing else:

| Type | Name | Value |
|---|---|---|
| Text | `SH_STORE_URL` | `http://127.0.0.1:8787` |
| Secret | `SH_STORE_TOKEN` | the same token the service is using |

**If they are not set, the worker behaves exactly as it did before** — bytes go to KV.
That is deliberate: the change is opt-in, so a misconfigured deployment degrades to the
old behaviour rather than to a broken website.

### The part that needs a decision from you

Executors run on your friends' phones and PCs. They cannot reach your PC — it's behind
your router with no public IP. So for scripts to actually *deliver from* your PC rather
than just be *stored* there, something has to bridge that gap. `tunnel.py` is that
bridge:

```powershell
py "Storage Keeper/tunnel.py"
```

It starts the service, starts `cloudflared` pointed at it, **verifies `/v1/health`
through the public address**, and only then prints the URL and token to paste into the
worker. Both processes must stay running for delivery to work.

**cloudflared is not installed on this machine yet**, and `winget` is unavailable, so
this has not been run end to end. Install it first:

```
# from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# put cloudflared-windows-amd64.exe somewhere on PATH
```

Then choose a mode:

| Mode | Command | Address | Trade-off |
|---|---|---|---|
| quick (default) | `py "Storage Keeper/tunnel.py"` | random `*.trycloudflare.com` | Proves the path works. **Changes on every restart.** |
| named | see below | a hostname you choose | Stable. Needs a domain in your Cloudflare account. |

The quick-mode address is random, which is a trap worth knowing about: after a reboot
the worker is holding a URL that no longer exists, and **every script fails at once**
while the service still looks perfectly healthy on disk. `tunnel.py` prints that warning
every time for exactly this reason. For anything you depend on, use a named tunnel:

```powershell
cloudflared tunnel login
cloudflared tunnel create scripterhub-keeper
cloudflared tunnel route dns scripterhub-keeper keeper.YOUR-DOMAIN
py "Storage Keeper/tunnel.py" --mode named --name scripterhub-keeper --hostname keeper.YOUR-DOMAIN
```

The token is persisted to `data/token.txt` and reused across restarts. Generating a fresh
one per run would be the obvious simplification and it is a trap: the worker holds one
copy, so a restart would lock the service out of its own worker.

The other option is to not bridge it at all — keep the PC as the canonical copy and KV as
the delivery cache. That is safe, but KV usage doesn't drop, so it doesn't meet the
storage goal.

## Expiry

**Creating a script sets no timer.** That was your instruction, and it is the right
default: publishing something should not silently start a clock on it.

What still applies:

- If you *do* set an expiry, it is honoured — clamped to one year.
- **One year maximum, always**, as a safety net, measured from when the script was
  *first* published. Re-publishing an existing script does **not** push it back.
- When a script expires, its file is **deleted from disk**. Not hidden — deleted.

The countdown in `status.html` is a display. It cannot make anything live. Expiry is
decided by the service on every read, from the file it actually holds.

## Missing or expired

Both produce exactly one response: `SHERR gone`, HTTP 404. The loader turns that into:

```
Script cannot be loaded, doesnt exist or expired.
```

Missing and expired are **byte-for-byte identical** on purpose. If they differed, the
endpoint would be a probe for which script ids have ever existed.

## Security

- **No filesystem path exists in the API.** The only thing a caller names is a script
  id, validated against `^ScripterHub[0-9]{6,16}$` — the same grammar the worker
  enforces. There is no parameter that could be a path.
- **Nothing internal is ever returned.** No paths, no Python errors, no stack traces,
  no SQL, no directory listings. Errors are logged server-side; clients get a fixed body.
- **Every request needs the bearer token**, compared with `hmac.compare_digest`.
  `/v1/health` is open and returns only `{"ok":true}`.
- **Binds to loopback by default**, and warns if you bind it wider.

The path-escape defence is a containment check at the one place an id becomes a path —
`Store._path_for` — rather than an argument that the regex is sufficient.

## Migrating existing scripts

Read-only by default. Nothing is deleted from the old location unless you ask.

```powershell
# 1. See what would happen. Writes nothing.
py "Storage Keeper/migrate.py" --source kv-export.json

# 2. Do it. Source is still retained.
py "Storage Keeper/migrate.py" --source kv-export.json

# 3. Only once you have confirmed the scripts load. This deletes from the source.
py "Storage Keeper/migrate.py" --source kv-export.json --remove-source
```

Each script is written, **read back, and SHA-256 verified** before its source becomes
eligible for removal. Re-running resumes rather than restarting, and every decision is
printed with a summary at the end.

Existing scripts keep working without migrating: their `storage_backend` stays `'kv'`
(see `migrations/0002_script_lifetime.sql`), and **no row is ever deleted**.

## Tests

```powershell
npm run test:keeper
```

63 Python tests and 30 integration tests. The integration test boots a **real Python
process** and runs the **real worker** against it — it is the only test that would fail if
the storage service were broken.

Covered: creation, loading, expiry, deletion, missing scripts, concurrent requests,
concurrent expiry, concurrent deletes, re-upload, path traversal, token auth, and that
nothing internal leaks.

## Files

| Path | What |
|---|---|
| `run.py` | entrypoint |
| `tunnel.py` | runs the service behind a Cloudflare Tunnel, so executors can reach it |
| `storage_keeper/config.py` | env config, the one refusal body |
| `storage_keeper/ids.py` | id grammar, kinds |
| `storage_keeper/store.py` | SQLite index + files, expiry, cleanup |
| `storage_keeper/app.py` | HTTP service |
| `migrate.py` | existing-script migration |
| `status.html` | owner dashboard with countdown bars |
| `tests/` | 63 tests |
| `data/` | your actual storage — gitignored, never commit |