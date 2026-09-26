# Architecture decisions

Record of decisions that were open, and why they were settled. Anything here
that later turns out to be wrong should be changed here first, with a reason.

Phases 0, 1a–1f and 2a were committed before Phase 3. Phase 3 is the phase that
actually wired the state layer into the worker, and it is where most of the
remaining decisions live.

---

## D1 — Keyless / free scripts require an account

**Decision: option B.** A free script is fetched as:

```
FREE SCRIPT
   ↓
free account            (signup already exists, already flood-guarded)
   ↓
short-lived session
   ↓
artifact
```

Not `anonymous → artifact`.

**Why.** Option A means an anonymous request can still obtain an artifact, so
for that tier the "no public artifact endpoint" property is false and Defense 1
does not hold. Option B keeps *every* artifact behind an identity and a session
boundary, including the free tier, while preserving a free product. Signup is
self-service and already limited, so the friction is a one-time account.

**Consequence, now live.** `/sh/<id>` cannot serve an artifact to an anonymous
client, so "free = anyone can run" no longer holds. An anonymous `/sh/session`
for a keyless script returns `SHERR hidden`. This is asserted by G02, and it is
the decision in this file most likely to surprise a user.

**Rejected.** Option C (anonymous + rate limits + watermark) — still an
unauthenticated artifact fetch.

---

## D2 — PBKDF2, not Argon2id

**Decision: PBKDF2-HMAC-SHA256 at 210k iterations**, via
`crypto.subtle.deriveBits`, plus an optional server-side pepper.

**Why.** Cloudflare Workers has no native Argon2id and no scrypt in WebCrypto.
Adding a WASM KDF is a supply-chain decision (new dependency, new build step,
new audit surface) and should not be made silently inside a security fix.
PBKDF2 at a high iteration count is the defensible choice on this runtime, and
it is a single-function swap if Argon2id is added later.

**Revisit if** Argon2id becomes available natively, or if a WASM dependency is
accepted.

---

## D3 — D1 for atomic state, KV for artifacts

**Decision.** D1 owns anything with a lifecycle or a uniqueness requirement:
sessions, nonces, revocations, rate limits, audit log, build versions.
KV keeps only large immutable values addressed by key — the artifact store.

**Why.** KV is eventually consistent with no atomic compare-and-swap, so it
structurally cannot implement one-time nonce consumption, rate-limit
increments, or a single-step validate-and-consume. Those three are the core
of session-gated delivery. A read-then-write on KV has a TOCTOU window in which
two concurrent requests both pass the check.

**Phase 3 nuance — dual store, on purpose.** Licenses and script metadata are
still *written* to KV because that is where the dashboard reads them, and
rewriting every panel is a far larger change than the gate is. But the gate
*reads* D1. Every mutation flows through `saveLicenses()` / `mirrorScript()`,
which write both; `loadLicenses()` reconciles on read so drift heals on the
next owner action. The split is a migration convenience, not a security
decision: KV is simply not trusted for an authorization decision, because a ban
written to it can take tens of seconds to become visible on another edge, and
"the ban is on its way" is not a security property.

---

## D4 — The session row is the authority for single-use

**Decision.** One session = one delivery = one nonce. Consumption is a
**single UPDATE with every precondition in the `WHERE` clause**, and success is
defined by `changes() === 1`.

```sql
UPDATE sessions SET consumed_at = ?
 WHERE sid = ? AND consumed_at IS NULL
   AND expires_at > ? AND revoked = 0
   AND (license_key IS NULL OR EXISTS (
         SELECT 1 FROM licenses l
          WHERE l.key = sessions.license_key
            AND l.revoked_at IS NULL
            AND (l.expires_at IS NULL OR l.expires_at > ?)
            AND (l.hwid IS NULL OR l.hwid = sessions.hwid)))
   AND (user_id IS NULL OR EXISTS (
         SELECT 1 FROM users u
          WHERE u.id = sessions.user_id AND u.disabled = 0))
```

**Why.** A single conditional `UPDATE` is atomic on its own. There is no
read-then-write window, so there is no TOCTOU hole, and it needs no explicit
transaction — which matters because it behaves identically on D1, on a local
SQLite replica in tests, and on any future backend.

**The `nonces` table is an audit trail, not the authority.** It records when
each issued nonce was consumed so a replay attempt is forensically visible.
The authoritative single-use check is the `sessions` UPDATE. Keeping the
authority in one statement is what makes the concurrency property provable; a
second source of truth that could disagree with the first would undermine it.

