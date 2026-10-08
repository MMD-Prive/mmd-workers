# MODEL_PAYOUT_AUTO_APPROVE — Design (draft)

Status: draft for owner review. No code, no deploy. Feature flag off by default.

## Goal
Remove the manual "approve" step for paying models. When a model has acknowledged a job and the job is completed, the system marks the payout approved on its own. Money still moves over a real rail (PromptPay / bank / payout API); this design only automates approval and, in Phase 2, the transfer.

## Approval trigger (not chat text)
Trigger = structured state, not parsed chat wording:
1. Model ack recorded via /sigil/confirm/job-model (token bound to job + that model's own payout amount)
2. Job status = completed in payments-worker (money truth; admin-worker and browser UI are never authoritative)
3. Payout amount is set and matches the ack'd amount

Chat messages are stored as supporting evidence only. They never create an approval.

## Payout record
payout_id, job_id, model_id, amount (model's own payout only), rail (promptpay | bank | api), destination_ref, status, approved_at, approved_by (= system | owner), paid_at, external_ref.

Status flow: pending_ack -> approved -> queued -> paid | failed | held_owner

## Guardrails (both phases)
- One payout per job (idempotency key = job_id + model_id)
- Per-payout cap and per-day cap; over cap -> held_owner
- Destination changed since ack -> held_owner until reconfirmed
- Ambiguous cases (no ack, amount mismatch, no payout channel, unset payout) -> owner-only, never guess
- Never expose customer amount/rate, payment_ref, payment_type, payment_status, LINE ID or internal ids to the model
- Feature flags: MODEL_PAYOUT_AUTO_APPROVE_MODE = off | dry_run | live (default off); no hardcoded Telegram chat IDs
- Rollout: deploy off -> dry_run (owner preview only) -> small pilot -> live

## Phase 1 — semi-automatic (start here)
- System auto-approves per the trigger above
- Owner Telegram digest (HYPE chat) lists approved payouts: model, job, amount, and a PromptPay QR with the exact amount per model
- Owner scans/pays in their own banking app; marks paid via button or reconciliation
- Needs no new provider contract

## Phase 2 — fully automatic
- Payout via bank bulk payment or a payment-provider payout API (requires account/contract; owner applies)
- Worker submits queued payouts on a schedule; webhook/status poll updates paid | failed
- Failures -> held_owner with Telegram alert; no silent retries on money
- Secrets stay in Worker secrets; nothing in repo

## Open questions
1. Which bank / provider for Phase 2?
2. Payout cadence: per job, daily, or weekly?
3. Caps: per-payout and per-day amounts
4. Where is the model's PromptPay/bank destination stored today, and how is it verified?

## Suggested tickets (separate, each flag-off)
- A: payout record + auto-approve (dry_run) in payments-worker
- B: owner Telegram digest with QR (Phase 1)
- C: provider payout integration (Phase 2)
