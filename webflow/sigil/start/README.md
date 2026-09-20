# SĪGIL Start V29

Canonical visible route: `/sigil/start`

## Product lock

This page is a concise three-lane decision surface only:

1. **Member Card** — Kenji → `/sigil/inme` with Membership secondary route
2. **Model Cards** — TarT → Public Model / Apply as Model / Travel Model
3. **Partner** — Yuki → Partner application / Partner Division

Do not add staff/team/system/admin lanes or expose internal route ownership language in the visible UI.

## V29 UX

- mobile-first
- TH / EN / ZH from one copy map
- shortest practical page
- mobile uses a 3-tab lane selector so only one lane card is visible at a time
- desktop shows all three lanes together
- each lane keeps secondary detail inside a `+` disclosure
- no image carousel
- no long horizontal image slider
- Apple-like blur/translate/scale reveal with reduced-motion fallback
- text/graphic transition bridges Hero → Lane selector
- explicit text colors and `-webkit-text-fill-color: currentColor` protect against the mobile disappearing-font regression

## Visual identity

- MMD Privé logo retained
- black / graphite / ivory / restrained warm gold
- Kenji = Member
- TarT = Model
- Yuki = Partner
- Boss Per remains subtle founder context, never a competing portrait

Kenji V29 card asset:

`https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab030ae56be7bcca053d2cd_Kenji%20sigil%20start.webp`

## Context handoff

Outgoing lane links preserve the current entry context keys:

- `t`
- `code`
- `promo`
- `liff.state`
- `from`
- `payment_ref`
- `session_id`
- selected `lang`

This frontend never turns those values into access/business truth.

## Files

- `sigil-start-v29.html`
- `sigil-start-v29.test.mjs`
