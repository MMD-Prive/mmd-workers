# /concierge/kenji — Kenji MMD AI Concierge

Public mobile-first concierge page source for Webflow route `/concierge/kenji`.

## Current build

`kenji-concierge-next-2-levels-v3-20260912`

Paste-ready source:

- `kenji-concierge-v3.html` — Webflow Embed
- `kenji-concierge-v3.css` — Page Settings → Inside `<head>`
- `kenji-concierge-v3.js` — Page Settings → Before `</body>`

The v2 files remain available as a rollback snapshot.

## Member truth and authority

The page reads the same-origin credentialed endpoint:

```text
GET /member/api/my-mmd/profile
```

The UI fails closed. Missing, pending, blocked, invalid, or timed-out member data never produces invented access. Kenji guides and routes; MMD remains the authority for approval and access.

## Customer routes

```text
/member/kenji-ai-20
/member/my-mmd
/booking
/recovery
```

## V3 direction

V3 raises the page by two visual and product levels:

- stronger Kenji Voice and higher-contrast amber signal system;
- live member signal panel with verified-state routing;
- concise mobile-first intent cards and horizontal swipe;
- Kenji Decision Engine sequence: READ → FILTER → MOVE → CARE;
- persistent mobile action dock driven by resolved member state;
- scoped Webflow styles, final contrast safety layer, progressive disclosure, and reduced-motion support.

## Verification

Run:

```bash
node --test webflow/concierge/kenji/kenji-concierge-v3.test.mjs
```
