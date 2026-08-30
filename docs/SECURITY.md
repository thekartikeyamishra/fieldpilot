# Security posture — what is enforced, in code

This is the implemented subset of the Security & Access document. Each row names the file that
enforces it, so the claim is auditable rather than aspirational.

| Control | Enforced in |
| --- | --- |
| Authentication: scrypt hashing, signed session cookie, live DB re-check every request | `src/server/auth/` |
| Authorisation: role → permission matrix, pure and unit-tested | `src/server/policy/roles.ts` |
| Tenant isolation: checked first, before role or risk; every query scopes by `organization_id` | `src/server/policy/policy.ts`, all repositories |
| AI trust ladder: observe → recommend → draft → execute low-risk; high risk never AI-executable | `src/server/policy/policy.ts` |
| Human approval for every AI-initiated write | `src/server/tools/gateway.ts` |
| Tool allowlist: seven tools, no general-purpose escape hatch | `src/server/tools/registry.ts` |
| Schema-constrained tool arguments; asset bound by the platform, not the model | `src/server/tools/registry.ts`, `impl.ts` |
| Structured model output validated before it can influence anything | `src/ai/schemas.ts` |
| Evidence refs minted server-side; unknown refs dropped before render | `src/server/workflow/orchestrator.ts` |
| Prompt injection: untrusted content fenced, detection logged as a signal | `src/ai/safety.ts` |
| Idempotency on every side effect | `src/lib/ids.ts`, `gateway.ts` |
| Rate limits on auth, sessions, turns, tool execution, token minting | `src/lib/rate-limit.ts` |
| Cost ceilings per session, per user-day, per org-month; hard caps on duration, calls, input size | `src/server/cost/governor.ts` |
| Secret custody: provider key server-side only; browser gets a 60s single-use token | `src/integrations/assemblyai/` |
| Append-only audit log: who, what, when, on what, result | `src/server/audit/audit.ts` |
| Zero-PII telemetry: salted-hashed identifiers in logs | `src/lib/ids.ts`, `logger.ts` |
| Human-language errors with a request id; no internals leaked | `src/lib/errors.ts`, `http.ts` |
| Security headers, no `X-Powered-By`, scoped microphone permission | `next.config.ts` |
| One-click export excluding credentials | `src/app/api/export/route.ts` |

## Not yet implemented

Postgres RLS policies (isolation is at the query layer today) · anomaly detection and automated
abuse response beyond rate limits · key rotation schedule · formal incident response runbook ·
dependency licence review / SBOM generation.

## Reporting

Security issues: kartikeyamishra099@gmail.com. Please do not open a public issue.
