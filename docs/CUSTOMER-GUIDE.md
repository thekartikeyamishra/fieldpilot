# FieldPilot — setup and operating guide

For the person responsible for making this work at a business: maintenance
manager, plant head, facilities lead, or the founder doing all three.

Read section 1 before anything else. It is short and it will save you from
setting this up for the wrong job.

---

## 1. What this is, and what it is not

**FieldPilot turns spoken observations into maintenance records.** A technician
describes what they are seeing; it identifies the asset, retrieves that machine's
history and the relevant procedure, recommends a next step citing the records
behind it, and — after a human approves — writes the work order and the audit
trail.

**It is not:**

- A safety system. It has no interlocks and no authority over equipment.
- A replacement for permit-to-work, lock-out/tag-out, or any statutory procedure.
- A certified engineering authority. Recommendations are AI-assisted and can be
  wrong or incomplete.
- A validated system for regulated recordkeeping. See section 7.
- A surveillance tool. Using it as one will destroy adoption faster than any
  technical fault.

**It fits best when all four are true:** you have recurring physical assets, the
technician's hands are genuinely occupied, the same machines fail repeatedly, and
somebody downstream — a supervisor, an auditor, a customer — needs the record.

If your technicians are at a desk anyway, this buys you very little.

---

## 2. Choose how you run it

| | **Hosted** | **Self-hosted** |
| --- | --- | --- |
| Setup time | 10 minutes | Half a day |
| Who runs the database | We do | You do |
| Where data sits | Our infrastructure | Your network |
| Cost | Free tier, then credits | Annual licence + your infrastructure |
| Needs | A browser | A server, Postgres, someone to operate it |
| Best for | Almost everyone starting out | Data that contractually cannot leave your network |

**Start hosted.** Move to self-hosted only when a specific contractual or
regulatory requirement forces it — running your own database has a real
operational cost, and it is not a security upgrade by itself.

Self-hosted requires a signed licence key. Write to
workmailkartikeya@gmail.com. An expired licence degrades to read-only; it never
deletes data or locks anyone out mid-shift.

---

## 3. First hour: getting set up

### Step 1 — Create the workspace (2 minutes)

Sign up with a work email. The first user becomes the **owner** of the
organisation. Your workspace arrives with one demo site and three assets so you
can try a real voice job immediately.

### Step 2 — Try it before you configure anything (3 minutes)

Go to **Voice job**, press *Start talking*, and say:

> "I'm at Site 14. Pump three is vibrating again."

Watch what happens: the asset resolves, the history appears, the recommendation
cites specific incidents, and a draft work order waits for you. Approve it.

Do this before loading your own data. If the workflow does not feel right for
your operation, you have spent three minutes rather than three days.

### Step 3 — Load your own assets

Go to **Assets → Import assets or procedures**. Download the template, fill it
in, and upload it. You will see a preview of exactly what will be created before
anything is written.

One row per asset:

| Column | Example | Notes |
| --- | --- | --- |
| Site name | Plant 2 | Group by physical location |
| Asset code | P-003 | **The tag your technicians actually say out loud** |
| Asset name | Pump 3 | How people refer to it in conversation |
| Type | pump | Lowercase; used to match procedures |
| Spec | operating_pressure_bar: 6.0-8.2 | Optional, but it makes recommendations sharper |

Save from Excel as **CSV UTF-8**. Re-importing a corrected file updates rows
rather than duplicating them, and a file with any error is not imported at all.

**The asset code matters more than anything else here.** Asset resolution is
deterministic: "pump three" becomes P-003 because the number matches. If your
tags are inconsistent — P3, PMP-003, Pump#3 across different sheets — fix that
first. It is the highest-value hour of the whole setup.

### Step 4 — Load your procedures

For each common failure, one procedure with:

- A reference your team already uses (MP-17, SOP-12)
- The asset type it applies to
- **Keywords covering how people actually describe the symptom** — "vibration,
  shaking, rattling, knocking, noise". This is what gets it matched.
- The content: what to check, what the limits are, when to escalate

Ten good procedures beat two hundred imported ones nobody wrote for voice.

### Step 5 — Add your people and set roles

| Role | Can | Cannot |
| --- | --- | --- |
| **Technician** | Use voice, create incidents, log measurements, create and update work orders | See audit logs, change settings, export data, buy credits |
| **Supervisor** | Everything a technician can, plus close work orders, review audit logs, export | Manage billing or organisation settings |
| **Owner/Admin** | Everything, including users, billing and unit economics | Alter or delete audit history — nobody can |

