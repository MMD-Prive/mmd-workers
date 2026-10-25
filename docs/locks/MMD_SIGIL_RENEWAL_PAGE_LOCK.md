# MMD / SĪGIL Renewal Route Lock

Status: Reviewed source contract; production deployment not claimed
Updated: 2026-10-25

## Canonical owner

```text
owner: member-dashboard-chat-worker
route source: member-dashboard-chat-worker:renewal-redirect-bridge
runtime marker: mmd-renewal-redirect-only
```

## Routes

```text
https://mmdbkk.com/pay/renewal*
https://www.mmdbkk.com/pay/renewal*
https://sigil.mmdbkk.com/pay/renewal*
https://mmdbkk.com/sigil/pay/renewal*
https://www.mmdbkk.com/sigil/pay/renewal*
https://sigil.mmdbkk.com/sigil/pay/renewal*
```

## Required behavior

The entire renewal compatibility route family remains redirect-only.
The owner-confirmed entry is `/sigil/pay/renewal`; `/pay/renewal` remains a compatibility alias.

Signed:
```text
/sigil/pay/renewal?t=<signed>
→ https://mmdbkk.com/sigil/pay?t=<same signed token>
```

Unsigned:
```text
/sigil/pay/renewal
→ https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package&world=private
```

The unsigned destination opens Renewal inside MY MMD. It is not a new page outside the app.
Only allowlisted package/campaign/source hints may be retained; none prove identity, price or entitlement.
Caller-provided intent, view, world, identity, amount, payment reference and redirect destinations cannot override this entry.
The signed token is never sent to the LINE Mini App destination.

This source contract supersedes older descriptions of the unsigned compatibility
route ending at `/sigil/member/membership?intent=renew`. Marketing/signup routes
and the signed payment owner are unchanged.

## Forbidden behavior

These routes must never render a fallback payment page, Renewal Payment Review,
hero/card/loading shell, bank destination, PromptPay QR, proof uploader,
browser-calculated amount, or legacy payment instructions.

Webflow is non-runtime for this route family.

## Authority

- MY MMD `/member/liff` shell owns the authenticated Renewal view.
- Signed `/sigil/pay?t=...` remains the destination for existing signed compatibility links.
- New payment handoff must use the existing server-issued checkout contract; this route creates no payment.
- `payments-worker` owns amount, payment destination, QR, payment reference and verification.
- No purchase flag, membership state, Points or notification changes are authorized by this redirect.

## Expected response

```text
status: 307
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:renewal-redirect-bridge
x-mmd-upstream-source: redirect-bridge
cache-control: no-store
```

GET and HEAD return empty bodies; mutation methods return 405 with `Allow: GET, HEAD`.

## Acceptance boundary

Focused local tests cover redirects, safe hints, signed tokens, methods and removed
spend-band offers. Full worker integration, authenticated LINE iOS/Android,
package switching, verified 365-day spend pricing and live payment completion
remain separate acceptance work. Do not enable customer purchases from this patch alone.
