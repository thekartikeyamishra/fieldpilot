# ADR-005 — Tool gateway and the approval boundary

**Status:** accepted · **Date:** 2026-09-01

## Context
An agent that can write to a production system is an incident waiting to happen unless the path from
intent to effect is narrow, inspected and reversible.

## Decision
Exactly one doorway between intent and effect:

```
allowlist -> schema -> authn -> authz -> policy -> risk class -> idempotency -> execute -> audit
```

Seven tools exist. There is deliberately no general-purpose escape hatch. Arguments are Zod-validated;
the asset is bound by the platform, never taken from the model. Every AI-initiated write is a draft
until a human taps Approve, and policy is re-evaluated at execution time because permissions may have
changed since the draft.

## Alternatives rejected
- **Native provider function calling straight to handlers** — convenient, but it makes the model's
  output the authorisation decision.
- **Full autonomy above a confidence threshold** — a confidence score is not a permission.
- **Approval in the UI only** — a client-side gate is a suggestion, not a boundary.

## Consequences
Two round-trips for any write, which is the correct cost for a system that files work orders.
Idempotency keys derive from tenant + session + tool + arguments, so retries and double-taps return
the first result instead of creating a second record. Trust can be raised later per tool by moving
reversible, low-risk actions to trust level 3 — the ladder exists in `policy.ts` already.
