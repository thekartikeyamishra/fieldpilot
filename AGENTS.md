# CLAUDE.md — engineering constitution for FieldPilot

Read this before writing a single line. Every AI coding session starts here.
If you change the architecture, update this file in the same commit.

## What we are building

A voice-to-work operations copilot for field maintenance technicians.
**Not** a voice chatbot. The promise: *talk through the job, and it becomes completed, recorded work.*

The hero flow, which every decision must serve:

```
speak -> understand -> identify asset -> retrieve context -> recommend with evidence
      -> human approves -> tool executes -> outcome recorded
```

## The architecture, in one line

```
Interface -> Identity -> Policy -> Workflow -> Context -> Model -> Validated tool -> Durable outcome
```

The LLM is one component inside the system, never the system itself.

## Non-negotiable rules

1. **The AI is never the authority.** It proposes. Policy decides. A human approves writes. Tools
   execute. Audit records. Never trust a model's claim about permissions, identity or state.
2. **Tenant isolation lives at the query.** Every tenant table carries `organization_id`; every
   query scopes by it. Never filter in the UI and call it security.
3. **No tool exists unless it is in `src/server/tools/registry.ts`.** Never add `execute_sql`,
   `run_shell`, `fetch_url` or any general-purpose escape hatch.
4. **Every model output is schema-validated** (`src/ai/schemas.ts`) before it can influence anything.
   Free-form text never drives a side effect.
5. **Every paid inference passes `checkBudget` first.** There is no other path to a model call.
6. **Every side effect carries an idempotency key.** Retries must not duplicate work.
7. **No secrets in client code, git, logs or screenshots.** The AssemblyAI key stays server-side;
   the browser gets a single-use token.
8. **No raw PII in telemetry.** Hash identifiers with `hashId`.
9. **Never lose user work.** Every failure path states what is safe. Errors are human sentences with
   a request id, never a stack trace or a status code.
10. **Vendor code lives behind an adapter.** `src/integrations/assemblyai/` is the only file that
    knows AssemblyAI exists. Model providers go behind `src/ai/router.ts`.

## Cost discipline

Use intelligence proportional to uncertainty:

```
deterministic rule -> cache -> budget check -> cheap model -> reasoning model
```

Before adding an AI call, answer: can a rule do this? can the cache? what does it cost per turn?
what is the ceiling? what happens when the ceiling is hit? A feature that cannot earn its cost gets
cut or merged.

## Definition of done

A feature is done when: acceptance criteria pass · unit and integration tests green · security
verified (authz, tenant, validation) · cost measured · failure and offline paths handled · loading,
empty and error states implemented · audit events emitted · feature flag defined · rollback known ·
docs updated · no secrets · `npm run typecheck` and `npm test` clean.

## Forbidden patterns

LLM touching the database directly · arbitrary tool execution · API keys in the browser · unbounded
retries or context · provider SDKs sprinkled through business logic · microservices for their own
sake · destructive migrations · unversioned prompts · silent failures · silent data loss ·
business rules inside React components.

## Current implementation status

Complete: foundation, auth, policy engine, context graph, cost governor, tool gateway, orchestrator,
voice streaming, approval flow, outcome ledger, audit log, export, health check, unit tests.

Not built: monetisation/credits, analytics events, CI workflows, E2E tests, migration files
(using `db:push` for now).

Known limitations: rate limiter and response cache are in-process (single node); TTS is the browser's
`speechSynthesis`; row-level security is enforced in the query layer, not yet as Postgres RLS policies.
