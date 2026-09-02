# Commercial Licence — FieldPilot

**Owner:** Kartikeya Mishra · workmailkartikeya@gmail.com
All rights reserved. Possessing this source grants no right to use it.

---

## How FieldPilot may be used

| Use | Permitted | Requires |
| --- | --- | --- |
| Reading the source to evaluate it | Yes | Nothing |
| Running locally to evaluate | Yes | Nothing |
| Using the hosted service at our domain | Yes | An account; usage billed in credits |
| Running your own instance internally | No | **Self-hosted licence** |
| Offering it to your customers as a service | No | **OEM / reseller licence** |
| Modifying and redistributing | No | **Written agreement** |
| Training a model on this code | No | Not offered |

## Tiers

| Tier | Who it is for | Basis |
| --- | --- | --- |
| **Hosted** | Anyone | Free tier plus credits. No licence needed — the terms of service cover it |
| **Self-hosted** | Companies whose data cannot leave their network | Annual, per deployment, banded by technician count |
| **OEM / reseller** | Vendors embedding FieldPilot in their own product | Annual minimum plus revenue share |
| **Enterprise** | Larger deployments needing SLA, security review, custom terms | Negotiated |

Pricing is quoted per deployment. Write to the address above.

## Enforcement

A self-hosted or OEM deployment requires a signed licence key issued by the
Owner. `src/server/licensing/` verifies it at boot and periodically thereafter.
The check is deliberately honest rather than hostile:

- It never phones home with customer data.
- It never disables a running deployment mid-shift.
- An expired licence degrades to read-only and warns the operator; it does not
  delete anything or lock anyone out of their own records.

The purpose is to make paying easier than not paying — not to punish a customer
whose renewal is late.

## Ownership statement

All intellectual property in FieldPilot — source code, architecture, database
schema, prompts, orchestration logic, cost-routing design, brand, documentation
and design system — rests solely and unambiguously with Kartikeya Mishra.

No contributor, contractor, employer, hackathon organiser, cloud provider or AI
vendor holds any ownership interest in the Software by virtue of participation,
hosting, sponsorship or tooling.
