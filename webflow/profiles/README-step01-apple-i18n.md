# Profiles Step 01 — Apple motion + TH/EN/ZH

Additive presentation layer for the existing Webflow `/profiles` page.

## Scope

- Adds the approved Step 01 image:
  `Midnight Penthouse Fashion Portrait.webp`
- Places the image beside the "Choose the role" introduction on desktop and below it on mobile.
- Adds restrained Apple-inspired image, typography, and role-card transitions.
- Respects `prefers-reduced-motion`.
- Completes TH / EN / ZH localization for the Step 01 role chooser, including all current role cards and the two separate routes.
- Keeps dynamic public-profile role labels/result count aligned with the current language.
- Reads language in this order: `?lang=` → `<html lang>` → `localStorage.mmd_lang` → Thai.
- Does not fetch data or change eligibility, pricing, booking, payment, or entitlement logic.

## Files

- `profiles-step01-apple-i18n-v1.css`
- `profiles-step01-apple-i18n-v1.js`
- `profiles-step01-apple-i18n-v1.test.mjs`

## Webflow source context

Live page inspected read-only on 2026-10-01:

- Site: `68f879d546d2f4e2ab186e90`
- Page: `6a59c8170f7c8dee11e3c47e`
- Route: `/profiles`

The live page already has a TH/EN/ZH shell for the hero and other shared copy. This patch closes the visible Step 01 localization gap without replacing the existing Profiles runtime.