**Consequence for "one artifact per session".** A session is therefore *one
fetch*, not a reusable bearer for the remainder of its TTL. Reading it the other
way — a spent nonce but a live session — would leave the session id usable
repeatedly, which is the permissive reading and a real hole.

---

## D5 — Two token types, not one token in two transports

**Decision.** `request()` (header-capable) and `HttpGet` (URL only) get
**different lifetimes** off the same session.

| Transport | Credential | TTL | Binding |
|---|---|---|---|
| `request()` | `Authorization`-capable POST/GET, `X-SH-Transport: header` | 45s | session + nonce + script + hwid |
| `HttpGet` | same session, credential in the URL query | 15s | one script + one use + session |

**Why.** `game:HttpGet` cannot set headers, so a credential must ride in the
URL on that path. If the same bearer works in both, the URL path inherits the
header path's TTL and the weak path is not actually weaker. The URL token is
derived server-side per request and is never the session id itself — otherwise
a logged URL equals a session.

**Residual risk, accepted and documented.** URL-borne credentials can reach
access logs on the fallback path. Short TTL + single use + script scoping
mitigate; they do not eliminate it. The URL path is also counted separately in
telemetry so its share of traffic is visible.

---

## D6 — No permanent artifact URL is achievable; do not claim it

**Decision: restate the goal.** The loader URL is public and permanent. What
changes is that it is *useless* without a live, single-use, server-verified
session.

**Why.** A URL that is public and long-lived is a fact of the design; the
honest, provable property is that it carries no authorization value on its own.
Claiming a non-existent property would be a documentation bug that turns into
a false assurance later.

**Now enforced.** `/sh/<id>` returns a bootstrap containing no ciphertext, no
key, no split key, and nothing derived from the artifact. It is identical for
every script except the id and the base URL, so inspecting it teaches an
attacker nothing about any artifact. Asserted by G01.

---

## D7 — Rate limits ship in-memory first, then move to D1

**Decision.** Phase 1 limits were in-memory (route + identity keyed). Phase 3
moved them to the D1 `rate_limits` table where the increment is an atomic
upsert, via `guardRate()`.

**Why.** In-memory needed no new binding, so it could ship before D1 existed,
and it was a large improvement over no limit for the brute-force case. It was
**not** durable: Cloudflare recycles isolates, so the counter reset by garbage
collection rather than by the clock, and a distributed attacker got a fresh
budget.

**Now:** `guardRate()` prefers D1 and falls back to the in-memory bucket on a
D1 error — falling back rather than allowing, because a D1 hiccup must not
become an open door. G14 is closed and is measured on both paths.

---

## D8 — Test doubles use real SQLite, not a mock

**Decision.** The D1 layer is exercised against Node's built-in `node:sqlite`
with the actual `migrations/0001_init.sql` applied, behind a thin adapter that
presents D1's `prepare().bind().first()/run()/all()` API.

**Why.** D1 *is* SQLite. A hand-rolled mock would encode my assumptions about
what `changes()` returns and whether an upsert is atomic — precisely the things
this work is supposed to verify. Using the real engine means the triggers,
the `UNIQUE` constraints and the conditional-update semantics under test are
the actual ones, not a reimplementation that could agree with a broken design.

**Cost of getting this wrong, twice.** The adapter silently dropped bound
parameters on `node:sqlite` (it has no `.bind`), writing NULL columns without
throwing. It was caught only because tests assert on the values actually
stored. Consequently `d1_state.js` now exports its `run` / `all` / `one`
helpers so no caller can write a parameterised statement without going through
the engine-normalising path.

---

## D9 — The gate FAILS CLOSED when D1 is absent

**Decision.** If the state layer is unavailable, `/sh/session`, `/sh/a`, `/sh/k`,
`/sh/c/*` and `/sh/g/*` all refuse. There is no KV fallback.

**Why.** This is the one place the design deliberately has no graceful
degradation. The Phase 2 notes specified a fallback "so the code could ship
before the database existed", and that constraint is now gone: `wrangler.toml`
step 2 creates the database and step 3 applies the schema, both before the
first deploy.

With the constraint gone, a fallback here would be strictly *worse* than
failing: it would restore every property Phase 3 exists to remove — replay,
expiry, ban-at-delivery, single-use — with no error anywhere, while the
operator believed the system was gated. A loud 503 plus a log line is more
useful than a silent hole.

**Pinned by G21**, which is the most important negative test in the suite. It
is also why every other gate supplies a database: without one they would be
measuring the absence of D1 rather than the property they claim to test.

