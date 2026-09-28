# MMD / SĪGIL Renewal Route Lock

Status: Production Redirect-Only
Updated: 2026-09-19

## Canonical owner

```text
owner: member-dashboard-chat-worker
route source: member-dashboard-chat-worker:renewal-redirect-bridge
runtime marker: mmd-renewal-redirect-only
```

## Production routes

```text
https://mmdbkk.com/pay/renewal*
https://www.mmdbkk.com/pay/renewal*
https://sigil.mmdbkk.com/pay/renewal*
https://mmdbkk.com/sigil/pay/renewal*
https://www.mmdbkk.com/sigil/pay/renewal*
https://sigil.mmdbkk.com/sigil/pay/renewal*
```

## Required behavior

The entire renewal compatibility route family is redirect-only.

Signed:
```text
/sigil/pay/renewal?t=<signed>
→ https://mmdbkk.com/sigil/pay?t=<signed>
```

Unsigned:
```text
/sigil/pay/renewal
→ https://mmdbkk.com/sigil/member/membership?intent=renew
```

The Worker may preserve only safe renewal-entry context on the unsigned path.

## Forbidden behavior

These routes must never render:
- renewal fallback UI;
- Renewal Payment Review page;
- hero/card/loading shell;
- bank destination;
- PromptPay QR;
- proof uploader;
- browser-calculated amount;
- customer-visible legacy renewal instructions.

Webflow is non-runtime for this route family.

## Authority

- `/sigil/member/membership?intent=renew` owns renewal entry.
- signed `/sigil/pay?t=...` owns canonical Private payment presentation.
- `payments-worker` owns amount, payment destination, QR, payment reference and verification.
- the renewal compatibility route owns redirects only.

## Production headers

Expected redirect response:
```text
status: 307
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:renewal-redirect-bridge
x-mmd-upstream-source: redirect-bridge
cache-control: no-store
```

## Smoke

Unsigned route must land on:
```text
/sigil/member/membership?intent=renew
```

Signed route must land on:
```text
/sigil/pay?t=<same token>
```

No response body may contain `mmd-renewal-single`, `Renewal Payment Review`, bank/QR/proof UI, or other fallback markup.
