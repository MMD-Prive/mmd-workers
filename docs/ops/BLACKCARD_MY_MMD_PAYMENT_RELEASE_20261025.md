# MY MMD Black Card payment release

Customer page: `/my-mmd/payments/blackcard` (Worker-rendered; no Lovable request).
The existing Payment Center and LIFF Home link to it. Missing session opens the
published MY MMD LIFF `2010862595-yT4DCEMc` with bounded
`intent=continue_payment&view=blackcard`, returning to this exact page.
No payment token or identity is passed to LINE in the login URL.

## Runtime ownership

- `member-dashboard-chat-worker`: page, existing MY MMD navigation and LIFF return.
- `member-pages-worker`: `/member/api/liff/blackcard/{state,purchase,instructions,evidence,companion}`;
  verified LINE/session, same-origin gate, server-only service credential.
- `payments-worker`: `/v1/internal/blackcard/member`; canonical Client lookup,
  Sessions/Payments ownership, server price 35,000 THB / 3 years, proof and selection.
- Existing official verification remains the authority for money and membership.

The backend first resumes an existing Client-linked Black Card membership payment.
Multiple existing payments, ownership conflicts, wrong stage/product/amount and
truncated lookup fail visibly rather than choosing or creating another order.
Otherwise the purchase has a deterministic Client/product Session ID and payment
reference. R2 conditional writes serialize concurrent purchase/preference requests.
A newly verified LINE identity can create a minimal canonical Client keyed by
`line_user_id`; it cannot acquire existing membership/history by name or amount.

QR and bank data use `/v1/confirm/payment-instructions`; upload uses the canonical
signed `/v1/pay/slip/evidence` implementation. The BFF keeps tokens server-side.
HTTP 200 without the complete proof-success schema is a failure. After confirmed
evidence intake the page displays Companion immediately, while entitlement remains
false. The Session note marker is the same format read by Black Card confirm and
visible to the owner. Re-login/new device reads the canonical account, not a
15-minute payment snapshot. It does not overwrite a member's unrelated KV-only
Personal Main preference on other products.

## Bindings and schema preflight

No new table, DO migration, bucket or secret is introduced. Verify existing:

- member-pages: `PAYMENTS_WORKER`, `LIFF_IDENTITY_KV`, `LIFF_SESSION_SECRET`,
  `AUTH_SERVICE_MEMBER_TO_PAYMENTS`.
- payments: the matching service secret, `PAYMENT_SLIP_EVIDENCE` R2,
  `PAY_SESSIONS_KV`, signing secret, Airtable API key/base, current instruction rows.
- chat: `MEMBER_PAGES_WORKER` and existing `/my-mmd/*`, `/member/liff*`,
  `/member/api/liff/*` route ownership on apex/www.

Run `node scripts/check-blackcard-payment-schema.mjs` with
`MMD_AIRTABLE_TOKEN` in the approved staging environment. It is read-only and
requires metadata access. It checks canonical Client/Session/Payment fields and
`black_card` / `membership` select options if those fields are selects.
If an option is absent, add that exact option before deploy through the normal
schema change process. The runtime never typecasts or changes schema automatically.
Do not write the derived Session customer-amount-due field. The details reader now
recognizes `membership` and uses canonical net price when that derived value is empty.

Canonical Thai copy: `MMD-Prive/mmd-i18n/assets/i18n/pages/my-mmd-blackcard-payment.th.json`.
Workers bundle its reviewed snapshot in `shared/blackcard-payment-copy.mjs`.
No runtime dependency on the translation CDN or additional language engine.

## Validation and limitations

- `npm run test:blackcard-member-payment`: 201 tests pass; covers real handler
  requests with in-memory Airtable/KV/R2 fixtures, LIFF return, existing reference
  adoption, concurrency, cross-customer denial, price/product rejection,
  evidence-schema failures, preference persistence, retry and DOM behavior.
- `npm run test:blackcard-flow`: legacy static contracts retained.
- Native UI tests execute generated JavaScript in JSDOM. They are not visual
  browser or provider acceptance tests. Chrome could not reach local preview
  (`ERR_CONNECTION_REFUSED`); direct HTML preview was blocked by browser policy.
- `node scripts/blackcard-payment-preview.mjs` is a local test fixture only;
  `/fixture/pending` opens the Companion state. Never deploy this preview server.
- No live payment, customer message, schema write, Worker deploy or Webflow publish
  was performed. Read-only schema preflight still requires staging credentials.
- PayPal is not presented as working: no verified provider order/capture/webhook
  lifecycle was found in the current Worker implementation. This change supports
  QR/bank proof intake. PayPal return/cancel/delayed webhook remains a separate
  release blocker for the full card-payment requirement.
- Legacy Black Card rows with missing canonical Client links must be repaired by
  the owner before adoption; the release acceptance must include those records.

## Release / rollback

Review both Workers and translation PRs. Run schema preflight and sandbox fixtures,
then deploy payments-worker, member-pages-worker, and member-dashboard-chat-worker
in that order only after approval. Open LIFF on a real mobile device; verify host
cookie continuity, first purchase, pending proof, verified payment, chosen Companion,
refresh, re-login and a second device. Check 390px mobile and desktop for image/name
match, contrast and overflow. Verify API/storage failure recovery.

The Webflow confirm source snapshot changes its no-token CTA to this MY MMD page;
existing signed-token handoff is retained. Apply the source to the current Webflow
draft only after comparing any concurrent Designer edits; publish after backend
acceptance. No current Designer content was overwritten during this change.

Rollback: restore the previous three Worker versions and previous Webflow embed.
Do not delete Clients, Sessions, Payments, proofs or preference markers: they remain
canonical and can be resumed by the corrected release. Revert this PR for source.
