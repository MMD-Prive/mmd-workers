# Spec: renewal inside My MMD LIFF (draft for owner review, 2026-10-12)

Goal (owner, 2026-10-12): customers in LINE renew without leaving LINE; web only for the payment page itself, opened in the same LIFF webview. Nothing here is implemented yet.

## What exists today
- LIFF signup: `member-pages-worker/src/public-membership-payment.js` creates a payment intent through `PAYMENTS_WORKER /v1/pay/verify` for one fixed public package (`mmd_member`) and the shell opens `/pay/checkout?t=...` in the same webview. It rejects any browser-supplied amount (only `package_code` is accepted).
- Renewal quote: `member-pages-worker/src/renewal-offer.js` `resolveCanonicalRenewalOffer` already quotes Standard 1,000 / Premium 2,500 and re-checks the promotion at payment time (`shared/membership-promotion-policy.mjs`).
- Renewal settlement: `payments-worker/canonical-web-renewal-settlement.js` is the money truth: expected amount, start date (future expiry if still active, payment date if expired), promotion, expiry write.
- LIFF has NO renewal UI: the PACKAGE view only displays the current package; `intent=renew` and `intent=status` open the same profile view.

## Gaps that need an owner decision before coding
1. **Renew before expiry.** `resolveCanonicalRenewalOffer` returns `review_required` (`active_renewal_price_policy_required`) for members who have NOT yet expired. Only "expired less than one year" is quoted. The owner wants advance renewal to work (extends from the future expiry, only within this promo month). Need: approved price for active members (same 1,000 / 2,500?) and confirmation that settlement may use it.
2. **Expired one year or more** counts as a new signup (existing rule): LIFF should send these to signup, not renewal.
3. **Grace (14 days)**: confirm it is quoted at the renewal price.
4. **VIP / SVIP / Black Card and other protected memberships** go to manual review (settlement already refuses them): LIFF shows "ติดต่อเปอร์", no payment button.
5. **Public tiers** (Elite / Red Card) have no LIFF catalog entry today; out of scope unless the owner wants them.

## Proposed design
- New LIFF endpoint `POST /member/api/liff/renewal/offer` (read): LINE session in, quote out: `{status: ready|review_required|signup_instead, package_code, amount_thb, start_rule, expires_after, promotion}`. Pure display; no amount accepted from the browser.
- New LIFF endpoint `POST /member/api/liff/renewal/purchase`: body `{package_code}` only; server re-resolves the quote, creates the intent via `PAYMENTS_WORKER`, stores the payment snapshot, returns `/pay/checkout?t=...` exactly like public purchase (`evidence_only_until_verified`, `entitlement_granted:false`).
- LIFF shell: when `intent=renew`, show the PACKAGE view with a renewal card (current expiry, new expiry preview, price, promo line, one button). `review_required` shows a "ติดต่อเปอร์" message, never a payment button.
- Chat menu: renewal line switches to `intent=renew&view=package` LIFF link only after this ships.

## Safety rules carried over
- payments-worker stays money truth; LIFF never sets amount, dates or entitlement.
- Bank/QR details appear only after the customer picks a method (existing /pay/checkout behavior).
- Renewals use TTB; job payments use Krungsri (existing item-type routing).
- Promo honored for payments through year-end; public announcement stays "ends 31 Oct".

## Tests required
Quote table (active / grace / expired <1y / expired >=1y / protected), browser-amount rejection, LINE session required, promo window edges, expiry preview equals settlement result for the same inputs, same-origin check, idempotent session id.

## Not verified
Real-phone behavior inside LINE (bank-app deep links from the LIFF webview) and the slow/empty My MMD profile view reported on 2026-10-12.
