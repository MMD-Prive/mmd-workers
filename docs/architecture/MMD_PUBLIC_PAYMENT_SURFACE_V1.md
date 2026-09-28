# MMD Public + SIGIL Unified Payment Architecture v1

Date: 2026-09-19  
Status: implementation candidate  
Owner: MMD / Boss Per

## Goal

Keep one payment engine while separating customer-facing presentation by world.

- **Public world**: Public Membership and TMIB purchases use MMD public presentation.
- **SIGIL world**: Private Membership, Black Card and service/job payments keep SIGIL presentation.
- **Money truth** never moves into Webflow. It remains in `payments-worker`.

## Route map

### Public

```text
/pay/membership
  -> verified LINE / MY MMD identity
  -> POST /member/api/liff/public-membership/purchase
  -> payments-worker intent
  -> /pay/checkout?t=<signed token>
  -> Payment Instructions
  -> proof evidence
  -> Official Verify
  -> entitlement materialization
```

```text
/tmib/act-001
  -> POST /member/api/liff/tmib/episodes/act-001/purchase
  -> payments-worker intent (tmib_act_001 / tmib_story / 299 THB)
  -> /pay/checkout?t=<signed token>
  -> Official Verify
  -> story grant
```

### Private / SIGIL

```text
/sigil/member/membership
  -> backend payment intent
  -> /sigil/pay?t=<signed token>
  -> Official Verify
  -> membership / entitlement materialization
```

Service/job/Black Card payment intents also remain on `/sigil/pay?t=...`.

## One engine, two presentations

`payments-worker/unified-payment-proof.js` chooses the presentation lane from server-owned context:

- `mmd_member`, `elite`, `red_card` with membership stage -> public
- `tmib_act_001` or `tmib_story` -> public
- everything else -> SIGIL unless another explicit server-owned rule is added later

The signed token format and payment authority remain shared.

## Public Membership catalog

`shared/payment-intelligence.mjs` owns the current public catalog:

| code | label | amount | base term |
| --- | --- | ---: | --- |
| mmd_member | MMD Member | 690 THB | 1 year |
| elite | Elite | 4,990 THB | 2 years |
| red_card | Red Card | 11,499 THB | 1 year |

Webflow may display these values for clarity but must reload the server catalog and may not send amount as authority.

## Public Membership API

`member-pages-worker/src/public-membership-payment.js`

- `GET /member/api/liff/public-membership/catalog`
- `POST /member/api/liff/public-membership/purchase`

Purchase request body is restricted to:

```json
{"package_code":"mmd_member"}
```

The Worker:
1. validates same-origin;
2. validates current LINE/MY MMD session;
3. resolves the public package server-side;
4. derives amount;
5. creates/reuses deterministic payment context;
6. calls `payments-worker`;
7. accepts only `https://mmdbkk.com/pay/checkout?t=...`;
8. returns no entitlement grant.

## Webflow surfaces

### /pay/membership

Public selection UI for MMD Member / Elite / Red Card.

The page:
- requests server catalog;
- sends only `package_code`;
- requests LINE verification when session is missing;
- accepts only signed `/pay/checkout?t=...`;
- never owns amount, account, QR, PayPal URL, verification or entitlement.

### /pay/checkout

Public signed payment + proof renderer based on SIGIL Pay v18 mechanics but with MMD Public presentation.

It retains:
- Payment Instructions v1;
- server amount and destination;
- PromptPay / bank / PayPal-card options as enabled server-side;
- proof upload;
- Official Verify wording;
- payment history handoff.

It removes SIGIL/private-world framing from the customer presentation.

### /sigil/pay

Unchanged canonical private/service signed payment renderer.

### /sigil/pay/membership

Private compatibility bridge only. It no longer owns or intercepts `/pay/membership`.

## TMIB

ACT 001 remains:
- package `tmib_act_001`
- stage `tmib_story`
- amount 299 THB
- active eligible membership includes story access
- non-eligible customer may buy the episode
- Paid + Verified/Approved required before access grant

The public Webflow runtime and member-pages Worker both validate `/pay/checkout?t=...` only for new TMIB purchase handoff.

## Proof and operational alerting

Public checkout uses source `public_pay`; SIGIL uses `sigil_pay`.

Both are canonical web sources for unified proof intake. Proof remains evidence only. Existing Telegram/payment review behavior continues downstream of the same canonical payment reference.

## Security invariants

- No browser amount authority.
- No browser payment destination authority.
- No browser-generated payment reference.
- No browser entitlement grant.
- No proof-only grant.
- No route conversion between signed public and signed SIGIL surfaces.
- Signed URL contains only `t`.
- Missing/invalid token fails closed.
- Revisit reuses canonical payment rather than creating duplicates.

## Deployment order

1. Merge/deploy `payments-worker` lane selection.
2. Merge/deploy `member-pages-worker` public membership and TMIB URL contract.
3. Smoke Worker contracts.
4. Publish Webflow `/pay/membership`, `/pay/checkout`, `/pay/tmib` and updated private bridge.
5. Production smoke:
   - catalog;
   - LINE-required behavior;
   - Member 690 / Elite 4,990 / Red Card 11,499 intent;
   - TMIB 299;
   - signed public checkout;
   - private SIGIL regression;
   - proof -> pending -> Official Verify;
   - entitlement/story materialization only after verify.
