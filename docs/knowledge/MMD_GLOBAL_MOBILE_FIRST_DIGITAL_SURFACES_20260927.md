# MMD Global Mobile-First Digital Surfaces — Owner Canon

Date: 2026-09-27
Owner decision: Boss Per
Scope: Webflow pages, Webflow embeds, Worker-rendered full-code pages, and future route/UI reviews.

## Decision

All pages should feel like the MMD Privé visual world, but the visible UI should not rely on spelling out the brand name. The look should come from mood, material, layout, typography, motion, imagery, and polish rather than repeated wordmarks.

## Global requirements

- Mobile-first is mandatory. Design the mobile viewport first, then scale upward.
- Mobile first screen must feel full-screen: `min-height: 100dvh`, edge-to-edge surface, no white outside border, no accidental browser-frame feeling, and no orphan margins.
- Do not show raw URL text in page content. Replace visible URLs with buttons, cards, chips, or short labels.
- Do not add visible brand-name wordmarks just to fill space. Use subtle symbol, asset, or context when identification is needed.
- Pages must be compact and digital, not long brochure pages.
- Prefer cards, segmented controls, tabs, accordions, drawers, sticky bottom CTA, and progressive disclosure.
- Thai copy must be short, direct, and scannable. Keep the first-screen explanation around 3-7 lines.
- Use premium readable typography: `Noto Sans Thai`, `Inter`, `IBM Plex Sans Thai`, or system Thai sans fallback.
- Avoid low-contrast thin type.
- Use editorial assets where useful: soft portraits, Bangkok mood, charcoal/gold/ivory material, blurred light, or relevant route imagery.
- If no suitable image exists, use gradient/glass/texture rather than random decoration.

## Theme direction

- Public/member/normal MMD Privé: warm ivory/soft bone, charcoal or black-glass structure, champagne-gold detail, and restrained wine/red accents. It should feel brighter, clearer, and more inviting than Private.
- SIGIL/private: a distinct controlled world — deep black/charcoal, smoked glass, champagne gold, restrained cool-blue highlight, warm amber light, cinematic vignette, and less visible chrome. Private must not look like Public with only a darker background.
- MMS: forest green remains when route-specific MMS rules require it, while preserving compact mobile-first structure.
- Internal: owner-first dashboard, compact workspace, clear action zones, no long scattered forms.

## Private Job cover contract

Every Private Job cover/card must show two compact labeled chips:

- `BUDGET · <value>`
- `ลูกค้า · <เพศลูกค้า>`

Rules:

- `BUDGET` is always visibly labeled.
- When `budget_disclosure_approved=true`, show the approved compensation value.
- When budget disclosure is not approved, keep the chip but render `BUDGET · PRIVATE`.
- Customer gender must come only from explicit structured data or explicit brief wording.
- Never infer customer gender from sexual orientation, name, behavior, photos, or model preference.
- Do not display customer sexual orientation on the cover.
- Unknown gender renders `ลูกค้า · ไม่ระบุ`.
- Private card still hides title, full brief, customer detail, and protected fields before reveal.
- Existing 30-minute reveal-token behavior and private access controls remain unchanged.

Canonical structured values:

- `male` → `ชาย`
- `female` → `หญิง`
- `couple` → `คู่ ชาย/หญิง` only when explicitly stated
- `mixed` → `หลายเพศ` only when explicitly stated
- `unspecified` → `ไม่ระบุ`

## Layout contract

Base wrapper should be equivalent to:

```css
.mmd-page {
  width: 100%;
  min-height: 100dvh;
  overflow-x: hidden;
}

.mmd-mobile-shell {
  min-height: 100dvh;
  padding: max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom));
}
```

Do not allow cards, tables, images, or forms to create horizontal scrolling. Use one-column cards on mobile and expand only at larger breakpoints.

## No visible URL rule

Visible page copy must not include raw URLs such as:

- `https://...`
- `/internal/...`
- `/public/api/...`
- worker route names or API paths

Use action labels instead:

- `เปิดกระดาน`
- `สร้างงาน`
- `ดูรายละเอียด`
- `ยืนยันผ่าน LINE`
- `กลับไปหน้าแรก`

Internal pages may expose route/system state only where it helps Boss Per operate safely.

## Implementation guardrails

Presentation-only work must not change:

- backend truth
- permissions
- eligibility
- payment authority
- entitlement resolver logic
- LINE/LIFF identity binding
- customer/model/job data rules

Route-specific canon overrides this global rule only when stricter or more specific.

## Acceptance checklist

For each affected page:

- Mobile viewport has no horizontal scroll.
- First screen feels full-screen and compact.
- No raw URLs are visible in rendered copy.
- No unnecessary brand-name wordmark is added.
- Page uses correct world theme.
- Private Job covers show labeled Budget and customer-gender chips.
- Primary CTA is visible without long reading.
- Route/system/debug language is hidden from customer/model surfaces.
- Internal surfaces remain operational and owner-first.
- At least one mobile screenshot or visual smoke is captured before publish.

## Related Webflow rule

A matching Webflow site instruction was created on the SĪGIL System site:

`rules/mmd-global-mobile-first-digital-surfaces.md`
