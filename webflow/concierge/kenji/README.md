# /concierge/kenji — Kenji MMD AI Concierge

Public mobile-first concierge page source for Webflow route `/concierge/kenji`.

## Current build

`kenji-concierge-mmd-ai-v2-20260912`

Paste-ready source:

- `kenji-concierge-v2.html` — Webflow Embed
- `kenji-concierge-v2.css` — Page Settings → Inside `<head>`
- `kenji-concierge-v2.js` — Page Settings → Before `</body>`

## Member truth and authority

The page reads the same-origin credentialed endpoint:

```text
GET /member/api/my-mmd/profile
```

The UI fails closed. Missing, pending, blocked, invalid, or timed-out member data never produces invented access. Kenji guides and routes; he does not grant membership, reveal unverified private talent, confirm payment, or replace Boss Per as final authority.

## Customer routes

```text
/member/kenji-ai-20
/member/my-mmd
/booking
/recovery
```

## Visual direction

MMD AI v2 uses high-contrast warm white, vivid amber signal accents, explicit Webflow-scoped heading colors, mobile horizontal service layers, progressive disclosure, and reduced-motion support.