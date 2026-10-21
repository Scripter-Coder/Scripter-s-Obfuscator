# REWARDS.md — the checkpoint and key system

The reward system is the "watch an ad, get a key" flow on
`reward.html`. This document is the operator's guide: how it works, how each
provider is wired, what is enforced on the server, what is NOT enforceable, and
how to deploy and verify it.

Everything here is enforced by `For Cloudflare/worker.js`. The browser is a
client and nothing more: it can ask questions and it can display answers, and
nothing it sends is treated as a verdict.

---

## 1. The three layers

```
  visitor                the worker (this repo)              the provider
  ───────                ──────────────────────              ──────────
  reward.html
    │  GET  /sh/reward/pub?rid&fp          → the reward's public shape
    │  POST /sh/reward/start {rid,fp}      → the next step, the ad link,
    │                                         a signed per-step token
    │  (opens the ad in a popup)  ───────────────────────────────────►
    │                                     ◄─── the visitor comes back
    │                                         with a click id
    │  GET  /sh/cp/<provider>?r&i&site&click_id
    │        → the worker asks the provider "was this click real?"
    │        → the click is parked, single use, with the IP the provider saw
    │  ◄── 302 to reward.html?rid&resume=<click id>
    │  POST /sh/reward/complete {rid,fp,clickId}
    │        → the click is checked, bound to this session and this step,
    │          and the step is recorded
    │  GET  /sh/reward/state?rid&fp        → the progress, from the server
    │  POST /sh/reward/claim {rid,fp}      → the key, minted by the worker
```

A provider that POSTS BACK to the worker instead of redirecting the visitor
(LootLabs) uses `GET /sh/reward/postback` instead of the visitor redirect; the
visitor's own poll then finds the click the provider left. Both routes end in
the same place: a **verified, parked, single-use click**, bound to a reward, a
step and an IP.

---

## 2. What the server enforces

| Control | Where | What it stops |
|---|---|---|
| The session id is derived | `deriveSesId` | A client cannot name a session, and cannot point the completion endpoint at somebody else's |
| The provider's own parameter is read | `pickClickId` | Linkvertise's `hash`, LootLabs' `click_id`, Work.Ink's `click_id` — the evidence is found whatever the provider calls it |
| The completion needs a click id | `/sh/reward/complete` | Calling the endpoint directly, with no evidence, counts nothing |
| The click must be parked | `readParkedClick` | A guessed or invented click id is not a click |
| The parked click must be **verified** | `parkClick` writes it only after the provider confirms it | Opening the postback url by hand does not count |
| The parked click must match the reward and the step | `pj.r !== rid \|\| pj.i !== i` | A click for one checkpoint cannot complete another |
| The click is single use | `spendParkedClick` marks it spent | A replayed callback cannot produce a second completion |
| The provider is the authority | `verifyProvider` | "The provider said so" is the only thing that counts |
| The provider's answer is READ | `readAntiBypassAnswer` | A 200 with an empty body is not a pass, and `FALSE` is not `TRUE` |
| The click's IP is checked | the completion and the poll | A click made on another machine cannot be claimed |
| The step is the one that is open | `ses.stepIndex` | A client cannot complete a step that was not started |
| The order is the order | `rewardNextStep` | The checkpoints have to be done in the configured order |
| The claim needs every step | `/sh/reward/claim` | Asking for a key early gets an error, not a key |
| The claim is one transaction | `rewardIssueKeyAtomic` | Two simultaneous claims mint one key, not two - the cap and the ordinal are the same count, taken at the same moment |
| The completion is recorded under a lock and re-read | `withSesLock` + the re-read | A concurrent page poll cannot roll a completion back |
| Provider outages are transient | `isTransientReason` | A provider that is down costs the visitor nothing |
| A broken configuration is not the visitor's fault | `isConfigReason` | A wrong endpoint or a wrong token is loud, and never a penalty |
| The rate limits | `RATE_BUCKETS` | Flooding the callback route is metered |
| The owner can prove the provider works | `/sh/reward/test-provider` | "It doesnt work" becomes "your token is wrong" in one click |

### The four things a visitor can never do

1. **Complete a checkpoint by calling the endpoint.** Without a click id that
   the provider confirmed, there is nothing to complete.
2. **Complete a checkpoint by changing the page.** The page's state is a
   rendering of the worker's answer; the worker never reads a verdict from
   the client.
