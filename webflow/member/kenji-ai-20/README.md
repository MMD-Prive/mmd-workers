# Kenji AI 2.0 — Member Concierge

Member-facing Webflow source for `/member/kenji-ai-20`.

## Current build

`kenji-ai-20-v23-sigil-system-20260910`

Source files:

- `kenji-ai-20-v23.html`
- `kenji-ai-20-v23.css`
- `kenji-ai-20-v23.js`
- `kenji-ai-20-v23.test.mjs`

The page stays customer/member-facing. `/internal/admin/kenji` remains the canonical single-owner administration surface and `/internal/admin/kenji?view=ai20` may preview the member runtime. The member page must never redirect a customer into the internal admin namespace.

## Member truth

V23 reads member facts only from the canonical same-origin My MMD BFF:

```text
GET /api/member/app/dashboard
```

The request is credentialed, no-store, and fail-closed. The browser does not send tier, Points, member ID, entitlement, Actual Access, or a frontend secret as authority.

Unverified values render as checking/unavailable. There is no demo member fallback and no default `0 pts` placeholder.

My MMD customer routes used by V23:

```text
/my-mmd/
/my-mmd/profile
/my-mmd/membership
/my-mmd/points
/my-mmd/history
```

## Concierge routing

V23 provides one clear next step instead of immediately treating free text as an authoritative action.

Canonical customer routes used by the safe route map:

```text
/booking
/sigil/booking
/confirm/payment-proof
/my-mmd/membership
/my-mmd/points
/my-mmd/history
/my-mmd/profile
/male-massage/home
/sigil/recovery
/rules/customer
```

The legacy `/member/dashboard` and `/member/membership` CTAs are not emitted by the V23 page.

The page may read the currently published Kenji Knowledge endpoint for approved Thai answer text. If published Knowledge is unavailable, it falls back only to the bounded safe route map; it does not expose QA-only or unpublished Knowledge as customer truth.

## Authority boundaries

Kenji may explain, guide, classify and route. Kenji does not:

- mark a payment as paid from a slip or OCR result;
- award Points;
- activate Membership or Actual Access;
- auto-grant VIP, SVIP or Black Card;
- guarantee model availability or confirm a booking from a request;
- expose another customer's data, internal notes, or unapproved private model information.

Payment proof remains evidence only until the canonical payment flow verifies it. Membership Level, lifecycle status and Actual Access remain separate states.

## Languages and UI

V23 includes TH / EN / ZH runtime copy in the page runtime. Display typography uses the site-registered `Canela` family for selected editorial Latin headings and `LINE Seed Sans TH` / `Noto Sans Thai` for member-facing text.

Layout is mobile-first, removes the previous oversized mobile headline density, keeps photographs and copy in controlled layers, and uses accordion disclosure for safety details.

## Legacy files

`kenji-member-concierge.js` and `kenji-safe-flow-knowledge-runtime-v21-5.js` remain repository history/compatibility assets. Do not load them together with the V23 runtime on `/member/kenji-ai-20`.
