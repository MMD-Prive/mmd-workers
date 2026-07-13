# Kenji Mini Page Brief

## Purpose

Kenji Mini is a lightweight page/interface layer.

It is not backend intelligence by itself. It is a small public/member-facing surface that can introduce Kenji, display safe guidance, route users to official pages, and explain next steps.

Kenji Mini must remain non-authoritative.

## What Kenji Mini Can Do

Kenji Mini can:

- introduce Kenji
- display safe public/member guidance
- explain process from published Knowledge Cards or safe static copy
- route users to official pages
- hand off to LINE / Telegram / MMD support
- show safe status language

Suggested routes:

- `/member/dashboard`
- `/sigil/booking`
- `/rules/customer`
- `/confirm/payment-confirmation`

## What Kenji Mini Cannot Do

Kenji Mini cannot:

- approve payment
- confirm booking
- unlock membership
- mark paid
- show private model lists
- show admin notes
- expose raw member records
- decide user tier
- decide model availability
- override Boss Per or MMD review

It should not say payment is verified, booking is confirmed, or membership is active unless a backend route specifically designed for that verified status returns it safely.

## Recommended Future Webflow Files

Do not create these files until the Kenji Mini UI task is approved.

Recommended future paths:

```text
webflow/kenji-mini/kenji-mini.html
webflow/kenji-mini/kenji-mini.css
webflow/kenji-mini/kenji-mini.js
```

## Suggested First Screen

Kenji Mini should open as a useful interface, not a marketing page. It should let a customer choose a safe next step:

- membership help
- renewal help
- booking help
- payment proof help
- customer rules
- contact MMD support

Each option should route to an official page or display safe published-card guidance.

## Safety Copy Pattern

Use process language:

- MMD will review the request.
- Payment proof must be checked by MMD.
- Booking is not confirmed until MMD confirms it.
- Model availability must be checked by MMD.
- Membership access starts only after the official system verifies status.

Avoid final authority language:

- paid
- approved
- confirmed
- unlocked
- active
- available
