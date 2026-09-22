# FieldPilot — go-live and complete testing guide

Work through this top to bottom. Part 0 gets fieldpilot.me working; everything
after tests the product the way real customers will use it.

Tick each box. When something fails, write down the **request ID** shown in the
error — every error has one and it points to exactly what happened in the logs.

---

## Part 0 — Get fieldpilot.me working

### What is actually wrong

I checked your domain from outside:

| Host | Resolves to | Meaning |
| --- | --- | --- |
| `fieldpilot.me` | `216.198.79.1` | Vercel's address — DNS is **correct** |
| `www.fieldpilot.me` | `216.198.79.65`, `64.29.17.65` | Vercel — DNS is **correct** |
| `field-pilot-eight.vercel.app` | `216.198.79.67`, `64.29.17.67` | Vercel — works |

And fieldpilot.me *is* answering — it serves a `robots.txt` that blocks
crawlers. Your deployed build ships no robots file at all. **So something is
answering on fieldpilot.me, and it is not your FieldPilot deployment.**

This is not DNS and not code. The domain is pointed at Vercel but is attached
to the wrong project, not attached to a project, or attached to a
non-production deployment.

### Fix it — Vercel dashboard (15 minutes)

- [ ] **1. Find where the domain lives.** Vercel → your team → **Domains** (top
      level, not inside a project). Find `fieldpilot.me`. Note which project it
      says it is assigned to.
- [ ] **2. If it is on another project, remove it there.** Open that project →
      Settings → Domains → remove both `fieldpilot.me` and `www.fieldpilot.me`.
      A domain can only serve one project.
- [ ] **3. Add both to the right project.** Open the project that serves
      `field-pilot-eight.vercel.app` → **Settings → Domains → Add**. Add
      `fieldpilot.me`, then `www.fieldpilot.me`.
      When asked about www, choose **"Redirect www.fieldpilot.me to fieldpilot.me"**.
- [ ] **4. Confirm it is assigned to Production.** Each domain row should show
      *Production*, not a git branch. If it shows a branch, edit it and
      clear the branch.
- [ ] **5. Wait for "Valid Configuration"** on both rows. If one says *Invalid
      Configuration*, Vercel shows the exact record it wants — copy it to your
      registrar exactly.

### Set the production environment (10 minutes)

**Settings → Environment Variables**, scope **Production**:

- [ ] `APP_URL` = `https://fieldpilot.me` — no trailing slash
- [ ] `NODE_ENV` = `production`
- [ ] `DATABASE_URL` = your managed Postgres pooled URL
- [ ] `AUTH_SECRET` = 48 random bytes, **never** the development value
- [ ] `TRUSTED_PROXY_HOPS` = `1`

> **Environment variable changes do nothing until you redeploy.** This catches
> almost everyone. Deployments → latest production → **⋯ → Redeploy**.

### Apply the new database migration — do not skip

This release adds the `invites` table (team management). Your production
database does not have it yet. Pages that touch it will fail until you run:

```powershell
$env:DATABASE_URL="<your production database URL>"
npm run db:migrate
```

This is exactly the failure you hit earlier with `rate_limits` — the code was
ahead of the database.

### Prove it is fixed

Open **https://fieldpilot.me/api/health**. You should see JSON like this:

```json
{
  "ok": true,
  "deployment": { "host": "fieldpilot.me", "environment": "production", "commit": "a1b2c3d" },
  "checks": {
    "database":    { "ok": true },
    "schema":      { "ok": true },
    "rateLimiter": { "ok": true },
    "appUrl":      { "ok": true, "detail": "serving fieldpilot.me, matches APP_URL" }
  }
}
```

- [ ] **The page returns JSON at all.** If you get a Vercel 404 or anything
      else, the domain is still not attached to this project — back to step 1.
- [ ] **`deployment.commit` matches** what
      `field-pilot-eight.vercel.app/api/health` reports. Different commits
      means the domain points at a different deployment.
- [ ] **`schema` is true.** If false, the migration above has not run.
- [ ] **`rateLimiter` is true.** If false, **stop** — cost controls are off.
- [ ] **`appUrl` is true.** If false, `APP_URL` is wrong. This one matters more
      than it looks: after a customer pays, the payment provider sends them to
      `APP_URL`. If that is a different host from where they signed in, they
      arrive signed out — the purchase succeeded and the product looks broken.
- [ ] `https://www.fieldpilot.me` redirects to `https://fieldpilot.me`.
- [ ] The padlock shows in the address bar on both.

### Last, once everything above is green