---

## D10 — Nonces are spent unconditionally, with no expiry predicate

**Decision.** `consumeNonce()` is
`UPDATE nonces SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL RETURNING ...`.
No `expires_at` check.

**Why.** The first version was `DELETE ... WHERE nonce = ? AND expires_at > ?`,
and it had a subtle resurrection property: a session presented *after* its TTL
would fail the predicate and therefore leave a **fully unconsumed nonce** in
the table. A later attempt whose clock read slightly earlier — a skewed client
clock, a retry through a different edge, a captured response replayed later —
would find the pair still good. An expired credential that can be revived is
not expired.

Spending the nonce unconditionally makes the failure direction safe: once a
pair has been presented it is dead, whether or not the attempt succeeded. The
session's own `expires_at` still enforces the TTL in `consumeSession()`, so
nothing is authorised by the change.

**Also changed: UPDATE, not DELETE.** The table is the audit trail (D4), so
spending a nonce must leave the evidence behind. A DELETE is equally atomic and
was the original implementation, but it made "was this nonce ever spent, and
when?" unanswerable. The `consumed_at` column already existed in the schema and
was unused; it is now load-bearing.

---

## D11 — Multi-part delivery is a forward-only chain, not a bearer grant

**Decision.** Large artifacts (>2MB, KV-chunked or Storage Keeper) are delivered
as a *chain*: the session row carries `parts_total` / `parts_served`, and each
part is one atomic forward step.

```sql
UPDATE sessions SET parts_served = parts_served + 1
 WHERE sid = ? AND parts_served = ? AND parts_total = ?
   AND consumed_at IS NOT NULL AND revoked = 0
   AND grant_expires_at IS NOT NULL AND grant_expires_at > ?
```

The `parts_served = ?` predicate must **equal** the requested index, so a
captured part-7 request succeeds once and never again, and a caller cannot skip
ahead. There is no read-then-write between "which part is next" and "this part
is served" because they are the same comparison in the same statement.

**Why not a bearer grant.** The obvious design is a token that unlocks all N
parts until it expires. That is a session with extra steps: whoever captures it
walks the whole artifact, and 60 seconds is a long time to exfiltrate 10GB.

**What this does NOT buy, stated plainly.** A legitimate client still receives
every byte, and someone watching an authorized run can reconstruct the
artifact. The chain makes a capture non-replayable, non-parallelisable and
non-resumable, and leaves a per-part audit trail. It is a work-factor and
blast-radius reduction, not a proof.

**Ordering.** The chain can only be opened on a session that has *already* been
consumed by `deliver()` (`consumed_at IS NOT NULL` in the guard). The chain is
a continuation of a delivery, never an alternative to one.

---

## D12 — Artifact bytes leave the worker through exactly one function

**Decision.** `deliver()` in `server/delivery.js` is the only path to artifact
bytes. `/sh/<id>` contains no artifact at all; `/sh/c/*` and `/sh/g/*` require
a grant that only `deliver()` can produce.

**Why.** Making "no artifact without a credential" a *structural* property
rather than a promise is the entire point of the phase. There is one exit from
the delivery path, and it is behind two atomic statements. A future route that
reads `sh_loader_*` directly would be visible as a code smell in review, rather
than as a silent hole.

---

## D13 — `licenses.script_id` is informational, with no foreign key

**Decision.** The column is nullable, carries no FK and no `ON DELETE CASCADE`,
and is not consulted by `consumeSession()`.

**Why.** The obvious shape is `script_id TEXT NOT NULL REFERENCES scripts(id)`,
and the first schema had exactly that. It does not fit the data: in the
dashboard a license is created against an internal project-script id like
`script_1737000000000`, or against the literal `"all"` meaning "valid for every
script this owner publishes". Neither is a `ScripterHub##########` loader id.

An earlier implementation of `syncLicensesToD1()` therefore filtered on that
shape, matched **nothing**, dropped every real license, left D1 empty, and made
the gate refuse every licensed delivery in production — while the test suite
passed, because the tests seeded licenses with a loader id that the product
never produces.

A license is a credential, not a property of one script. The license→loader
binding the gate actually needs lives on `sessions.script_id`, recorded at mint
time on the one row that is genuinely about a delivery. Deleting a dashboard
script must not delete a license people are still paying for.

---

## D14 — `visibility` moved from localStorage to the server

**Decision.** Added `POST /sh/visibility`, and `visibility` is now sent on
upload. The dashboard keeps a local copy as a cache, but the server is the
authority.

