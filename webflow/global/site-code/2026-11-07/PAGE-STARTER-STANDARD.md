# ทุกเพจเริ่มอย่างไร — CSS / JS starter standard (TH)

## Principle

ทุกเพจ **ต้องทำตามลำดับโหลด** แต่ **ไม่จำเป็นต้องโหลดทุกไฟล์**. Source of truth: `MMD-Prive/mmd-workers` (CSS/JS) and `MMD-Prive/mmd-i18n` (canonical language runtime/dictionaries).

## Site-global Head

Keep only favicon/touch icon, shared font preconnects, narrowly scoped base tokens, and the approved early world/bootstrap. No route-specific style or inline business JS.

## Page-specific Head

- Choose one world: **MMD Public / SĪGIL-MY MMD / MY MODEL / Partner / MMS / Internal**. Do not mix themes.
- CSS order: base/world tokens → required shared scoped components → page-specific CSS.
- The MMD CSS Lock family must be contained in `<div class="mmd-system">…</div>`. No global `h1,body,p,button` overrides.
- All hosted CSS/JS references need an immutable Git SHA and a verified SRI hash. Never deploy a sample `COMMIT_SHA` placeholder.

## Page content

Put readable Thai fallback text directly in markup. Use stable `data-i18n-text`, `data-i18n-placeholder`, `data-i18n-attr` keys from `mmd-i18n`. No extra page-level language engine. Treat `data-i18n-html` as trusted-content-only.

## Page-specific Footer

Load only this route's JS and dictionary extensions after the shared canonical loader; load exactly once and keep deterministic order. Scripts must run even when DOMContentLoaded has already fired.

- Public: Public header, editorial styles and only relevant CTA/data modules.
- SĪGIL / MY MMD: private skin, member auth & payment/confirmation only on applicable routes.
- MY MODEL: status/action UI + confirmed payment-gates; no global booking/accept shortcuts.
- Partner: partner theme + partner UI, no MMS/public global overrides.
- MMS / MY MMS / MY Therapist: MMS fonts/colors + proper therapist actions.
- Internal: internal/admin theme and gated tools; admin modules never on public pages.
- Profiles / Rules / Studio / Campaigns: their own page-specific modules only.

## QA before Publish

Verify SHA + SRI, no 404s, Thai fallback, mobile 375/390, tablet/desktop, focus/keyboard, route guard, analytics duplication, no Webflow duplicate binds, and real/preview parity. Never test with live customer tokens.

The current deployed site has not been modified by this source capture. See `README.md` and `manifest.json`.
