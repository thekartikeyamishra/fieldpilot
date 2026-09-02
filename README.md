# FieldPilot

**Voice-to-work for field technicians.** Talk through the job; FieldPilot identifies the asset,
reads its history, cites the procedure, drafts the action — and records the work you approve.

Built for the AssemblyAI Voice Agent Hackathon (Sep 1–30, 2026).

---

## What this actually is

Not a voice chatbot. A workflow system with voice as the primary interface and an LLM as one
controlled component inside it:

```
Interface -> Identity -> Policy -> Workflow -> Context -> Model -> Validated tool -> Durable outcome
```

The model proposes. Policy authorises. A human approves. A tool executes. Audit records.

---

## Quick start (Windows, PowerShell, VS Code)

Prerequisites: **Node.js 22+**, **Docker Desktop** (or any Postgres 16), **Git**.

> **Extract the zip first.** `package.json` must sit next to `setup.ps1`. Do not run from a drive
> root such as `E:\` — npm cannot create `node_modules` there. Use something like
> `E:\projects\fieldpilot`. `.\setup.ps1 -Check` verifies this without changing anything.

```powershell
# 1. Install dependencies
npm install

# 2. Start Postgres
docker compose up -d

# 3. Create your environment file
Copy-Item .env.example .env.local

# 4. Generate a session secret and paste it into .env.local as AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 5. Add your AssemblyAI key to .env.local (ASSEMBLYAI_API_KEY)

# 6. Create the schema and load demo data
npm run db:push
npm run seed

# 7. Run it
npm run dev
```

If anything goes wrong at any point, run `npm run doctor`. It names the broken piece and the fix.
`docs/TROUBLESHOOTING.md` covers the failures people actually hit.

Then open <http://localhost:3000/api/health> first. It tells you exactly which piece is not wired
before you waste time guessing.

Sign in with **demo@fieldpilot.app / fieldpilot123**, go to **Voice job**, press *Start talking* and say:

> "I'm at Site 14. Pump 3 is vibrating again."

Or use the typed input — same pipeline, same guarantees. Useful when the plant room is loud, the
demo wifi is bad, or the microphone is blocked.

### One-shot setup

```powershell
.\setup.ps1
```

---

## Environment

Every variable is documented in `.env.example`. The three that matter on day one:

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Postgres. `docker compose up -d` gives you the exact default. |
| `AUTH_SECRET` | 32+ chars. Signs session cookies. |
| `ASSEMBLYAI_API_KEY` | Server-side only. Mints short-lived browser tokens. |

Public legal pages live at `/about`, `/contact`, `/pricing`, `/terms`, `/privacy` and `/refunds`.
Payment providers require these to be reachable without signing in. **Edit `src/content/business.ts`
before activation** — the legal name, address and domain are marked `TODO` and an incomplete address
is the most common rejection reason. Full walkthrough in `docs/RAZORPAY.md`.

For payments, `PAYMENTS_PROVIDER=mock` fulfils instantly without a card so you can exercise the whole
purchase path locally. It is **refused at runtime in production** — set `PAYMENTS_PROVIDER=razorpay`
with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` before you deploy.
Point the Razorpay webhook at `POST /api/billing/webhook/razorpay` and subscribe to
`payment.captured` and `payment.failed`.

`AI_API_KEY` is optional — it falls back to your AssemblyAI key, because the LLM Gateway accepts it.
With no LLM key at all the agent still runs, in an honest degraded mode.