**Why.** `visibility` existed only in the browser's localStorage. The worker
never heard about it, so "Private" and "Anyone" produced byte-identical loader
URLs with byte-identical responses. No amount of gating in the delivery route
can fix a policy the server has never been told — that is gate G10.

A separate endpoint rather than a re-upload, because re-uploading would need
the artifact, and the artifact is deliberately not in the dashboard's hands.

**'friends' degrades to 'account'.** There is no friends graph on the worker to
authorise against, and defaulting to `'anyone'` would silently turn a
restricted script into an unrestricted one.

---

## D15 — The browser "view the source" feature is removed, not deprecated

**Decision.** The HTML key page (ciphertext + a working JS decryptor) is gone.
`/sh/<id>` returns a metadata page for browsers.

**Why.** The page embedded the ciphertext, so a visitor could read the script by
typing the Special Key. That is gate G03. There is no hardening that preserves
it, because the property that made it useful — the ciphertext is on the wire —
is exactly the property that made it a hole.

**This is a real feature removal.** "View my script's source in a browser by
typing the Special Key" no longer works, because there is nothing to view. The
owner's copy of the source is the original file they uploaded, which was never
on the server.

---

## D16 — The split key is HANDED OVER, not fetched twice

**Decision.** The gate returns the build's key line, the bootstrap writes it
into a genv slot, and the obfuscated file's baked chunk reads it from there. The
chunk keeps its `/sh/auth` + `/sh/k` HTTP path as a fallback and uses it only
when the slot is empty.

**Why.** The baked chunk used to fetch its own key from `/sh/k` *after* the gate
had already paid for a session. That is a second, weaker, replayable round
trip, and it is the entire reason the `/sh/k` compatibility window had to
exist: a file already in users' hands cannot be taught a new protocol.

The slot name is `SPLITKEY_GENV` in two files. They are separately-bundled
programs — the obfuscator runs in the owner's browser, the worker on the edge —
so there is no module graph to share, and a generated file is a build step
nobody remembers. `tools/splitkey_handoff_test.mjs` asserts the two agree.

**Why injecting is not a hole.** t0 and chk are baked into the file and the
padded key bytes are not, so a forged injection fails the t0/chk comparison and
the payload never unlocks. The global changes *where the bytes come from*, not
*whether they are correct*. The handoff test asserts the right t0/chk plus the
wrong key bytes yields a **different** payload — not no payload, because the VM
happily emits garbage from a wrong seed. Asserting "nothing runs" would have
been the easy claim and the wrong one.

---

## D17 — Rotation is a re-upload, and it kills the previous build

**Decision.** Every upload carries a fresh `t0` from the obfuscator, records a
`build_versions` row with an incrementing `generation`, and retires every older
generation. The gate refuses a `t0` that is not the active build's.

**Why.** `t0` is baked into the published file and was therefore identical
forever, so anything derived from it was permanent — the one credential in the
system that could never be revoked. `generation` is what makes it rotatable.

**Cost, stated plainly.** Rotating kills the previous build's files. That is the
point, but it means a re-upload is a *rotation*: the owner must re-issue
loadstrings afterwards. Doing that silently on every save would be hostile. G16
asserts both halves — the retired `t0` is refused **and** the new build still
works, because a rotation that broke the live script would be a self-DoS
passing its own test.

**Legacy exemption.** A script with no `build_versions` row is exempt from the
check, so anything published before rotation existed keeps working. That is a
real weakening, scoped to legacy scripts only; a script with any recorded build
is always checked.

---

## D18 — At-rest encryption is opt-in, marker-prefixed, and fails closed

**Decision.** `SH_ARTIFACT_KEK` enables AES-GCM over artifact blobs in KV.
Stored values carry a `SHKEK1:` marker. Unmarked values are plaintext and are
served as-is; marked values need the KEK. A marked value with no KEK is
**refused**, never passed through.

**What it does and does not protect.** The artifact is *already* ciphertext
under the owner's Special Key, so this is not about hiding it from the worker —
claiming that would be a category error. It narrows the blast radius of "the KV
namespace leaked", which is the realistic case, because that namespace is one
flat store that also holds licenses, users and split keys.

**Why opt-in with a marker.** An optional encryption switch has *three* states,
and the third is the one that loses data: envelope on disk, KEK removed. That
is data loss, not a downgrade, and it would happen silently. A marker makes the
two states unambiguous, so a partial rollout is safe in both directions and the
switch can be turned on for new uploads without touching existing ones.

