# MMD Memory — My MMD Member Dashboard Product Spec — 2026-09-05

Status: CANONICAL PRODUCT SPEC
Decision owner: Per

## 1. Product intent

My MMD is the member's private control surface, not a marketing landing page and not a second admin console.

The product should answer four questions quickly:

1. Who am I in MMD right now?
2. What is my current verified status?
3. Is there anything I need to do now?
4. What is new in MMD that is relevant to me?

The canonical customer route is:

```text
/my-mmd/
```

Lovable owns the presentation application. MMD Workers own identity, session, data, points, membership, entitlement, coupons, CARE BACK, history and all authoritative calculations.

## 2. Core architecture boundary

### Lovable owns

- React/TanStack app shell
- visual layout and navigation
- Home dashboard
- Membership screen
- Points screen
- Coupons / wallet screen
- History screen
- Profile screen
- loading / checking / empty / error states
- TH / EN / ZH presentation
- responsive behavior and interaction polish

### MMD Workers own

- LINE / LIFF identity
- same-site member session
- member profile truth
- membership level and lifecycle status
- points balance and ledger
- entitlement / Actual Access
- coupon and CARE BACK state
- approved discount percentage
- history and customer-safe activity data
- all authoritative calculations and policy decisions

Canonical browser API namespace:

```text
/api/member/app/*
```

Lovable must use same-origin requests with `credentials: same-origin` and must never call Airtable, LINE APIs, Supabase, Cloudflare internals, entitlement storage, points storage or coupon storage directly.

The browser must never calculate or infer points, membership level, status, Actual Access, coupon eligibility or `approved_discount_percent`.

## 3. Information architecture

Canonical routes:

```text
/my-mmd/
/my-mmd/membership
/my-mmd/points
/my-mmd/coupons
/my-mmd/payments
/my-mmd/history
/my-mmd/profile
```

Legacy `/member/my-mmd*` is compatibility-only and must not become a separate member application again.

## 4. Home — Feed-first Private Home

Decision update: 2026-09-22.

The Home route is no longer a traditional account dashboard. It is the member's **private home**: a light verified snapshot at the top and a vertically scrolling **MMD NOW** feed as the primary experience.

Conceptual balance:

```text
~20% light dashboard / verified snapshot
~80% feed / updates / current actions
```

The product goal is to answer two questions immediately:

1. **ตอนนี้ฉันต้องทำอะไรไหม**
2. **MMD มีอะไรใหม่ที่เกี่ยวกับฉัน**

Home must remain mobile-first, calm and editorial. It must not become a marketing landing page, a dense operations dashboard or a second admin console.

### A. Compact greeting / identity

Keep the greeting short and understated.

Example:

```text
สวัสดีครับ คุณเปอร์
MY MMD
```

The Home header must not become a large marketing hero.

### B. Light verified snapshot

Use one compact status strip/card only.

It may show, only when backend-verified:

- Membership Level
- lifecycle/status
- confirmed Points
- one short Actual Access indicator when the backend supplies it safely

These concepts remain separate:

```text
Membership Level != Current Status != Actual Access
```

Home must not render the full membership artwork, long member-since/expiry detail, entitlement evidence or account explanation. Those belong on their dedicated routes.

If a field is unresolved, show a neutral checking state or omit it according to the existing safe presentation contract. Never guess a tier, balance, expiry or access state.

### C. Needs You

`Needs You` appears only when canonical backend state already provides a safe action or an existing backend-backed actionable item.

Examples of eligible source states:

- backend-provided `nextAction`
- current Job/Booking action already present in the safe member projection
- canonical payment continuation/review state
- renewal/recovery action
- CARE / Coupon action already supplied by the owning backend

Rules:

- no frontend-created business decision;
- no fabricated urgency;
- no more than 1–3 visible actions;
- payment, entitlement and booking truth remain with their canonical backend owners;
- unresolved data must not become an action recommendation.

### D. MMD NOW — primary feed

`MMD NOW` is the main Home content plane.

Feed categories:

