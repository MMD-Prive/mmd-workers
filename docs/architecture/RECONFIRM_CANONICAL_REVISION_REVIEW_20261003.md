# Reconfirm canonical revision guard — draft release review

## What was verified

This is a product-backend safeguard, **not a demonstrated fix to the reported ChatGPT scheduled monitor**. The reported shared conversation is titled `Model D-1 18:00 Escalation` (https://chatgpt.com/share/e/6ac10e14-e3b8-800a-a934-9779d697caae). Parent retrieval reports generation at 2026-10-03 12:26:08Z, preceding the explicit owner-supported 17:45 revision at 12:27:38Z. Full task prompt, fetch timestamps, queue/delivery timestamps and runtime source are unavailable here. Browser access was rejected by automatic approval review; no workaround was attempted. Do not infer generation after resolution, a cancellation, replacement model, or a verified 21:02 time. Earlier 16:04–16:05 Bangkok proposals were choices, not acceptance. Source freshness still needs investigation independently from delivery lag.

Fresh read-only Airtable schema/records:

- Base `appsV1ILPRfIjkaYg`; Session `recWT7FLsJrf1eH6G`; Job `recAbsYyFC6ADOi7k`; linked Client `recNjAIKUOHRHOSr9`. Client's linked records corroborate those IDs; no name matching.
- Session start `2026-10-04T10:45:00.000Z`, end `2026-10-04T12:15:00.000Z` (17:45–19:15 Bangkok, 90 minutes). Job text reflects that same window. Location/model/partner are unchanged.
- Session paid_received_sum 30,000; balance_due_calc/customer_amount_due_thb 0. Jobs Paid Total rollup remains 0 and Remain to Pay 30,000; these are **not** the payment authority and were not altered.
- Session `notes` contains explicit owner-source references for the Oct 3 change; `note` still contains older Oct 2 text. Reconfirm remains `scheduled`, due/reminder/overdue 09:00/11:00/12:00Z on Oct 3. Partner confirmed_at remains Oct 2 15:30:22.932Z; revision 1. No new acknowledgement can be inferred.
- No Customer Change Request row was returned for the canonical session ID. This manual owner update did not pass through the existing reviewed customer-change handler.

Repository main inspected at `5dbd985c`. Open PRs were reviewed; no open reconfirm fix found among returned PRs. Checkout is isolated under task-6. No AGENTS.md/.agents or software-engineering skill was found in this checkout or installed skill directories; mmd-ops was used read-only.

## Actual product path and bounded change

`events-worker/src/model-eta-wrapper.js` calls `runModelReconfirmSweep` on its existing 15-minute cron. That implementation previously kept an Airtable list snapshot through LINE reminder and Telegram overdue dispatch. Guard v2 is configured false in source; this patch applies freshness checks in both branches without changing flags.

The existing owner/admin `resolve_customer_change` route already requires exact preview version, explicit review, identity/link checks and conditional R2 audit journal writes. It now appends an internal structured revision line to existing `Sessions.notes` in that same guarded write. It records the canonical details hash, server timestamp, exact request ID and authenticated actor reference; preserves prior notes/history; increments the existing partner revision while retaining its existing pending-change behavior. A retry reuses the journal/receipt and does not append again. No financial or identity authority is widened. No new table, field, service, permission or binding is added.

The sender requires fresh unique Session reads and complete Customer Change Request reads before each dispatch, checks linkage/duplicates and applied provenance, validates the revision hash and D-1 schedule, then reads Session again. Pending choice/review, approved but unapplied, unavailable/incomplete/conflicting sources and unreconciled manual revisions return structured `review_required` reasons. Cron logs a bounded data-review event. These checks never parse third-party chat or historical free text into commands. Cancelled/completed/in-progress state observed on a fresh read prevents dispatch.

Blank acknowledgement alone is not proof someone did not answer. Reminder/overdue requires evidence of the backend notice and a 2/3-hour grace period after it. A late sweep sends its initial notice only. Genuinely unresolved delivery-backed risk remains eligible. LINE uses a stable per-session/details/step retry UUID and accepts the provider's duplicate receipt. Reference: https://developers.line.biz/en/docs/messaging-api/retrying-api-request/ (retry keys have a 24-hour scope and do not prove end-user delivery).

## Explicit limitations / release blockers

- This does not access, modify or repair the independent ChatGPT task, its prompt or its delivery queue. It must fetch current canonical state, the latest owner-supported resolution and relevant source freshness immediately before emitting a summary; its actual prompt/fetch/send timing must first be identified. Do not disable monitoring globally.
- No chat-to-canonical command path was located. Do not automatically execute chat messages. The actual manually updated Que record will return `manual_revision_requires_review`, rather than inventing current ACKs or claiming old time confirmed. A separate owner-approved, exact record plan is needed to make that historical resolution structured; **do not replay the original update, create a fake customer request, or resend the previously sent confirmation URL**.
- The existing reviewed change handler updates Session, not the Jobs text projection. PartnerDash/MY MMD source reads must be verified for future changes; a Jobs projection repair requires an explicit plan and existing trusted integration. The golden case's projections are already updated and were not touched.
- Airtable does not offer conditional PATCH here. Freshness checks narrow but cannot eliminate a mutation between the last GET and send/PATCH. The in-process sweep lock covers one isolate; LINE retry keys cover duplicate LINE acceptance for 24 hours. Distributed Telegram exactly-once dispatch and cross-isolate writer serialization are not established. No new security/storage architecture was introduced to claim otherwise. Those are release-review gates, not hidden guarantees.
- Legacy ACK endpoints are not redesigned by this draft. The existing payment confirmation revision contract is separately tested. Model reconfirm action/UI revision binding and partner stale-tab action checks need review before a complete revision-authority rollout.
- Source-live field overrides/configuration were not read. The current Session lacks a populated `session_state`/`status` in the read response; product runtime behavior depends on field mappings. Do not claim that production cron processed this case solely from `Session Status=Confirmed`.
- Data-review output is a structured cron result/log, not new customer/partner/owner outreach. Its collection/visibility in operational monitoring must be verified.

## Exact release steps (not performed)

1. Review draft diff and confirm it is wanted as a backend safeguard separately from the ChatGPT monitor investigation. Keep draft while the limitations above remain.
2. Verify exact head GitHub Actions, including Model Reconfirm CI and Payment Review Facade CI. Run the focused command below and `npm run check`; both Worker bundle dry-runs must pass. Resolve failures at that head.
3. Read runtime field mappings, existing table access and log collection. Verify the new read-only Customer Change Request lookup is available to the existing events-worker credential. Do not expand permissions without separate approval.
4. In a non-production fixture, exercise owner approve, retry, ambiguous records, concurrent/mid-read updates, pending choice, source outage, cancellation/completion and positive unresolved escalation. Verify PartnerDash and MY MMD read the canonical Session. Review remaining action/projection/distributed gates before production approval.
5. Identify the ChatGPT task's actual prompt, source read time, alert generation time and delivery time. Review a concrete task-only correction before any approved automation mutation; none was made here.
6. Separately review any exact historical reconciliation plan for Que; retain 17:45–19:15, all payment/model/client/partner/location facts and sent-link history. No invented acceptance/ACK, no replay/outreach.
7. Only after explicit merge/deploy authorization, merge the reviewed commit and deploy admin-worker then events-worker using existing release procedures. No cron/flag/settings change is needed by this diff. Verify first cron's data-review result before approving any further record or notification work.

Focused verification:

```sh
node --test admin-worker/model-reconfirm-runtime.test.mjs admin-worker/model-reconfirm-freshness.test.mjs admin-worker/model-reconfirm-guard.test.mjs admin-worker/model-reconfirm-owner.test.mjs admin-worker/customer-change-resolution.test.mjs admin-worker/sigil-jobs-reconfirm-integration.test.mjs shared/confirmation-revision.test.mjs payments-worker/confirmation-ack-revision.test.mjs
```

Local validation: 70/70 focused tests passed on Node 24.14.0. Root `npm run check` initially encountered the host Node 24 removal of `--experimental-default-type`; rerun with installed Node 22.23.3 passed, without changing repository scripts. Both existing Wrangler bundle dry-runs completed successfully (no upload). GitHub exact-head status is recorded in the PR after push; local success does not substitute for CI.