**Why it fails closed.** Passing the raw `SHKEK1:…` string through when the KEK
is absent would reach the client, fail the SHOK magic, and surface as "wrong
Special Key" — a flood of support tickets about a key that is correct. Refusing
says what is actually wrong.

**Encryption boundary.** Each KV chunk is encrypted independently, not the
joined artifact. That costs one GCM nonce+tag per chunk (~28 bytes) and means a
10GB artifact never exists in memory as one plaintext buffer.

---

## D19 — A scheduled Worker is the only correct sweeper

**Decision.** `scheduled()` plus a cron trigger (`17 * * * *`) calls
`state.sweepExpired()`. Not a request path, not a lazy threshold.

**Why.** Every table the state layer writes is append-or-update, so all of them
grow without bound. They inflate the database, slow the indices, and eventually
make every write slower — a slow-motion outage nobody diagnoses because nothing
is actually broken. `sweepExpired()` existed for a phase with nothing calling
it, which is the same as not having it.

**Why not on the request path.** A multi-table DELETE in front of somebody
trying to run a script is a self-inflicted outage. Nothing in a user's run may
depend on housekeeping having happened.

**Why a failed sweep is not rethrown.** It would mark the invocation failed and
Cloudflare would retry, multiplying the load of a job that is already unhealthy.
The tables keep working; they just keep growing. Logged, not swallowed.

**Retention.** Sessions 24h past expiry *and* spent — a session that expired
unspent is kept, because a client that never reached the delivery step is
exactly the shape of a replay attempt and is worth being able to look at. Nonces
only once their session is gone. Rate-limit windows 24h. Audit and revocations
**30 days**: the audit log is evidence, and "delete everything old" is not a
retention policy. `GET /sh/health` now returns row counts so growth is visible
before it becomes a problem.

---

## D20 — `getgenv().ScripterHubKey` is BOTH the Special Key and the license

**Decision: unchanged, and now documented as a known confusion rather than
quietly relied upon.**

The Special Key encrypts the artifact in the owner's browser. The license key
authorises the run. Both are read from the same global.

**Why it was not changed.** It is pre-existing product behaviour, and the
Phase 3 bootstrap matches it exactly — changing one half without the other
would break published scripts. But it is genuinely confusing: one value
presented as two credentials, and the dashboard does not make that clear.

**Known consequence.** A user's `getgenv().ScripterHubKey` is their own copy of
the owner's Special Key. If the owner also uses "Require Key", the value a
runner sets is doing double duty, and the two cannot be rotated independently.

**Not fixed here** because it is a UX change to every published script, not a
security fix, and it should be a deliberate decision rather than a drive-by.

---

## D21 - The worker is ONE self-contained file, because the dashboard has no filesystem

**Decision: the four-file split is reverted. `For Cloudflare/worker.js` is the
whole worker, and it must never import anything.**

The worker was previously split into `worker.js` plus `server/d1_state.js`,
`server/delivery.js` and `server/artifact_crypto.js`, on the reasoning that

    "wrangler bundles these (main = For Cloudflare/worker.js), and the node test
     harness resolves them straight off disk, so there is no build step and no
     second copy to keep in sync."

Every clause of that was true. The conclusion was wrong, because it never
asked how the worker actually ships. It ships by being **pasted into the
Cloudflare dashboard**, which has no filesystem and evaluates a single string.
A relative import cannot resolve there:

    Uncaught TypeError: Invalid module specifier "../server/d1_state.js".
                        imported from "worker.js".

Not a setting, not a config, not fixable from inside the dashboard.

**An intermediate answer was tried and abandoned.** The first response was a
bundler producing `dist/worker.single.min.js` for pasting. It does work, and it
was verified - 23/23 gates and 18/18 attacker rows against the generated file.
It was reverted anyway, because it bought a worse problem: a generated
artifact that can drift from its source, a staleness check to manage that
drift, and a build step in a project deliberately kept build-step-free.
Deleting the bundler removed the whole category instead of managing it.

**The failure mode of an import here is invisible until deploy.** Node
resolves it, wrangler bundles it, all 23 security gates pass. The only symptom
is a dashboard refusing to evaluate the file, by hand, at the worst possible
moment. Hence `tools/single_file_worker_test.mjs`:

- **S1/S2** no static imports, and no relative specifier anywhere - including
  inside a string or a dynamic `import()`, which is the same trap in a
  different disguise
- **S3** the default export keeps `fetch` **and** `scheduled`, so the cron
  sweeper (D19) cannot be lost in a refactor
