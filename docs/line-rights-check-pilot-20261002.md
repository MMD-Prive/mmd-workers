# LINE rights check / renewal pilot readiness — 2026-10-02

## Current readiness

Implementation is prepared for a separate draft PR stacked on #2184 (`codex/private-renewal-manual-review-20261002`, a71808f). Nothing is merged or deployed. Missing `KENJI_LINE_RIGHTS_CHECK_MODE` means existing behavior. Only `pilot` is implemented; there is no global `live` mode. Current production kill-switch evidence belongs to the parent investigation and has not been changed here.

Today, the usable operational fallback is Per-assisted LINE: customer asks “เช็กสิทธิ์” / “เช็คสิทธิ์” / “ต่ออายุ”; Per verifies the canonical member against the signed OA/verified LIFF identity, reads confirmed entitlement and eligible points, creates or locates the existing renewal payment item, confirms package, amount and inclusive dates, then asks for the slip on that same item. Evidence stays pending_review until Official Verify owner review succeeds. A chat message, uploaded slip, or generated quote never grants membership/points.

Reviewed code destinations: customer entry https://mmdbkk.com/sigil/start (owner preferred); member payment center https://mmdbkk.com/my-mmd/payments; renewal https://mmdbkk.com/pay/renewal. Owner surfaces `/internal/admin/customer-data`, `/internal/admin/payments`, `/internal/ceo/payment-slip-inbox` require existing owner authentication. This feature does not certify a live mobile login/payment journey or create a payment item automatically.

Per's unresolved-case checklist:
1. Open the existing Conversation Matrix handoff, inspect `handoff_reason` (`rights_check:missing:...`) and `last_event_id`, then the original Console Inbox event. Do not substitute an OA web chat-path ID for its signed provider UID.
2. Resolve canonical identity or missing entitlement evidence; preserve VIP/SVIP/Black Card while unknown. Read reviewed expiry rather than a renewal date embedded in a rename.
3. Reconcile ledger source, unique paid+verified payment, amount, session and ownership before publishing spendable points. Historical estimates remain unusable and are never sent by this feature.
4. Confirm renewal or >1-year-expired new-signup classification through existing policy. Use the actual reviewed payment date for expired membership and existing expiry for active membership. Confirm protected tiers manually.
5. Locate/create the canonical renewal payment through the existing owner intake, attach the proof to that member/item, and approve only through Official Verify. No isolated Payments row or direct ledger write.

## Prepared behavior

- Signed MMD LINE webhook enters the existing canonical intake first. MMS ingress/credentials stay separate. Only direct user text with exact bounded own-status / renewal phrases is intercepted; foreign-account, slip, CARE BACK and unrelated questions remain in existing lanes.
- SHA-256 provider-user pilot allowlist; malformed/empty/missing mode or allowlist fails closed. No owner UID is guessed or committed.
- Fresh authoritative member resolver supplies entitlement. `rights_check` reuses payment-backed points reader with strict canonical member ownership, complete paging and reconciled history. It refuses uncertain profile values, imported note amounts, duplicate payment references, amount/session mismatches and foreign member rows.
- A renewal discount quote uses the existing package/timing policy only when the same guarded rows carry explicit canonical service classification and paid ownership. Missing `Payments.member_id` or `payment_kind` / `payment_type` means review, not an inferred discount. This production field coverage has not been verified; no schema/mapping changes were made.
- Existing `KENJI_MODEL_DEDUPE` transactional claim is reused in a distinct object namespace. Event reservation is committed before effects; one delivery attempt per event for 24h, redelivery silent. LINE ambiguity never retries or writes confirmed outbound history.
- Incomplete truth writes one actionable owner handoff through the existing Conversation Matrix, with exact missing evidence and source event. Pending cases are reused. Case claim precedes write to avoid duplicate uncertain writes; if persistence fails, the answer explicitly says queueing failed and asks for Per. Owner can recover via the original canonical inbox. This is at-most-once side effect behavior, not guaranteed background retry.
- Owner takeover is checked before truth lookup and again from fresh continuity immediately before delivery. Runtime controls are re-read after the lookup; unavailable owner/controls are silent. The existing human controls must be used for a manual takeover.

## Owner-test prerequisites / release gate

Offline fixtures are ready. Before any real owner test, separately approve an isolated staging setup, exact verified MMD OA provider UID hash, sender credentials already managed as secrets, service bindings including existing DO, and owner matrix/control storage. No fixture source IDs are live testers. Named staging currently lacks the full required bindings; no staging deployment was attempted.

Global runtime kill currently blocks this lane too. Do not globally unpause to test it: that could enable existing unrelated LINE paths. A safe live owner pilot needs a separately reviewed deployment/control plan that preserves the broader delivery lock. No scoped override exists in this PR. Live response latency, owner mobile UX and data coverage remain unmeasured.

## Validation

- New focused contracts: 38/38 passed, including actual signed ingress, invalid-signature rejection, real existing DO concurrency, both spellings, duplicate cases, failure acknowledgments, takeover/kill races, no failed-delivery history, corruption 61,320 fixture, foreign identity, duplicate payment, protected tiers and new-signup classification.
- `npm run test:member-pages-liff`: 408/408 passed.
- `npm run test:member-dashboard-line`: 340/340 passed.
- Regression subset: 85/85 passed.
- Wrangler dry-run build passed for both affected Workers. No deploy command without `--dry-run` was executed.
- `git diff --check` passed. New contracts were added to existing CI test scripts.

No customer messages, real slip verification, financial approval, grants, ledger repair, billing/security policy changes or runtime control changes occurred. #2184 is preserved; merge/deploy remain separate decisions.
