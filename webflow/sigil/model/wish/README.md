# Model Wish · Sixth Year redesign

Route: `/sigil/model/wish`

An editorial black, ivory and matte-gold redesign with the requested mini logo, full-aspect-ratio Boss Wish image, three collapsible writing sections and an optional Gallery update. Native details controls remain usable without the runtime. Textareas use 16px text on mobile, keyboard focus is visible and reduced-motion preferences are respected.

## Placement

- `model-wish.html`: replace the existing Webflow Embed.
- `model-wish.css`: wrap in `<style>` inside page head; keep `noindex,nofollow`. The stylesheet imports Cormorant Garamond and Noto Sans Thai, with local font fallbacks.
- `model-wish.js`: wrap in `<script>` before closing body, replacing the old runtime.
- `FULL-CODE.md`: complete paste-ready HTML, CSS/head and JavaScript/footer blocks in order.

Site: `68f879d546d2f4e2ab186e90`; page: `6987dae2b3f7f937340de1a6`; Embed: `f1a5d5a6-d067-931e-a152-bdbb3567615a`.

## Preserved integration

Existing signed Model session / LINE LIFF, `/v1/model/profile`, `/v1/model/liff/exchange`, `/v1/model/session/current?mode=year6_direct_wish`, and Gallery upload remain authoritative. Full `location.href`, including any `t`, is preserved on login return. Existing session-only draft restoration remains in place. Submission requires any one message, not all three. Telegram and Past Clients remain independent and optional; Per-only text is separate from the shareable message. No media IDs are added to the direct Wish payload, no current job is required and manual review remains a backend gate.

The runtime now locks submission before authentication/upload to prevent double sends, opens the first field on empty submission, preserves retryable drafts after malformed responses and reuses uploaded Gallery media when only the Wish POST needs a retry.

## Validation and rollout

- `node --check webflow/sigil/model/wish/model-wish.js`
- `node --test webflow/sigil/model/wish/model-wish.test.mjs`: 8 passing behavioral tests using local DOM/network fixtures.
- `node --test admin-worker/model-direct-wish.test.mjs member-pages-worker/member-model-wish-notes.test.mjs`: 13 passing existing contract tests.
- HTML IDs and accessibility references validated; Webflow Embed/head/footer read back and compared with source.
- Responsive CSS covers mobile first, 600px and 900px layouts. Actual browser layout is unverified: local preview was blocked by the cloud browser and the Webflow Designer snapshot returned status false. Real LINE authentication, actual uploads and production submissions were not exercised.
- Staged as a Webflow draft on 2026-09-18. This redesign has not been published or merged. No Worker/backend changes are required by this patch.
