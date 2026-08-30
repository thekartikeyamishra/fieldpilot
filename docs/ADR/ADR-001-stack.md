# ADR-001 — TypeScript, Next.js, modular monolith

**Status:** accepted · **Date:** 2026-09-01

## Context
A month-long build by one person, judged on working software. The system needs a browser UI, a
WebSocket-adjacent audio path, server-side secret custody, a relational store and real transactional
writes.

## Decision
TypeScript everywhere. Next.js App Router for both UI and API. One deployable application, separated
internally into modules (`app`, `server`, `ai`, `integrations`, `db`, `lib`).

## Alternatives rejected
- **Python/FastAPI backend + separate React frontend** — two languages, two deploys, duplicated types
  across the boundary. The integration tax is paid daily and buys nothing here.
- **Microservices** — deployment complexity, network failure modes and debugging overhead, with no
  scaling problem to solve yet.
- **Vite SPA + standalone API** — loses server components and makes secret custody the developer's
  problem on every route.

## Consequences
One language, one type system, one deploy. Business logic sits in `src/server/*` behind pure
functions, so extracting a service later is a move, not a rewrite. Vendor lock to Next.js is real
but shallow: the domain layer imports nothing from the framework.
