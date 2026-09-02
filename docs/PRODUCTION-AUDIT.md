# Production audit — what was found, fixed, and still open

Every item below was verified against a running server and a real Postgres, not
reasoned about. Where I could not fix something, it is listed as open rather
than quietly omitted.

---

## Found and fixed

### 1. Rate limiting did not exist under load — CRITICAL

The limiter was a `Map` in process memory. On serverless each request can land
on a fresh instance, so the counter was per-instance: with ten instances warm,
the effective limit was ten times what was configured. Since abuse defence and
AI cost control both depend on it, this was the most serious defect in the
codebase.

Now a single atomic upsert against Postgres. Verified: 20 concurrent requests
against a limit of 5 → exactly 5 allowed, 15 blocked. Thirteen login attempts
against a limit of 10 → ten 401s then three 429s.

**Two secondary bugs surfaced while fixing it, both worth recording:**

- The driver rejected a `Date` binding, so every call threw. Because the limiter
  fails open by design, this was **completely invisible** — the product behaved
  as if limiting worked. Now binds an explicit ISO string with a cast.
- The health check I added asserted `remaining > 0`, which is exactly what a
  broken fail-open limiter returns. **It reported green while nothing was being
  counted.** It now proves the counter persisted, and `/api/health` fails
  overall if the limiter is not recording.

### 2. Asset resolution silently broke above 500 assets — HIGH

The resolver loaded the first 500 assets and scored them in Node. An
organisation with 10,000 assets would have an arbitrary 5% considered, so
"Pump 3" could resolve to nothing while Pump 3 sat in the database. A wrong
answer at scale is worse than a slow one.

Candidate selection now happens in SQL, filtered by the tokens in the utterance,
capped at 60. Bounded work regardless of tenant size.

### 3. A closed browser locked a technician out — HIGH

Sessions end via an explicit `DELETE`. A closed tab, a dead battery or a lost
network never sent it, so the row stayed `active` forever — and the "one active
session per technician" rule handed them that dead session on every retry.
Stale sessions past the max duration are now expired on the next start.

### 4. Work order numbers leaked platform volume — MEDIUM

`number` was a global sequence, so a customer seeing `#10482` could infer total
platform throughput, and a first customer would see `#1`. Both are bad. There is
now a per-organisation `orgNumber`, serialised by a Postgres advisory lock
scoped to that organisation.

### 5. Analytics events were dropped on serverless — MEDIUM

`track()` was fire-and-forget. Serverless runtimes freeze the instance when the
response returns, discarding in-flight promises — so activation and aha metrics
would have been silently incomplete, and you would have trusted the numbers.
Now awaited, still non-throwing.

### 6. Voice commands never matched Indian languages — HIGH for the Indic path

Command patterns ended in `\b`. JavaScript's word boundary is defined over
`[A-Za-z0-9_]`, so every Devanagari, Tamil and Bengali character is a non-word
character and `\b` fails after them. "ठीक है" and "नहीं" matched nothing while
every English command worked. Now terminated with `(?!\p{L})` under the `u` flag.

### 7. The agent could hear and answer itself — HIGH

The microphone stays open while speech plays. Echo cancellation handles a
headset, not a phone on a bench beside a running machine. The agent would
transcribe its own sentence and reply to it — the fastest possible way to lose a
user's confidence. Now suppressed by comparing incoming transcripts against what
is currently being spoken.

### 8. You could not interrupt it, or approve by voice — HIGH

Waiting for a machine to finish a sentence you already understood is the most
irritating thing in voice UX. And approval required a screen tap, which defeats
the premise of a hands-free product.

Both fixed: barge-in cancels speech the moment a real utterance begins (two
words or eight characters — a cough does not count), and "yes" / "haan" /
"ठीक है" approves the pending draft. Guarded so that "yes but create it for
pump 9 instead" is treated as content, not a bare approval — that mistake would
execute the wrong draft and discard what the technician actually said.

### 9. Speech synthesis could hang forever — MEDIUM

Safari and some Android builds never fire `onend`. The agent would believe it
was still speaking and swallow every later transcript as an echo: total,
silent failure of voice input. A duration-estimated timeout now releases it.

### 10. Credit price was inconsistent with the pack catalogue — MEDIUM

`CREDIT_PRICE_USD` was $0.06 while packs sell credits at ₹1.20–1.49. Every
margin figure, including the owner economics panel, was overstated roughly 4x.
Now set to the lowest realised pack rate so revenue is undercounted.

### 11. Export held an entire tenant in memory — HIGH

Thirteen unbounded `SELECT`s, every row materialised before serialising. Fine
for a demo tenant, fatal for a real one: a few hundred thousand conversation
events exhaust a serverless function and the export fails — precisely for the
customer who most needs to get their data out, which makes the portability
promise false exactly when it matters.

Now streamed with keyset pagination, 500 rows at a time, hashing incrementally.
Memory is flat regardless of tenant size. Columns are named explicitly rather
than `select *`, so a future secret column cannot silently enter an export.

### 12. IP-based throttling was absent, and the obvious fix is a vulnerability — MEDIUM

Per-email limiting is evaded by rotating the email. The naive fix — read the
first entry of `x-forwarded-for` — is worse than nothing, because a client can
prepend anything and every limit then tracks a fiction.

`clientIp()` prefers platform headers a client cannot set, and otherwise counts
back from the right by `TRUSTED_PROXY_HOPS`. Tested against a 50-entry spoofed
chain.

### 13. Two concurrent turns could both pass one budget check — MEDIUM

`checkBudget` reads spend and `recordUsage` writes it, so simultaneous turns
could read the same pre-spend total and both proceed. Credits are charged first
and atomically, which bounded the damage — but "roughly bounded" is not a cost
control. The paid path is now serialised per session with an advisory lock.

---

## Open, with reasons

| Issue | Impact | Why not fixed |
| --- | --- | --- |
| **Response cache is still per-instance** | Cache hit rate drops on serverless; correctness unaffected | Costs money, not correctness. Move to Redis when instance count justifies it |
| **Idempotency key includes full argument JSON** | Two near-identical drafts could both execute | Human approval sits in front of it, so the blast radius is one duplicate a person chose twice |
| **Load test measures the limiter, not throughput** | True capacity unknown | `npm run loadtest` drives every worker through one account, so the per-user limit dominates. Realistic throughput needs distinct users and a deployed environment |
| **Response cache still per-instance** | Lower cache hit rate on serverless | Costs money, not correctness |
| **Sarvam browser recorder not built** | Indic voice path incomplete | Adapter and economics are done; the client record-and-post loop is not |
| **No browser E2E for the microphone** | Real audio path is human-verified only | `npm run smoke` covers the API funnel; audio needs a person in a plant |

---

## Verified state

- `tsc --noEmit` clean · `next build` clean
- **126 unit tests** — policy, tools, context, cost, agent output, billing, payments, per-language economics, conversation, licensing, large values and adversarial input
- **44 live integration checks** against a running server and real Postgres
- Concurrency proven for: credit consumption, rate limiting, work order numbering, per-session budget
- **Load tested**: 40 concurrent workers x 6 turns — 92 of 96 requests correctly rate limited,
  zero 5xx, p95 294 ms, limiter still healthy afterwards
- **Portability round-trip verified**: streamed export re-hashed and every entity checksum matched
