# ADR-006 — Data portability as a product feature

**Status:** accepted · **Date:** 2026-09-01

## Context
"No lock-in" is a claim every vendor makes. It is only true if a customer can leave with everything,
today, without asking.

## Decision
`GET /api/export` returns the organisation's entire graph in one authenticated request: a manifest
(version, timestamps, entity counts, sha256 per entity) plus the entities themselves. Password hashes
are excluded — an export is not a credential dump. `npm run export:test` re-fetches the export and
recomputes every checksum.

## Alternatives rejected
- **Export on request via support** — the thing this decision exists to prevent.
- **CSV per table** — loses relationships, types and nesting.
- **Streaming NDJSON archive with media** — the right long-term shape; deferred because there is no
  media yet and a single JSON document is verifiable today.

## Consequences
Export is memory-bound and will need cursored streaming at large tenant sizes. Checksums make an
export verifiable rather than merely produced, which is what turns portability into evidence.