Add `CANONICAL_REDIRECT=true` and redeploy. Now the `.vercel.app` address also
redirects to fieldpilot.me, so nobody signs in on the wrong host.

**Do this last on purpose.** Turned on while fieldpilot.me is still broken, it
would redirect the one working address to a broken one. The redirect is
temporary (302), so removing the variable undoes it instantly.

---

## Part 1 — Prepare to test

### Devices

You need at least:

- [ ] A laptop with Chrome
- [ ] An Android phone with Chrome
- [ ] An iPhone with Safari, if you can borrow one — Safari behaves differently
      for microphone and speech, and most of your buyers' supervisors carry one

### Accounts

Create these as you go through Part 2. Use real email addresses you can read
(Gmail `+` addresses work: `you+tech1@gmail.com`).

| Role | Email | Used for |
| --- | --- | --- |
| Owner | `you+owner@gmail.com` | Everything |
| Supervisor | `you+super@gmail.com` | Closing work, imports |
| Technician | `you+tech1@gmail.com` | Voice jobs |
| Second company's owner | `you+rival@gmail.com` | Proving companies cannot see each other |

### Real test data

Make two CSV files from a real plant if you can — ask a contact at any Peenya
unit for their breakdown register. Otherwise, sign in and download the
templates from **Assets → Import → Download template**.

A realistic asset file for testing:

```csv
site,asset_code,name,type,status,spec
Unit 7,P-101,Cooling water pump 1,pump,operational,"operating_pressure_bar: 6.0-8.2; motor: 15kW"
Unit 7,P-102,Cooling water pump 2,pump,operational,"operating_pressure_bar: 6.0-8.2; motor: 15kW"
Unit 7,C-201,Air compressor 1,compressor,operational,rated_pressure_bar: 10
Unit 7,HP-301,Hydraulic press 1,press,degraded,tonnage: 150
Unit 9,GB-401,Conveyor gearbox,gearbox,operational,
```

And a procedure file:

```csv
reference,asset_type,title,keywords,content
MP-17,pump,Bearing inspection after vibration,"vibration, shaking, rattling, knocking, noise","1. Isolate and lock out. 2. Inspect rear bearing for play and scoring. 3. If two vibration incidents occur within 90 days, escalate before restart."
MP-40,compressor,Overheat response,"hot, overheating, temperature, smell","1. Shut down. 2. Check oil level and cooler fins. 3. Escalate if above 95C twice in a week."
MP-55,press,Slow cycle diagnosis,"slow, sluggish, cycling slow, pressure drop","1. Check hydraulic oil level and temperature. 2. Inspect pump inlet filter. 3. Record cycle time before and after."
```

**Saving from Excel:** File → Save As → **CSV UTF-8 (Comma delimited)**. Plain
"CSV" can mangle non-English text. Uploading an `.xlsx` directly is refused
with instructions — that is deliberate.

---

## Part 2 — User journeys

### Journey A — A new business signs up and loads its data

*Who: a plant owner who has never seen the product.*

- [ ] **A1.** Open fieldpilot.me in a private window. The landing page loads,
      explains the product in one screen, and has a clear sign-up button.
- [ ] **A2.** Sign up as the owner. You land straight in a voice job — no tour.
- [ ] **A3.** Do the first job before configuring anything. Say or type:
      *"I'm at Site 14. Pump 3 is vibrating again."*
      **Pass:** asset P-003 resolves, history appears, a recommendation cites
      evidence (E1, E2…), and a draft work order waits for approval.
- [ ] **A4.** Approve it. **Pass:** a green confirmation, and it appears under
      **Work** with number **#1** — not a large number (numbers are per company).
- [ ] **A5.** Go to **Assets → Import assets or procedures**.
- [ ] **A6.** Upload your asset CSV and press **Preview import**.
      **Pass:** it lists every row as *new*, counts new sites, shows zero errors,
      and **nothing is written yet**.
- [ ] **A7.** Press **Import N rows**. **Pass:** "Done. N created".
- [ ] **A8.** Upload the **same file again** and preview.
      **Pass:** every row now shows *update*, zero *new*. Re-importing never
      duplicates.
- [ ] **A9.** Edit the file: change one asset code to lowercase (`p-101`) and
      add a second row with the same code in capitals (`P-101`). Preview.
      **Pass:** an error on the second row — *duplicate of line N*. Codes are
      case-insensitive on purpose: one machine is one asset.
- [ ] **A10.** Try to import that broken file anyway. **Pass:** the Import
      button does not appear. **A file with any error is never partly loaded.**
- [ ] **A11.** Upload a file with wrong column names. **Pass:** the message
      names exactly which columns are missing and which it found.
