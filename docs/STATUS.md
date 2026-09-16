# Implementation status

Last verified: `tsc --noEmit` clean · `next build` clean · **142 unit tests green** ·
**44/44 live smoke checks green** against a running server and a real Postgres 16 ·
versioned migration generated · seed loaded.

## Built and working

| Area | State | Where |
| --- | --- | --- |
| Repository, config, strict TypeScript | done | root |
| Environment validation, fail-fast at boot | done | `src/lib/env.ts` |
| Three-layer error model | done | `src/lib/errors.ts` |
| Structured logging, hashed identifiers | done | `src/lib/logger.ts`, `ids.ts` |
| Rate limiting | done (in-process) | `src/lib/rate-limit.ts` |
| Schema: 13 tables, indexed, tenant-scoped | done | `src/db/schema.ts` |
| Auth: scrypt, JWT cookie, live DB re-check | done | `src/server/auth/` |
| Roles matrix + pure policy engine | done | `src/server/policy/` |
| Context Graph resolver, bounded retrieval | done | `src/server/context/resolver.ts` |
| Cost governor: session/user/org ceilings | done | `src/server/cost/` |
| Tool allowlist, gateway, idempotency | done | `src/server/tools/` |
| Orchestrator + deterministic rule layer | done | `src/server/workflow/` |
| Model router, retry, failover, JSON repair | done | `src/ai/router.ts` |
| Prompt versioning, output schema, injection fencing | done | `src/ai/` |
| AssemblyAI adapter, token minting | done | `src/integrations/assemblyai/` |
| Voice streaming client, worklet, reconnect, barge-in | done | `src/components/useVoiceStream.ts` |
| Hero voice job UI, approval, evidence, receipt | done | `src/components/VoiceJob.tsx` |
| Outcome ledger + conservative attribution | done | `src/server/outcomes/` |
| Append-only audit log | done | `src/server/audit/` |
| One-click export with checksums | done | `src/app/api/export/` |
| Health check | done | `src/app/api/health/` |
| Landing, auth, dashboard, assets, work pages | done | `src/app/` |
| Unit tests (142) | done | `tests/unit/` |
| International payments via Square, currency-routed | done | `src/integrations/payments/square.ts` |
| Region pricing with fee-aware margin tests | done | `src/server/billing/catalog.ts` |
| Canonical host redirect for fieldpilot.me | done | `next.config.ts` |
| Remotion product demo: 9 scenes, transitions, synthesised SFX, voiceover hook | done | `demo/` |
| Streaming export, constant memory, explicit columns | done | `src/server/export/stream.ts` |
| Spoof-resistant client IP + per-IP auth throttling | done | `src/lib/client-ip.ts` |
| Per-session budget lock | done | `src/server/cost/governor.ts` |
| Load-test harness | done | `scripts/loadtest.ts` |
| Durable rate limiting (Postgres, atomic, concurrency-proven) | done | `src/lib/rate-limit.ts` |
| Conversation layer: echo suppression, barge-in, voice approval | done | `src/components/conversation.ts` |
| Proprietary licence + self-hosted licence verification | done | `LICENSE`, `src/server/licensing/` |
| Per-tenant work order numbering | done | `src/server/tools/impl.ts` |
| Production audit: 10 defects found and fixed | done | `docs/PRODUCTION-AUDIT.md` |
| Language routing, 10 Indian languages, code-mix token extraction | done | `src/server/i18n/languages.ts` |
| Sarvam adapter: utterance STT, Bulbul TTS with phrase cache, spoken-output cap | done | `src/integrations/speech/sarvam.ts` |
| Per-language turn cost model + margin guardrail test | done | `src/server/billing/language-economics.ts` |
| Payment abstraction + Razorpay adapter + dev mock | done | `src/integrations/payments/` |
| Credit pack catalogue, server-side pricing, profitability gate | done | `src/server/billing/catalog.ts` |
| Checkout endpoint, signed webhook, triple-guarded fulfilment | done | `src/app/api/billing/`, `src/server/billing/purchase.ts` |
| Purchase UI with honest "you have not been charged" failure copy | done | `src/components/BuyCredits.tsx` |
| Credits: atomic consumption, replay-safe, refund on provider failure | done | `src/server/billing/credits.ts` |
| Plans, credit pricing, contribution guardrail | done | `src/server/billing/plans.ts` |
| Value receipt / usage page, owner-only unit economics | done | `src/app/(app)/usage/page.tsx` |
| Login / logout API, shared auth path | done | `src/app/api/auth/`, `src/server/auth/authenticate.ts` |
| Funnel analytics, zero-PII, property allowlist | done | `src/lib/analytics.ts` |
| Versioned migrations | done | `drizzle/0000_initial_schema.sql` |
| Doctor: preflight diagnosis without a server | done | `scripts/doctor.ts` |
| Live smoke test (29 checks) | done | `scripts/smoke.ts` |
| CI: typecheck, tests, schema, seed, build, smoke, secret scan | done | `.github/workflows/ci.yml` |
| `.env.local` loading for scripts and drizzle-kit | done | `src/lib/load-env.ts` |

