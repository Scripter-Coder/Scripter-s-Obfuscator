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

```powershell
py "Storage Keeper/run.py"
```

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
than just be *stored* there, something has to bridge that gap. **This is not done yet and
I have not deployed anything.**

The options, in the order I'd pick them:

1. **cloudflared tunnel** (recommended) — `cloudflared tunnel --url http://127.0.0.1:8787`
   gives a public HTTPS URL. Point `SH_STORE_URL` at it. The worker keeps every gate and
   only fetches bytes through the tunnel. Requires leaving cloudflared running.
2. **Don't bridge it.** Store on the PC as the canonical copy, keep KV as the delivery
   cache. Safe, but KV usage doesn't drop, so it doesn't meet the storage goal.
3. **Port-forward your PC.** Works, but exposes your machine directly. Not recommended.

Until one of those is done, the PC holds the bytes and Cloudflare still serves them —
which is a backup, not the goal.

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
| `storage_keeper/config.py` | env config, the one refusal body |
| `storage_keeper/ids.py` | id grammar, kinds |
| `storage_keeper/store.py` | SQLite index + files, expiry, cleanup |
| `storage_keeper/app.py` | HTTP service |
| `migrate.py` | existing-script migration |
| `status.html` | owner dashboard with countdown bars |
| `tests/` | 63 tests |
| `data/` | your actual storage — gitignored, never commit |