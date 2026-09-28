# MMD APP LIFF Digital System V1

Status: OWNER DIRECTION — 2026-09-28

## Decision

The native **MMD APP LINE LIFF** experience must use the same compact digital product language as the new MMD digital system.

This decision is independent of Lovable presentation work. LIFF-native entry, verification bootstrap, identity resolution and onboarding must remain usable and visually coherent even when Lovable is not involved.

## Product principle

**One screen. One job. One owner. One obvious next action.**

MMD APP is a model work application, not a luxury marketing page.

## Digital visual language

- Mobile first, optimized for 390–430px.
- Centered maximum application width: 520px.
- Background: `#080907`.
- Quiet charcoal/graphite surfaces.
- Champagne-gold accent.
- Warm ivory text.
- Compact status pills, cards, meters and action rows.
- Safe-area aware.
- No oversized hero image on verification, onboarding, availability, job or transaction screens.
- Utility screens remain data/action first.
- Editorial/model imagery is reserved for profile/media surfaces where it serves the job.

## LIFF-native scope

The following surfaces are Worker/LIFF-native and must not require Lovable to render correctly:

1. LINE Mini App handoff / bootstrap.
2. LIFF primary bootstrap.
3. PWA-to-LIFF bootstrap.
4. Identity verification / identity review state.
5. New-model Phase A onboarding.
6. Fail-closed unavailable/retry states.

Authenticated dashboard presentation may evolve separately, but the LIFF entry chain must remain self-sufficient.

## Model-side role lock

- **TART** is the model-side guide.
- Kenji is not used as the model-side guide.
- Per remains human authority for protected/manual-review decisions.
- TART can explain and route, but never invent job, rate, payout, payment, availability, approval or access truth.

## Authority boundary

UI is presentation only.

Workers remain authority for:

- LINE identity and model session;
- canonical model binding;
- application review;
- profile and availability;
- job/session state;
- allowed actions;
- rate/payout truth;
- media review and visibility;
- GPS/privacy;
- manual review and protected access.

No browser-side tier/access inference, no fake NEEDS YOU, no fake job, no local authority, no new database.

## Navigation model after authenticated entry

Target application architecture:

`WELCOME → VERIFY → IDENTITY RESOLVE → ONBOARDING if needed → HOME / JOBS / CONSOLE / YOU`

- HOME = model overview/work readiness.
- JOBS = verified current/recent work where backend data exists.
- CONSOLE = canonical `/sigil/model/console`, active-job execution.
- YOU = profile, availability, media, My Card, Telegram, privacy/GPS, TART support.

## Current implementation in this PR

- LIFF bootstrap pages receive the digital MMD APP shell.
- Phase A onboarding receives the same digital shell and tokens.
- Existing LIFF IDs, query preservation, session cookies, Worker endpoints, validation, submission payloads and fail-closed behavior stay unchanged.
- No production deploy is implied by this document.
