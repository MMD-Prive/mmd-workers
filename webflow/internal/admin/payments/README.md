# `/internal/admin/payments` — Money Control V3

Build: `money-control-v3-evidence-context-20260912`

## Goal

Replace the long console-style payment review surface with a search-first, filterable, paginated evidence desk while preserving the existing credential-bound payment authority.

## Authority

The browser is a review UI only. It must never mark paid, award Points, change membership, mutate entitlement, or mutate sessions directly.

Existing contracts remain unchanged:

- `GET /v1/admin/payments/review-queue?limit=100`
- `GET /v1/admin/payments/evidence?proof_id=...` (credential-bound private R2 proxy)
- `POST /v1/admin/payments/review`
- `credentials: include`
- unique `Idempotency-Key` per submitted decision
- POST body: `proof_id`, `decision`, `admin_reason`
- decisions: `approve`, `issue`, `reject`

`approve` may change money truth only after canonical validation and payments-worker acceptance. `issue` and `reject` do not mark paid.

## UX

1. Search comes first and searches payer/name, payment reference, member email, session, proof id, channel, status, and stage.
2. The default lane contains only evidence ready for owner review. Incomplete rows are separated into `รอระบบเติมข้อมูล`.
3. Counts are explicitly scoped to the loaded review queue. The current review API caps this surface at 100 records, so the UI never pretends the loaded count is a global total.
4. Results paginate locally with a visible `showing X–Y of Z · loaded N` summary and selectable page size.
5. Evidence opens in a focused review drawer with a large preview and a full-image lightbox.
6. Match flags use human-readable labels and include linked renewal context.
7. Operator reason remains required before Approve / Issue / Reject.
8. Missing backend state must render `BACKEND WAITING` rather than fake counts.
9. Evidence amount is always labelled `NOT REVENUE`.
10. Historical Backfill and CEO Slip Decision Desk remain separate linked surfaces.
11. Missing amounts render as `ยังอ่านยอดไม่ได้`, never as `0 ฿`.
12. Private LINE slip objects render through the authenticated admin evidence endpoint; R2 keys never reach the browser.
13. Approve stays disabled until preview, extracted amount, payment reference, and a canonical payment/session/renewal link are present.

## Webflow

Canonical page ID: `6987d9a876666dfa1ced0017`.

The primary HtmlEmbed contains the complete V3 HTML/CSS/JS. The former readability override embed is intentionally neutralized so V3 has one visual source of truth.
