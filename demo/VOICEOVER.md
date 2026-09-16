# Voiceover script

Timed to the render. Total ≈ 92 seconds. Read it calmly and slightly under-energised —
this is an operations product, and a hyped read makes it sound like it has something
to hide.

---

**[0:00 — Hook]**
> *(let the technician's line land on its own — no narration over it)*

**[0:07 — Problem]**
> A machine breaks. The technician knows what's wrong in seconds. But recording it means
> stopping work, walking to a terminal, finding the asset, reading its history, and typing.
> So it gets written later, from memory. Or not at all.

**[0:21 — Title]**
> *(silence — let the mark and the line breathe)*

**[0:26 — Speak]**
> With FieldPilot, they just say it. AssemblyAI streams the speech; "pump three" resolves
> to asset P-003 by deterministic match — no model call, no cost, and nothing to hallucinate.

**[0:37 — Evidence]**
> Then it pulls that machine's actual history. Two prior vibration incidents. A pressure
> reading above range. The procedure that matches. Every reference is issued by the server,
> so the model can cite evidence — it cannot invent it.

**[0:50 — Approve]**
> It proposes an urgent work order. It does not create one. The tool gateway checks the
> allowlist, the schema, the tenant, the role and the risk — then stops, and waits for a
> human. One word. Approved. Work order created, audit trail written.

**[1:03 — Architecture]**
> Underneath is not a voice wrapper. Identity, policy, a context graph, a model router and
> a tool gateway. Seven tools exist. There is no execute-SQL, no fetch-URL, no arbitrary code.

**[1:16 — Economics]**
> And every turn is priced before it's spent. Rules and cache handle most of them for
> nothing. A full English turn costs twenty-six paise at seventy-eight percent margin.
> Ten Indian languages, including code-mixed speech.

**[1:27 — Close]**
> FieldPilot. Talk through the job — it becomes completed work.

---

## Generating the audio

Any of these produces `public/vo/voiceover.mp3`, which the video picks up automatically.
No file, no voiceover — the render still works.

**ElevenLabs** (best quality for an English submission): paste each block, download,
concatenate.

**Sarvam Bulbul** (you already have the key) — good for a Hindi cut:

```powershell
npm run voiceover
```

**Free and immediate** — Windows built-in, useful for timing a rough cut:

```powershell
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile("public\vo\voiceover.wav")
$s.Speak((Get-Content VOICEOVER.md -Raw))
$s.Dispose()
```

Then convert: `ffmpeg -i public/vo/voiceover.wav public/vo/voiceover.mp3`

## Timing it

Record first, then adjust `SCENES` in `src/theme.ts` so the picture matches the read.
Scene durations are in one object precisely so this is a two-minute edit, not a rebuild.
