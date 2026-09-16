# FieldPilot — product demo (Remotion)

A ~90 second product demo, rendered from code. Nine scenes, meaningful
transitions, synthesised SFX, optional voiceover.

Rendering from code rather than an editor means the demo stays true: it uses the
product's real design tokens, and when a number changes you edit one line and
re-render instead of rebuilding a timeline.

## Run it

```powershell
cd demo
npm install
npm start              # Remotion Studio — live preview, scrub the timeline
```

First launch downloads a headless Chrome (~150 MB). One time.

## Render

```powershell
npm run render         # 1920x1080 mp4 -> out/fieldpilot-demo.mp4
npm run render:square  # 1080x1080 for LinkedIn and X
npm run render:cover   # cover.png for the lablab.ai submission
```

## Voiceover

The video renders fine without one. To add it, produce
`public/vo/voiceover.mp3` — the composition detects the file and plays it
automatically. Script and three ways to generate it are in `VOICEOVER.md`,
including `npm run voiceover`, which reuses the Sarvam key from the main project.

Record first, then tune `SCENES` in `src/theme.ts` so the picture matches your
read. Scene durations live in one object precisely so this is a two-minute edit.

## Sound

Every effect in `public/sfx/` was synthesised for this project — no sample packs,
no attribution, no licensing risk in a competition submission.

| File | Where | Why it sounds like that |
| --- | --- | --- |
| `tap` | approval press | dry, low, short — a control-panel button, not a notification |
| `whoosh` | scene cuts | filtered noise sweep, kept quiet enough to sit under narration |
| `tick` | evidence cards | tiny and informational; four in a row must not become a drum |
| `confirm` | work order created | two rising notes, the only warm sound in the video |
| `impact` | title cards | low sine plus a short noise burst |
| `roomtone` | scene beds | 50 Hz hum and brown noise, barely audible — silence otherwise reads as dead air |

## Structure

| Scene | Length | Job |
| --- | ---: | --- |
| Hook | 7s | A technician's sentence. No logo, no music sting |
| Problem | 14s | Six steps and a clock — the cost, shown not asserted |
| Title | 5s | The one line that has to be remembered |
| Speak | 11s | Real UI, state rail, deterministic asset resolution |
| Evidence | 13s | The differentiator: cited records with dates |
| Approve | 12s | The boundary between intelligence and action |
| Architecture | 13s | For the judge asking "is this a wrapper?" |
| Economics | 11s | The part a business actually buys |
| Close | 8s | Mark, line, proof points |

Transitions carry meaning: **fade** = change of subject, **slide** = moving
forward through the same workflow, **wipe** = pulling back to reveal the layer
underneath.

## Before you render for the submission

- `src/scenes/Close.tsx` says `fieldpilot.app` — change it to your real deployed URL.
- `Speak.tsx` shows `00:14` and `Approve.tsx` shows work order `#14`. If you
  record a real screen capture later, match these to it.
- Everything factual in the video is drawn from the product's own tested
  numbers — ₹0.26 per turn, 78% margin, 126 tests. If those change, change them
  here too. A demo that overstates is worse than no demo.
