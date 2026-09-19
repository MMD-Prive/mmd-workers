# MMD Route Lock Smoke Checklist - 2026-07-01

> **2026-09-19 Public/Private lane override:** `/pay/membership` is the canonical Public Membership entry for Member / Elite / Red Card. `/sigil/member/membership` is the canonical Private Membership selection / renewal / upgrade entry. `/member/payments` is payment status/history navigation. `/sigil/pay/renewal` and `/pay/renewal` are redirect-only compatibility routes; they render no payment or renewal fallback UI. Signed Public checkout is `/pay/checkout?t=...`; signed Private/Service payment is `/sigil/pay?t=...`.


> Updated 2026-09-13. The July incident checklist is retained for traceability, but membership-payment route expectations are superseded by `docs/locks/MMD_PAYMENT_ROUTE_BRIDGE_LOCK_20260913.md`.

Use these checks without secrets. Run with redirects disabled first.

## Route Smoke

```bash
curl -I -sS https://mmdbkk.com/sigil/member/membership
curl -I -sS https://mmdbkk.com/sigil/pay/membership
curl -I -sS 'https://mmdbkk.com/sigil/pay/membership?t=route-lock-placeholder'
curl -I -sS https://mmdbkk.com/pay/membership
curl -I -sS 'https://mmdbkk.com/pay/membership?t=route-lock-placeholder'
curl -I -sS https://mmdbkk.com/sigil/pay/renewal
curl -I -sS https://www.mmdbkk.com/sigil/pay/renewal
curl -I -sS https://mmdbkk.com/pay/renewal
curl -I -sS https://mmdbkk.com/sigil/pay/renew
curl -I -sS https://mmdbkk.com/sigil/pay/payment
curl -I -sS https://mmdbkk.com/unknown-test-route-mmd
```

Expected:

- `/pay/membership` is the canonical Public Membership selection entry for MMD Member / Elite / Red Card; it is selection UI only and never payment authority.
- `/sigil/member/membership` is the canonical Private Membership selection / signup / renewal / upgrade entry for Standard / Premium and private access.
- `/sigil/pay/membership` and `/pay/membership` are compatibility aliases only and never payment authorities.
- An unsigned membership alias may remain a `200` compatibility bridge or redirect only to `/sigil/member/membership`.
- A signed membership alias may remain a `200` compatibility bridge or redirect only to `/sigil/pay?t=...`; if redirected, the payment URL must carry only the signed `t` authority token.
- Membership aliases must never redirect to `/sigil/pay/renewal` and must never preserve browser-provided amount, account, PromptPay, or package values as payment authority.
- `/sigil/pay/renewal` and `/pay/renewal` are redirect-only compatibility routes. They must not render Renewal Payment Review, bank/QR, proof upload, or other fallback UI.
- `/sigil/pay/renew` should bridge directly to `/sigil/member/membership?intent=renew`.
- `/sigil/pay/payment` is retired as a standalone payment UI; unsigned traffic may bridge to `/member/payments`, while a valid signed `t` may bridge to `/sigil/pay?t=...`.
- Unknown routes do not redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.

## LIFF Smoke

The old browser-supplied identity bridge is intentionally disabled. Do not use it as a route generator.

```bash
curl -sS -X POST https://mmdbkk.com/member/api/liff/identify \
  -H 'content-type: application/json' \
  --data '{"line_user_id":"Uroute_lock_spoof","member_id":"MMD-route-lock-spoof"}'
```

Expected:

- HTTP `410`.
- `error.code: LEGACY_LIFF_IDENTITY_DISABLED`.
- The response does not echo or trust `Uroute_lock_spoof` or `MMD-route-lock-spoof`.

Canonical LIFF payment setup is tested through the verified LIFF-session contract at `/member/api/liff/payment-intent`. That contract must:

- validate package and amount from the server-side LIFF session;
- call the canonical payments authority;
- return a backend-minted customer URL shaped as `https://mmdbkk.com/sigil/pay?t=...`;
- reject a customer payment URL that contains payment-authority query parameters other than `t`;
- never infer verified payment or membership entitlement from browser input.

Do not create synthetic public payment-intent smoke traffic without a valid verified LIFF session.

## Worker Route Ownership

Expected current ownership constraints:

- `mmd-redirect-worker` is hard-disabled and transparent pass-through only. Do not restore payment routing logic there while `REDIRECT_WORKER_DISABLED` is true.
- `member-pages-worker` is production service-only (`routes = []`) and must not be attached directly to `mmdbkk.com` merely to retire aliases.
- `member-dashboard-chat-worker` may own explicit manual renewal routes such as:
  - `mmdbkk.com/pay/renewal*`
  - `www.mmdbkk.com/pay/renewal*`
  - `mmdbkk.com/sigil/pay/renewal*`
  - `www.mmdbkk.com/sigil/pay/renewal*`
- `member-dashboard-chat-worker` must not absorb `/sigil/pay/membership` or `/pay/membership` into the renewal route family.
- Membership compatibility aliases remain bounded bridges until an explicit live edge owner is approved; do not create a broad wildcard that collides with `/sigil/pay/renewal*`.

## Authority Check

- Membership selection authority: canonical membership backend/member resolver.
- Exact payment instruction and verification authority: `payments-worker`.
- Customer payment + proof UI after a signed intent: `/sigil/pay?t=...`.
- Generic payment status/navigation: `/member/payments`.
- Browser/Webflow/Telegram/LIFF route parameters never become amount, destination, account, PromptPay, or verification truth.