Give people the lowest role that lets them do their job. Every technician does
not need supervisor access, and the audit trail is only worth something if
accounts are not shared.

### Step 6 — Run one real job, with one real technician

Not a demo. Stand next to them at an actual machine and watch. You are looking
for: does the asset resolve on the first try, is the recommendation useful, does
the noise break transcription. Fix what you find before rolling out to ten people.

---

## 4. How different businesses use it

### SME manufacturing — pumps, compressors, presses

**Load:** one site per plant, every asset with a maintenance history, procedures
for your five most common breakdowns.
**Roles:** technicians on the floor, one supervisor per shift.
**A typical session:** *"Line 2 press is cycling slow."* → history shows two
hydraulic incidents → procedure match → work order raised before the technician
has walked away.
**Measure:** work orders raised per week, and how many now have a written cause
where previously they had none.
**Common trigger to adopt:** a customer audit or ISO requirement demanding
maintenance records you cannot produce.

### Facilities and property — HVAC, lifts, generators, multi-building

**Load:** one site per building, assets grouped by building. Include the plant
room location in the asset name — technicians navigate by place.
**Roles:** mobile technicians, one facilities manager as supervisor.
**A typical session:** at a rooftop AHU with no laptop and poor signal. Voice job
records the fault; if the network drops, the work is preserved and syncs.
**Measure:** time between fault noticed and fault recorded. This is usually days
before, and minutes after.

### Utilities, water and energy

**Load:** assets by substation or pumping station. Procedures must reflect your
statutory requirements, not generic ones.
**Roles:** strict separation — technicians propose, supervisors approve anything
consequential.
**Critical:** FieldPilot never replaces a permit-to-work or isolation procedure.
Use it to record and recommend, never to authorise energisation or entry.
**Measure:** completeness of incident records at audit.

### Fleet and heavy equipment

**Load:** one asset per vehicle, keyed on registration or fleet number — that is
what mechanics say aloud.
**A typical session:** under a truck, hands filthy, phone on the bench.
**Measure:** repeat faults caught earlier because history is actually searchable.

### Cold chain and food processing

**Load:** chillers, blast freezers, compressors. Procedures aligned to your HACCP
plan.
**Use it for:** logging temperature readings by voice at the point of check —
*"Chiller 4 is at minus eighteen point five"* — which is otherwise a clipboard.
**Read section 7 first.** If a record is legally required in a specific format,
FieldPilot supplements your compliance system; it does not replace it.

### Field service contractors — assets belong to your customers

Currently the context graph is organised around *your* organisation's assets. If
you service equipment owned by many customers, model each customer as a site.
This works, but reporting is not yet built for per-customer billing.

### Equipment manufacturers (OEM)

Bundle FieldPilot with machines you sell, preloaded with your own procedures. Your
customers get maintenance guidance in your words, and you get the failure data.
This needs an OEM licence — it is the most commercially interesting arrangement
and needs a conversation, not a signup.

---

## 5. Running it day to day

**For a technician, per job:** start a voice job → say where you are and what you
see → answer the one question it asks → read the recommendation and its evidence
→ approve or reject → end the job.

**For a supervisor, weekly:** review open work orders, check the outcome ledger
for recommendations that were rejected (those tell you where the procedures are
wrong), close what is done.

**For the owner, monthly:** check the Usage page. Credits consumed, jobs
completed, work time returned, and — visible only to you — whether the economics
are healthy. Export your data at least once so you know the button works.

---

## 6. Do's and don'ts

### For technicians

**Do**

- Say the asset code or the full name. "Pump three", not "the pump".
- Give readings with units: *"eight point seven bar"*, not *"eight seven"*.
- Read the evidence before approving. It exists so you can disagree with it.
- Reject a bad recommendation. A rejection is useful information, not a failure.
- End the job when you are finished.

**Don't**

- **Don't take a phone into a hazardous area unless it is certified for it.** If
  your site has Zone 1/2 or flammable-atmosphere classification, a standard
  smartphone is an ignition source. This overrides every convenience in this
  product. Use it before you enter or after you leave.
- Don't approve an action you have not read. The approval step is the whole
  safety model; clicking through it defeats the product.
- Don't dictate anything about a named colleague — write about equipment, not
  people.
- Don't use it to record a conversation with someone who has not been told.
- Don't share your login. The audit trail is only meaningful if it is yours.

### For supervisors

**Do**

