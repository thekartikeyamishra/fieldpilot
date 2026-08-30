# ADR-004 — AssemblyAI behind a VoiceProvider adapter

**Status:** accepted · **Date:** 2026-09-01

## Context
The hackathon requires AssemblyAI, and the product genuinely needs real-time turn-taking rather than
post-processed speech. But the API key must never reach the browser, and depending on the vendor's
SDK shape throughout the app would make the dependency structural.

## Decision
One interface, `VoiceProvider`, with a single implementation. `src/integrations/assemblyai/` is the
only file that knows the vendor exists. The server mints a single-use streaming token
(`GET /v3/token`, 60s TTL, capped session duration); the browser connects to
`wss://streaming.assemblyai.com/v3/ws` with that token and streams 16 kHz PCM produced by an
AudioWorklet.

## Alternatives rejected
- **Browser holds the API key** — an unbounded, unattributable spend liability. Non-negotiable no.
- **Proxy audio through our server** — doubles latency and bandwidth for no security gain over
  short-lived tokens.
- **Web Speech API** — inconsistent across browsers, no turn-taking control, and it would make the
  AssemblyAI integration cosmetic rather than infrastructural.

## Consequences
Voice sessions are explicitly terminated (`{"type":"Terminate"}`), because streaming is billed on
connection time and an abandoned socket bills for its full window. Reconnect mints a fresh token,
since each is single-use. Speech output uses the browser's `speechSynthesis` — zero cost, zero
latency, one function to swap for hosted TTS.
