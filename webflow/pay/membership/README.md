# `/pay/membership` — Public Membership entry

Synced from Webflow: **2026-09-20**
UI revision: **Compact V9 · Per Voice · mobile-first**

Webflow page ID: `6a70c99f1b2b686c83001271`

Canonical Public Membership:
- MMD Member — 690 THB / 1 year
- Elite — 4,990 THB / 2 years
- Red Card — 11,499 THB / 1 year

## Source mirror

These files mirror the active Webflow implementation:
- `membership.html` — scoped HtmlEmbed body
- `membership.css` — CSS from page Head
- `membership.js` — guarded Footer runtime

Root authority remains `#mmd-public-membership`.

## Compact V9 UX lock

- Per Voice; avoid system-like customer copy.
- Mobile-first and vertically compact.
- Flow: Hero → horizontal Membership layers → Red Card moment → Progressive Disclosure → final CTA.
- No image carousel / no right-to-left image slideshow.
- Horizontal swipe is for compact information cards only.
- Long detail is folded into `+` accordions.
- Apple-like reveal transitions use restrained opacity / translate / scale motion.
- Graphic transition rails connect major sections.
- Sticky premium glass header with direct MY MMD access.
- LINE Seed Sans TH first, Noto Sans Thai fallback.
- Final scoped contrast safety layer is mandatory so Webflow global text rules cannot erase mobile text colors.
- Red Card feature image randomly selects from the approved HITO / HIRO / HIEI / HIMA Red Card assets.

## Benefit meaning

- **Member 690** — access to freelance companion services such as meals, outings/travel and companion-style services according to each freelancer's available scope; Bangkok first, nationwide expansion later.
- **Elite 4,990** — access to premium men with public visibility / follower reach / social recognition, plus Exclusive MMD news.
- **Red Card 11,499** — highest Public MMD access tier for confidential options and special date/dining experiences when available, plus earlier access to news and service opportunities.

Customer copy must not promise a specific person, celebrity, date, booking or availability before MMD confirms the real opportunity.

## Runtime contract

The page reads:
- `GET /member/api/liff/public-membership/catalog`

Purchase sends only:
- `POST /member/api/liff/public-membership/purchase`
- body: `{"package_code":"..."}`

The browser never submits amount, payment destination, payment reference, entitlement or verified state as authority.

If the verified LINE session is missing, the customer goes through the existing MMD LINE Mini App and returns to the same Public Membership route with the selected package preserved.

The browser accepts only a backend-issued signed:
- `https://mmdbkk.com/pay/checkout?t=...`

## Authority

- Public package catalog: `shared/payment-intelligence.mjs`
- Public membership intent: `member-pages-worker/src/public-membership-payment.js`
- Money truth: `payments-worker`
- Entitlement materialization: reviewed payment flow after MMD verification

The displayed price is informational. The Worker resolves the authoritative package and amount again before creating the payment intent.

## Webflow lock

- Public/MMD presentation; do not add SIGIL/private framing.
- Do not add browser-owned amount fields.
- Do not embed bank/PromptPay/PayPal destination.
- Do not mark membership active after returning from payment or proof upload.
- Keep proof/review language explicit without exposing internal system terms to customers.
