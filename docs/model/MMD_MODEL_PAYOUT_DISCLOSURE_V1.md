# MMD Model Payout Disclosure V1

Status: Canonical payout presentation contract  
Date: 2026-09-22

## Money-lane separation

MMD has **two different model-job money systems**. They must never be merged by UI convenience.

### PUBLIC MONEY · `model_work_lane=public_model`

Public work may use standardized products/packages.

- Customer price can come from a published Public package/catalog.
- Model payout can come from an approved Public payout matrix or a Session-locked Public payout.
- OT/add-on/after-midnight rules may be standardized per Public product.
- Public package/OT rules may be surfaced in MMD MODEL after the Session is identified as `public_model`.

### PRIVATE MONEY · `model_work_lane=private_model`

Private/SIGIL work is **case-priced and case-locked**.

- Customer price is the approved quote for that specific private job.
- Model payout is the payout explicitly locked for that specific Session.
- Public package prices, Public payout percentages, Public OT tables and Public after-midnight formulas **do not apply automatically**.
- Any extension, scope change, late-night continuation or additional request requires a new MMD case quote plus Model approval before it becomes official.
- MMD MODEL may show the exact payout locked for the case, but must not infer a Private payout from a Public package matrix.

### REVIEW · `model_work_lane=needs_review`

No pricing matrix is allowed. Payout terms fail closed until MMD assigns the correct money lane and locks the case.

### Confidential is not a money lane

`Confidential` describes disclosure/privacy handling, not pricing authority.

A person with a Public Profile may receive an offer whose details are confidential while the Session remains `public_model`. Conversely, a job explicitly classified by MMD as Private uses `private_model` money rules.

**Never change the money lane merely because the job is hidden from public view.**

## Core rule

**Client Price and Model Payout are separate amounts and separate visibility surfaces.**

- Public pages show the customer-facing package price.
- MMD MODEL shows the worker/model the exact payout they will receive before they accept.
- Public pages must never expose internal payout, margin, commission, or MMD revenue.
- MMD MODEL must never require a model to infer payout from the customer price.

## Required payout summary before Model acceptance

Every job offer shown in MMD MODEL must include:

- `base_payout_thb` — amount paid to the worker for the confirmed package scope.
- `scheduled_start_at` / `scheduled_end_at`.
- `included_minutes` and package scope.
- `overtime_payout_before_midnight_thb_per_hour`.
- `after_midnight_premium_payout_thb_per_hour` when pre-booked time crosses 00:00.
- `overtime_payout_after_midnight_thb_per_hour`.
- `overtime_payout_after_0300_thb_per_hour` when applicable.
- `reimbursable_expense_policy`.
- `cancellation_payout_policy`.
- `payout_policy_version`.
- `payout_locked_at`.

The acceptance surface should read in plain language as **“คุณได้รับ”**. It should not expose MMD margin, customer spend history, or commission internals.

## Current public package payout matrix

### Driver Companion — ACTIVE

| Package | Client price | Worker payout |
| --- | ---: | ---: |
| PICK ME UP | ฿1,490 | ฿900 |
| AIRPORT, PLEASE. | ฿1,890 | ฿1,100 |
| WAIT FOR ME | ฿2,690 | ฿1,650 |
| HALF DAY WITH HIM | ฿3,490 | ฿2,200 |

Driver add-on payout:

- Overtime charged to client ฿790/hour → worker payout ฿550/hour.
- Late-night surcharge charged to client +฿300 → worker payout +฿200.
- Extra distance charged to client ฿25/km → worker payout +฿15/km.
- Tollway and parking are pass-through actual expenses, not payout or margin.

### Culinary Companion — ACTIVE

| Package | Client price | Worker payout |
| --- | ---: | ---: |
| COOK WITH ME | ฿1,990 | ฿1,250 |
| DINNER, MADE FOR YOU | ฿2,990 | ฿1,850 |
| MARKET TO TABLE | ฿3,790 | ฿2,350 |
| PRIVATE TABLE | ฿4,990 | ฿3,100 |

Culinary add-on payout:

- Overtime charged to client ฿690/hour → worker payout ฿450/hour.
- Extra guest service fee charged to client +฿500/person → worker payout +฿300/person.
- Ingredients, parking, and approved special travel are pass-through actual expenses.
- PRIVATE TABLE requires MMD-reviewed culinary skill before assignment.

## Everyday / Night Life payout matrix

Status: **RESERVED FOR NEXT PUBLIC PACKAGE RELEASE.** Do not expose these as live public packages until the corresponding package contract is merged and published.

### DAY OFF

| Package | Client price | Worker payout |
| --- | ---: | ---: |
| DAY OFF — SHORT · 3h | ฿3,500 | ฿2,100 |
| DAY OFF — HALF DAY · 5h | ฿5,500 | ฿3,300 |
| DAY OFF — FULL DAY · 8h | ฿8,500 | ฿5,100 |

### NIGHT LIFE

| Package | Client price | Worker payout |
| --- | ---: | ---: |
| NIGHT OUT · 3h | ฿4,500 | ฿2,800 |
| DINNER TO MIDNIGHT · 5h | ฿6,500 | ฿4,000 |
| OWN THE NIGHT · 7h | ฿8,900 | ฿5,500 |

Extension payout:

- OT before 00:00: client ฿990/hour → worker ฿650/hour.
- Pre-booked time after 00:00: client +฿500/hour → worker +฿350/hour.
- OT after 00:00: client ฿1,490/hour → worker ฿1,000/hour.
- OT after 03:00: client ฿1,790/hour → worker ฿1,200/hour.
- After 06:00: no automatic extension; MMD review required.

After-midnight premium and OT must never be double-charged for the same minute.

## Extension authority

A customer cannot extend a job by paying or agreeing directly with the model.

Canonical flow:

`MY MMD extension request → MMD MODEL approve/decline → payment required/verified → MMD confirmation → new official end time`

Until `mmd_confirmed`, the original booking end time remains the official coverage boundary.

Any direct off-system agreement is not an MMD-confirmed extension. MMD may still accept a safety report or assist after an incident, but the off-system commercial terms, price, scope, or extension are not endorsed by MMD.

## Confidential work

Public-profile visibility and job confidentiality are independent.

A person may have a public MMD profile and still ask MMD to route selected work privately.

- Public profile may remain visible.
- Confidential job details must not be posted publicly.
- Confidential offers must move through controlled MMD review and MMD MODEL.
- Client contact details remain protected.
- Direct client-model payment/contact bypass is not an approved confidential-work flow.

Public talent contact:

`https://t.me/mmdapply`

Recommended public copy:

> มีโปรไฟล์กับ MMD อยู่แล้ว และต้องการรับงานแบบ Confidential / ไม่เปิดเผยรายละเอียดงานต่อสาธารณะ? ติดต่อ MMD Apply ผ่าน Telegram

## Visibility boundary

Public may show:
- customer-facing package name and price;
- public package rules;
- public model/profile eligibility;
- contact path for confidential work.

Model-only may show:
- exact worker payout;
- worker OT payout;
- cancellation payout;
- reimbursable-expense policy;
- extension payout;
- offer-specific scope.

Internal-only:
- MMD margin;
- customer spend;
- commission internals;
- risk flags and private operator notes.
