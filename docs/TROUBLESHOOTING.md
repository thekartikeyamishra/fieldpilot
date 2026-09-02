# Troubleshooting

Run `npm run doctor` first. It checks the same things this page describes and tells you which one
is broken.

---

## `npm error EPERM ... mkdir 'E:\'`

npm is running somewhere other than the project folder, or in a place Windows will not let it write.

**Check where you are.** `package.json`, `.env.example` and `docker-compose.yml` must sit next to
`setup.ps1`. If the zip was extracted into a subfolder, `cd` into it first:

```powershell
Get-ChildItem            # do you see package.json here?
cd .\fieldpilot          # if the files are one level down
.\setup.ps1
```

**Never run from a drive root.** `E:\` is not a valid project folder — npm cannot create
`node_modules` there. Use `E:\projects\fieldpilot`.

**Other EPERM causes**, in the order they actually happen:

1. Antivirus scanning `node_modules` mid-write. Add the project folder to your exclusions.
2. OneDrive / Dropbox / Google Drive syncing the folder. Move the project outside the synced tree.
3. VS Code, a dev server or a file explorer holding files open. Close them, then
   `Remove-Item -Recurse -Force node_modules` and retry.
4. A network or external drive with restrictive permissions. Copy the project to a local disk.

`setup.ps1 -Check` diagnoses all of this without changing anything.

---

## `no configuration file provided: not found`

That is Docker saying there is no `docker-compose.yml` in the current folder — the same
wrong-directory problem as above.

---

## `Cannot find path '.env.example'`

Same cause. The project files are not where you are standing.

---

## Docker is installed but `docker compose up -d` fails

Docker Desktop must actually be running, not merely installed. Start it, wait for the whale icon to
settle, then retry. If you would rather use your own Postgres:

```powershell
# put your own connection string in .env.local, then
.\setup.ps1 -SkipDocker
```

---

## `/api/health` says the database is unreachable

```powershell
docker compose ps          # is the container healthy?
docker compose logs db     # what did Postgres say?
```

Then confirm `DATABASE_URL` in `.env.local` matches the container:
`postgres://fieldpilot:fieldpilot@localhost:5432/fieldpilot`.

Port 5432 already in use by another Postgres? Change the host port in `docker-compose.yml` to
`5433:5432` and update `DATABASE_URL` to match.

---

## `/api/health` says the voice provider is missing

`ASSEMBLYAI_API_KEY` is empty in `.env.local`. Add it and restart `npm run dev` — environment
variables are read at boot.

Everything except live microphone streaming works without it, including the typed input, the full
orchestration path, approvals and the outcome ledger.

---

## The voice socket opens and closes immediately

Almost always the speech model string. Model names change; this one is configuration, not code:

```
ASSEMBLYAI_SPEECH_MODEL=u3-rt-pro                    # default
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english  # safest fallback
```

Change it in `.env.local`, restart, try again.

---

## "Voice unavailable" and the job page shows Typing mode

`ASSEMBLYAI_API_KEY` is not set. This is expected, not broken — the product deliberately checks on the
server and disables the microphone rather than letting you press a button that cannot work.

Everything except live audio still runs: type what you would say and the pipeline is identical —
same asset resolution, same evidence, same approval step, same records. Add the key to `.env.local`
and restart (`npm run dev`), since environment variables are read at boot. `npm run doctor` confirms it.

---

## Hydration warning mentioning an attribute on `<html>`

Something like `data-scribe-recorder-ready="true"` or `data-lt-installed`. That attribute is added by a
**browser extension** — screen recorder, password manager, translator, grammar checker — before React
loads. It is not a rendering bug in the app.

The root element carries `suppressHydrationWarning` for exactly this case. If you still see the warning
for a *different* attribute, test in an incognito window with extensions disabled to confirm the source
before changing any code.

---

## The microphone button does nothing

Browsers only allow microphone access on `localhost` or over HTTPS. On `http://` with any other
hostname, `getUserMedia` fails silently by design. Deploy behind HTTPS, or test on `localhost`.

Also check the browser's site permissions — a previously denied prompt does not reappear on its own.

---

## `The agent says analysis is limited right now`

That is the degraded path working, not a crash. One of three things:

- No LLM key configured (`AI_API_KEY`, or the AssemblyAI key it falls back to).
- The provider rejected the model name — check `AI_MODEL_FAST` / `AI_MODEL_SMART`.
- A cost ceiling was reached. Raise `AI_COST_LIMIT_PER_SESSION` in `.env.local`.

The server log line `model_primary_failed` carries the provider's own error text.

---

## Buying credits returns "that capability is switched off"

Expected in production with `PAYMENTS_PROVIDER=mock`. The mock takes no money, so it is refused
outside development by design. Set `PAYMENTS_PROVIDER=razorpay` with real keys.

In development the mock fulfils instantly and the balance updates on reload.

---

## A payment succeeded but no credits arrived

Credits are granted by the webhook, not by the browser. Check, in order:

1. Is the Razorpay webhook pointed at `POST /api/billing/webhook/razorpay` and subscribed to
   `payment.captured`?
2. Does `RAZORPAY_WEBHOOK_SECRET` match the one configured in the Razorpay dashboard? A mismatch
   logs `webhook_rejected` with `signature mismatch` and returns 400.
3. Is the endpoint reachable from the internet? A local dev server needs a tunnel.

The payment row on `/usage` shows the real state. Razorpay retries a 5xx, so a transient failure
self-heals; a 400 does not, because a signature that does not verify is never retried into working.

---

## `AUTH_SECRET must be at least 32 characters`

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste the result into `.env.local`. Changing it signs everyone out; that is expected.

---

## Everyone got signed out after a restart

See above — a new `AUTH_SECRET` invalidates existing session cookies. Keep it stable per environment.
