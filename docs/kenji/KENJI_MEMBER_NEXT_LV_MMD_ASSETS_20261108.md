# KENJI–04 · /member/kenji · Full NEXT LV mobile-first

Status: GitHub review/QA candidate — **not production-deployed**. Updated 2026-11-08 (Asia/Bangkok).

## Canonical route and security

- The active /member/kenji HTML is rendered by `member-dashboard-chat-worker/src/kenji-next-lv-page.js`, delegated from `kenji-member-app.js`. The Webflow page record is not a second live chat implementation.
- Existing authenticated same-origin BFF stays `POST /api/member/kenji/chat` with `{message}` only. All member identity/Points/payment/access/booking and AI Worker authority remains on the server. The browser never grants or infers Private access.
- Kenji LINE OA reply categories and runtime controls are unchanged. Customer page keeps Q&A and promotion navigation without claiming new promotions are verified.

## Owner-provided Kenji–04 image asset set

Owner supplied `Kenji04_Member_Concierge_NextLV_4Images(1).zip`. Original images were reviewed and Public/Private separated. Only the **Public** portraits are used by this member UI.

Webflow site ID: `68f879d546d2f4e2ab186e90`. Asset folder: **Kenji AI 20** (`6a690f6ca729a50e536152e0`).

| Use | Official asset | Webflow asset ID | GitHub backup |
|---|---|---|---|
| Desktop Hero 16:9 | Kenji04 Member NEXT LV Desktop 16x9.webp | `6af00f6c543fc6f65ec870cc` | `webflow/assets/kenji04/Kenji04_Public_Desktop_16x9.webp` |
| Mobile Hero 9:16 | Kenji04 Member NEXT LV Mobile 9x16.webp | `6af00f7040441227f49253cf` | `webflow/assets/kenji04/Kenji04_Public_Mobile_9x16.webp` |
| Chat avatar | Kenji04 Member NEXT LV Chat Avatar.webp | `6af00f73a5e7765e6ebdb688` | `webflow/assets/kenji04/Kenji04_Public_Chat_Avatar.webp` |

Official Webflow hosted URLs are referenced in the canonical Worker page. Never substitute a generic stock/generated face. The 2 Private editorial images from the ZIP are **excluded** from the Curated member UI.

## Two-logo customer-brand split (owner-supplied URLs)

**Curated** — MMD Privé gold/white transparent mark:
`https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aec945d0a09b10a4799ebda_transparent-gold-white-240px.webp`

**Private** — SĪGIL System 2027:
`https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aec9538faadf68fb64e70eb_SIGIL%20Logo%202027.webp`

The top-level member page uses Curated branding, while an optional compact Private link shows the separate SĪGIL logo and navigates to `/member/private`, where backend membership/access checks still control the available content. Showing a logo/link never implies entitlement or changes member class.

## NEXT LV UI

- Phone viewport **first**: single-column, short Kenji hero, read-first chat, compact brand navigation, large enough Q&A / promotion touch targets, horizontal prompt chips, a safely anchored composer with `env(safe-area-inset-bottom)`.
- Desktop expands to a two-column editorial hero + chat layout. Desktop face crop corrected to right-side focus, avoiding off-screen face.
- Short-phone 320×568 layout compresses top chrome while preserving one full visible greeting bubble.
- Messages remain ephemeral browser display; no local/session storage, no auto-send prompt, no automatic retry after uncertain delivery.
- Footer/private navigation never exposes backend tokens, identity or payment info.
- Nonced CSP remains intact; image URLs use official Webflow asset CDN; connect-src remains `'self'`.

## Verification

Local layout checks using the owner images (embedded preview only) and controlled mocked BFF response:

- `320×568`, `375×812`, `390×844`, `768×1024`, `1440×900`: no document horizontal overflow, composer remains visible, page hierarchy intact.
- Q&A / Promotions switch and prompt-to-draft behavior verified; mocked `POST /api/member/kenji/chat` updates transcript and member label without issuing other privileged actions.
- `node --check` passed for the corresponding inline browser script.
- GitHub Actions/real authenticated iPhone verification and Cloudflare release smoke are separate release gates.

## Release gate

PR review is not a deployment. Before production, confirm GH tests, mobile screenshot comparison and authenticated member/no-session/401 paths; deploy the Worker through the established release path only after owner sign-off. **No need to overwrite the shadowed Webflow page or publish unrelated Webflow site changes.**


## Visual correction — Logo visibility and MMD fonts (2026-11-08)

Follow-up owner QA found empty logo placeholders in the offline preview and typography falling back to generic fonts even though the font family names were referenced. The former Preview depended on externally hosted Webflow image URLs; the Worker HTML is standalone and has no Webflow site font registry attached.

Remediation:
- Added `member-dashboard-chat-worker/src/kenji-member-brand-assets.js` with small **official Webflow-preview raster variants** of exactly the owner-supplied Curated MMD gold/white and Private SĪGIL 2027 logos. The Worker substitutes data-URI images server-side so the header and two selection cards render independently of CDN availability. Logos are not rebuilt as plain text or fabricated marks.
- Increased their visible art area and changed Curated / Private brand cards to image-first vertical composition at normal mobile/desktop widths; compact horizontal composition is retained for short mobile displays. These cards remain navigation only, never a Private entitlement control.
- Bound actual registered Webflow font files using explicit `@font-face`: `LINE Seed Sans TH` regular/bold/extra-bold for Thai app UI, `Canela` regular/italic for the editorial Kenji headline, `Inter` regular/semibold for EN labels. This corrects previous CSS stacks that referenced fonts without loading them.
- CSP still has a fresh nonce for inline CSS/scripts and same-origin-only `connect-src`; explicit `font-src 'self' https://cdn.prod.website-files.com` allows the registered Webflow font resources.
- Regression tests decode embedded logo data and validate RIFF/PNG signatures, assert font declarations and CSP. The offline layout smoke (with image-size placeholders rather than downloaded logos) checked 320×568, 375×812, 390×844, 768×1024 and 1440×900, with no horizontal overflow, usable chat history and composer visible.

**Font loading depends on the Webflow font CDN remaining available in the production browser.** The local offline screenshot cannot validate the final font rasterization; do a connected-browser typography check and iPhone review after code review. No production publication as part of this fix.
