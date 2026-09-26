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

## Open items

- **G16 / build rotation (Phase 4).** `build_versions` exists and
  `generation` is unique per script, but nothing increments it on re-upload, so
  `t0` — which is baked into the shipped file and is therefore identical
  forever — is still not rotatable. Any token derived from `t0` is permanent.
  The gate stays `deferred` rather than being written to pass on an absent
  feature.
- **D1 not yet created.** `wrangler d1 create scripterhub` needs an
  authenticated wrangler session. `database_id` is still a placeholder in
  `wrangler.toml`. Until it exists, **every delivery route refuses** (D9).
- **Legacy accounts.** Users who never log in keep a recoverable `btoa`
  record until they do. A hash cannot be computed without the plaintext. Forced
  reset is the clean fallback for those.
- **Rate limits are not swept.** `rate_limits` rows accumulate. `hitRateLimit`
  only ever upserts the current window, so old rows are harmless but unbounded.
  A periodic `DELETE FROM rate_limits WHERE window_start < ?` belongs in a
  scheduled Worker.
- **Sessions are not swept.** Expired/consumed session rows accumulate for the
  same reason. `sweepExpired()` exists in the state layer but nothing calls it.
