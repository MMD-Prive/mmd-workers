# SIGIL Booking Flow V10 Logo

Mobile-first Webflow package for `/sigil/booking` with the MMD Privé logo lockup added.

## Install

Use the full embed file for this version:

- `sigil-booking-flow-v10-logo-full-code.html` → paste into one Webflow Embed element on `/sigil/booking`.

This version intentionally ships as one self-contained Webflow embed to reduce Webflow placement drift and avoid the previous split-code flow/layout mismatch.

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
