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
| `npm run export:test` | Portability round-trip: export, recompute every checksum, verify |

---

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
│   ├── outcomes/            outcome ledger + conservative attribution
│   └── audit/               append-only audit log
├── ai/                      router, providers, prompts, schemas, safety, cache
├── integrations/assemblyai/ the only file that knows the vendor exists
├── db/                      schema + pooled client
└── lib/                     env, errors, logger, ids, rate limit, http
```

---

## Status

Shipped and verified: the full vertical slice — foundation, auth, voice session, AssemblyAI
realtime, orchestration, context retrieval, tool calling, approval, outcome — plus the security,
cost and portability layers. `tsc` clean, `next build` clean, 39 unit tests green.

Open: monetisation/credits, analytics instrumentation, CI workflows, E2E coverage. See
`docs/STATUS.md`.

## Licence

MIT. See `LICENSE`.
