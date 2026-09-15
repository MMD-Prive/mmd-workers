# MMD Memory — My MMD Member Dashboard Product Spec — 2026-09-05

Status: CANONICAL PRODUCT SPEC
Decision owner: Per

## 1. Product intent

My MMD is the member's private control surface, not a marketing landing page and not a second admin console.

The product should answer four questions quickly:

1. Who am I in MMD right now?
2. What is my current verified status?
3. Is there anything I need to do now?
4. Where do I go for detail?

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
/my-mmd/history
/my-mmd/profile
```

Legacy `/member/my-mmd*` is compatibility-only and must not become a separate member application again.

## 4. Home Dashboard — intentionally light

The Home route should be a calm status dashboard, not a summary of every feature.

### Required content

#### A. Greeting / identity

Keep it short.

Example:

```text
สวัสดีครับ คุณเปอร์
My MMD
```

Do not turn this area into a large marketing hero.

#### B. Primary Member Status card

One card should show the minimum useful verified state at a glance:

- Membership Level — only when backend-verified
- Current Status — Active / Grace / Expired / Pending Review / Suspended / Blocked / Revoked / Checking
- Confirmed Points — only when backend returns a verified balance
- Actual Access — only from backend authority; unresolved must display `Checking`

These concepts must stay visibly separate:

```text
Membership Level != Current Status != Actual Access
```

Do not imply access from tier or lifecycle status.

If a value is missing or unverified, show a neutral checking state rather than a guessed value.

#### C. One Next Action

Home may show one contextual action only when the backend provides a safe action.

Examples:

- ต่ออายุสมาชิก
- ยืนยันผ่าน LINE
- ดำเนินการ CARE BACK ต่อ
- ตรวจสอบข้อมูล

Do not create frontend rules that decide the action independently.

#### D. MMD Letter / New Letter

Show one lightweight latest editorial card only.

Recommended card fields:

- short label: `MMD LETTER` or `WHAT'S NEW`
- title
- 1–2 line excerpt
- date
- optional `อ่านต่อ` CTA

Rules:

- one latest item only on Home
- no feed wall
- no auto-carousel
- no urgent visual treatment unless the content is genuinely operationally urgent
- no personalized entitlement or benefit claims inside editorial content
- no points, coupon eligibility or membership conclusions derived from the Letter

For the current version, MMD Letter may be presentation-owned static/editorial content inside Lovable because it carries no member authority. If it later becomes personalized or dynamically targeted, it must be supplied through a bounded Worker endpoint.

#### E. Compact navigation

Home should make the five detail areas easy to reach without duplicating their content.

Preferred mobile primary navigation should stay within normal mobile conventions and avoid more than five primary bottom tabs.

Recommended primary nav:

```text
Home
Member
Points
Wallet
More
```

`More` may contain:

```text
History
Profile
Support
```

The canonical detail URLs remain unchanged even if navigation groups some of them under More.

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

The reading order should be:

```text
1. Greeting / identity
2. Member Status
3. One Next Action, only when needed
4. MMD Letter / New Letter
5. Navigation to detail
```

If there is no action required, the Home page should feel intentionally quiet.

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

A future dynamic MMD Letter endpoint is optional and should not be added until editorial content needs personalization or independent publishing cadence.

## 15. Acceptance criteria for Home

Home is considered correct when:

- it opens quickly on mobile
- it does not expose mock/demo values on the canonical host
- the member can identify their verified status in a few seconds
- unverified fields remain Checking
- there is never more than one primary Next Action
- the latest MMD Letter is visually secondary to Member Status
- no detailed module is duplicated on Home
- navigation reaches every detail route
- no browser-side point, membership, entitlement or coupon calculation exists
- session-required, checking, blocked and error states are visually distinct and fail closed

## 16. Canonical product principle

```text
Home tells me where I stand.
Detail pages tell me why.
Workers decide what is true.
Lovable decides how it feels.
```
