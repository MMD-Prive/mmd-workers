# MMD APP Digital System vNext — Worker implementation spec

Target: `MMD-Prive/mmd-workers` → `model-dashboard-presentation-worker`

Status: presentation reference only. The Worker remains the sole authority for LINE/model sessions, identity binding, profile, availability, jobs, `allowed_actions`, ETA, media, rate, payout/history, GPS, Telegram, reviews, and all writes.

## Files

- `mmd-app-tokens.css` — reusable semantic tokens and Worker-safe base classes.
- `gallery.html` — static, no-script component gallery. Every value is labeled `DESIGN PREVIEW` and is not business truth.
- This file — mapping and acceptance contract for the Worker port.

## Runtime boundaries

1. Render protected screens only after the existing Worker session and canonical `model_record_id` are established through LINE LIFF.
2. Never infer a role, identity, review result, job, rate, payment, availability, or history state in browser code.
3. Missing, stale, unauthorized, ambiguous, or unsupported data renders checking, review, unavailable, or error. It never becomes a positive state.
4. `/sigil/model/console` remains the only active-job execution surface. Home and Jobs may link to it but must not recreate lifecycle actions.
5. Historical work reads only through the existing `/v1/model/history` contract after LIFF self-onboarding. Do not add email, phone, public-name, manual-ID, or admin binding.
6. Customer sell price, identity/contact, raw chats, payment references, evidence IDs, MMD margin, internal notes, storage keys, and raw LINE/Airtable identifiers must never enter model HTML.

## Shared shell mapping

| Lovable reference | Worker HTML/CSS | Data/state owner |
| --- | --- | --- |
| `AppShell` | `.mmd-app > .mmd-frame` plus `.mmd-bottom-dock` | Presentation only |
| `VerifiedChip` | `.mmd-chip[data-tone=verified]` | Explicit verified session/profile response |
| `Section` | `.mmd-section-label` plus `.mmd-surface` | Presentation only |
| Primary CTA | `.mmd-primary-action` | Visibility/action permission from Worker contract |
| Secondary CTA | `.mmd-secondary-action` | Presentation only; action still Worker-owned |
| `LoadingBlock` | fixed-height skeleton rows, `aria-busy=true` | Request lifecycle |
| `ErrorBlock` | error status plus retry when safe | Request failure; no inferred fallback |
| `ModelLinkPrompt` | review chip and review copy | Exact `identity_review_required` contract only |

## Four-item navigation

The dock is exactly:

1. HOME → `/sigil/model/dashboard` in production Worker rendering.
2. JOBS → the Worker-rendered jobs/history view.
3. CONSOLE → `/sigil/model/console` only, preserving the existing LIFF environment.
4. YOU → the Worker-rendered profile/settings hub.

Use `aria-current="page"` on exactly one local destination. Console is a handoff and never receives duplicated active-job controls.

## Screen contracts

### Home

- Greeting uses Worker-returned `working_name`; otherwise render a neutral checking state.
- Verified identity chip requires verified LINE/model session state.
- Work Status comes from the returned profile/availability value.
- NEEDS YOU renders only for explicit backend reconfirm, new-job, review, or action state.
- ACTIVE NOW requires a verified current session.
- ETA renders only when `allowed_actions` contains `send_eta`.
- Rate renders only from the verified profile/offer response.
- Quick access: Profile, Media, Availability, History.

### Jobs and Work & Earnings

- Current work comes only from the existing current-session API.
- Active work has one primary handoff to `/sigil/model/console`.
- A successful, empty history response may render the honest empty state.
- Loading, unresolved binding, owner review, authorization failure, or history failure must not render a false empty state.
- `earned_amount_thb` and `paid_amount_thb` are separate fields and separate visual rows. Never sum or derive either client-side.
- Owner-confirmed payment without an old slip uses: `จ่ายแล้ว · MMD รับรอง`.
- Never display `payment_evidence` or any evidence/reference identifier.

### You

Links: Profile, Availability, Media, My Card, Telegram, GPS/privacy, TART, Work & Earnings. The Year 6 Wish renders only when the existing Worker response says `eligible: true`.

### TART

TART is the model-side guide. It may explain approved content and route the model. It must not approve or invent a job, rate, payout, payment, availability, media review, identity review, or access state. Kenji is not used on this surface.

## State matrix

| State | Required presentation | Forbidden presentation |
| --- | --- | --- |
| Checking | Skeleton/spinner, `aria-busy`, neutral copy | Empty, verified, active, or paid |
| Identity review | Pending/review chip and Boss Per review copy | Profile picker, self-link, or access grant |
| Conflict | Error/support route; fail closed | Retry that silently rebinds identity |
| Empty | Only after a successful authoritative read | Empty after 401/403/404 ambiguity or network failure |
| Error | Safe message and bounded retry | Cached positive state presented as current truth |

## Responsive and accessibility acceptance

- Primary target: 390–430px; centered maximum width 520px on desktop.
- Minimum interactive height 44px; primary actions 48px.
- Safe-area padding on the fixed dock and content bottom.
- No horizontal scrolling for app navigation or primary controls.
- Status is never conveyed by color alone; pair tone with text/icon.
- Respect `prefers-reduced-motion`.
- TH is the initial language; preserve EN/ZH presentation. Chinese profile-language writes continue to use the existing backend value `thai` only where the established contract requires it.

## Port checklist

- Import `mmd-app-tokens.css` into the Worker presentation bundle.
- Map only existing, verified response fields into the listed presentation slots.
- Keep all mutation, authorization, normalization, and state-transition logic in existing Worker handlers.
- Run all 18 Rich Menu level/button checks separately; this model dashboard export does not replace Rich Menu entitlement resolution.
- Compare Worker screenshots at 390px, 430px, and 520px against `/design-preview` in this design lab.