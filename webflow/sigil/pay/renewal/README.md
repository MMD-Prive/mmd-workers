# SĪGIL Renewal Compatibility Route

Status: redirect-only runtime.

The route family is owned by `member-dashboard-chat-worker` only so a stale Webflow or legacy payment page can never win route precedence.

## Route behavior

```text
/pay/renewal*
/sigil/pay/renewal*
```

- When a valid-looking signed token `t` is present:
  - redirect to `https://mmdbkk.com/sigil/pay?t=...`
  - the canonical signed SIGIL Pay page owns payment UI, payment instructions and proof intake.
- Without `t`:
  - redirect to `https://mmdbkk.com/sigil/member/membership?intent=renew`
  - preserve only safe renewal-entry context such as package/plan/tier/code/promo/source/campaign.
- The compatibility route renders **no customer-visible HTML**.
- It does not show a loading page, fallback card, bank details, QR, proof uploader or legacy renewal review UI.
- It is never payment authority.

Webflow may retain a hidden/non-runtime compatibility page record, but the Worker route wins production and must remain redirect-only.
