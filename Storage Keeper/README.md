# Storage Keeper — your PC as ScripterHub's storage

Generated scripts are stored on **your Windows PC**, not in Cloudflare KV. Cloudflare
keeps only the metadata the website needs (id, name, visibility, who owns it); the
obfuscated bytes live in `Storage Keeper/data/scripts/`.

```
browser ──POST /sh/upload───────▶ worker ──PUT /v1/objects/<id>──▶ this PC
browser ──POST /sh/kb-put ×N────▶ worker ──PUT /v1/objects/<id>──▶ this PC
                                                    (kind=part0…part255)
executor ──/sh/<id>────────────▶ worker ──GET /v1/objects/<id>──▶ this PC
executor ──/sh/kb/<id>/<i>─────▶ worker ──GET /v1/objects/<id>──▶ this PC
```

The worker stays the only thing an executor ever talks to. All license gates, HWID
locks, killswitches and session grants keep working exactly as before — only the bytes
move. **Nothing about the obfuscator changed.**

### Large scripts are parts, and they live here too

A script over ~45 MB is uploaded as a sequence of 40 MB parts (`kind=part0`, `part1`, …
up to `part255`) rather than one object, and delivered as a forward-only chain — the
loader fetches them one at a time behind the gate's grant. It is the same mechanism the
old GitHub backend used, with the repository swapped for this service. Up to 256 parts,
so roughly **10 GB for one script**.

**Nothing is written to a GitHub repository any more.** `/sh/gh-put` and
`/sh/gh-finalize` answer `410 Gone` — and still answer `401` to an unauthenticated
caller first, so the endpoint does not advertise itself to strangers. The *read* path
`/sh/g/<id>/<i>` deliberately stays: scripts published before the retirement are running
on people's machines right now, and removing it would orphan them.

## Running it without babysitting it

Obfuscation runs entirely in the browser and has never needed the tunnel. What needs the
tunnel is **publishing and delivery** — the worker moves script bytes onto this PC through
it. Because a quick tunnel hands out a **random address on every start**, restarting by
hand leaves the worker pointing at an address that no longer exists. That happened four
times.

One command does the whole sequence — start it, wait for it, point the worker at it:

```cmd
keeper-autostart.cmd
```

Registered as a **Scheduled Task** (`ScripterHub-Keeper-AutoStart`) that runs at every
logon, so after a reboot there is nothing to do by hand. Re-running is safe: a tunnel that
is already live is reused rather than starting a second one over it.

| Flag | Effect |
|---|---|
| `--skip-deploy` | start the tunnel, leave the worker alone |
| `--force-restart` | start a fresh tunnel even if one is live |
| `--timeout 300` | wait longer for the tunnel to answer |

### Why it waits before deploying

A fresh `*.trycloudflare.com` hostname takes roughly **30–60 s** to resolve from a resolver
that has not seen it. Measured during development: the service answered on `127.0.0.1`,
cloudflared reported `readyConnections: 1`, and every external fetch still failed — then all
of it worked seconds later with neither process changed.

So the launcher **waits until the public address actually answers**, and only then
deploys. Deploying first is how a dead address ships, and the symptom only shows later as
a `502` on publish with a service that looks perfectly healthy.

For manual work, `py "Storage Keeper/run.py"` serves on loopback only — fine for testing,
useless for delivery.

### Still the weak link

The autostart handles the changing address for you, but a **named tunnel** removes it
entirely. That needs a domain in your Cloudflare account.

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

79 Python tests and 41 integration tests. The integration test boots a **real Python
process** and runs the **real worker** against it — it is the only test that would fail if
the storage service were broken.

Covered: creation, loading, expiry, deletion, missing scripts, concurrent requests,
concurrent expiry, concurrent deletes, re-upload, path traversal, token auth, and that
nothing internal leaks.

Plus, for the parts path specifically: parts round-trip without disturbing the artifact,
out-of-range and path-shaped kinds are refused, a part expires on its own clock, deleting
a script reclaims every part **off disk**, concurrent parts all land, finalize refuses a
part count the service cannot back, the chain points at `/sh/kb/` and not at the retired
GitHub route, and a browser User-Agent cannot fetch a part.

The legacy GitHub read path has its own suite (`ghstorage.test.mjs`) that seeds an
already-published script and drives the real gated chain — including running a 30 MB
stitched artifact through Lua — so retiring the upload half cannot silently break
delivery for scripts already in the wild.

## Files

| Path | What |
|---|---|
| `run.py` | entrypoint |
| `tunnel.py` | runs the service behind a Cloudflare Tunnel, so executors can reach it |
| `storage_keeper/config.py` | env config, the one refusal body |
| `storage_keeper/ids.py` | id grammar, kinds (including `part0..part255`) |
| `storage_keeper/store.py` | SQLite index + files, expiry, cleanup |
| `storage_keeper/app.py` | HTTP service |
| `migrate.py` | existing-script migration |
| `status.html` | owner dashboard with countdown bars |
| `tests/` | 79 tests |
| `data/` | your actual storage — gitignored, never commit |