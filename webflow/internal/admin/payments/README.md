## Simple daily payment review — 2026-09-21

`payment-review-simple.html` is the complete primary embed for `/internal/admin/payments`.
It replaces the live `money-control-v3` embed and uses a new root so old presentation patches cannot enable its approval controls.

- Two search views: pending slips and the latest 100 created jobs, including jobs without slips. Results are explicitly scoped to the loaded view.
- Authoritative Per Rename names are joined through exact canonical Client IDs; original names, LINE display names and canonical model aliases remain searchable. No name or amount is used to match money to a job.
- `view=recent_jobs` is a read-only projection through the existing authenticated queue route. It shows each payment separately and retrieves an exact pending `proof_id` before review, including slips outside the default queue window.
- Missing alias data is visibly marked as partial; errors never masquerade as an empty list. Ambiguous links fail closed. Confirmation tokens and model payouts never appear in discovery.
- `include_context=1` adds a read-only canonical Payment/Session projection; no confirmation tokens or model payouts are returned.
- Show the submitted amount next to the amount due for this payment, not the total job fee.
- View the evidence and confirm both the job match and money received in the bank before enabling approval.
- An uncertain response retains the exact request and idempotency key in session storage; only an explicit retry replays it.
- The result separately reports money recorded, internal Telegram handoff, customer/model delivery, and membership write-through when relevant.
- Issue/reject record the review audit only. The UI says the item remains in the queue, matching the existing API contract.
- The CEO inbox remains available under additional tools for exceptional identity/context matching. Historical imports remain separate.
- Web proofs use semicolon metadata and private `web-payment-proofs`/`mmd-shop-payment-proofs` objects; LINE proofs retain their JSON metadata and private prefix. Images and sandboxed PDFs are served only after the existing admin session check.

Validation: `node --test admin-worker/payment-review-simple.test.mjs` plus existing review/auth/delivery suites. The UI was also exercised with a DOM harness for evidence-load failure, both approval checks, persistent same-key retry, and a failed-delivery receipt after successful payment.

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
