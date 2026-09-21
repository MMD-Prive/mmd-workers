## Before-job follow-through — 2026-09-22

Build `payment-job-readiness-20260922` continues the paid-job panel into preparation and day-of-work tracking.

- The authenticated confirmation read adds `readiness` from the exact canonical Session and Customer Change Requests table (`tblhQGfJc4GgiteZr`). It shows current date/time/location, missing details, customer/model acknowledgement checks, unresolved customer requests and the model's canonical session state.
- Pending and approved-but-not-applied requests remain outstanding. Applied/rejected/withdrawn requests are retained in expandable history. Before/requested snapshots are separate from current job details; a request never changes the displayed canonical location by itself.
- Both acknowledgements cannot produce the completed-checklist heading while a request or required detail is outstanding. Merely storing a hotel does not imply the customer agreed to it.
- A failed, truncated, malformed or conflicting request query produces an unknown/incomplete state, never a zero-outstanding claim. Exact Session ID plus a single canonical Session link are required before any request details are projected.
- The model lifecycle comes from `model_session_contract_v1`; time passing and payment receipt cannot advance it. The checklist does not authorize service start, approve amendments or alter Sessions, payments, calendar holds or payouts. Existing job management remains responsible for resolving changes; this release surfaces that work in the paid-job view.
- Production still uses the two derived CSS / HTML+JS Webflow embeds described below. No independent generated asset or new public API route is introduced.

Validation includes DOM behaviour for changed-location requests after both acknowledgements, safe rendering of customer text, missing readiness, API pagination and failure handling, plus existing payment-delivery regression suites. Authenticated production interactions require the owner browser session; no real change request or payment is submitted by these tests.

## Confirmation follow-through — 2026-09-21

Build `payment-confirmation-20260921` adds persistent follow-through to the paid-job view.

- Open a paid deposit/full payment to read the private delivery journal and canonical Session acknowledgement timestamps. Delivery acceptance and clicking Confirm remain separate statuses for each recipient.
- `GET review-queue?view=confirmation&session_id=…&payment_ref=…&payment_stage=…` is read-only. The response allows only delivery booleans, timestamps and bounded state; signed links and recipient identities stay server-side.
- `POST review` with `action: retry_confirmation` revisits an existing delivery event only. It requires owner/admin, an exact canonical Paid payment/session/stage/client match, an active job and an exact journal subject. It never creates a delivery event or calls money settlement. Existing per-recipient checkpoints, retry lease, backoff and expiry remain authoritative.
- Missing history stays unknown. Missing recipient bindings require team forwarding from the existing Telegram message. Sending a link never implies recipient acknowledgement; manual forwarding itself is not tracked as an automatic delivery.
- Final payments, tips, membership and shop payments cannot re-release initial job links.

Webflow deployment: the source remains a self-contained HTML file for local validation. It now exceeds Webflow's 50,000-character embed limit: publish its `<style>…</style>` block to the secondary HtmlEmbed `a52fc9d7-80a2-6244-30e4-5209520328d3`, and the remaining HTML/JS to primary HtmlEmbed `5a2aa67e-dc32-3826-e2d8-3708b2a4f124`. Do not keep the obsolete secondary override. Both parts derive from this same source.

Validation: 7 follow-through API tests, 10 UI interaction tests, 89 delivery/evidence regressions and 17 review/discovery/provenance tests. Live production queue checks require an authenticated admin session; no real approval or notification is sent during validation.

## Payment workspace — 2026-09-21

Build `payment-flow-20260921` replaces the separate job/slip tabs with one search and a list/detail workspace. The visible flow is customer/job → evidence from web or LINE → verified money → confirmation delivery. Desktop keeps the selected job and evidence beside the list; mobile opens one task at a time with a back button.

- Search spans the latest 100 jobs and latest 100 pending proofs. Exact payment/session links deduplicate the same item. Membership or otherwise unmatched proofs remain visible.
- Pending evidence, waiting for evidence, and paid amounts have plain-language filters. Searching automatically includes every status.
- Each selected proof is re-read by exact ID before displaying the review controls. A stale response cannot replace the user's next selection.
- Viewing the evidence and confirming both the match and real bank receipt remain mandatory. Unknown outcomes preserve the same request/key across leaving and reopening an item.
- Payment success and Telegram/customer/model delivery are shown separately. Existing paid jobs do not claim that confirmation delivery is complete. Issue/reject remain audit-only.
- The obsolete global technical banner and owner-mode pill are hidden only on this page. Scoped light work panels, explicit contrast, compact headings, and a four-step strip replace the oversized dark layout.
- Existing pending-job payment URLs remain available from the original job creation notification; this frontend does not mint or release signed URLs.

Interaction checks: `MMD_UI_TEST_MODULES=/path/to/node_modules node --test admin-worker/payment-review-flow-ui.test.cjs` with jsdom 30.0.1. The payment review CI installs its isolated test dependency under the runner temporary directory.

## Previous simple daily payment review

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
