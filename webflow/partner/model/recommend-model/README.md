# Personal Friend Referral — LV15

Full code rebuild of `/partner/model/recommend-model`, 25 October 2026.

## What changes

The previous mobile page measured 4,535 px at 390 × 844. Repeated steps, repeated closing copy and a fixed duplicate CTA made the route unnecessarily long. The new default page measures 1,572 px, about 65% shorter. The hero CTA is 178 × 50 px instead of 350 × 54 px.

The existing approved Yuki photograph and unframed SĪGIL Partner mark remain. The portrait has a separate responsive frame; Thai copy sits on a readable burnt-brown surface. Three accessible step tabs and native FAQ accordions retain the information in less space. A floating CTA appears after the main CTA passes above the mobile viewport. Image motion is restrained and respects reduced motion. The percentage indicator counts completed page-preparation tasks and does not block content.

A global font conflict previously removed Thai glyphs from mixed-language buttons. The scoped final typography/contrast rules explicitly protect Thai labels with Anuphan and dark CTA ink.

## Source and Webflow ownership

- Site: `68f879d546d2f4e2ab186e90`
- Page: `6a319e346ff7555dd157e046`
- Existing HtmlEmbed: `8eb1a142-7f44-900e-99be-a8e02ad5f4cd`
- `recommend-model.html`: replacement code for that same existing embed.
- `recommend-model.css` and `recommend-model.js`: editable source.
- `page-head.html` and `page-footer.html`: generated page-only freeform code.
- `preview.html`: standalone reviewable preview with Thai fallback copy.
- `original-webflow.json`: exact embed/head/footer captured before the rebuild for rollback.
- `verification.json`: scoped validation evidence and limitations.

Run `node sync-derived.mjs` after a source change; `node sync-derived.mjs --check` verifies the generated files. Replace the existing embed and the two page-level freeform blocks. Do not add a second embed, duplicate LIFF initialization, or change global code.

## Preserved contracts

- Model-to-model submission: `/partner/model/recommend-model-apply?source=model-to-model`.
- Agency / management introduction: `/partner/referral` (current destination verified against its live content).
- Header destinations: `/partner` and `/partner/dashboard`.
- The existing `t` parameter remains URL encoded on these same-origin Partner links only.
- Existing `#top`, `#how`, `#next`, `#route`, `#care`, and `#faq` fragments remain available.
- Consent, initial information, contact preference, and subsequent work-condition explanations remain intact. The model-to-model audience is now stated in the hero.
- The route stays `noindex,nofollow`. No rates, financial rules, authentication, forms, endpoints, or business records are changed.

## Language integration

The existing site-level canonical dictionary and `i18n.core.v21.js` remain the only language runtime. Thirty-two Thai keys under `partner.recommend.*` are added to `MMD-Prive/mmd-i18n/assets/i18n/i18n.dict.js` in the companion PR. The HTML retains identical Thai fallback copy, so the page remains readable before that dictionary update is merged or when the CDN is unavailable. The current global language configuration is preserved.

The companion i18n change also allows its existing HTML audit to recognize the already-deployed canonical `i18n.core.v21.js`, in addition to `i18n.core.js`. It does not alter either runtime.

## Validation

Chromium previews were checked at 320, 360, 390, 430, 768, 1024 and 1440 px with the actual site CSS, original hero and fonts. Final checks include the current two relevant global theme loaders and the canonical language runtime. No horizontal overflow or page JavaScript error was found.

Verified: step tabs and keyboard navigation, all native FAQs, conditional dock, synthetic-token handoff, legacy fragments, no-JavaScript fallback, reduced motion, and failed-image fallback. Thai coverage is 32/32; syntax and strict i18n audit pass. Requests are intercepted for local verification and all writes are blocked. No production submission or end-to-end backend approval is claimed.

## Release boundary

This is a page-only draft/source change. Publishing and Worker deployment are separate actions. Do not assume a full-site publish is required or approved. If production needs full-site publication, inspect pending unrelated changes before requesting that final release step.