3. **Complete a checkpoint out of order.** The worker decides which step is
   open and only that step can be completed.
4. **Get a key without the checkpoints.** The claim route re-checks the
   completed count, the cooldown and the cap, on the server.

---

## 3. Provider setup

The URL the panel shows you is derived from the worker's own routes, so it
cannot drift. **Where it goes is different for each provider**, and putting it
in the wrong place is the difference between a checkpoint that works and one
that never completes.

### Linkvertise

**This is the one that was broken, and it is worth reading carefully.**

1. Create a link. The target can be anything for now.
2. Settings → Account → enable **Anti Bypassing**. That issues a 64-character
   API token.
3. Paste the token into the checkpoint's **API Token** field.
4. Open the checkpoint, copy the **Postback URL**, and paste it as the
   link's **Direct Link** (the target URL).
5. Open the checkpoint again and paste your **Publisher ID** into that field.
   It is the number in the Full Script API snippet on your dashboard:

   ```html
   <script src="https://publisher.linkvertise.com/cdn/linkvertise.js"></script>
   <script>linkvertise(1294304, { whitelist: [], blacklist: [] });</script>
   ```

   Linkvertise lists it as a credential of its own, so it travels with every
   verification request.
6. Press **🧪 Test this provider**. The panel asks Linkvertise itself and
   shows the answer. **Do this before you share the link.**
7. The **Verification URL** field can be left empty. The worker uses the
   address Linkvertise documents:

   ```
   POST https://publisher.linkvertise.com/api/v1/anti_bypassing
        ?token=<64 char anti-bypass token>&hash=<64 char hash>
   ```

   It is the address from Linkvertise's own *Anti Bypass Documentation*. Fill
   the field in only if you want to pin a different one — and note that a
   saved address is a **preference, not a lock-out**: if it does not answer,
   the documented one is tried as well, and whichever answers replaces it.

**What Linkvertise actually sends, and why the old code could never work.**

Linkvertise's anti-bypass does not send a click id. It appends

```
?hash=<64 characters>
```

to your target url. That hash is the **only** evidence there is, and it has
three properties that matter:

- it lives for **ten seconds** on Linkvertise's side;
- it is **deleted** when it is verified, so it can be used once;
- the check has to happen **the moment the visitor arrives**, not when their
  page submits it later.

So the worker recognises `hash` as the proof (it used to look for `click_id`,
`clickid`, `clickId`, `unique_id` and `c` — and `hash` was not among them, so
**no Linkvertise checkpoint could ever complete**, for the owner, for a
visitor, or for a test), and the verification happens at the callback, where
Linkvertise is actually answering.

**The answers are JSON, not prose.** The API answers

```json
{"status": true}
```

and the older sources describe the same thing in plain text (`TRUE` /
`FALSE` / `Invalid token.`). Both shapes are read, and the meaning is the
same:

| The provider says | It means |
|---|---|
| `{"status":true}` | the hash was found and deleted — the visit was real |
| `{"status":false}` | the hash was not found — it expired, or was already used |
| `{"status":"Invalid token."}` | the API token is wrong — a **configuration** problem |

`{"status":false}` and `Invalid token.` are not the same thing and are not
treated the same way. `false` usually means the ten seconds ran out, which is
**not the visitor's fault** and earns them no penalty. `Invalid token.` means
the token is wrong, which is **not the visitor's fault** either.

**There is no "which campaign was this click on" check, and there cannot be
one.** The answer is `{"status":true}` — it says the visit was real and
nothing else, so it does not name the link the click came from. A check that
looked for your link id in the answer would refuse **every** honest click,
because the answer never contains it. The single use of the hash, the
provider's own answer and the IP binding are what stand between a real visit
and a forged one.

**If the verification URL is not right.** The exact address is Linkvertise's
business, so it is editable on the checkpoint, and the **Test this provider**
button settles it in one click: the worker calls the address with a proof that
cannot exist and shows the provider's literal answer.

- the provider answered `{"status":false}` → the address and the token are right;
- the provider answered `Invalid token.` → the token is wrong;
- the provider answered "not found" → the address is wrong;
- the provider accepted a proof that does not exist → it is not checking
  anything, and it must not be used for a paid reward.

When the field is **empty**, the worker uses the documented address. If that
address ever stops answering, the worker falls back to searching for it — but
only after the known address has been tried, and only three times per
checkpoint, because the search is a burst of requests to the provider and the
hash only lives for ten seconds.