- **S5** no duplicate top-level names. Four modules now share one scope, and
  a duplicate `const` is legal JavaScript where the later one silently
  wins. When the shadowed name is `DENY` or `deliver`, the symptom is an
  authorization bug that reads as a logic error, not a collision.

**How the merge nearly shipped broken - twice.** Both the bundler and the
migration script recorded the import alias `run as d1run` as a name to
collision-check and printed it under a label claiming it had been emitted,
while emitting no declaration at all. The result parsed cleanly,
`node --check` passed, and delivery failed at runtime with
`d1run is not defined` - 9 security gates and 2 attacker rows.

The build log agreed with the bug because it described what had been
*collected* rather than what had been *written*. A build log that reports its
inputs instead of its output is worse than no log, because it lends the
failure its credibility. Both scripts now verify the emitted text by reading
it back and refuse to exit 0 otherwise, and that check was itself confirmed by
re-breaking the merge on purpose.

---

## D22 - Mojibake is a build failure, not a cosmetic issue

**Decision: `tools/find_mojibake.mjs` runs in `npm test` and exits non-zero on
any repairable double-encoded UTF-8.**

Text decoded as cp1252 and re-saved as UTF-8 comes back as *valid* UTF-8
containing mojibake. Nothing flags it: the encoding is legal, no decoder emits
U+FFFD, and the tests pass because it is a comment or a string compared only
against itself. Same failure class as the raw NUL byte in `worker.js` -
behaviourally invisible, visible only to whoever reads the file.

**One hit was a real shipping bug, not a comment.** `custom-obfuscator.js`
carried the anti-crack message as a string literal, so every obfuscated script
the tool has ever produced has contained a corrupted string. It is now
`Goodluck Sonion 💖`, arrived at by three differently-corrupted copies of the
same string each repairing to the same value - which is cross-validation rather
than a guess.

**Repair is proven, not assumed.** Every candidate repair must decode without
U+FFFD, must not itself contain mojibake, and must strictly reduce the number of
runs. The reverse table is built from `TextDecoder` rather than hand-listed, and
the character class is asserted at startup - because three earlier versions of
the detector were wrong in ways that made it confidently report *nothing wrong*:
an unpadded `\\u` escape silently became a class of ASCII letters, a `latin1`
inverse could not represent U+20AC, and a hand-picked lead set missed the second
and third layers of encoding.

---

## Open items

- **D1 not yet created.** `wrangler d1 create scripterhub` needs an
  authenticated wrangler session. `database_id` is still a placeholder in
  `wrangler.toml`. Until it exists, **every delivery route refuses** (D9).
- **KV still holds licenses and users.** D1 is what the *gate* reads; KV is
  what the *dashboard* reads, and `saveLicenses` / `saveUsersMap` write both
  (D3). The dashboard itself has not been migrated.
- **Legacy accounts.** Users who never log in keep a recoverable `btoa` record
  until they do. The D1 mirror deliberately stores
  `pbkdf2$0$legacy$unmigrated` rather than the btoa value, so a recoverable
  credential is never copied into a second store.
- **The compatibility window is closed by default.** So the first deploy cuts
  over hard and every require-key script published before today stops working.
  Watch `legacy.delivery` in the audit log; if it reaches zero without the flag,
  the window was never needed.
- **GitHub Storage Keeper parts are not at-rest encrypted.** They live in a
  private repo reached through the worker's token, so the KEK does not apply.
  That path is protected by repo access, not by this mechanism.
- **No automated devirtualization benchmark.** `tools/attacker_benchmark.mjs`
  covers the delivery layer. Measuring the *runtime* cost — what it actually
  takes to devirtualize a captured run — is still manual, and it is the number
  that matters most.
- **The owner email is hard-coded** (`OWNER_EMAIL` in worker.js). It is the
  root of trust for site-owner privilege and belongs in a secret.
- **The dashboard paste path is unverified against the real editor.** The
  worker is proven by executing it (23/23 gates, 18/18 attacker rows, plus
  S1–S7), but nobody has confirmed the dashboard accepts ~265 KiB in one
  paste. The earlier "truncates at ~500 lines" symptom was the NUL byte, not a
  size limit, so the real limit is still unknown. If the editor does cap size,
  the answer is `wrangler deploy`, which is the supported path anyway.
- **The KV namespace id is still commented out** in `wrangler.toml`.
  `wrangler deploy --dry-run` lists `env.LOADERS_KV` regardless, so a clean
  dry-run is not evidence that it is configured.
