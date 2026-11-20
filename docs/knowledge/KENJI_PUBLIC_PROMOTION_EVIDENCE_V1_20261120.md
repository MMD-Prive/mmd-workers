# Kenji Public AI — read-only promotion evidence gate (20 Nov 2026)

**State:** draft PR / not deployed / not authorized to publish promotions.

## Why this change exists

PR #3227 narrowed the canonical server BFF to `general_qna` and `published_promotions`, with the latter returning HTTP 423 pending a trustworthy source. The CARE BACK policy is not an approval or publishing ledger. Its November public announcement ends **before 2026-12-01 00:00 Asia/Bangkok**; payments may separately be honored before **2027-01-01 00:00 Asia/Bangkok**. This December honor period must never extend public marketing automatically.

The Git source card `knowledge/kenji/cards/promotion/care-back-2026-final-lock-th.json` and the legacy `kenji_20_011_care_back_2026` fallback contain outdated September/30-day coupon claims. They are now explicitly retired from published read surfaces; existing customer entitlements, coupons, owner knowledge audit/history and settlement policies are unchanged.

## What is actually implemented

1. A **pure read-only evidence validator** at `member-dashboard-chat-worker/src/kenji-public-promotion-evidence.js`.
2. An optional server-only `GET` to a future independently attested `KENJI_PROMOTION_EVIDENCE_WORKER` service binding. It forwards **no cookie, authorization header, member ID, LIFF identity or user message**. The binding is **not configured by this PR**.
3. An explicit feature gate `KENJI_PUBLIC_PROMOTIONS_ENABLED === "true"`. **No flag is enabled by this PR.** Missing/invalid/stale/ambiguous evidence remains typed HTTP 423 `published_promotion_contract_unavailable`; `AI_WORKER` is never called for promotions.
4. Verified, currently published single-campaign evidence may produce only the **exact approved Thai copy** and its allowed public promotion link; expiry produces a fixed neutral message and MY MMD handoff. It cannot calculate or grant a coupon or member benefit.
5. A personal coupon request is a restricted lane (HTTP 403), even if the message also mentions a promotion. The existing /member/kenji UI now translates typed 423/403 to customer-safe MY MMD handoffs. Other 423 conditions retain their prior behavior.
6. The general Q&A AI payload now has minimal identity-only context, while the BFF still resolves a verified server session before classifying/answering. The Worker-generated UI shortcut prompts no longer advertise restricted Black Card, payment or membership lookup actions.

## Contract

**Schema:** `mmd.public_promotion_evidence.v1`. A future trusted evidence producer must return a single public campaign:

- `authority: "mmd_promotion_evidence_registry"`, `read_only: true`, `observed_at` (absolute timestamp, max age 5 minutes).
- `campaign_id` (canonical owner-approved mapping; **not** inferred from `6-years-care-back` vs `care_back`), `audience: "public"`.
- `approval: { state:"approved", approved_by:"Boss Per", approved_at, approval_ref, copy_th, copy_sha256 }`. The approval reference must be a durable owner authorization tied to the exact copy bytes.
- `publication: { state:"published", public_url, published_at, publish_ref, revision, copy_sha256 }`. The producer must verify the actual custom-domain page / channel, not infer from Webflow site-level lastPublished.
- `display_window: { starts_at, ends_before }` as absolute timestamps with zone offsets.
- `source_revision: { policy_git_blob_sha, approval_revision, publication_revision, approved_copy_sha256, published_copy_sha256 }`. Revisions must match the approval and published copy; the Worker independently re-hashes approved text.
- No member-specific offers, eligibility, private access, coupon instances, personal identifiers or payment evidence in the public snapshot.

For CARE BACK specifically, the validator locks the reviewed canonical `shared/membership-promotion-policy.mjs` blob SHA and disallows a November-window end after Dec 1. A policy change requires a fresh code review and a new attested source revision.

**Not acceptable:** a Git Knowledge Card with `status:published`, Airtable Promo Code `status:active`, a Coupons wallet payload, a public page existing at a URL, a campaign draft, a site-wide Webflow Publish timestamp, or a policy calculation of December honor eligibility **alone**.

## Evidence still missing (do not enable)

- Owner approval receipt + exact approved public-facing copy and digest.
- A normalized canonical Campaign ID joining legacy IDs.
- Per-page/real-channel publication receipt, source revision and approved-text comparison.
- A trusted read-only adapter that periodically verifies Webflow/other channel state, emits the bounded snapshot, and expires/revokes it on unpublish.
- Explicit staged QA / release authorization and production Worker version/edge-route confirmation.

The currently observable Webflow CARE BACK page, promo-code records and policy calculation do **not** fill the missing proof contract. Do not synthesize approval IDs or publication receipts.

## Release gates

- Test malformed/missing/stale evidence, hash/revision mismatch, draft/unpublished/cross-domain link, personal coupon request, explicit expiration at Bangkok midnight, October/November/Honor distinction, and `AI_WORKER` call count zero on denied promotions.
- Keep old member/Points/payment/booking/care guardrails, same-origin check and session-first 401 behavior.
- The Worker-generated /member/kenji shortcut prompts have been replaced with General Q&A-only examples. Verify they still classify as general; independently reconcile any older Webflow /concierge/kenji page before publication. Do not enable legacy operational lanes.
- Real iOS/LINE QA, known test session, and no customer data or writes.
- Verify active Cloudflare Worker deployment **and** Edge Router owner against the reviewed Git commit. Merge != deploy; uploaded version != active traffic.
- Keep `KENJI_PUBLIC_PROMOTIONS_ENABLED` off until the evidence producer is attested, tested and explicitly approved. No deploy, Webflow publish, marketing post, customer write or LINE send is within this change.

## Safe customer responses

- **Unknown evidence (423):** "ตอนนี้ผมยังยืนยันข้อมูลโปรโมชั่นที่ประกาศล่าสุดไม่ได้ครับ เพื่อไม่ให้แจ้งสิทธิ์คลาดเคลื่อน เปิด MY MMD เพื่อตรวจคูปองที่ระบบยืนยันไว้ได้โดยตรงครับ"
- **Announcement ended, proven campaign:** "โปรโมชั่นรอบประกาศนี้สิ้นสุดแล้วครับ สิทธิ์ที่เกี่ยวข้องกับบัญชีต้องตรวจจากระบบ MY MMD โดยตรง ไม่สามารถยืนยันจากแชตได้ครับ"
- **Personal coupon (403):** "ข้อมูลนี้เกี่ยวข้องกับสิทธิ์หรือข้อมูลเฉพาะบัญชีครับ ผมจะไม่คำนวณหรือยืนยันแทนระบบ กรุณาเปิด MY MMD เพื่อดูข้อมูลที่ยืนยันแล้วครับ"