1. **NEEDS YOU** — backend-backed customer actions only
2. **FOR YOU** — backend-backed personalized items only
3. **MMD UPDATE** — non-authoritative editorial/system update content
4. **EDITORIAL** — MMD Letter, TMIB, Behind MMD, City Guide, Academy / MMS stories

Ordering principle:

```text
must act -> relevant to me -> newest useful update -> editorial
```

Feed cards may contain:

- small category label
- title
- 1–2 line excerpt
- date only when the source provides a real date
- optional safe editorial image
- CTA to an approved route

No auto-carousel.

### E. Personalized feed authority

Personalized feed content must never be inferred from frontend-only data.

If a feed card claims or depends on:

- customer status
- entitlement/access
- Points
- coupon eligibility/value
- payment status/amount
- booking/job state
- private Model availability or access
- customer preference/history targeting

then the card must be backed by an explicit bounded backend projection.

Lovable may own static/editorial cards that make **no** customer-specific authority claim.

When no trustworthy feed item exists, Home should show a refined quiet state such as `ตอนนี้ยังไม่มีอัปเดตใหม่` rather than fabricate content.

### F. Compact quick access

Quick access is utility, not the Home's main content.

Preferred Home quick access:

```text
Member
Points
Wallet
Payments
```

History and Profile remain available through application navigation and later navigation refinement.

Avoid the previous dense six-tile Home grid.

### G. Feed / Telegram separation

Telegram member groups are read-only broadcast surfaces.

Home is the complete private personalized plane; Telegram is only the time-sensitive push layer that sends the member back to My MMD.

```text
MY MMD = archive + personalized feed + personal action
Telegram = limited urgent/fresh broadcast + route back to MY MMD
```

Do not mirror the full MY MMD feed into Telegram.

## 5. What must NOT be on Home

Do not place the following full modules on the Home dashboard:

- complete Points ledger
- full coupon wallet
- full booking / activity history
- long membership detail
- long profile detail
- long CARE BACK explanation
- model catalog
- admin or reconciliation information
- internal entitlement evidence
- debug / backend wording
- raw API states or internal identifiers

Home is the member's status glance, not the member database.

## 6. Membership screen

Route:

```text
/my-mmd/membership
```

Must show:

- verified Membership Level
- Current Status
- lifecycle state when available
- verified renewal / expiry information only when backend supplies it safely
- Actual Access as a separate field
- contextual next action from backend
- neutral explanation when status or access is Checking

Do not infer Actual Access from Membership Level.

## 7. Points screen

Route:

```text
/my-mmd/points
```

Must show:

- confirmed Points balance
- unit label
- Points ledger when supplied
- entry date
- entry label
- delta (+/-)
- pending/checking state when backend says the record is unresolved

The frontend must display the exact backend-provided confirmed balance and must not recompute the balance from visible ledger rows.

Do not fabricate earned total, redeemed total or balance-after values when the backend does not provide them.

## 8. Coupons / Wallet screen

Route:

```text
/my-mmd/coupons
```

Must show:

- coupon state
- reference/code when safe to display
- activation / expiry when supplied
- CARE BACK visual status color only from verified membership/status mapping
- actual discount only from `approved_discount_percent`

Before an approved percentage exists, use only generic wording such as:

```text
สูงสุด 10%
UP TO 10% OFF
```

Color identifies presentation/status; color never determines discount percentage.

## 9. History screen

Route:

```text
/my-mmd/history
```

Customer-safe activity only:

- service / booking activity
- payment history
- membership activity
- CARE activity when appropriate
- date
- short title
- safe status label

Never expose internal notes, payment refs, proof IDs, allowlists, staff-only decisions or raw Airtable identifiers.

## 10. Profile screen

Route:

```text
/my-mmd/profile
```

Must remain minimal and privacy-safe:

- display name
- LINE display name when available
- masked email only when backend marks it safe to display
- masked phone only when backend marks it safe to display
- member since when safely available
- primary contact channel

No raw LINE user ID, raw email/phone, internal member record ID, entitlement evidence or admin fields.

## 11. Session states

### Resolving

