# Confidential Model Brief V24

Canonical presentation route: `/docs/confidential-model-brief`

Public convenience alias: `/confidential-model-brief` → canonical route.

## Ownership boundary

This folder is presentation source only.

- route access, private token, expiry, revocation and audit authority remain Worker-owned
- browser code must not infer or grant access
- the 6-digit `Private Ref` shown by V24 is session-scoped presentation metadata only
- no private customer identity is embedded in this file

## V24 design lock

- mobile-first
- TH / EN / ZH from one centralized copy map
- shortest possible page while preserving the current brief
- no image carousel
- no right-to-left image slider
- horizontal swipe is limited to compact information layers
- long explanations live inside native `details/summary` accordions
- one accordion stays open at a time
- static graphic transitions connect major sections
- Apple-like blur / translate / scale reveal with `prefers-reduced-motion` fallback
- explicit mobile text colors and `-webkit-text-fill-color: currentColor` prevent the historical disappearing-font/color regression
- font stack covers Thai, English and Simplified Chinese without bundling font files

## Information preserved

V24 keeps the current page's substantive content:

- private-only / direct-review / consent-first status
- privacy and controlled client access
- current access canon: VIP / Black Card as one private group, SVIP as owner-granted status, plus case-level direct review
- job brief fields: client context, request type, time, location, boundaries and risk notes
- client expectations and unsupported risk patterns
- aggregate LINE Official audience signals: 90.8%, 72.2%, 35–39 / 26.3%, 30–34 / 22.3%, 40–44 / 19.0%
- variable compensation and model decision rights
- payment/contact boundary: Client → MMD → Model
- Model Console reminder flow and `/rules/private-model-work`
- direct work without a public profile when appropriate and consented
- final private Telegram handoff to `https://t.me/mmdapply`

## Files

- `confidential-model-brief-v24.html` — self-contained Webflow embed source
- `confidential-model-brief-v24.test.mjs` — UX/i18n/content regression locks

## Local check

```bash
node --test webflow/docs/confidential-model-brief/confidential-model-brief-v24.test.mjs
```

Before production, copy the reviewed embed into the Webflow page only after confirming the Worker route/access boundary still wins.
