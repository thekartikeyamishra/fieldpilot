# Putting FieldPilot on fieldpilot.me

Two things I cannot do for you: I have no access to your registrar, your
hosting account or your Square dashboard. Everything below is exact, but you
have to run it.

Budget about 2 hours, most of it waiting for DNS.

---

## 1. A managed database (20 minutes)

The Docker container is for development only. Production needs backups.

1. **neon.tech** → new project → region **AWS ap-south-1 (Mumbai)** if your
   users are in India. Database latency is on every single request.
2. Copy the **pooled** connection string.
3. Apply the schema with versioned migrations, never `db:push`:

```powershell
$env:DATABASE_URL="postgresql://...neon.tech/fieldpilot?sslmode=require"
npm run db:migrate
```

Do **not** run `npm run seed` against production unless you want the demo org.

---

## 2. Deploy (20 minutes)

```powershell
npm i -g vercel
vercel login
vercel link
```

Set each variable with `vercel env add <NAME> production`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your Neon pooled string |
| `AUTH_SECRET` | 48 random bytes. Changing it signs everyone out |
| `APP_URL` | `https://fieldpilot.me` |
| `NODE_ENV` | `production` |
| `DEPLOYMENT_MODE` | `hosted` |
| `ASSEMBLYAI_API_KEY` | Without it, voice is disabled and the UI says so |
| `TRUSTED_PROXY_HOPS` | `1` for Vercel alone, `2` behind Cloudflare |

Generate a secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then `vercel --prod`.

---

## 3. Point the domain (30 minutes, plus DNS propagation)

In **Vercel → Settings → Domains**, add **both** `fieldpilot.me` and
`www.fieldpilot.me`. Vercel shows the exact records; at your registrar:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Use whatever Vercel displays — those values change.

**The app already redirects `www` to the apex permanently.** This is not
cosmetic: your session cookie is set on `fieldpilot.me` and is *not* sent to
`www.fieldpilot.me`, so without one canonical host a user who signs in on one
and lands on the other is silently signed out.

Certificates are issued automatically. **HTTPS is not optional here** —
`getUserMedia` fails on plain HTTP for anything but `localhost`, so the
microphone simply will not work until the certificate is live.

### If your domain is at Squarespace

Squarespace will be serving something at that domain now. Either point the DNS
at Vercel as above, or transfer the domain out. You cannot have both answering
the same host.

---

## 4. Verify before telling anyone

```powershell
curl https://fieldpilot.me/api/health
```

Every check must be `true`.

- **`schema: false`** → the database is behind the code. `npm run db:migrate`.
- **`rateLimiter: false`** → **stop.** Cost controls are not running and one
  abusive user can spend your money freely.

Then run the full integration suite against production:

```powershell
$env:APP_URL="https://fieldpilot.me"
npm run smoke
```

44 checks, all must pass.

---

## 5. Payments

### India — Razorpay

Follow `docs/RAZORPAY.md`. Activate the account (the six policy pages are built
and linked), create a **live-mode** webhook at
`https://fieldpilot.me/api/billing/webhook/razorpay`, then buy the smallest pack
with a real card and confirm the credits land.

### International — Square

**The pay link you were creating in the dashboard will not work for this.** A
static link cannot tell us *which account* to credit, so money arrives
unattributable and someone reconciles it by hand. FieldPilot creates a payment
link per purchase through the API instead, carrying our own order id.

Keep the static link if you like — it is fine for a self-hosted licence sale,
where fulfilment is manual anyway.

1. **developer.squareup.com** → your application → **Credentials** → copy the
   **production access token**.
2. **Locations** → copy the **Location ID**.
3. **Webhooks** → Add subscription:
   - URL: `https://fieldpilot.me/api/billing/webhook/square`
   - Event: `payment.updated`
   - Copy the **signature key**.
4. Set:

```powershell
vercel env add SQUARE_ACCESS_TOKEN production
vercel env add SQUARE_LOCATION_ID production
vercel env add SQUARE_WEBHOOK_SIGNATURE_KEY production
vercel env add SQUARE_WEBHOOK_URL production      # https://fieldpilot.me/api/billing/webhook/square
vercel env add PAYMENTS_PROVIDER_INTL production  # square
```

> **`SQUARE_WEBHOOK_URL` must match the dashboard entry character for
> character.** Square signs the concatenation of the URL and the body, so a
> trailing slash or an `http`/`https` mismatch makes every signature fail — and
> the failure looks *exactly* like a forged request. If genuine payments are
> being rejected, this is the first thing to check.

5. Test in sandbox first: set `SQUARE_ENVIRONMENT=sandbox` with sandbox
   credentials, buy a pack, confirm credits land. Then switch to production.

---

## 6. International pricing, and why it is not the rupee price converted

| Pack | India | International |
| ---: | ---: | ---: |
| 100 credits | ₹149 | $9 |
| 400 credits | ₹499 | $29 |
| 1,500 credits | ₹1,799 | $99 |

Three reasons, each of which costs real money if ignored:

1. **Square takes about 2.9% + 30¢ per transaction.** On a $2 sale the fixed 30¢
   alone is 15%. Small packs must be priced so the fixed fee cannot eat the
   margin — there is a test asserting it stays under 5%.
2. **Cross-border settlement and FX** cost another 1–2%.
3. **A US or EU buyer's willingness to pay is not an Indian SME's.** Charging
   them Indian prices is not generosity, it is leaving money on the table.

After all fees, international packs net **85–93%** of gross, and every one nets
more per credit than the domestic equivalent. Those are assertions in
`tests/unit/international-payments.test.ts`, not estimates — if you change a
price and break one, the test fails.

---

## 7. Before real customers

- [ ] `/api/health` fully green, including `rateLimiter` and `schema`
- [ ] `npm run smoke` passes against production
- [ ] One real Razorpay payment, end to end
- [ ] One real Square payment, end to end, with credits landing
- [ ] Restore a database backup into a scratch database and run `smoke` against it
- [ ] `npm run export:test` passes
- [ ] Roll back to the previous deployment and forward again, timed
- [ ] Legal pages carry your real address (`src/content/business.ts` — the
      remaining `TODO` fields)
- [ ] DPDP review by an Indian technology lawyer