Before host/session/provider resolution, show a neutral checking/loading state.

Never flash mock member data on `mmdbkk.com` or `www.mmdbkk.com`.

### Session required

Only an explicit backend 401 session-required state should invite LINE verification.

Use explicit tap; do not auto-open LINE.

### Blocked / revoked / forbidden

403, blocked, suspended or revoked states must remain fail-closed and must not be presented as a normal login invitation.

## 12. Visual direction

Home should be quieter than detail screens.

Use:

- SIGIL warm-light member profile direction
- warm ivory / porcelain background
- translucent ivory cards
- soft taupe borders
- restrained oxblood / burgundy accent
- dark warm-brown text
- LINE Seed Sans TH / Noto Sans / system sans
- subtle Apple-like transitions
- large tap targets
- reduced-motion support

Avoid:

- oversized hero sections
- heavy black dashboard styling
- dense grids of metrics
- horizontal swipe for primary member information
- auto-rotating promotional banners
- loud campaign UI on every visit

## 13. Home visual priority

The Home reading order is:

```text
1. Greeting / identity
2. Compact verified snapshot
3. Needs You — only when backend-backed
4. MMD NOW feed
5. Compact quick access
```

The feed should feel more editorial than the detail screens while preserving the same warm-light My MMD design system.

Home must not use:

- full Membership card artwork as the dominant hero
- heavy black account cards
- dense accounting modules
- repeated policy/explanation notes
- oversized quick-action grids
- auto-rotating promotions

If there is no action and no new feed item, the Home page should feel intentionally quiet rather than artificially busy.

## 14. Current API contract

Current bounded read routes:

```text
GET /api/member/app/dashboard
GET /api/member/app/profile
GET /api/member/app/membership
GET /api/member/app/points
GET /api/member/app/coupons
GET /api/member/app/history
GET /api/member/app/care
```

All member authority remains server-side.

The existing bounded read routes remain authoritative for all current member truth.

A future dynamic `MMD NOW` feed endpoint may be added only when MMD needs independently publishable or personalized feed content. Until such a bounded backend contract exists, static presentation-owned editorial content must remain non-personalized and non-authoritative.

## 15. Acceptance criteria for Home

Home is considered correct when:

- it opens quickly on mobile;
- it does not expose mock/demo values on the canonical host;
- the member can identify verified status at a glance without reading a dense dashboard;
- unverified fields remain Checking/omitted according to backend state;
- `Needs You` appears only from a real backend-backed action;
- the main visual body is `MMD NOW`, not account modules;
- no customer-specific feed card is fabricated by frontend logic;
- static editorial cards make no membership, access, payment, Points, coupon, booking or entitlement claim;
- full Membership detail, full Points ledger, full Wallet, full Payment detail and full History remain on dedicated routes;
- no browser-side point, membership, entitlement, payment, booking or coupon calculation exists;
- session-required, checking, blocked and error states remain visually distinct and fail closed.

## 16. Canonical product principle

```text
Home tells me what matters now — and what is new in MMD.
Detail pages tell me the full story.
Workers decide what is true.
Lovable decides how it feels.
```


## 17. Upload-size and uploader ownership contract

MY MMD does not own a generic payment-proof uploader.

Canonical upload limits are purpose-specific:

```text
General member/customer image attachment: 15 MB max per image
Supported member/customer video attachment: 50 MB max per clip
Payment slip / payment proof image: 10 MB max per image
```

Rules:

- A 15 MB image or 50 MB video limit applies only when the owning member/customer backend endpoint explicitly supports that attachment type.
- Payment slips/proofs remain a separate evidence lane and keep the payment backend limit of 10 MB per image.
- MY MMD must never create a second proof uploader. It may show payment/proof status and open the exact backend-supplied signed `/sigil/pay?t=...` URL.
- MY MMD must never reuse MMD MODEL media endpoints.
- Browser copy and client-side validation must never advertise a larger file than the owning backend accepts.
- Upload size is transport policy only; an accepted upload never creates payment truth, membership, entitlement, Points, access, or verification.
