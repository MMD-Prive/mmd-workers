# SIGIL payment evidence and confirmation delivery

This change covers Create Job → `/sigil/pay` or LINE OA evidence → Payment Review → Member/Model confirmation delivery. It does not change the authority for approving payments.

## Evidence correlation

LINE evidence uses the existing Payment reference only when the canonical customer, selected Session, payment stage, and amount resolve to exactly one Payment. The bank transaction reference remains in the evidence note. Ambiguous, cancelled, mismatched, or incomplete matches remain in the existing review path.

Both intake workers use conditional writes in their existing shared private `mmd-line-slip-evidence` bucket to lock intake by Payment reference. Each channel checks for existing evidence inside that lock. A concurrent request receives `payment_evidence_intake_in_progress`; a subsequent request returns the existing proof. Duplicate and error responses include the configured website CORS policy.

This applies to new evidence. It does not rewrite old bank-reference proofs or backfill historical Payment links.

## Notification recovery

- Web proof documents are queued under `payment-notifications/v1/web-proof/` before attempting Telegram delivery. Retries read the already stored file and never recreate or settle a Payment.
- Approved job notifications are queued under `payment-notifications/v1/approved-job-links/` only after Payments accepts Official Verify. Customer, Model, and Ops acknowledgements are persisted separately. Retries skip acknowledged recipients, re-read canonical identities/URLs, and stop for a cancelled Session.
- Replaying the same review key can recover delivery using the approved Session/Payment context in the audit. It does not call Payments again. Reusing that key for another proof or decision is rejected.
- Existing LINE evidence notifications continue to use their existing durable outbox.

Both new queues use conditional leases, bounded backoff, and a five-minute scheduled sweep. After 12 failed attempts or 23 hours, the task becomes `manual_review`. Completed and terminal receipts are kept outside the active queue. API responses expose `retry_queued`/`delivery_status` for job links and `telegram_retry_queued`/`telegram_delivery_status` for web evidence. Missing canonical recipient identities require the existing Ops manual delivery fallback.

Acknowledged deliveries are deduplicated. LINE also uses a stable retry key. Telegram does not provide an equivalent acknowledgement key here: an ambiguous network failure after Telegram accepted a message can still result in a repeated message.

Older approval audits without a stored Session ID need manual recovery. No historical messages or payment approvals are replayed by this patch.

## Deployment and verification

Deploy all three changed workers: `payments-worker`, `member-dashboard-chat-worker`, and `admin-worker`. The existing bindings point to the same evidence bucket; no new secret, Airtable field, or bucket is required.

The payments and admin deployment workflows explicitly ensure the five-minute Cron trigger after the version is deployed. The schedule sync preserves existing schedules and does not alter route ownership. Version upload alone does not install the schedule.

Run `npm run test:payment-delivery` for the focused regression suite. Tests exercise both channel orders, signed upload/confirmation reads, incorrect or ambiguous matches, concurrent locks, Telegram outages, partial recipient failures, same-key review recovery, cancelled jobs, and rejection before Official Verify. All network transports and financial writes in these tests are mocks.

Local validation: 164 related tests passed; Wrangler dry-run builds passed for the three production entrypoints. The admin build reports pre-existing duplicate `picker_*` keys in `recovery-control.js`; this patch does not change that module. The legacy pricing module's malformed duplicated block was removed and its entrypoint tests now pass.

Production end-to-end delivery remains to be verified after deployment using an authorized real or designated test job. No live proof submission, payment approval, Telegram message, or production deployment was performed while preparing this patch.

Implementation references: [R2 conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations), [LINE retry keys](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/), [Cloudflare schedules API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/update/).