- [ ] **A12.** Switch to **Procedures**, import the procedure file.
- [ ] **A13.** Start a voice job: *"Air compressor one is overheating."*
      **Pass:** it resolves **C-201** and cites **MP-40** — data you imported
      one minute ago, used on the very next turn.

### Journey B — The owner builds a team

- [ ] **B1.** **Team** appears in the menu (owners only).
- [ ] **B2.** Invite a **technician**, pinned to `you+tech1@gmail.com`. Copy the
      link. **Pass:** the page warns it is shown only once.
- [ ] **B3.** Open the link in a different browser. **Pass:** the page says
      *Join [your company]* and the email is filled in and locked. There is **no
      organisation field** — they cannot accidentally create their own company.
- [ ] **B4.** Try it with a different email. **Pass:** refused.
- [ ] **B5.** Complete with the right email. **Pass:** they land in a voice job
      inside **your** company and can see **your** assets.
- [ ] **B6.** Open the same link again. **Pass:** "no longer valid".
- [ ] **B7.** Create an invite, then **Revoke** it before using it.
      **Pass:** the link stops working.
- [ ] **B8.** Invite a **supervisor** with no email pinned; join as
      `you+super@gmail.com`.
- [ ] **B9.** As the owner, try to **deactivate yourself** and to **change your
      own role**. **Pass:** both refused with a clear reason. A company can
      never be left without an owner.
- [ ] **B10.** Keep the technician signed in on their device. As the owner,
      **Deactivate** them. On the technician's device, click anything.
      **Pass:** they are signed out on that very click.
- [ ] **B11.** Reactivate them. **Pass:** they can sign in again, and every work
      order they created is still attributed to them.
- [ ] **B12.** Sign in as the technician. **Pass:** no Team link, no Usage
      buy button, no Import button.

### Journey C — A technician on a real job

*Who: someone with dirty hands, a phone, and a machine making a noise.
Do this on your phone, not your laptop.*

- [ ] **C1.** Sign in on the phone. Tap **Voice job → Start talking**.
      **Pass:** the browser asks for microphone permission once.
- [ ] **C2.** Say: *"Pump one oh one is making a knocking noise."*
      **Pass:** resolves **P-101** (spoken numbers are understood).
- [ ] **C3.** Say something ambiguous: *"The pump is vibrating."*
      **Pass:** it asks *which* pump rather than guessing. Guessing wrong on an
      asset is worse than asking.
- [ ] **C4.** Give a reading: *"Pressure is eight point seven bar."*
      **Pass:** logged as a measurement with the unit, without a model call.
- [ ] **C5.** When the draft work order appears, **say "yes"** instead of
      tapping. **Pass:** approved by voice.
- [ ] **C6.** Next draft, say **"no"**. **Pass:** dropped, nothing created.
- [ ] **C7.** Say *"yes, but for pump one oh two instead."*
      **Pass:** this is **not** treated as approval — it is treated as a new
      instruction. This is the dangerous case, so check it carefully.
- [ ] **C8.** While it is speaking, start talking over it.
      **Pass:** it stops speaking within about a second.
- [ ] **C9.** Say *"say that again"*. **Pass:** it repeats its last answer.
- [ ] **C10.** Put the phone next to a speaker playing its own voice.
      **Pass:** it does not answer itself.
- [ ] **C11.** Hindi / code-mixed: *"पंप एक सौ एक में vibration आ रहा है"*
      then approve with *"हाँ"* or *"ठीक है"*.
- [ ] **C12.** Turn on airplane mode mid-job, speak, turn it back on.
      **Pass:** a clear message, no silent loss, and you can continue.
- [ ] **C13.** Close the browser mid-job without ending it. Reopen.
      **Pass:** you are not stuck — a fresh job starts normally.
- [ ] **C14.** Deny microphone permission, then try again.
      **Pass:** a clear explanation and typed input still works.

### Journey D — The supervisor's week

- [ ] **D1.** Sign in as supervisor. Open **Work**. All open work orders
      from every technician are visible.
- [ ] **D2.** Close one. **Pass:** status changes; the audit trail records who.
- [ ] **D3.** Open a completed job's evidence. Every E-reference points to a
      real record with a real date — nothing invented.
- [ ] **D4.** Supervisors can import data and export; they cannot manage the
      team or billing.

### Journey E — The owner pays

**India — Razorpay (test mode first)**

- [ ] **E1.** **Usage → India (INR)** shows ₹149 / ₹499 / ₹1,799.
- [ ] **E2.** Buy the smallest pack with test card `4111 1111 1111 1111`.
- [ ] **E3.** **Pass:** credits increase within a few seconds **of the webhook**,
      not of the redirect. Refresh until they appear.
