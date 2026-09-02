# Deployment

From a working local install to something the world can use. Roughly 90 minutes.

---

## 0. Before you start

```powershell
npm run doctor      # everything green except optional keys
npm run verify      # typecheck + 113 unit tests
```

Do not deploy on red. `doctor` names the broken piece and the fix.

---

## 1. A managed database

The Docker container is for development. Production needs backups and
point-in-time recovery.

**Neon** (recommended — serverless Postgres, generous free tier, ap-south-1
region available):
1. neon.tech → new project → region **AWS ap-south-1 (Mumbai)** if your users
   are in India. Latency to the database is on every request.
2. Copy the pooled connection string.

Apply the schema with versioned migrations, not `db:push`:

```powershell
$env:DATABASE_URL="postgresql://...neon.tech/fieldpilot?sslmode=require"
npm run db:migrate
npm run seed          # optional; skip for a clean production tenant
```

---

## 2. Deploy

```powershell
npm i -g vercel
vercel login
vercel link
```

Set each variable (repeat per name):

```powershell
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel env add ASSEMBLYAI_API_KEY production
vercel env add NODE_ENV production
```

**Required in production**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Managed Postgres, pooled connection |
| `AUTH_SECRET` | 48 random bytes. Changing it signs everyone out |
| `ASSEMBLYAI_API_KEY` | Without it, voice is disabled and the UI says so |
| `NODE_ENV` | `production` |
| `DEPLOYMENT_MODE` | `hosted` |
| `PAYMENTS_PROVIDER` | `razorpay` once activated, else omit |
| `RAZORPAY_*` | Key id, secret, webhook secret |
| `APP_URL` | Your real domain |

**Optional:** `SARVAM_API_KEY` for Indian languages, `AI_*` overrides.

```powershell
vercel --prod
```

---

## 3. Verify before you tell anyone

```powershell
curl https://your-app.vercel.app/api/health
```

Every check must be `true` — including `schema`, which fails if the database is
behind the deployed code. **If `rateLimiter` is false, stop** — the cost
controls are not running and one abusive user can spend your money freely.

Then run the full integration suite against production:

```powershell
$env:APP_URL="https://your-app.vercel.app"
npm run smoke
```

44 checks. All must pass.

---

## 4. Domain and HTTPS

Vercel → Settings → Domains → add yours, follow the DNS instructions.

**HTTPS is not optional here.** `getUserMedia` fails silently on plain HTTP for
anything other than `localhost`, so the microphone will simply not work on a bare
IP or an http domain. Vercel issues certificates automatically.

---

## 5. Payments

Follow `docs/RAZORPAY.md`. In short: activate the account (the six policy pages
are already built and linked), create a **live-mode** webhook pointing at
`/api/billing/webhook/razorpay` with a fresh secret, then make one real purchase
of the smallest pack and confirm the credits land.

---

## 6. Backups and recovery

Neon keeps point-in-time recovery on paid tiers. Whatever provider you choose:

**An untested backup does not exist.** Before your first customer, restore a
snapshot into a scratch database and run `npm run smoke` against it. Put a
reminder in your calendar to repeat it quarterly.

Also run the portability round-trip, which proves an export can be verified:

```powershell
$env:FP_COOKIE="fp_session=..."
npm run export:test
```

---

## 7. Operating it

### Before your first multi-site customer

```powershell
$env:APP_URL="https://your-app.vercel.app"
npm run loadtest -- --users 40 --turns 6
```

Note what this does and does not prove: every worker signs in as the same
account, so the per-user rate limit dominates and the result measures **the
limiter**, not throughput. Seeing most requests return 429 is the pass
condition, not a failure. For real capacity numbers you need distinct users.

Set `TRUSTED_PROXY_HOPS` correctly for your deployment: **1** behind Vercel
alone, **2** with Cloudflare in front. Too high and per-IP limits track a
spoofable value.

| Task | How |
| --- | --- |
| Watch errors | Vercel → Logs. Filter `"level":"error"` |
| Watch spend | `/usage` as an owner: cost per completed job and contribution margin |
| Prune rate-limit rows | `pruneRateLimits()` on a weekly cron. Harmless if skipped |
| Kill a runaway feature | Set its `FEATURE_*` flag false and redeploy. No code change |
| Roll back | Vercel → Deployments → previous → Promote to Production |

**Feature flags are your emergency brake.** `FEATURE_VOICE_AGENT`,
`FEATURE_TOOL_EXECUTION`, `FEATURE_OUTCOME_LEDGER` each disable a subsystem
without touching code.

---

## 8. Before real customers

- [ ] Restore a backup into a scratch database and run `smoke` against it
- [ ] `npm run export:test` passes
- [ ] Roll back to the previous deployment and back again, timed
- [ ] Confirm `/api/health` is green, including `rateLimiter`
- [ ] One real payment end to end
- [ ] Legal pages carry your real address (`src/content/business.ts` — the
      `TODO` fields)
- [ ] DPDP review by an Indian technology lawyer
- [ ] Decide the hackathon licence question (see `docs/LICENSING-NOTE.md`)

---

## Self-hosted customers

For a customer whose data cannot leave their network:

1. Issue a licence key (see `COMMERCIAL-LICENCE.md`).
2. They set `DEPLOYMENT_MODE=self-hosted`, `LICENSE_KEY`, `LICENSE_SIGNING_SECRET`.
3. `docker compose up -d` for Postgres, then `npm run db:migrate && npm start`.

An expired licence degrades to read-only and warns. It never deletes data and
never locks anyone out of their own records mid-shift — deliberately.
