# /sigil/pay — SIGIL Pay v19 mobile-first rebuild

Canonical route: \`/sigil/pay?t=<signed token>\`

## Source of truth

- Job/session/customer context: \`POST https://sigil.mmdbkk.com/v1/confirm/details\`
- Payment destinations and card fee: \`POST https://sigil.mmdbkk.com/v1/confirm/payment-instructions\`
- Slip evidence: \`POST https://sigil.mmdbkk.com/v1/pay/slip/evidence\`
- \`payments-worker\` remains the sole payment authority.

## V19 changes

- Replaces the old claims-only hydration from \`/v1/confirm/verify\`.
- Displays canonical Model, customer, date/time, location, service lane and pricing.
- Restores the three server-enabled payment methods: PromptPay QR, Bank Transfer, Credit/Debit Card via PayPal.
- Bank account number is progressively disclosed.
- Card fee is displayed only from server-returned Payment Instructions.
- Webflow subdomain signed entries canonicalize to \`https://mmdbkk.com/sigil/pay\` before API hydration.
- Slip upload remains evidence only until MMD Official Verify.
- Removes LIFF-login dependency from this payment surface.
- Mobile-first layout; desktop adds a sticky status rail.
