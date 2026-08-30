# Implementation status

Last verified: `tsc --noEmit` clean · `next build` clean (14 routes) · 39 unit tests green ·
schema pushed to Postgres 16 · seed loaded.

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
| Unit tests (39) | done | `tests/unit/` |

## Not built yet

| Area | Priority | Note |
| --- | --- | --- |
| Monetisation: credits, metering, subscription | should | Cost accounting already exists; billing does not |
| Analytics events (activation, aha, funnel) | should | Metric names defined in the PDR |
| CI workflows (`.github/workflows`) | should | typecheck + test + build |
| E2E tests (Playwright) | should | Signup → voice → approve → outcome |
| Versioned migration files | should | `db:push` in use; run `db:generate` before production |
| Postgres RLS policies | nice | Enforced at query layer today |
| Redis-backed rate limit and cache | nice | Needed only above one node |
| Hosted TTS behind an adapter | nice | Browser `speechSynthesis` today |
| Supervisor dashboard, multilingual, integrations | nice | Explicit non-goals for V1 |

## Known limitations

- Rate limiter and response cache are per-process. Correct for one deployment; swap the `Map` for
  Redis behind the same function signatures to scale out.
- Speech output uses the browser's `speechSynthesis`: zero cost, zero latency, no vendor lock.
  Voice quality varies by browser. `speak()` in `useVoiceStream.ts` is the single swap point.
- Model prices in `src/server/cost/pricing.ts` are configuration and go stale. The credit
  abstraction means customer pricing does not have to move when they do.
- The `number` column on `work_orders` is a global sequence, so work order numbers are unique
  across the platform rather than per organisation.
