# MMD APP — Model Work History & Historical Payout Canon — 2026-09-27

Status: OWNER CONFIRMED
Owner: Per
Timezone: Asia/Bangkok

## Policy

Historical model history shown in MMD APP may include owner-approved MMD records even when an old transfer slip is unavailable.

For historical records only:

- The model may see past work and the model fee that MMD/Per has approved for that work.
- Model fee is distinct from the customer sell price.
- Historical model fee is distinct from paid-confirmed status.
- A record must not be hidden only because an old transfer slip is unavailable.
- Per may approve a historical record once and allow it to become model-visible.
- Future/new jobs continue to use the current verification and evidence flow.

## Identity / binding

Historical records must never be bound from a public/display name alone.

Safe flow:

`Model opens MMD APP through their own LINE → verified Model session resolves a canonical model_record_id → approved history linked to that Model record becomes readable from GET /v1/model/history`

If the canonical Model record / LINE subject is not resolved yet, history visibility stays open/pending. The browser must not guess the match.

## Privacy

Model-visible history may include only the model's own safe work history and fee/payment summary.

Do not expose:

- customer identity or contact;
- customer sell price;
- customer chat text;
- payment refs / bank data / internal evidence IDs;
- MMD margin / partner commission;
- raw LINE or Telegram notes;
- internal risk/review notes.

## Money semantics

Keep the following concepts separate:

1. **Historical model fee / earned amount** — the fee approved for the model for a past job.
2. **Paid confirmed amount** — amount explicitly recorded as paid/verified.
3. **Customer sell price** — internal only and not model-visible here.

Never add (1) and (2) together as if they were two separate earnings. A job with fee 25,000 and a payout record of 25,000 still represents 25,000 earned, with 25,000 paid confirmed.

A historical payout may be owner-verified without an attached old slip. UI copy must not imply that absence of a slip means unpaid.

## Pilot — Gaz / Gazz

Owner confirms Gaz and Gazz are the same person.

Historical source:
- LINE OA copy is sufficient as the source for the job record.
- Telegram and full LINE album reconstruction are not required for this pilot.

18 Mar 2026:
- Customer sell price: 38,000 THB — internal only, never show to model.
- Model fee for Gaz: 25,000 THB.
- Per confirms the 25,000 THB payout was paid.
- Exact bank transfer timestamp is not currently recorded.
- Old slip is not required for this historical owner-approved payout.

Airtable records:
- Model History Imports: `recxHkkc9PKRMDlh7`
- Payout Evidence: `recRIlWBbhqC4rpas`
- Source candidate: `LINEOA-0164-011296`

These two Airtable records describe the same historical job/payment context and MUST NOT be totaled as 50,000 THB.

Visibility remains open until Gaz self-onboards / verifies through LINE and the history records are safely bound to the resolved canonical Model record.

## API contract

Canonical model-safe read:
`GET /v1/model/history`

Current authority:
`canonical_sessions_payout_evidence_and_owner_approved_history_imports`

The endpoint reads by the verified `model_record_id` from the Model session. It must fail closed when identity is not ready.

## UI rule for Digital MMD APP

In YOU → Work & Earnings / History:

- label `earned_total_thb` as historical/current **ค่าตัวที่ยืนยันในระบบ**
- label `paid_confirmed_total_thb` separately as **จ่ายแล้วที่ MMD รับรอง**
- do not sum those two metrics
- show approved historical jobs even when no old slip exists
- use neutral language such as `ประวัติที่ MMD รับรอง`
- if a payout is verified without a slip, show `จ่ายแล้ว · MMD รับรอง`, not `ไม่มีหลักฐาน`
- pending-review imports remain hidden from the model
- no customer sell price or customer identity is rendered

## Acceptance

Before claiming a model can see historical work:

1. Model has a verified Model session.
2. Canonical `model_record_id` is resolved.
3. Owner-approved historical record is linked to that Model record.
4. `GET /v1/model/history` returns the record in the authenticated session.
5. MMD APP UI reads and renders the route without exposing forbidden fields.
