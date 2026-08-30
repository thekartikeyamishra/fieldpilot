# Demo script

Four minutes. The order matters: the judge should think "another voice agent" for the first
twenty seconds, then keep being wrong.

## Before you start

- `http://localhost:3000/api/health` — everything green.
- Signed in as `demo@fieldpilot.app`, sitting on **Voice job**.
- A second tab on **Work** to show the ledger at the end.
- Browser microphone permission already granted (do this before you present, not on stage).
- If the room is loud or the wifi is bad, use the typed input. Identical pipeline, no apology needed.

## The run

**1. The problem (20s).** "A technician finds a fault. To do anything about it they stop work, walk
to a terminal, find the asset, read its history, then type. FieldPilot removes the walk."

**2. Speak (30s).**
> "I'm at Site 14. Pump 3 is vibrating again."

Point at the state rail as it moves: listening → retrieving → recommended. Note the asset resolved
to Pump 3 — and that the seed data also contains a **Pump 30**, which is why the system asks rather
than guesses when the utterance is ambiguous.

**3. The turn (30s).** FieldPilot names the two prior vibration incidents and MP-17. Open the
evidence panel: E1, E2, E3 are real records with dates, not a paraphrase. Say the line that matters:
*"It cannot invent an evidence reference. The server mints them; anything else is dropped before
you see it."*

**4. Give it a reading (20s).**
> "The pressure is 8.7 bar."

This one costs nothing — the deterministic rule layer handles it. Show the cost strip:
`path rule · 0 ms · $0.00000`.

**5. The approval boundary (40s).** FieldPilot drafts an urgent work order. Do not tap Approve yet.
*"The model proposed this. It did not do it. The tool gateway checked the allowlist, the schema, the
tenant, the role and the risk class — and then it stopped, because a write proposed by an AI needs a
human."* Tap **Approve**.

**6. The receipt (30s).** Work order number, session duration, minutes returned, audit entry written.
Switch to **Work**: the outcome ledger, with the attribution basis published underneath. *"We
undercount deliberately. The number has to survive being questioned."*

**7. The economics (30s).** Dashboard: cost per completed job. *"Not tokens. Not sessions.
Cost per completed job — and every model call passes a budget ceiling before it happens."*

**8. Close (20s).** "Voice plus operational context plus evidence plus controlled execution plus a
measured outcome. Speech is the interface. The system is the product."

## If something breaks

- **Mic blocked or too loud** → type the same sentences. Say "same pipeline" and carry on.
- **No network to the model** → the degraded path still shows real history, the real procedure and a
  clear statement that analysis is limited. That *is* the graceful-degradation story; use it.
- **Budget ceiling hit mid-demo** → also a feature. Show the message, raise
  `AI_COST_LIMIT_PER_SESSION`, continue.
