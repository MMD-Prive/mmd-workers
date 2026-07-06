# SIGIL Booking Flow V10 Logo

Mobile-first Webflow package for `/sigil/booking` with the MMD Privé logo lockup added.

## Install

Use the split files in this folder for Webflow:

1. `01-head-css.html` → Page Settings → Custom Code → Inside `<head>`
2. `02-body-embed.html` → Webflow Embed element
3. `03-before-body-js.html` → Page Settings → Custom Code → Before `</body>`

`sigil-booking-flow-v10-logo-full-code.html` is the one-piece fallback version.

## Brand / logo

The header uses the MMD Privé wordmark direction from the CI manual:

- Primary logo direction
- Gold Luxe `#C9A14A`
- MMD Privé wordmark treatment

## Governance

- Cloudflare Worker Router owns `/sigil/booking`.
- Webflow displays the page only.
- No page-script global redirect.
- Public page calls only `/api/sigil/models/*` and `/api/sigil/booking/request`.
- Airtable, Google Drive, R2, Admin, Payment, Telegram, Events, and Realtime stay worker-side only.