## Not built yet

> **Gating gap for real customers:** there is no UI to create sites, assets,
> procedures or users. Signup seeds a starter set; everything else needs a
> script. A business cannot onboard itself today. This is the highest-priority
> item before any customer touches the product — see `docs/CUSTOMER-GUIDE.md`
> section 3, which documents the workaround honestly.


| Area | Priority | Note |
| --- | --- | --- |
| Recurring subscription billing | nice | One-off credit packs are live; a subscription needs Razorpay Subscriptions and a renewal webhook |
| Stripe adapter for non-Indian customers | nice | The `PaymentProvider` interface is ready; it is one file |
| Refund execution | nice | Policy and ledger fields exist; the provider refund call does not |
| Browser recorder for the Sarvam utterance path | should | Adapter is done; the client-side record-and-post loop is not |
| Indian-language evaluation set (accents, plant noise, equipment vocabulary) | should | Highest-leverage missing piece before claiming language quality |
| Native-language system prompting per language | should | Prompt is English today |
| Browser E2E (Playwright) | should | Real microphone path; the API funnel is covered by `npm run smoke` |
| Postgres RLS policies | nice | Enforced at query layer today |
| Redis-backed rate limit and cache | nice | Needed only above one node |
| Hosted TTS behind an adapter | nice | Browser `speechSynthesis` today |
| Supervisor dashboard, multilingual, integrations | nice | Explicit non-goals for V1 |

## Bugs found and fixed by the test suite

Recorded because they are the reason the suite exists:

- **Sequence race in conversation logging.** `sequence = max + 1` was read-then-write; two concurrent
  turns collided on the unique index. Now allocated inside the INSERT with a bounded retry, and a
  failed transcript line can never fail the technician's turn.
- **Pricing model inverted.** The profitability gate used `CREDIT_PRICE_USD` — a *sale* price — as a
  proxy for cost, and passed packs that could not cover their own inference. Cost is now derived
  from the model pricing table, and the 1,500 pack was repriced from ₹1,499 to ₹1,799 as a result.
- **`.env.local` not read by scripts.** `drizzle-kit` and the CLI scripts loaded `.env`, so
  `db:push` failed straight after setup wrote `.env.local`.
- **Credit price was inconsistent with the pack catalogue.** `CREDIT_PRICE_USD` was $0.06 (₹5.28)
  while packs actually sell credits at ₹1.20–1.49. Every margin figure in the product — including the
  owner economics panel — was overstated roughly 4x. Now set to the lowest realised pack rate so
  revenue is undercounted rather than flattered.
- **`setup.ps1` reported success after failure.** PowerShell does not throw on a native command's
  exit code.

## Known limitations

- Rate limiter and response cache are per-process. Correct for one deployment; swap the `Map` for
  Redis behind the same function signatures to scale out.
- Speech output uses the browser's `speechSynthesis`: zero cost, zero latency, no vendor lock.
  Voice quality varies by browser. `speak()` in `useVoiceStream.ts` is the single swap point.
- Model prices in `src/server/cost/pricing.ts` are configuration and go stale. The credit
  abstraction means customer pricing does not have to move when they do.
- The `number` column on `work_orders` is a global sequence, so work order numbers are unique
  across the platform rather than per organisation.
- `npm run smoke` exercises the API funnel, not the microphone. Real audio capture and turn-taking
  still need a human at a browser — `docs/DEMO.md` is that checklist.
