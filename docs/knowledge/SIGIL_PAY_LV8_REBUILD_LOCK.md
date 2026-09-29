# SIGIL Pay LV8 Rebuild Lock

Updated: 2026-09-30
Owner directive: `/sigil/pay` Full Code Rebuilt LV8.

## Canonical route

`/sigil/pay?t=<signed customer token>` is the canonical private signed payment room for SIGIL / Private Job / Black Card / selected private service payments.

The page is not a visual-only Webflow landing page. LV8 means the complete customer payment lifecycle must work end-to-end across Webflow, payments-worker, admin/Official Verify, Telegram delivery, My MMD / Payment Center, and model/customer handoff links.

## LV8 definition

LV7 made the customer able to pay and upload proof. LV8 means the job must not get lost after the customer pays.

Required LV8 flow:

1. Signed link opens fast and renders from backend truth only.
2. Customer sees amount, payment stage, model/job context, date/time/location when available.
3. Payment methods come only from `payments-worker` via `/v1/confirm/payment-instructions`.
4. Slip upload posts to `/v1/pay/slip/evidence` and must send the actual slip file to Per/Telegram, not only filename metadata.
5. Upload result becomes evidence-only `pending_review`; it never marks paid, verified, membership-active, private-access-ready, or job-confirmed by itself.
6. Duplicate upload loops are blocked while pending review unless backend explicitly requests new evidence.
7. Official Verify is the only authority that can move the payment to verified/approved.
8. After Official Verify, the system must be able to produce and deliver:
   - customer confirmation URL;
   - admin job URL;
   - model job app URL / LINE Mini App handoff;
   - Telegram completed/verification pack for Per.
9. My MMD / Payment Center must show the correct pending review or verified state from backend truth.
10. If token, session, payment_ref, amount, payment instructions, or verification truth is missing, fail closed with safe copy and no destination details.

## Customer-facing copy

Use Per Voice: short, calm, premium, human.

Good copy:

- `ผมสรุปยอดกับรายละเอียดไว้ให้แล้วครับ`
- `ส่งครั้งเดียวพอครับ เดี๋ยวผมดูต่อให้`
- `ได้รับสลิปแล้วครับ เดี๋ยว MMD ตรวจยอดให้ต่อ`
- `ตอนนี้อยู่ระหว่างตรวจยอดครับ`

Do not expose raw terms such as token, schema, authority, endpoint, Payment Review, Airtable, Worker, or stack traces to customers.

## Webflow runtime lock

The `/sigil/pay` Webflow page must remain mobile-first, compact, dark SIGIL, and practical:

- no white border;
- no broken accordion;
- no hidden upload input that is impossible to tap;
- no raw URL/token display;
- no demo labels;
- no fake paid state;
- no browser-created amount, destination, QR, fee, or PayPal URL;
- payment methods must remain usable at 360px, 390px, 430px, and desktop around 1280px;
- LINE Seed Sans TH only with existing weights 400, 700, 800;
- final CSS must protect text color and contrast on mobile.

## Backend authority

Payment authority remains `payments-worker`.

Canonical APIs:

- `POST /v1/confirm/details`
- `POST /v1/confirm/payment-instructions`
- `POST /v1/pay/slip/evidence`
- Official Verify/admin route for payment approval and link delivery

`/v1/pay/slip/evidence` stays evidence-only even when it forwards the uploaded file to Telegram.

## Telegram / Per visibility

After customer upload, Per must receive enough information to act without guessing:

- actual uploaded slip file when present;
- payment_ref;
- session_id;
- payment_stage;
- file name/type/size;
- Airtable/payment record link or record id when available;
- admin/Official Verify next-action URL when available.

If Telegram delivery fails, the customer must not be marked paid. The backend response may still record evidence, but owner visibility failure must remain observable in logs/metadata.

## Official Verify / link delivery

After official verification, the system must send or expose the correct next links:

- customer confirmation URL for the customer;
- admin job URL for Per/owner;
- model job app URL for the assigned model;
- for existing model/job handoff, owner/job-assigned alias must win over onboarding self-name.

The model URL must not send assigned models back to generic MMD model signup/onboarding when the URL is job-specific.

## Acceptance tests

Before calling LV8 done, cover at least:

- valid signed token renders details and payment methods;
- missing/expired token fails closed;
- payment instructions unavailable hides QR/bank/PayPal;
- upload requires file or valid evidence payload;
- upload forwards an image slip to Telegram as a file/photo;
- upload response remains evidence-only and pending review;
- pending review blocks duplicate customer resubmit loop;
- verified state appears only from backend official verification;
- after official verification, customer and model handoff URLs are present;
- mobile layout has no horizontal overflow except intentional payment-method swipe layers.

## Non-goals for LV8

LV8 is not full autonomous payment approval. Do not OCR slips into paid state, auto-grant membership, auto-open private access, or finalize jobs without Official Verify.

LV10 can later add observer/reconciliation/automation, but LV8 must first make the human-verified production flow stable.