### LootLabs

1. Create a link (the destination can be anything).
2. Profile → copy the **API key**.
3. Paste it into the checkpoint's **API Key** field.
4. Open the checkpoint and copy the **Postback URL**. It is the
   `/sh/reward/postback` shape and it carries your key as a shared secret.
5. LootLabs → **Advanced** tab → paste it into the **Postback URL** field.
   Turn on **CLICK_ID**, **IP** and **UNIQUE_ID** — without the click id and
   the IP the click cannot be tied to a visitor.
6. Do **not** put this URL in the link destination. LootLabs calls it itself.

LootLabs has no "ask about a click" API. Its documented mechanism is a
server-to-server GET to your postback url carrying `click_id`, `ip` and
`unique_id`, so the postback **is** the proof — and it is authenticated with
the secret in the url, so anybody who reads the url out of a support thread
can forge one. That is why the panel says not to post it publicly.

### Work.Ink

1. Developer dashboard → generate an **API key**.
2. Create a link whose destination contains the click-id macro, and paste the
   **Postback URL** as the target.
3. Enable **Advanced Anti-Bypass** on their dashboard too.
4. Press **🧪 Test this provider**.

The worker checks the click with `https://api.work.ink/confirm/v2`, and the
clicker's IP can be included so the answer is bound to the visitor.

### The test provider

A built-in page with no third party. The visitor presses "I Have Finished This
One" themselves. It proves the plumbing works and it proves **nothing** against
a motivated bypasser — never leave it on a real reward.

---

## 4. Deployment

Nothing new is needed: the reward system already lived in the worker and in
KV. The changes are inside the same routes.

```
  wrangler d1 execute scripterhub --file=migrations/0003_reward_keys.sql
  wrangler deploy                          (For Cloudflare/worker.js)
  npm run build && git push                (the static site: reward.html, rewards.js)
```

**The migration is not optional.** `migrations/0003_reward_keys.sql` adds the
reward ledger - the table that makes the key a one-time reward. Without it the
worker creates the table on the fly, so a missing migration is not an outage,
but applying it is the supported path.

### Where each thing lives

| Thing | Where | Why |
|---|---|---|
| The reward config | KV | Read and written by the owner, rarely |
| The visitor session | KV | Read and written constantly; guarded by a per-session lock |
| **The issued keys** | **D1** | The one thing that has to happen exactly once, so it is a transaction |
| The parked provider clicks | KV | Short lived, single use |
| The bans | KV | Read on every visitor request |
| The licenses the gate reads | D1 | Already the authoritative store |

The key issuance is ONE statement, and SQLite runs a statement atomically:

```sql
INSERT INTO reward_keys (rid, sid, ordinal, key_text, at, expires)
SELECT ?,?,(SELECT COUNT(*) FROM reward_keys WHERE rid=? AND sid=?),?,?,?
WHERE (SELECT COUNT(*) FROM reward_keys WHERE rid=? AND sid=?) < ?
```

The count that becomes the ordinal and the count that enforces the cap are the
same count, taken at the same moment. Two claims that arrive together get
ordinal N and N+1, or the second is refused by the cap - which is what
"maxKeys" means. The primary key turns the last of the race into a constraint
failure, which is retried rather than silently overwriting.

The visitor page needs to know where the worker is. It reads it from

```html
<script data-sh-endpoint="https://your-worker.workers.dev"></script>
```

in `reward.html`, and `?w=` in the URL overrides it. If the two disagree, the
page says "This page is not connected to the reward server" instead of failing
quietly.

### Environment

| Variable | Needed for | Notes |
|---|---|---|
| `SH_SESSION_SECRET` | everything | The session ids and the step tokens are HMAC'd with it. Without it they are forgeable. **Set it.** |
| `SH_BASE_URL` | the postback bounce | Where the worker thinks it lives. The provider's callback URL is built from it. |
| `SH_OWNER_CODE_HASH` | the owner panel | The owner session. |
| `LOADERS_KV` | everything | The reward config, the visitor sessions, the parked clicks. |
| `SH_DB` | the delivery gate | Already required by the delivery path. |

The provider credentials (Linkvertise token, LootLabs/Work.Ink key) are **not**
environment variables: they are stored per checkpoint, on the server, and are
never included in the share link, the public view or the visitor page.

### The callback URL

The provider's callback points at the **worker**, never at a local URL and
never at a page on the static site. The worker bounces the visitor back to the
site afterwards, so the site never has to answer a provider.

