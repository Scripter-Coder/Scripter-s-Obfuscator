# Architecture decisions

Record of decisions that were open, and why they were settled. Anything here
that later turns out to be wrong should be changed here first, with a reason.

Phases 0, 1a–1f and 2a were committed before Phase 3. Phase 3 is the phase that
actually wired the state layer into the worker, and it is where most of the
remaining decisions live.

---

## D1 — Keyless / free scripts require an account  -  **REVERSED by D23**

> **This decision no longer holds.** It was reversed in full; see
> [D23](#d23--a-free-script-needs-no-account-no-key-no-email) for what replaced
> it and what was given up. The text below is kept as written so the reasoning
> that produced it is not lost.

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
was verified - 24/24 gates and 18/18 attacker rows against the generated file.
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
  worker is proven by executing it (24/24 gates, 18/18 attacker rows, plus
  S1–S7), but nobody has confirmed the dashboard accepts ~265 KiB in one
  paste. The earlier "truncates at ~500 lines" symptom was the NUL byte, not a
  size limit, so the real limit is still unknown. If the editor does cap size,
  the answer is `wrangler deploy`, which is the supported path anyway.
- **The KV namespace id is still commented out** in `wrangler.toml`.
  `wrangler deploy --dry-run` lists `env.LOADERS_KV` regardless, so a clean
  dry-run is not evidence that it is configured.

## D23 - A free script needs no account, no key, no email

**Decision.** The keyless tier is fetched as:

```
FREE SCRIPT
   ↓
short-lived session          (no identity of any kind)
   ↓
artifact
```

A user runs a free script by pasting one `loadstring` line. They set nothing in
the executor: no license key, no email address, no token. This reverses
[D1](#d1--keyless--free-scripts-require-an-account--reversed-by-d23).

**Why.** Two reasons, and the first is a correction rather than a preference.

**It did not work.** D1 required an account *and* the gate demanded a signed user
token (`verifyUserToken`) that the loader had no way to carry. Those two together
did not produce a gated free tier; they produced an undeliverable one. A user who
followed the instructions exactly — set `getgenv().ScripterHubUser` to their own
address — was still refused, because the token was the thing actually checked and
nothing could supply it. The decision was made before anyone tried to run a script
through it, and the failure only appeared on first contact with a real executor.

**It bought nothing against a scrapper.** Retrieving a keyless artifact is two
requests:

```
POST /sh/session?id=X&k=&h=anything   ->  SHS <sid> <nonce> <expires>
GET  /sh/a/X?s=<sid>&n=<nonce>       ->  the artifact
```

A scrapper has no email and would simply leave the field blank. The account check
was a wall in front of a door that opens with two curls, while being a genuine
barrier to the person the product is for. It cost privacy — users do not want to
hand their address to a script author — and it cost a step in the one flow that
has to be frictionless.

**What is given up, stated plainly.** An anonymous caller who knows a script id
*can* retrieve that script. This is not mitigated; it is accepted, and it is
recorded as benchmark row **A9, "accepted by design"** so it is measured on every
run rather than argued about. Two things previously described as protecting
against bulk do still hold, and are now the actual defence:

- the session is minted per request and is **single use** (D4, D10 — the nonce is
  spent with `UPDATE ... RETURNING`, so a replay returns nothing), and
- minting is **rate limited** — 30/min on the `session` bucket, 60/min on
  `deliver`, D1-backed with an in-memory fallback (D7). Asserted as G02.3b and
  as benchmark row A19.

**What this cannot do.** It does not stop one deliberate fetch, and nothing
delivered to a client can: whoever runs the code can read it. So the honest
statement of the free tier is *"the code is not published, and pulling it takes a
live session per execution rather than a URL you can paste elsewhere"* — not
*"the code cannot be obtained"*. Protection against bulk scraping is real;
protection against a determined single request is not, and is not claimed.

**Also changed with it.** The `hidden` refusal no longer means "a keyless script
needs an account" — it means a private script or a killswitch, and the loader now
says so. Leaving the old wording would have sent users to set an email that does
nothing.

**Verified, not assumed.** Gate G02 was rescoped rather than deleted, because two
of its three assertions were unrelated to D1 and are load-bearing: the public
loader still carries no artifact bytes, and a fabricated session still delivers
nothing. Check B10 was inverted — it previously asserted that the request carried
`u=`, and it now runs a keyless bootstrap against an **empty** `getgenv()` and
requires the flow to complete. The harness grew a `bare: true` option for it,
because every prior run pre-seeded a license key, so the no-credentials path had
never once been executed.

---


## D24 - A protection failure must never be silent

`applyBytecodeVm` returns `null` (rather than throwing) for any unsupported
construct, so the tier below it in `custom-obfuscator.js` used to degrade to
the lite pass with no signal at all.

A UTF-8 BOM at the head of a customer script was the trigger. luaparse 0.3.1
dies inside its own lexer on the BOM with a misleading `Cannot read properties
of undefined (reading 'range')` - which reads like a syntax error in the
customer's code, but is not. The result was that the customer received a
~33 KB artifact whose payload is their own source behind a static key
schedule, instead of the ~355 KB real VM. That fallback artifact is
recoverable in a single static pass: it is exactly the "paste the obfuscated
source into a deobfuscator bot" outcome this system exists to prevent.

Scripts arrive by copy-paste and every Windows text editor writes a BOM, so
this was not an edge case. Nothing caught it because every fixture in the
repo was written without a BOM.

Three changes, in order of importance:

1. `normalizeSourceText()` in `vm-bytecode.js` strips the BOM inside
   `compile()`, so every consumer benefits and no future caller can
   reintroduce it at a different entry point.
2. The VM tier now captures WHY it declined. `debugInfo.vmFallback` carries
   the reason, the console warns, and `main.js` tells the customer their
   build is not VM-protected. A protection failure that looks exactly like a
   successful build is worse than a visible failure.
3. `strictVm: true` refuses the degraded build instead of shipping it, for
   callers that would rather fail loudly.

`tools/bom_vm_regression_test.mjs` locks all three in place. It also asserts
its own fixture is valid Lua before testing anything, because an invalid
fixture produces a fallback that is indistinguishable from this bug.

Unchanged: D6, D12, D16. The delivery chain was already correct - a BOM only
ever affected what the chain was allowed to carry.

---

## D25 - The loader stub is readable ON PURPOSE (Luarmor parity)

`shLoader()` returned a single line:

    loadstring((request and request({Url=...,Headers={...}}).Body) or game:HttpGet(...))()

That worked, and it was the wrong shape. It advertises the delivery mechanism
in a form that invites the question "what does this fetch?", and it re-fetches
on every run.

The stub is now the Luarmor shape - readfile / makefolder / HttpGet / writefile /
loadstring(response)(id) - with two transports, a disk cache, and a loud error
instead of a silent nil. 17 lines, ~783 bytes, plain text.

The reasoning, which is the opposite of the usual instinct:

**Making the stub unreadable protects nothing.** The artifact is not in the
stub. The URL is public and permanent (D6) and cannot change. Obfuscating the
stub only raises the cost of reading a URL a scraper can just fetch.

**Making the stub maximally readable IS the security property.** A bot or an AI
handed this text writes down a URL and stops - there is no reversing work to do,
because there is nothing hidden. That is exactly what the Luarmor stub
accomplishes, and it is why that stub is not obfuscated either.

Properties this now shares with Luarmor:

1. Readable, with no secret in it. Legibility is the property, not a failure.
2. The id is passed as an ARGUMENT rather than baked in, so the stub text is
   identical across every script apart from the id and the URL. LP4 asserts
   that two scripts differ in nothing else.
3. Caches to disk, so a re-run costs no round trip.

`luaSessionBootstrap` now reads `...` for the id and KEEPS the baked-in value as
the fallback, so an executor that cached an older one-liner keeps working. The
argument is pattern-matched to ^ScripterHub%d+$ before use, and `...` reaches
neither BASE nor any fetch - it can only name a script, so it is not an SSRF
primitive. LP6 executes that guard in a real Lua VM against a URL, a traversal
string, a number, an empty string and trailing junk, and confirms each one falls
back to the baked id.

Unchanged and deliberately so: the stub still only ever fetches /sh/<id>, which
serves the bootstrap containing no ciphertext, no key and no split key
(D6/G01). The bytes still leave the worker through deliver() alone (D12).
Readability did not become a second route to the artifact.

tools/luarmor_parity_test.mjs (26 checks, npm run test:luarmor) locks this down.

The old "must be one line" assertion in loader_exec_test.mjs was REPLACED, not
deleted: "one line" was never the property, "carries no secret" was - and that is
now asserted directly against the stub.

**SUPERSEDED IN PART BY D31.** The fifteen-line stub is gone. Its disk cache
moved into the init layer, and the pasteable line is one line again:

    loadstring(game:HttpGet("https://host/sh/ScripterHub1234567890"))()

The reasoning above still holds, and D31 keeps the readable-init-layer property:
the pasted line is a URL, and the layer behind it is the Luarmor-shaped init
layer. What changed is WHERE the cache question was answered - the init layer
does not cache the artifact either, and D29 says why.

---

## D26 - The host compile is NOT proxied; the browser is given a ticket

Four separate failures were reported on one 6000-line script. They share one
theme: every one of them was a size limit that had been placed in the wrong
layer.

**1. HTTP 520 on a 100-second compile.** The browser POSTed to the worker and
the worker relayed to the keeper. A Worker holding a subrequest open across a
100-second Node compile is killed by Cloudflare, and 520 is reported as "can't
understand the response from your origin" - which points at the owner's PC and
hides that the relay was the problem. The host was fine and simply too slow to
be proxied.

The relay is split into two fast steps. `POST /sh/obfuscate-ticket` authenticates
the user and signs a ticket (milliseconds); the browser then POSTs to the keeper
directly, where there is no proxy to expire. The retired `/sh/obfuscate` route
is KEPT but answers immediately with "reload the page", so an open tab gets a
sentence it can act on instead of a 404. It will not come back.

The keeper's permanent token still never leaves the worker: main.js is public, so
a permanent token in the page would be readable by anyone, who could then spend
the owner's machine and reach the stored scripts. A ticket authorises ONE
compile and expires in 10 minutes.

The ticket is signed with `SH_STORE_TOKEN` - the secret the worker already holds
and the keeper already trusts - so there is no second secret to configure and
therefore no second secret to forget. The signature covers the expiry, so a
ticket cannot be extended by editing it.

`Storage Keeper/tests/test_compile_ticket.py` (11 checks) covers the accepted
case, the forged signature, the wrong secret, the expired ticket, a ticket with
no expiry at all, an edited expiry, garbage, and the property that a compile
ticket does NOT unlock the stored-script routes.

**2. "Sign in before obfuscating on the host" while signed in.** `shObfuscateOnHost`
read the token from sessionStorage, which is empty unless this tab has already
uploaded something. `shEnsureUserToken()` mints one from stored credentials when
there is none - the same fix the owner panel already used. The 401 was never
about authorisation.

**3. "Unrecognised delivery format." - and the `toobig` dead zone.** ONE root
cause: parts were 40 MB. A part is delivered as a single HTTP response, so a 40
MB part is a 40 MB response; Cloudflare answers 524/502, the body arrives as an
HTML page, and the bootstrap reports a format error naming neither size nor
timeout. Worse, an 18.5 MB artifact under the old 40 MB size produced `n = 1` -
a "chunked" script with exactly one part, so there was no chain to fall back on.

`SH_KEEPER_PART_SIZE` is now the same number the worker uses for an inline body
(`INLINE_DELIVERY_MAX`). The two are the same question - what one response can
reliably carry - and keeping them in step is the fix.

The KV writer had the matching bug: `putBlob` split at `CHUNK_THRESHOLD`
(~25 MB, a STORAGE limit) while delivery inlined at 6 MB (a DELIVERY limit).
Anything between the two was stored whole with no parts, so it could be neither
inlined nor chained and was refused. `CHUNK_DELIVERY_MAX` is now DERIVED from
`INLINE_DELIVERY_MAX` rather than being a second literal, because two independent
numbers with a gap between them is precisely how the original bug existed - and a
derived value cannot drift apart again.

`tools/delivery_part_size_test.mjs` (27 checks) pins the invariant. It evaluates
the constant EXPRESSIONS rather than regexing the first number out of them: that
flaw was in the first draft of this test and it passed with the 40 MB bug
reintroduced, which is the failure mode this test exists to prevent.

**4. `QuotaExceededError` on a successful build.** `saveProjects` wrote first and
caught the exception, so every big obfuscation printed a red console error and
the page looked broken although the script had uploaded fine. The payload is now
measured BEFORE the write and the bulky fields dropped until it fits, so the
common case never throws. Only local copies are dropped - the cloud copy and the
loadstring are untouched - and `codeStripped` is now READ: Script Settings says
the local copy was dropped and why, instead of opening an empty code pane that
reads as data loss.

Two CORS allowlists gained `X-SH-Ticket`. Without it the preflight fails and the
browser deletes the request BEFORE it is sent, which presents as "could not
reach the host" and sends the user to restart a machine that is running
perfectly. `tools/cors_test.mjs` caught the worker half of this.

---

## D27 - A restart must not be able to change the bearer token

Reported as "the host is unreachable" after a perfectly ordinary restart.

`Config.from_env()` generated a fresh `secrets.token_urlsafe(32)` whenever
`SH_STORE_TOKEN` was absent from the environment. `tunnel.py` persisted its token
to `data/token.txt` and passed it in, so the launcher path was safe - but a BARE
`py run.py` restart, which is exactly what an operator does after pulling a
change, went straight to the generator.

The consequence is the reason this is worth a decision rather than a patch. The
worker holds its own copy of that token. A restart therefore changed the token in
one place only, and the service locked itself out of its own worker: every script
stopped delivering and every browser call came back a credential error, while the
keeper reported itself perfectly healthy and said nothing about the token having
moved. Restarting again - the obvious remedy - re-broke it, because every restart
minted another token.

The fix is to make a restart idempotent. `_persisted_token()` reads
`data/token.txt` first and only generates (and writes) when there is nothing
there. A token is secret only because it is the SAME secret in two places, so
changing it in one place is a configuration change - and it must not be
something a restart can do by accident.

One ordering bug was found while testing this and is worth recording, because the
first draft had it. The token was resolved against the environment root and the
caller's `root=` override was applied afterwards. A test calling
`from_env(root=tmp)` therefore read the real `data/token.txt`, and could have
written it, while appearing to work in a temporary directory. The root has to be
settled before anything touches the disk.

`Storage Keeper/tests/test_token_persistence.py` (8 checks) pins the property: a
restart returns the same token, the token is on disk, a restart does not rewrite
the file, eight restarts produce one distinct value, an existing token file is
honoured (the migration path for an operator who already has a working one), an
explicit `SH_STORE_TOKEN` still wins, a first run still generates a real secret,
and a blank token file is replaced rather than trusted.

---

## D28 - The artifact size model is measured, and the VM is the number that matters

Reported as: a few KB of source obfuscates to ~18 MB, and the result does not
run on executors. The instinct is that this is a storage limit. It is not.
Storage is the owner's own disk and was never the constraint (D26). This is the
obfuscator's expansion factor, and the model that was supposed to manage it was
wrong in two independent ways.

**1. The model could not see the VM.** It predicted `source x 4.5*(i/4)^1.73` and
was evaluated on the SOURCE, before the VM pass ran. Measured on a 652-byte
script:

    no VM        ->   33 KB    53x
    vm lite      ->  238 KB   374x
    bytecode VM  ->  300 KB   471x

The budget predicted 53 KB and the artifact was 300 KB - under-reporting by
**5.7x** - so for a small script it reported success while shipping exactly what
it existed to prevent.

**2. The model clamped a knob that does not turn.** Layer pass, wraps isolated:

    srcKB    i=1   i=4   i=10  i=22
      4.2     46    48    50     48
     17.2    100   102   104    102
     43.7    211   212   214    213

Intensity does not move the output. Three of four rows are flat to within 2 KB
across a 22x change. The old clamp fired on every measurement while the artifact
stayed 2-4x over budget: a control that cannot move the thing it claims to
control, which is worse than none, because it is believed.

**3. The largest term was missing entirely.** Ultra wrapping. On a 1.2 KB source:

    no-ultra, no VM          37 KB
    no-ultra, bytecode VM   408 KB
    ultra,    bytecode VM 8,976 KB     <- ~22x, predicted as 390 KB

This is the reported symptom. A few KB of source producing a multi-megabyte
artifact is the bytecode VM plus ultra, not a large script.

**What the model is now.** `outKB = (29 + 4.15 * vmKB) * wrapFactor`, where
`vmKB` is the VM's REAL output length - measured, not modelled - and `wrapFactor`
is 22 for double wrap (intensity >= 7), 46 for triple (>= 25), 1 otherwise. It is
evaluated AFTER the intensity clamp, because the clamp changes which wrap
applies and a model describing a build that never happens is worse than none.

Verified within **7%** across every tier and source size measured, against a 5.7x
error before.

**The clamp stayed, and that is the second finding.** It was removed on the
evidence that intensity does not move size - which is true, and it broke the
EMITTER. Without it, a 40 KB source at SECURE produced Lua that does not parse:

    40 KB SECURE produced invalid Lua: [3:12037] unexpected symbol '\' near '18'

`tools/size_budget_test.mjs` went 13/13 -> 5/13 with the clamp removed, two of
the failures being corrupt artifacts rather than oversized ones. So the clamp is
a CORRECTNESS guard and is now labelled as one; it is no longer presented as a
size control, which is what let the blind spot survive. Measured on tiny
synthetic sources it looked like a no-op - on real ones it is load-bearing.

**One assertion in `size_budget_test.mjs` was wrong rather than the code.** It
required every size to land inside the budget, and it passed - while
`estimatedOutputKB` held a layers-only, pre-VM figure. A 3 KB source reported
41 KB for an artifact that came out at 426 KB. The budget appeared satisfied
because the number being compared was not the number that mattered. It now
requires that every over-budget build is FLAGGED, which is the property that
matters: an unflagged oversize ships and fails on an executor.

`debugInfo.estimatedOutputKB` is now the authoritative prediction. The pre-VM
figure lives under `preVmEstimatedOutputKB`, and `vmOutputKB`,
`vmAppliedTier`, `artifactOverBudget` and `recommendedVmTier` are reported so
the caller can see the jump and what to do about it.

`tools/size_model_test.mjs` (15 checks) predicts against the real obfuscator
rather than against itself, and covers the ultra term, the VM-source gap, and
that over-budget builds name the VM rather than the user's script.

---

## D29 - A free script gets a server-only layer, and SHX is how

Reported as: "people can say to AI 'give me deobfuscated code from that
loadstring' and it fails, but 'give me the OBFUSCATED code' and it succeeds."

The reference is JNKIE, and reading its loader shows the mechanism plainly.
`GET /public/<id>/download` returns an anti-bot HTML page. The payload comes
from `POST /delivery/<id>` with the script key as the body: no key gets
`403 LDR-DENIED:KEY_INVALID`, a wrong method gets `401`, and there is no GET
path to the payload at all. The AI in the transcript had the loadstring and a
placeholder key and still got nothing - **the key is the gate**, not the HTML.

**What we already had.** `/sh/<id>` returns `scriptPageResponse` to a browser
user-agent and only the bootstrap to an executor. The payload then requires a
single-use session grant (`SHS <sid> <nonce> <exp>`) plus nonce, HWID and
licence. So the JNKIE shape was already in place for PAID scripts.

**The real gap.** `shServerKeyOpts` returned `{}` for a keyless build, on the
reasoning that "a keyless script has no licence to gate, so there was nothing
for a split key to protect". That confuses the LICENCE with the LAST LAYER of
the artifact. Without the split key the file is fully self-contained, so every
free script was a valid single-sample deobfuscation target: paste the
loadstring, take the artifact, work offline. Exactly what the JNKIE flow
prevents.

**SHX.** The reason it was withheld is real and is recorded in the code: the
keyless loader read `body:sub(5)` and never expected a key line, so bolting one
onto SHL fed the parser raw key numbers as line 1
(`loadstring:1: Expected identifier when parsing expression`). The fix is a new
envelope, not a missing protection:

    SHL\n<plain lua>                     keyless, no server-only layer
    SHX\n<t0 chk k1 k2..>\n<plain lua>   keyless WITH a server-only layer
    SHK\n<t0 chk k1 k2..>\n<ciphertext>  paid, decrypted locally

SHX is deliberately NOT spelled SHK. SHK means "ciphertext follows", and a
keyless bootstrap never runs DEC - there is no Special Key - so it would hand
plain Lua to the parser as ciphertext and skip decryption entirely.

Free-script UX is unchanged: no key to type, no account, no email. The only
change is that the artifact stops being self-contained. SHL remains for
artifacts stored with no split key in KV, so already-published scripts keep
running.

**A test harness bug this uncovered, which mattered more.** The `loadstring`
mock called `luaL_loadstring` and then returned `undefined`, which fengari reads
as "zero return values". The compiled function was left ON THE STACK unclaimed,
the bootstrap's own `pcall` consumed it as junk, and the outer `pcall` ended on
a corrupted stack - a userdata error with no message. The runner then read that
back with `lua_tostring`, got null, and stored `runtimeError: null`, which is
falsy, so the assertion chain fell through to a later check that happened to
hold. **Four tests were passing without ever running to completion.** The stub
now returns 1, the runner reports non-string errors as such, and
`bootstrap_exec_test.mjs` is 17/17 where it was 12/17.

`tools/keyless_server_layer_test.mjs` (12 checks) asserts the client side: a
keyless build gets a serverKey naming the right script, and the artefact it
produces parses and contains no plaintext. `bootstrap_exec_test.mjs` B11/B12/B13
run the real Lua and prove the SHX envelope strips the key line into genv,
leaves SHL working, and reports malformed envelopes instead of indexing nil.

---

## D30 - A spent nonce is recovered, not reported

The second error from the same report: `[ScripterHub] Denied: nonce`, using the
explicit loader stub rather than the one-liner.

Reproduced against the live deployment by replaying a session: the second use of
a `(sid, nonce)` pair is refused with exactly that string. So the user's bootstrap
presented the same pair twice.

It does so itself. `GET()` tries `request()` first and falls back to
`game:HttpGet`, and a large script's first request can be slow enough over a
tunnel that `request()` comes back empty - so the fallback fires a SECOND
delivery carrying the SAME nonce. The first spent it; the second is refused.

The message names a security control rather than the timeout that caused it. The
script exists, the key is valid, and re-running the loadstring is the correct
user action, but nothing in "Denied: nonce" says so.

So a spent nonce now mints a FRESH session and spends that instead, once. It
cannot be abused: the caller already proved it may hold a session, and the retry
is bounded at one extra session. Genuine refusals - banned, private, expired -
still report, and B15 asserts they spend exactly one session so the recovery
cannot swallow them.

**Two bugs found while writing the recovery, both of which made it dead code.**

1. `body:sub(1,10)=="SHERR nonce"` - "SHERR nonce" is ELEVEN characters, so the
   comparison never matched. Replaced with a `match("^SHERR (%S+)")` capture,
   which cannot drift by a character count.

2. `local S2,N2=(type(r2)=="string") and r2:match(...) or nil` - Lua's `and`
   truncates a multiple-value expression to ONE value, so S2 took the first
   capture and N2 was nil forever. The retry never ran and nothing was raised,
   because `if S2 and N2` is an ordinary guard over a value that is always nil.
   The existing mint a few lines above is written as a direct
   `local a,b = s:match(...)` for exactly this reason, and the asymmetry is
   what made it findable.

Neither would be caught by a string check on the generated Lua - both compile,
both parse, both look correct. B14 runs the real Lua VM, gets `SHERR nonce`, and
requires the bootstrap to recover on its own.

`tools/bootstrap_exec_test.mjs` is 19/19.

---

## D31 - The loadstring is ONE line, and the three layers are L1 / L2 / L3

The owner asked for the loadstring a user pastes to be a single line:

    loadstring(game:HttpGet("https://host/sh/ScripterHub1234567890"))()

and for the layer behind it to look the way a Luarmor user expects: a data table
(`_bsdata0`), a link to the file that holds the program, and the program itself
behind that link.

That is a three-layer shape, and it is the shape Luarmor has:

    L1  the pasted line        - one line, a URL, nothing else
    L2  the init layer         - _bsdata0 + the cdn link + the handshake
    L3  the artifact           - the obfuscated program, behind the gate

**What moved where, and why.**

D25 made the PASTEABLE line the fifteen-line stub, because the stub had the
disk cache in it. The cache was the only reason it was long, and the cache
belongs to the layer that knows what it is allowed to keep - the init layer,
not the pasted line. So the cache question was settled first, and the line
followed.

**THE DISK CACHE IS NOT COPIED FROM LUARMOR, and that is deliberate.**

Luarmor's init file writes what it downloaded to disk and re-runs it from the
cache. Here that would put the artifact on the user's disk, and for a FREE
script the split key IS the server-only layer (D29): the envelope carries the
key line with it, so a cached copy is a complete, offline-runnable artifact. That
is precisely the single-sample deobfuscation target D29 was built to close.

So the init layer fetches the artifact on every run, and the license is still
checked on every run. The cost is one round trip per execution; the benefit is
that the server-only layer still is one. tools/luarmor_parity_test.mjs asserts
the ABSENCE of `writefile` in the init layer, so a later refactor cannot
re-introduce the cache by accident.

**THE CDN LINK IS A SHAPE, NOT A HOLE.**

L2 points at `/sh/v4_init_<id>.lua`, which reads like the Luarmor init file's
`https://cdn.luarmor.net/v4_init_<key>.lua`. It is the SAME route as
`/sh/a/<id>`: same gate, same nonce, same session, same bytes. "cdn" here means
"a file-shaped address for the delivery", not "a public bucket anybody can
fetch" - the artifact has to stay behind the same atomic gate (D12), and a
second spelling must not become a second door.

**THE PORTABLE TWIN EXISTS, AND IT IS OFFERED NEXT TO THE PLAIN ONE.**

One executor in circulation throws from inside its own `game:HttpGet` before
any request is made, so a line that only calls `game:HttpGet` cannot run there.
D25's line solved that by preferring `request()`, and paying for it with a
line that advertised the whole delivery mechanism.

Now both exist: the plain one line is what the owner sees and copies, and
`shLoaderPortable()` is the same URL with `request()` (and the executor
User-Agent) first. The site offers the second one NEXT TO the first, labelled,
for the executor that needs it. tools/loader_exec_test.mjs runs both on a real
Lua VM against four executor shapes.

**THE INIT LAYER SETS THE USER-AGENT ON ITS OWN REQUESTS.**

`request()` with no User-Agent is not treated as an executor, and the worker
answers such a request with the metadata page. `game:HttpGet` stamps a genuine
Roblox UA; a bare `request()` does not. The init layer now sends the header
explicitly on both transports, so a future change to the delivery route cannot
break the fetch by accident.

**UNCHANGED, DELIBERATELY SO:**

- The pasted line still only ever fetches `/sh/<id>`, which serves the init
  layer - no ciphertext, no key, no split key (D6/G01). The bytes still leave
  the worker through `deliver()` alone (D12).
- The init layer is IDENTICAL for every script apart from the id and the base
  URL. LP4 asserts it for both layers.
- The id is still pattern-matched to `^ScripterHub%d+$` before use, and `...`
  still reaches neither the base URL nor any fetch - it can only name a script,
  so it is not an SSRF primitive. LP7 executes that guard in a real Lua VM
  against a URL, a traversal string, a number, an empty string and trailing
  junk.
- The browser still sees the metadata page and nothing else.

tools/luarmor_parity_test.mjs (40 checks) and tools/loader_exec_test.mjs (21
checks) lock the shape down.

---
