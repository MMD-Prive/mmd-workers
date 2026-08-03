# MMD Rules Compact UX Patch — Apple Luxury / Mobile First

Date: 2026-08-03  
Route: `/rules`  
Webflow site: SĪGIL System  
Webflow site ID: `68f879d546d2f4e2ab186e90`  
Webflow page ID: `69c322895cd2c934f03927ad`

## Goal

- Reduce desktop hero width and height so the page feels less cramped.
- Make mobile shorter by hiding the hero card and clamping long rule copy.
- Remove inner border / edge artifact that caused color lines around the hero.
- Keep Hito hero image, LINE / Noto font stack, Apple-style fade-up, and MMD Privé black-gold mood.

## Production status

Applied to Webflow page footer custom code and published full site to:

- `mmdbkk.com`
- `www.mmdbkk.com`
- Webflow subdomain

## Key design changes

### Desktop

- Shell max width: `1480px`
- Hero max width: `1380px`
- Hero min-height: `680px`
- Hero card max width: `360px`
- Hero focal point: `76% center`

### Mobile

- Hero min-height: `560px`
- Hero card hidden
- Rule paragraph text clamped to 3 lines
- CTA compact
- `PRIVATE RULES` headline reduced with clipping-safe line height

### Edge artifact fix

- Removed inner hero border
- Removed image `scale()` transform
- Kept only one clean outer border
- Added `backface-visibility: hidden`

## Assets

Hero image:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69ac303cafc2d25c8c34f9dc_hito_rules_hero.webp
```

Logo image:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c44867ac035cdb7c13e34_MMD_Prive%CC%81_logo_main_transparent%20FINAL.webp
```

## Font lock

Use LINE first and Noto as the main Thai fallback.

```css
font-family: "LINE Seed Sans TH", "Line Seed Sans TH", "Noto Sans Thai", "Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
```

## Core CSS direction

```css
/* MMD Rules Compact UX Patch — Apple Luxury */

@media (min-width: 992px) {
  #mmd-rules-page-lvmaxx-v2 .mmd-rules-shell {
    max-width: 1480px !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero {
    max-width: 1380px !important;
    margin: 0 auto !important;
    min-height: 680px !important;
    border-radius: 34px !important;
    border: 1px solid rgba(255,255,255,.065) !important;
    box-shadow: 0 28px 92px rgba(0,0,0,.46) !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero:before {
    display: none !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-image {
    object-position: 76% center !important;
    transform: none !important;
    backface-visibility: hidden !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-inner {
    min-height: 680px !important;
    padding: 56px 56px 44px !important;
    grid-template-columns: minmax(0, 1fr) 360px !important;
    gap: 34px !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-headline {
    font-size: clamp(78px, 6.4vw, 120px) !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-card {
    max-width: 360px !important;
    padding: 22px !important;
    margin-bottom: 10px !important;
  }
}

@media (max-width: 767px) {
  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero {
    min-height: 560px !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero:before {
    display: none !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-image {
    object-position: 72% center !important;
    transform: none !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-inner {
    min-height: 560px !important;
    padding: 210px 16px 16px !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-hero-card {
    display: none !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-headline {
    font-size: clamp(46px, 15vw, 68px) !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-lead {
    font-size: 14px !important;
    line-height: 1.65 !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-writing,
  #mmd-rules-page-lvmaxx-v2 .mmd-rules-cta {
    margin-top: 18px !important;
    padding: 18px 14px !important;
  }

  #mmd-rules-page-lvmaxx-v2 .mmd-rules-block-text {
    display: -webkit-box !important;
    -webkit-line-clamp: 3 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    font-size: 13.5px !important;
    line-height: 1.6 !important;
  }
}
```

## Implementation note

This patch is an override layer on top of the existing LV Maxx++ page script. It keeps the content intact while improving density, reducing scroll depth, and removing hero edge artifacts.
