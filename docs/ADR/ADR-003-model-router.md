# ADR-003 — Model router and the cost cascade

**Status:** accepted · **Date:** 2026-09-01

## Context
One abnormal user can destroy the unit economics of many normal ones. Model prices and names change
monthly. The product must never be architecturally welded to a single LLM.

## Decision
Business logic asks for a **task class** and a **tier** (`fast` | `smart`), never a vendor. The
router resolves that to a provider through an OpenAI-compatible adapter, with retry, jitter, a
configured fallback provider, and per-call cost logging.

In front of it, a cascade: deterministic rules → exact-match cache → budget check → cheap model →
reasoning model. Roughly: use intelligence proportional to uncertainty.

## Alternatives rejected
- **Call the provider SDK directly** — spreads vendor detail through the workflow and makes a swap a
  rewrite.
- **Always use the best model** — pays reasoning prices for "the pressure is 8.7 bar".
- **A third-party gateway as the only path** — trades one lock-in for another.

## Consequences
Switching providers is an environment change. `AI_MODEL_FAST`/`AI_MODEL_SMART` are configuration, so
a renamed model does not break a deploy. The trade-off is a small routing layer to maintain and a
pricing table that goes stale — mitigated by the credit abstraction, which keeps customer pricing
stable when provider pricing moves.
