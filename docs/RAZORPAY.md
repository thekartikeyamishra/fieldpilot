# Getting Razorpay keys and connecting them

Two separate tracks. Do them in parallel — test keys need none of the paperwork.

---

## Track A — test keys (today, ~10 minutes)

Test mode requires no KYC, no policy pages, no bank account. Cards are simulated; no money moves.

1. Sign up at <https://dashboard.razorpay.com/signup> with `workmailkartikeya@gmail.com`.
2. Confirm the toggle at the top of the dashboard reads **Test Mode**.
3. **Account & Settings → API Keys → Generate Test Key**.
4. Copy both values immediately — the secret is shown **once** and cannot be retrieved later.

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

### The webhook secret

This one you invent. It is a shared secret between Razorpay and your server, not something Razorpay issues.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The webhook needs a publicly reachable URL, so a local server needs a tunnel:

```powershell
npx cloudflared tunnel --url http://localhost:3000
```

Then in **Account & Settings → Webhooks → Add New Webhook**:

| Field | Value |
| --- | --- |
| Webhook URL | `https://<your-tunnel>/api/billing/webhook/razorpay` |
| Secret | the hex string you just generated |
| Active events | `payment.captured` and `payment.failed` |

Put all three into `.env.local` and switch the provider over:

```
PAYMENTS_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=<your hex string>
```

Restart (`npm run dev` — env is read at boot), sign in as `owner@fieldpilot.app`, go to **Usage → Top up**, and buy a pack. Use test card `4111 1111 1111 1111`, any future expiry, any CVV.

**What to expect:** checkout opens, payment succeeds, the message says credits appear once it settles. The balance updates when the webhook lands — usually a second or two. If it never updates, the webhook is not reaching you; check the Razorpay dashboard's webhook delivery log, which shows the exact response your server returned.

---

## Track B — live keys (activation)

Razorpay reviews the business before releasing `rzp_live_` keys. This is where the policy pages matter.

### What Razorpay checks

Your site must have these pages, publicly reachable **without signing in**. They are already built and linked from the landing page footer:

| Page | Route |
| --- | --- |
| About Us | `/about` |
| Contact Us | `/contact` |
| Pricing | `/pricing` |
| Terms & Conditions | `/terms` |
| Privacy Policy | `/privacy` |
| Refund & Cancellation | `/refunds` |

**Before you submit, edit `src/content/business.ts`.** Four fields are marked `TODO` — legal name, full address, and your production domain. A missing or incomplete address is the single most common activation rejection. The address must match what you give Razorpay.

Since FieldPilot is a digital service with no shipping, the refund page states that credits are delivered instantly to the account. Razorpay accepts that in place of a shipping policy; if a reviewer asks for one explicitly, say so and I will add a `/delivery` page.

### The submission

1. Deploy the app so the six URLs above are live on your real domain.
2. Dashboard → **Complete Activation**.
3. Business type: **Individual / Sole Proprietorship** unless you have registered a company.
4. Provide PAN, the bank account that will receive settlements, and the business address.
5. Business category: **Software / SaaS**.
6. Website URL: your production domain.
7. Submit and wait — typically 2–4 working days.

### After approval

1. Switch the dashboard to **Live Mode** and generate live keys.
2. Create the webhook again in Live Mode — test-mode webhooks do not carry over. Use a **new** secret.
3. Set the live values in your production environment (Vercel: `vercel env add RAZORPAY_KEY_ID production`, and so on).
4. Confirm `PAYMENTS_PROVIDER=razorpay` and `NODE_ENV=production` are set. The app refuses to start a checkout in production with the development provider, by design.
5. Make one real purchase of the smallest pack and confirm the credits arrive.

---

## How the money path actually behaves

Worth knowing before you test, because it explains what you will see:

- The browser sends a **sku only**. The price comes from `src/server/billing/catalog.ts`. A request carrying its own amount is ignored.
- Credits are granted by the **signed webhook**, never by the browser's success callback. So the balance updates a moment *after* checkout closes. That is correct, not a delay to fix.
- The webhook signature is verified over the raw body before anything parses it. A forged or unsigned request gets a 400 and grants nothing.
- A duplicate webhook delivery grants once. Razorpay retries on a 5xx, and that is safe.
- If the amount Razorpay reports does not match what we asked for, the payment is marked failed and no credits are granted.

## When something goes wrong

| Symptom | Cause |
| --- | --- |
| Checkout returns "that capability is switched off" | `PAYMENTS_PROVIDER=mock` in production, or Razorpay keys missing |
| Payment succeeded, no credits | Webhook not reaching the server, or `RAZORPAY_WEBHOOK_SECRET` does not match the dashboard |
| Webhook log shows 400 | Signature mismatch — the secret differs between dashboard and `.env` |
| Webhook log shows 500 | Real processing error; Razorpay will retry. Check the server log for `webhook_processing_failed` |

Server logs carry `webhook_rejected`, `webhook_processed` and `webhook_ignored` with the reason attached.
