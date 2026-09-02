# Indian languages: Sarvam alongside AssemblyAI

## The constraint that shapes this design

The hackathon requires every project to be built on AssemblyAI. Sarvam therefore does **not** replace
it. AssemblyAI stays the default and owns the English path; Sarvam is a second adapter behind the same
`VoiceProvider` port, selected by the technician's language. Both coexist, and either can be removed
without touching workflow code.

```
technician picks language
          |
   +------+-------+
   |              |
English        Hindi, Bengali, Marathi, Telugu,
   |           Tamil, Kannada, Gujarati, Malayalam, Punjabi
   |              |
AssemblyAI     Sarvam
streaming      utterance STT + Bulbul TTS
   |              |
   +------+-------+
          |
   one shared context graph, policy engine, tool gateway
```

One conversational brain, language-specific speech at the edges. Not nine assistants.

## Why utterance REST rather than a streaming socket

Sarvam does offer streaming, but for this product the REST path is better on three counts:

1. **The key stays server-side.** A browser cannot set auth headers on a WebSocket. Streaming would
   mean either exposing the subscription key or proxying audio through our server anyway.
2. **We pay for speech, not silence.** Field sessions are mostly gaps between short bursts. Sarvam
   bills per second of audio; an open socket would bill the pauses too.
3. **Technicians speak in bursts.** "पंप 3 में vibration आ रहा है" is eight seconds, not a monologue.

## The cost finding that drives everything

Per turn, at published rates (Sarvam, 2026):

| Path | Cost | Credits | Revenue | Margin | Dominant cost |
| --- | ---: | ---: | ---: | ---: | --- |
| English via AssemblyAI | ₹0.260 | 1 | ₹1.20 | 78% | speech |
| Hindi spoken reply | ₹0.655 | 2 | ₹2.39 | 73% | **speech output** |
| Hindi, cached phrase | ₹0.175 | 1 | ₹1.20 | 85% | speech |
| Hindi, text-only reply | ₹0.175 | 1 | ₹1.20 | 85% | speech |

**Text-to-speech is the most expensive part of an Indian-language turn — more than the model call.**
Bulbul v3 is ₹30 per 10,000 characters; Sarvam 105B is ₹29.28 per *million* input tokens. A chatty
200-character reply costs more to speak than to think.

Every optimisation below follows from that one line.

## How we keep the margin

| Technique | Effect | Where |
| --- | --- | --- |
| **Hard cap on spoken output** — 180 chars, truncated at a sentence boundary | Caps the dominant cost per turn | `MAX_SPOKEN_CHARS`, `integrations/speech/sarvam.ts` |
| **Phrase cache for speech output** | Field dialogue repeats constantly — "Work order created", "Which asset?". Cached phrases cost ₹0 | `ttsCache` |
| **Browser voice for English** | English speech output is free; we pay only where the browser has no usable voice | `Language.browserTts` |
| **Sarvam 105B as the Indic model** | ₹29.28/₹73.2 per 1M tokens — several times cheaper than Western frontier models | `SARVAM_LLM_MODEL` |
| **Prompt caching** | Sarvam's cached input rate is ₹10.98 vs ₹29.28 — a 62% discount on the system prompt, which is identical every turn | Enable once traffic justifies it |
| **The rule layer still runs first** | A pressure reading in Hindi is still parsed deterministically. Free path, no provider call at all | `workflow/rules.ts` |
| **An extra credit only when we actually paid** | A spoken Indic reply charges 2 credits; a cached or text-only reply charges 1 | `creditsForLanguageTurn` |

The margin guard is a test, not an intention: `tests/unit/language-economics.test.ts` fails the build if
any supported language drops below 40% margin.

## Code-switching

Real speech is "पंप 3 में vibration आ रहा है, pressure 8.7 bar" — not clean Hindi.

The deterministic asset matcher survives this because `extractPortableTokens()` pulls the Latin and
numeric tokens out of any script before matching. Asset codes, equipment names and readings are said
the same way in every language, so **P-003 resolves from a Hindi sentence without a model call**. That
is not a happy accident; it is why the matcher was built on tokens rather than language.

Sarvam's STT accepts `language_code` and can auto-detect, which matters most for code-mixed input.

## What is NOT built yet

Being explicit, because this is a foundation rather than a finished feature:

- **Browser audio capture for the Sarvam path.** The adapter accepts an utterance; the client-side
  recorder that produces it (record → detect end of speech → POST) is not written. The AssemblyAI
  streaming path is complete.
- **Model names are unverified.** `saaras:v4`, `bulbul:v3`, `sarvam-105b`, speaker `anushka` are from
  the docs, not tested against a live key. Confirm before relying on them.
- **No Indian-language evaluation set.** This is the highest-leverage missing piece. Model quality
  claims mean nothing until tested on *your* users, accents, plant noise and equipment vocabulary.
- **Native-language prompting.** The system prompt is English. It should instruct the model to answer
  in the technician's language, and be evaluated per language.

## Setting it up

```
SARVAM_API_KEY=              # dashboard.sarvam.ai — ₹100 free credits on signup
SARVAM_STT_MODEL=saaras:v4
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=anushka
SARVAM_LLM_MODEL=sarvam-105b
SARVAM_TTS_ENABLED=true      # false = text-only replies, cheapest path
```

Without a key the product runs English-only through AssemblyAI. Nothing breaks.

**Commercial licensing:** shipping Bulbul-generated audio in a paid product has its own licence terms.
Read `docs.sarvam.ai/api/getting-started/commercial-licensing` before you charge for it.

**Sarvam Startup Program** (6–12 months of API credits, priority support) is worth applying to before
you spend anything: `sarvam.ai`.
