# Kenji AI 2.0 Published Knowledge Runtime Lock

Status: active implementation lock
Date: 2026-08-19
Payment route amendment: 2026-09-11
Customer/member surface: `/member/kenji-ai-20`
Canonical owner admin preview: `/internal/admin/kenji?view=ai20`
Runtime source endpoint: `/v1/internal/kenji/knowledge/published`
Admin namespace: `/v1/admin/kenji/knowledge/*`

## Decision

Kenji AI 2.0 must read published knowledge cards from the runtime endpoint first. If the endpoint or persisted store is unavailable, the page/chat must fallback to the static canonical route map only. The published runtime must not return an empty `cards: []` as the normal customer-facing state.

The customer/member runtime remains `/member/kenji-ai-20`. For the single owner, the preview of that runtime is consolidated into `/internal/admin/kenji?view=ai20`; this is a preview surface only and does not create a second runtime, knowledge store, or authority layer.

For payment routing, `docs/knowledge/MMD_CANONICAL_PAYMENT_MEMORY_20260911.md` and `docs/knowledge/UNIFIED_PAYMENT_PROOF_FLOW_LOCK.md` are authoritative when older wording conflicts with this document.

## Active Knowledge Board cards

The following cards are treated as the current active card set for Kenji AI 2.0:

1. `kenji_20_001_role` — Kenji AI 2.0 member concierge role lock.
2. `kenji_20_002_mmd_companion` — MMD Companion route.
3. `kenji_20_003_mms` — MMS Wellness route.
4. `kenji_20_004_partner_venue` — Partner Venue / Relax Spa by 9 route.
5. `kenji_20_005_private_talent` — Private Talent route.
6. `kenji_20_006_payment_proof` — canonical payment handoff: current signed `/sigil/pay?t=...` when available, otherwise `/member/payments`; proof remains evidence only.
7. `kenji_20_007_retired_routes` — Drop 690 main route guard.
8. `kenji_20_008_membership_intake_catalog` — Membership Intake service catalog.
9. `kenji_20_009_web_forbidden_terms` — Web forbidden terms guard.
10. `kenji_20_010_cloudflare_deploy_gate` — Cloudflare deploy gate.
11. `kenji_20_011_care_back_2026` — CARE BACK 2026 final policy, Wish-saved coupon gate, status benefits, and owner boundaries.

## Route map

- `/member/kenji-ai-20` — Kenji AI 2.0 page/chat runtime for customers/members.
- `/member/kenji-ai-20?mode=admin-preview` — standalone owner preview source used by the canonical Kenji Admin AI 2.0 view.
- `/internal/admin/kenji?view=ai20` — canonical owner preview inside Kenji Admin.
- `/internal/admin/kenji?view=knowledge` — canonical owner Knowledge view.
- `/internal/admin/kenji?view=board` — canonical owner sanitized SIGIL Board view.
- signed `/sigil/pay?t=...` — canonical combined payment + proof surface only when the current backend payment intent supplies the signed URL.
- `/member/payments` — generic payment list/status/navigation handoff when no signed canonical pay URL is available.
- `/confirm/payment-proof` — legacy/manual no-ref evidence compatibility only; not the default new-payment CTA and must not create a replacement `payment_ref`.
- `/sigil/member/membership` — canonical Membership Intake / Reviewed Access entry for package selection/start/renew/upgrade.
- `/sigil/membership` — Renewal / Access Conditions only; not checkout.
- `/promotion/6-years-care-back` — CARE BACK 2026 canonical customer route; login/identity alone never issues coupon or Points.
- `/v1/internal/kenji/knowledge/published` — published cards runtime source.
- `/v1/admin/kenji/knowledge/list` — admin list source.
- `/v1/admin/kenji/knowledge/draft` — admin draft intake source.
- `/v1/admin/kenji/knowledge/{id}` — admin detail source.

## Payment routing and safety lock

Payment proof is evidence only. Customer-facing copy must use safe wording such as:

- `รับหลักฐานแล้ว`
- `รอตรวจยอดจริง`
- `MMD ตรวจยอดจริง`
- `MMD รับหลักฐานไว้ตรวจสอบแล้ว`

Customer-facing copy must not use:

- `Payment Successful`
- `Paid`
- `Verified`
- `Approved`
- `ชำระเงินสำเร็จแล้ว`
- `อนุมัติแล้ว`
- `สุนทรเวช`

Additional hard rules:

1. Reuse the canonical payment item/reference; never mint a replacement because a customer revisits the flow.
2. If a current signed `/sigil/pay?t=...` URL exists, use that exact URL.
3. Otherwise route payment continuation/status to `/member/payments`.
4. `/confirm/payment-proof` is legacy/manual no-ref compatibility only.
5. If proof is already pending verification, do not ask the customer to submit it again.
6. Only Official Verify/backend money truth can turn evidence into a paid/materialized state.

## Drop 690 main route

Public Access 690 is retired from the main path. New requests should route to Reviewed Access / Membership Intake. If payment continuation is needed, use the current signed `/sigil/pay` handoff when supplied by the backend or `/member/payments` otherwise. Do not present 690 as the main access product, instant unlock, or pay-to-view gateway.

## Role lock

Kenji can guide, explain, classify, and route. Kenji must not approve payment, verify funds, unlock membership, guarantee talent availability, guarantee booking, approve access, or replace MMD review.

Customer-facing actor before Companion assignment is `MMD`. After assignment, use the Companion label/name as allowed by the customer-safe ownership rules.

## Implementation files

- `admin-worker/src/kenji-knowledge-runtime.js`
- `admin-worker/src/kenji-public-knowledge-runtime.js`
- `member-dashboard-chat-worker/src/kenji-line-next-action.mjs`
- `admin-worker/src/admin-login-hero-worker.js`
- `admin-worker/kenji-knowledge-runtime-storage.test.mjs`
- `webflow/member/kenji-ai-20/kenji-safe-flow-knowledge-runtime-v21-5.js`
- `webflow/internal/admin/kenji/kenji-admin-ai20-view-v1.js`

## Cloudflare deployment note

Runtime persistence requires Cloudflare env/bindings to include Airtable access and the Knowledge Board table/field mapping used by `kenji-knowledge-runtime.js`. The owner preview bundle must not receive these secrets; it only renders the existing member-facing preview route.

Required operational check before deploy:

1. Validate Worker config.
2. Confirm secrets/env are present server-side.
3. Deploy Worker/runtime changes with the existing guarded deployment path when required.
4. Smoke test:
   - `/v1/admin/kenji/knowledge/meta`
   - `/v1/admin/kenji/knowledge/list`
   - `/v1/internal/kenji/knowledge/published`
   - `/member/kenji-ai-20`
   - `/internal/admin/kenji?view=ai20`

## Current publication reference

Webflow page `/member/kenji-ai-20` was published with the v21.5 runtime loader at `2026-08-09T16:40:25.767Z`. A later V23 rebuild may supersede this runtime only after its own PR and explicit production publication are approved.
