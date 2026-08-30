# ADR-002 — PostgreSQL with Drizzle

**Status:** accepted · **Date:** 2026-09-01

## Context
The Context Graph is strongly relational: organisation → site → asset → incident, measurement,
procedure, work order, outcome. Correctness matters more than flexibility — a duplicate work order
is a visible failure.

## Decision
PostgreSQL 16. Drizzle ORM: thin, SQL-shaped, fully typed, with migration tooling.

## Alternatives rejected
- **MongoDB** — the data is relational; we would rebuild joins and constraints in application code.
- **Prisma** — heavier runtime, a separate schema language, and a query builder that hides the SQL
  we care about tuning.
- **Raw SQL** — no type safety across a schema this wide, and no migration story.

## Consequences
Foreign keys, unique constraints and transactions enforce integrity below the application, so a bug
in a route cannot corrupt the graph. Every tenant table carries `organization_id` with a composite
index. Postgres RLS policies are a later hardening step; isolation is enforced at the query layer today.
