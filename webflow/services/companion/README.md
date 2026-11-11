# /services/companion

Source-controlled snapshot of the live Webflow Companion page.

Webflow:
- Site: `68f879d546d2f4e2ab186e90`
- Page: `6a577a16780332c4d2a9ef68`
- Published path: `/services/companion`

Files:
- `page.html` — primary Companion embed (markup + base styles + TH/EN/ZH copy)
- `visual-overrides.html` — compact/crop/Bangkok visual overrides from the live page
- `footer.html` — interaction + i18n runtime
- `i18n-contract.test.mjs` — regression contract

i18n contract:
1. Supported locales are `th`, `en`, `zh`.
2. `?lang=th|en|zh` wins over stored language.
3. Safe `localStorage.mmd_lang` is the fallback.
4. Thai is the final fallback.
5. Language clicks update the current URL without dropping other query parameters.
6. Internal Companion links carry the active `lang`.
7. Business/pricing/booking truth is not translated or recomputed by the runtime.

Snapshot source: live Webflow page on 2026-10-01.