- [ ] **E4.** In Razorpay's dashboard, resend the same webhook.
      **Pass:** credits do **not** increase twice.

**International — Square (sandbox first)**

- [ ] **E5.** Set `SQUARE_ENVIRONMENT=sandbox` with sandbox credentials.
- [ ] **E6.** **Usage → International** shows $9 / $29 / $99.
- [ ] **E7.** Buy a pack. You go to Square's hosted page, pay with a sandbox
      card, and return to fieldpilot.me **still signed in**.
      If you return signed out, `APP_URL` is wrong — see Part 0.
- [ ] **E8.** **Pass:** credits land after Square's webhook.
      If they never land, check `SQUARE_WEBHOOK_URL` matches the dashboard
      **character for character** — Square signs the URL plus the body.
- [ ] **E9.** Then one real purchase on each rail with your own card, and
      refund yourself afterwards.

**Running out**

- [ ] **E10.** Use a fresh organisation until credits reach zero.
      **Pass:** a clear message, typed rule-based actions still work, and no
      paid model call is made.

### Journey F — Customers own their data

- [ ] **F1.** As owner, **Export** everything. A JSON file downloads.
- [ ] **F2.** Open it. **Pass:** no password hashes anywhere. Assets, work
      orders, outcomes and the audit trail are all present.
- [ ] **F3.** Run `npm run export:test` against production. Every checksum
      must match.

---

## Part 3 — Things that will happen in a real plant

| Test | How | Pass |
| --- | --- | --- |
| Loud machine | Record next to a running fan or a YouTube "factory noise" video | Still resolves the asset; if not, asks rather than guessing |
| Gloves | Try every button wearing gloves | Buttons are large enough to hit |
| Bright sun | Use outdoors at midday | Text readable; nothing relies on colour alone |
| Weak signal | Chrome DevTools → Network → Slow 3G | Slower, never silently broken |
| Screen locks mid-job | Let the phone sleep while talking | Resumes or restarts cleanly |
| Two technicians, one asset | Both report on P-101 at once | Both recorded, work order numbers do not collide |
| Very long rambling | Talk for a full minute | Accepted, trimmed, the request at the end is kept |

---

## Part 4 — Security and isolation

**Do not skip this. A single cross-company leak ends a B2B product.**

- [ ] **S1.** Sign up a second company as `you+rival@gmail.com` in a separate
      browser.
- [ ] **S2.** As rival, try every page. **Pass:** none of the first company's
      assets, work orders, team or usage are visible anywhere.
- [ ] **S3.** As rival, say *"Pump one oh one"*. **Pass:** not found — it is
      the other company's asset.
- [ ] **S4.** Copy a work order URL from company one and open it as rival.
      **Pass:** not found.
- [ ] **S5.** Try signing in with a wrong password 12 times.
      **Pass:** blocked after 10 with "too many attempts".
- [ ] **S6.** Send a fake payment webhook:

```powershell
curl -X POST https://fieldpilot.me/api/billing/webhook/razorpay -H "Content-Type: application/json" -d '{"event":"payment.captured"}'
```

      **Pass:** `400`, and no credits granted anywhere.

- [ ] **S7.** Sign out, press the browser Back button. **Pass:** no private
      data is shown.

---

## Part 5 — How your customer's data flows

A customer asks: *"where does my data go?"* The honest answer:

1. **Setup.** They import assets and procedures. Stored in your Postgres,
   every row tagged with their organisation. No other company can query it.
2. **Speaking.** Audio streams to AssemblyAI for transcription and is not
   stored by FieldPilot.
3. **Reasoning.** Only the words, the one identified asset and its recent
   records go to the AI model — never the database, never another company's
   data.
4. **Writing back.** Only after a human approves. Every approved action becomes
   a record that makes the next recommendation better.
5. **Leaving.** One export, everything they own, with checksums. No lock-in.

---

## Part 6 — Known limits

Tell customers these rather than letting them discover them:

- **Day-one recommendations are thin** until history accumulates or is
  imported. Procedures work immediately; history takes weeks.
- **No native app.** It is a web app; add it to the home screen.
- **Subscriptions are not built.** Payments are credit packs on both rails.
- **Not validated for regulated recordkeeping** (pharma GxP, medical devices).
- **Browser voice output** varies in quality between devices.

---

## Reporting a problem

For each failure, write down:

1. Which step (e.g. *C7*)
2. Device and browser
3. Exactly what you said or did
4. What you expected, and what happened
5. The **request ID** from the error message

That is enough to find and fix almost anything.