---

## 5. What this cannot do

Being honest about this is part of the feature.

- **A provider that sends no click id cannot be verified per visitor.** The
  worker says so plainly ("This checkpoint cannot be verified") instead of
  looping the visitor. If a provider is set up that way, either give it a
  click-id macro or use the server-to-server postback.
- **A real click from another campaign is a real click.** The optional link id
  closes that for Linkvertise. For a provider that cannot report it, the
  click is still checked with the provider's API, and the IP still has to
  match — but a determined attacker with a campaign of their own can produce
  clicks that pass.
- **A modified client can hide its own behaviour.** No amount of server-side
  checking changes that. What the server guarantees is that a reward is only
  paid out on a provider-confirmed click, bound to a session, in order, once.
- **The fingerprint is not a secret.** It is a hash of the browser's own
  properties. It identifies a browser, not a person. It is not used to
  authenticate anything — it only keys the session and the ban.
- **The session is not bound to the IP.** It was, and that was a bug: a phone
  that changed network lost its progress and its earned keys. The IP is still
  recorded, and it is still what a click is checked against.
- **An IP mismatch does not punish anybody.** It refuses the completion and
  records it. Changing your IP address, sharing a NAT or using a VPN must
  never cost a visitor a lockout.
- **A key earned from a checkpoint is a real license.** It is in the same
  license map as the keys the owner typed, so it opens the owner's scripts
  exactly like one. The panel's sync cannot delete it, and the Keys tab
  shows it.
- **A repeated forgery is a block; a single one is a message.** The provider
  cannot tell an invented proof from a proof that expired in the ten seconds
  it lives for, so the first two attempts cost nothing and the third costs
  a minute. The count is on the fingerprint, never on the address, and a
  successful verification clears it.

---

## 4b. What the owner sees, and what the visitor can do with a key

### The owner's key list

The **Users Keys** tab shows two things now:

- the keys the owner typed, which live in the browser and are pushed to the
  worker as a mirror;
- the keys a **visitor earned** by completing a checkpoint, which are minted
  on the server and live in the reward ledger.

The earned ones are marked **· ad reward**. They are fetched from the
worker when the tab is opened, and they are never written into the browser's
list — the browser's list is what the panel syncs, and a stale copy of a
reward key would push the old expiry back over a key the visitor had just
extended.

Their buttons are the server's, not the panel's: **🔄 HWID** and
**⛔ Ban**. There is no **Delete** — a reward key belongs to its reward, and
the worker will not let a panel sync delete it.

Each reward also has a **🔑 Keys** button, which lists every key that
reward has paid out: when it was issued, when it ends, and whether it is
active, expired or revoked.

### The key card inside the game

`scripterhub_keycard.lua` is the owner's own in-game card: the big UI, the
key box, the countdown, the ad links and the script buttons.

**It does not use JSON.** Not "we avoid JSON" - JSON is not used at all,
because some executors have no `HttpService:JSONEncode` and a key system
that speaks JSON is dead on them. Everything is one plain-text `HttpGet` and
one `string.match`:

```
GET <worker>/sh/keycheck?k=<key>&h=<hwid>

    SHOK <expiresAtMs> <lifetime>      the key is good
    SHERR invalid|banned|expired|hwid  it is not
```

The route is a **check**, not an auth: it does not bind the hardware and it
does not mint a token. The script's own gate (`/sh/session`) does that, on
the delivery, where it belongs.

**THE SOURCE IS PURE ASCII.** GitHub Pages serves a `.lua` file as
`text/x-lua` with **no charset**, and a client that decodes the response
with the charset it guessed — and the guess for an unknown text type is
usually Latin-1 — turns every emoji into `âœ…` garbage. So every emoji in
the card is written as its UTF-8 bytes in decimal escapes:

```lua
text = "\240\159\148\151 GET KEY FROM LINKVERTISE"   -- a chain link
```

A Lua string is a byte string, so Roblox renders the bytes as UTF-8 exactly
as before, and **no** charset, copy-paste or download can mangle the source
any more.

**THE CARD ASKS WHETHER THE WORKER IS THERE.** "Could not reach the key
server" and "the key is invalid" look identical from the outside, and only
one of them is the card's fault. There is a **📺 TEST THE CONNECTION**
button that asks the worker for nothing (`GET /sh/ping` answers `SHPONG`)
and shows the answer — or what the last attempt said, because the card tries
`game:HttpGet`, `request`, `syn.request`, `http.request` and `httpget` in
turn and remembers which ones it tried.