- Fix procedures when recommendations are consistently unhelpful. The system is
  only as good as what you gave it.
- Review rejected drafts weekly — the fastest signal about bad data.
- Treat the audit trail as evidence, not as a performance metric.

**Don't**

- **Don't use session counts or transcripts to monitor or discipline staff.**
  Legally this exceeds the purpose the data was collected for; practically, the
  day your team believes it is surveillance is the day they stop using it.
- Don't let one person's login be used by a shift.

### For owners and admins

**Do**

- Tell your team, in writing, what is recorded and why, before rollout.
- Set credit limits deliberately and watch cost per completed job.
- Export your data periodically and keep a copy. It is yours.
- Keep asset codes consistent. It is the difference between resolution and "which
  asset did you mean?"

**Don't**

- Don't roll out to fifty people before ten have used it for a fortnight.
- Don't promise your customers that FieldPilot's records satisfy a regulatory
  requirement without checking section 7.
- Don't claim data never leaves India. Speech and inference providers may process
  it elsewhere; the privacy policy states this honestly and so should you.

---

## 7. Rules, regulations and obligations

*General information, not legal advice. Have a qualified professional in your
jurisdiction review anything that carries a compliance consequence.*

### Telling your employees (India — DPDP Act, 2023)

Voice is personal data. Before rollout you should:

- Give written notice of what is collected (audio in transit, transcripts,
  records), why, and how long it is kept.
- Limit use to the stated purpose. Maintenance recordkeeping is the purpose;
  performance monitoring is not.
- Provide a route to access, correct or delete. FieldPilot has one-click export;
  deletion requests go to the account owner.
- Name someone responsible for data questions.

Outside India, GDPR, UK GDPR and similar regimes impose comparable and sometimes
stricter duties — particularly around employee monitoring, where several
jurisdictions require consultation with worker representatives.

### Where data goes

Audio is streamed to a speech provider and is not stored by us. The transcript,
the identified asset and its related records go to an AI model provider to
generate a recommendation. Some providers operate outside India. Your own
customer contracts may restrict this — check before you load their data.

### Safety-critical work

- Recommendations are assistive. The technician's training and your written
  procedures remain authoritative.
- Never let FieldPilot substitute for permit-to-work, isolation, LOTO, confined
  space entry or any statutory control.
- Where a procedure says escalate to a supervisor, escalate. The system says so
  because you told it to.

### Regulated sectors — read this before you rely on it

FieldPilot's audit log is append-only and complete, but the system is **not
validated** for:

- **Pharmaceutical GxP** — electronic records and signatures carry specific
  validation, e-signature and change-control requirements that this has not been
  audited against.
- **Medical devices** — biomedical equipment records often carry regulatory
  weight FieldPilot does not currently address.
- **Food safety (FSSAI, HACCP)** — legally mandated logs may need a defined
  format and retention that you must verify separately.
- **Aviation, rail, nuclear** — assume it is unsuitable until formally assessed.

In these sectors, treat FieldPilot as a tool that helps technicians capture
information faster, feeding a compliance system that remains your system of
record.

### Commercial

- Hosted use is governed by the terms of service. Self-hosted and OEM use require
  a licence.
- Payments are processed by Razorpay; card details never reach our servers.
- Indian customers: GST applies per your registration status. Invoices are issued
  by the licensed entity.
- Unused credits are refundable within 7 days; consumed credits are not. Failed,
  duplicate or unauthorised charges are always reversed.

---

## 8. Your first 30 days

| When | Do this | You should see |
| --- | --- | --- |
| Day 1 | Set up, try the demo job, load 10–20 real assets | The workflow makes sense for your operation |
| Day 2–3 | Write your 5 most common procedures | Recommendations start citing your own documents |
| Day 4 | One technician, one real job, you standing there | Whether noise, gloves and signal actually work |
| Week 2 | Three technicians using it for real faults | Assets resolving first time; procedures being matched |
| Week 3 | Review rejected recommendations; fix procedures | Rejection rate falling |
| Week 4 | Check the Usage page; export your data | Jobs completed, time returned, and a working export |

**Stop and reconsider if,** after three weeks with real technicians: assets do not
resolve reliably, recommendations are consistently ignored, or people quietly go
back to the register book. Those are answers, not failures — and they are much
cheaper to learn in week three than in month six.

---

## Getting help

workmailkartikeya@gmail.com

Include the **request ID** from any error message — every error carries one, and
it points to exactly what happened. For payment questions, include the payment
reference from your Usage page.
