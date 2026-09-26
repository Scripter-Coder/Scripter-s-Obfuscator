# Architecture decisions

Record of decisions that were open, and why they were settled. Anything here
that later turns out to be wrong should be changed here first, with a reason.

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

**Consequence.** `/sh/<id>` cannot serve a keyless artifact to an anonymous
client, so the "free = anyone can run" behaviour changes. Anyone relying on
that needs to be told before Phase 3 ships.

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
increments, or a single-step validate-and-consume. Those three are the core of
session-gated delivery. A read-then-write on KV has a TOCTOU window in which
two concurrent requests both pass the check.

---

## D4 — The session row is the authority for single-use

**Decision.** One session = one delivery = one nonce. Consumption is a
**single UPDATE with every precondition in the `WHERE` clause**, and success is
defined by `changes() === 1`.

```sql
UPDATE sessions SET consumed_at = ?
 WHERE sid = ? AND nonce = ? AND consumed_at IS NULL
   AND expires_at > ? AND revoked = 0
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

**Consequence for "one artifact per session".** Consuming the nonce also
consumes the session, because they are the same row. A session is therefore
*one fetch*, not a reusable bearer for the remainder of its TTL. Reading it
the other way — a spent nonce but a live session — would leave the session id
usable repeatedly, which is the permissive reading and a real hole.

---

## D5 — Two token types, not one token in two transports

**Decision.** `request()` (header-capable) and `HttpGet` (URL only) get
**different credentials** with different lifetimes.

| Transport | Credential | TTL | Binding |
|---|---|---|---|
| `request()` | `Authorization: Bearer <session>` | 30–45s | session + nonce + script + hwid |
| `HttpGet` | short-lived scoped URL token | ~10–15s | one script + one use + session |

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

---

## D7 — Rate limits ship in-memory first, then move to D1

**Decision.** Phase 1 limits are in-memory (route + identity keyed). Phase 2
moves them to the D1 `rate_limits` table where the increment is an atomic
upsert.

**Why.** In-memory needs no new binding, so it can ship before D1 exists, and
it is a large improvement over no limit for the brute-force case. It is **not**
durable: Cloudflare recycles isolates, so the counter resets by garbage
collection rather than by the clock, and a distributed attacker gets a fresh
budget. That is a real weakness, not an oversight, and gate G14 stays open
until the D1 version lands.

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

---

## Open items

- **Phase 3 residual race.** The delivery re-check reads license state, then
  the atomic consume runs. A ban landing in that sub-millisecond window is not
  caught. Closing it fully requires the license predicate to be part of the
  same SQL statement (a `JOIN` in the `UPDATE`), which is Phase 3 work. Called
  out rather than hidden.
- **D1 not yet created.** `wrangler d1 create scripterhub` needs an
  authenticated wrangler session. `database_id` is still a placeholder in
  `wrangler.toml`.
- **Legacy accounts.** Users who never log in keep a recoverable `btoa`
  record until they do. A hash cannot be computed without the plaintext.
  Forced reset is the clean fallback for those.