The card reads the key from `getgenv().ScripterHubKey` (the name the site
uses) or `getgenv().KEY`, keeps the four files it has always kept, and
counts down once a second instead of once a frame.

### The hammer (🔨)
An expired key is not a key any more: the gate refuses it and the script
dies with "License expired". If the owner has allowed it — **➕ Allow
Extending**, with **Max Hours** as the ceiling and **Extend Hours** as the
amount — a **🔨** appears next to the expired key in the visitor's table.

Pressing it adds the owner's hours **from now**, never past the cap, and
moves the ledger and the license mirror together. The worker refuses it for
a reward that has extending turned off, and refuses it for a key that is
not the visitor's.

### What a bypass attempt costs

| what happened | what the visitor gets | what it costs |
|---|---|---|
| the provider has not reported back yet | "Not verified yet" | nothing |
| the proof expired on the way here | "Not counted yet" | nothing the first two times |
| the same thing again and again | the same message | **a one-minute block on the third attempt** |
| the owner pasted the wrong token or URL | the owner is told | nothing — it is the owner's mistake |
| the click was made on another network | the completion is refused | nothing, and nobody is banned |

The block is on the **fingerprint**, never on the address, and it is a
minute that doubles for a persistent offender. It is exactly the same
penalty a nonce replay has always had.

---

## 6. Verifying it by hand

### A legitimate run

1. Publish a reward with one **Linkvertise** checkpoint, with the API token
   and the postback URL in place.
2. Open the share link in a normal browser. The page shows `Progress: 0/1`.
3. Press **Start**. The ad opens in a new tab.
4. Watch the ad to the end. The provider sends you back; the page reloads with
   `?resume=<click id>` in the URL, the URL is scrubbed, and the page shows
   `Progress: 1/1` and a **Get A New Key** button.
5. Press it. A key appears in the table.
6. **Refresh the page.** The progress and the key are still there — they live
   on the server, not in the browser.
7. Press **Get A New Key** again. The reward's `maxKeys` is enforced and no
   second key appears.

### A forged run

From a terminal, with the reward id and the visitor fingerprint from the
page's network tab:

```bash
# 1. complete a checkpoint with no evidence at all
curl -X POST "$WORKER/sh/reward/complete" \
  -H 'Content-Type: application/json' \
  -d '{"rid":"<rid>","fp":"<fp>","clickId":""}'
# -> {"ok":false,"error":"No click was reported by the provider, so there is
#     nothing to count."}      and the progress does not move

# 2. complete it with an invented click id
curl -X POST "$WORKER/sh/reward/complete" \
  -H 'Content-Type: application/json' \
  -d '{"rid":"<rid>","fp":"<fp>","clickId":"i-made-this-up"}'
# -> refused: "That click was not reported by the provider."

# 3. claim a key before the checkpoints are done
curl -X POST "$WORKER/sh/reward/claim" \
  -H 'Content-Type: application/json' -d '{"rid":"<rid>","fp":"<fp>"}'
# -> {"ok":false,"error":"Not all checkpoints are complete."}

# 4. tell it the checkpoint is done
curl -X POST "$WORKER/sh/reward/complete" \
  -H 'Content-Type: application/json' \
  -d '{"rid":"<rid>","fp":"<fp>","success":true,"completed":true,"done":1}'
# -> refused. The client does not decide anything.
```

---

## 7. The tests

| File | What it covers |
|---|---|
| `tools/reward_security_test.mjs` | Legitimate progression and every unauthorised route, against the real worker |
| `tools/reward_static_postback_test.mjs` | The provider redirect end to end, and the click that nobody reported |
| `tools/reward_completable_test.mjs` | Every checkpoint in a reward can actually be completed |
| `tools/reward_routes_test.mjs` | The routes, the ban, and the session rules |
| `tools/reward_ban_fairness_test.mjs` | An honest visitor is never punished for a transient answer |
| `tools/reward_flow_test.mjs` | The visitor page against a mocked worker |

Run them all:

```
node tools/reward_security_test.mjs
node tools/reward_static_postback_test.mjs
node tools/reward_completable_test.mjs
node tools/reward_routes_test.mjs
node tools/reward_ban_fairness_test.mjs
node tools/reward_flow_test.mjs
```
