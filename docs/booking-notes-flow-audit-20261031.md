# Booking notes: verified routes and narrow UI enhancement

## Public /booking
- Live Webflow page ID: 6a70ef60df7464659cea9d17, not the retired ID in the August rule.
- Root: #mmd-booking-v4. The existing textarea[name=note] is in panel 3, inside the request details form.
- booking-api-bridge.js sends note plus the existing request summary as client_notes to the canonical /sigil/api/booking/intake endpoint. No new API or data store is necessary.
- public-booking-notes.js improves that same field: optional, four rows, 1000-character input limit, accessible character count, 16px text, translated label and placeholder following the existing html lang. It preserves the textarea node/value, original name, listeners, disabled state, and form membership. It adds no submit handler, fetch, localStorage or sessionStorage.
- Register this <=2000-character script once at the page footer. Do not overwrite head/footer code or clear other scripts. Registration/application is staged configuration, not evidence of live publication.

## /sigil/booking
- Live route currently comes from sigil-booking-proxy-worker / Webflow Cloud release, not the legacy Webflow SKB26 freeform code. Do not patch the old Webflow page expecting it to affect the app.
- Live default Public lane has Brief / หมายเหตุ in the WHEN & WHERE section. Source of the app: MMD-Prive/sigil-booking.
- Current contract at commit 81c27690e59aa589acacf3c2c0a3468eae5bd1de sends FormValues.brief.trim() as client_notes. PrivateBooking v15 also has a notes input and includes the value in the final review. A second field would risk duplicate or discarded values.
- Keep notes in controlled form state, not in query parameters. No DOM text replacement on React nodes.

## Backend and privacy
- Intake stores client_notes in Client Notes. Admin Notes remain separate.
- Request-only status and Public/Private entitlements stay unchanged. Notes do not confirm a job, price, availability, payment or model.
- The Compcard screen is a separate internal media library. Its card notes are not customer booking notes; a zero-result Public filter is not evidence that booking models were deleted.

## Validation and release boundaries
- Local Chromium on an offline synthetic DOM passed 18 checks for preserving multiline notes, optional bounds, ARIA descriptions, idempotence, character count, TH/EN/ZH language changes, same form serialization, unrelated-route no-op, delayed mount, disabled-state preservation and no API/storage writes.
- This is not an authenticated production booking test and created no real intake record.
- Do not claim live release until the exact page/app build is published and read back. Do not full-site publish unrelated pending Webflow edits.
