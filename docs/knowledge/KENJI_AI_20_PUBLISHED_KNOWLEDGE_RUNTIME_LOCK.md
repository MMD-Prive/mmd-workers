# Kenji AI 2.0 Published Knowledge Runtime Lock

Status: active implementation lock
Date: 2026-08-09
Owner surface: `/member/kenji-ai-20`
Runtime source endpoint: `/v1/internal/kenji/knowledge/published`
Admin namespace: `/v1/admin/kenji/knowledge/*`

## Decision

Kenji AI 2.0 must read published knowledge cards from the runtime endpoint first. If the endpoint or persisted store is unavailable, the page/chat must fallback to the static canonical route map only. The published runtime must not return an empty `cards: []` as the normal customer-facing state.

## Active Knowledge Board cards

The following cards are treated as the current active card set for Kenji AI 2.0:

1. `kenji_20_001_role` — Kenji AI 2.0 member concierge role lock.
2. `kenji_20_002_mmd_companion` — MMD Companion route.
3. `kenji_20_003_mms` — MMS Wellness route.
4. `kenji_20_004_partner_venue` — Partner Venue / Relax Spa by 9 route.
5. `kenji_20_005_private_talent` — Private Talent route.
6. `kenji_20_006_payment_proof` — Payment Proof handoff.
7. `kenji_20_007_retired_routes` — Drop 690 main route guard.
8. `kenji_20_008_membership_intake_catalog` — Membership Intake service catalog.
9. `kenji_20_009_web_forbidden_terms` — Web forbidden terms guard.

## Route map

- `/member/kenji-ai-20` — Kenji AI 2.0 page/chat runtime.
- `/confirm/payment-proof` — only customer route for sending payment evidence to MMD for review.
- `/member/membership` — Membership Intake / Reviewed Access entry, not instant access and not a payment-success page.
- `/v1/internal/kenji/knowledge/published` — published cards runtime source.
- `/v1/admin/kenji/knowledge/list` — admin list source.
- `/v1/admin/kenji/knowledge/draft` — admin draft intake source.
- `/v1/admin/kenji/knowledge/{id}` — admin detail source.

## Safety copy lock

Payment proof is evidence only. Customer-facing copy must use safe wording:

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

## Drop 690 main route

Public Access 690 is retired from the main path. New requests should route to Reviewed Access / Membership Intake or Payment Proof only when context requires evidence upload. Do not present 690 as the main access product, instant unlock, or pay-to-view gateway.

## Role lock

Kenji can guide, explain, classify, and route. Kenji must not approve payment, verify funds, unlock membership, guarantee talent availability, guarantee booking, approve access, or replace MMD review.

Customer-facing actor before Companion assignment is `MMD`. After assignment, use the Companion label/name as allowed by the customer-safe ownership rules.

## Implementation files

- `admin-worker/src/kenji-knowledge-runtime.js`
- `admin-worker/src/admin-login-hero-worker.js`
- `admin-worker/kenji-knowledge-runtime-storage.test.mjs`
- `webflow/member/kenji-ai-20/kenji-safe-flow-knowledge-runtime-v21-5.js`

## Cloudflare deployment note

The source is ready for `admin-worker` deployment through Wrangler/Cloudflare. Runtime persistence requires Cloudflare env/bindings to include Airtable access and the Knowledge Board table/field mapping used by `kenji-knowledge-runtime.js`.

Required operational check before deploy:

1. Validate Worker config.
2. Confirm secrets/env are present.
3. Deploy with `wrangler deploy --keep-vars` from the `admin-worker` package.
4. Smoke test:
   - `/v1/admin/kenji/knowledge/meta`
   - `/v1/admin/kenji/knowledge/list`
   - `/v1/internal/kenji/knowledge/published`
   - `/member/kenji-ai-20`

## Current publication reference

Webflow page `/member/kenji-ai-20` was published with the v21.5 runtime loader at `2026-08-09T16:40:25.767Z`.