**Model names move.** `AI_MODEL_FAST`, `AI_MODEL_SMART` and `ASSEMBLYAI_SPEECH_MODEL` are
configuration, not code. If the Gateway rejects one, change the env var — nothing else.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm test` | Unit tests (policy, tools, context, cost, agent output, limits) |
| `npm run db:push` | Apply the schema (fast path for development) |
| `npm run db:generate` / `db:migrate` | Versioned migrations (use these for production) |
| `npm run seed` | Demo organisation with a real history to reason over |
| `npm run doctor` | Diagnoses Node, env, database, schema, AssemblyAI key and LLM key — run this first when anything is wrong |
| `npm run verify` | Typecheck plus unit tests, in one command |
| `npm run smoke` | End-to-end test against a running server: sign-in, session, turn, approval, idempotency, role boundary, export |
| `npm run loadtest` | Concurrency and limiter behaviour against a running deployment |
| `npm run export:test` | Portability round-trip: export, recompute every checksum, verify |

---

## Commercial model

Credits are the abstraction between what a customer buys and what a request costs us, so provider
prices can move without repricing the product.

- **Deterministic and cached turns are free.** We did not pay a provider, so we do not charge.
  Charging for a customer's own repetition is rent, not revenue.
- **Paid inference costs 1 credit, reasoning 2.** Charged before the call, inside a locked
  transaction, keyed so a retry can never double-bill.
- **Provider outage refunds automatically.** Our failure is not the customer's cost.
- **Running out degrades; it never blocks.** History, procedures, evidence and every record stay
  available. Nothing is lost, nothing is held hostage.
- **Purchases are granted by signed webhook, never by the browser.** A success callback is a claim;
  a signed webhook is evidence. Three independent guards stop a double grant: the provider event is
  recorded once, the payment row is state-checked, and the credit grant is itself idempotent.
- **The price lives on the server.** The client sends a sku and nothing else. A request carrying its
  own `amountMinor` is ignored.
- **The contribution guardrail is a function, not a hope.** `contribution()` in
  `src/server/billing/plans.ts` compares credit revenue against real AI cost, and the owner-only
  panel on `/usage` shows whether the mechanism is actually profitable this month.

## How the money stays positive

Every paid inference passes a budget decision first. There is no code path to an unbounded call.

```
1. Don't use AI            deterministic rules — "the pressure is 8.7 bar" needs no model
2. Cache                   exact-match, per tenant + asset + utterance
3. Budget check            session / user-day / org-month ceilings; ALLOW | DEGRADE | STOP
4. Cheap model             default for commands and short turns
5. Reasoning model         only for genuinely diagnostic questions
```

Ceilings live in `.env` (`AI_COST_LIMIT_PER_SESSION`, `_PER_USER_DAY`, `_PER_ORG_MONTH`), plus hard
caps on session duration, model calls, tool calls and transcript length. When a ceiling is reached
the product degrades to a cheaper path and finally says so plainly — it never silently burns money,
and it never loses the user's work.

Cost per completed job — not per token — is on the dashboard, and on every turn in the UI.

---

## How it stays safe

- **Tenant isolation at the query layer.** Every tenant row carries `organization_id` and every
  query scopes by it. The policy engine checks it before anything else.
- **Tool allowlist.** Seven tools exist. There is deliberately no `execute_sql`, `fetch_url` or
  `run_code`. Arguments are Zod-validated; the asset is bound by the platform, never by the model.
- **Human approval.** Every AI-initiated write is a draft until someone taps Approve.
- **Idempotency.** Same intent, same key, one record. Retries and double-taps cannot duplicate work.
- **Prompt injection.** Transcripts, procedures and imported text are fenced as untrusted data.
  Detection is a signal; the real defence is that such text can only ever reach a schema-validated,
  policy-checked tool.
- **No secrets in the client.** The AssemblyAI key never leaves the server; the browser holds a
  single-use token that expires in 60 seconds.
- **Zero-PII telemetry.** Identifiers are salted-hashed before they reach a log line.

---

## Repository map

```
src/
├── app/                     routes: landing, auth, dashboard, job, assets, work, /api/*
├── components/              UI primitives, VoiceJob, useVoiceStream
├── server/
│   ├── auth/                sessions (JWT cookie + live DB re-check), scrypt passwords
│   ├── policy/              roles matrix + pure policy engine
│   ├── context/             the Context Graph resolver and bounded retrieval
│   ├── cost/                pricing table + budget governor
│   ├── tools/               registry (allowlist), gateway, implementations
│   ├── workflow/            orchestrator + deterministic rule layer
│   ├── billing/             credits, plans, catalogue, purchase fulfilment
│   ├── outcomes/            outcome ledger + conservative attribution
│   └── audit/               append-only audit log
├── ai/                      router, providers, prompts, schemas, safety, cache
├── integrations/assemblyai/ the only file that knows the speech vendor exists
├── integrations/payments/   payment abstraction + Razorpay and mock adapters
├── db/                      schema + pooled client
└── lib/                     env, errors, logger, ids, rate limit, http
```

---

## Status

Shipped and verified: the full vertical slice — foundation, auth, voice session, AssemblyAI
realtime, orchestration, context retrieval, tool calling, approval, outcome — plus the security,
cost and portability layers. `tsc` clean, `next build` clean, 39 unit tests green.

Verified end to end: 126 unit tests plus 44 live integration checks against a running server and a
real Postgres, including credit atomicity under concurrency, webhook forgery refusal and the
production guard on the development payment provider.

The platform is feature-complete against the Feature Ticket List. Remaining work is operational,
not structural: browser-level E2E for the microphone path, and a production deployment. See `docs/STATUS.md`.

## Licence

MIT. See `LICENSE`.
