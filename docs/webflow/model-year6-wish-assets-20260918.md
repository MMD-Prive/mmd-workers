# MMD Model · Year 6 Wish — Webflow Asset Reuse Lock

Status: ACTIVE
Date: 2026-09-18

The post-job Model Wish in MY MMD Model Hub reuses the same approved three-image set as Webflow Wish Atelier V23. Do not upload duplicate copies for the Model surface.

## Approved image set

Use these frames in this exact order:

1. `MMD 6 Y Mob.webp`
   - Webflow asset ID: `6a929ff50646bb6234f57e1a`
   - CDN: `https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a929ff50646bb6234f57e1a_MMD%206%20Y%20Mob.webp`
2. `Group - Wish.webp`
   - Webflow asset ID: `6a88ca88ac06aa170c7da680`
   - CDN: `https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a88ca88ac06aa170c7da680_Group%20-%20Wish.webp`
3. `Happy BD 6 Years.webp`
   - Webflow asset ID: `6a80812d257ecdddd8a24175`
   - CDN: `https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a80812d257ecdddd8a24175_Happy%20BD%206%20Years.webp`

## Model Hub presentation rules

- Render the set as a compact image stage inside/above the optional `6 YEARS · MODEL WISH` card.
- Mobile first; no horizontal page overflow.
- Preserve the order above.
- Reuse Webflow CDN assets directly; no duplicate uploads or browser-side persistence.
- The assets are presentation only. They must not affect session lifecycle, payout eligibility, Wish eligibility, or submission authority.
- Model Wish remains available only when backend eligibility is true after separation.
- Wish API failures must not block normal wrap-up/status/payout UI.
- Do not restore older F1 or legacy Happy BD images.

## Canonical relationship

- Visual authority: Webflow `/promotion/6-years-care-back/wish` / Wish Atelier V23.
- Model Wish transport remains `GET|POST /v1/model/session/current?mode=year6_wish`.
- Model Wish campaign remains `mmd_year_6_model_wish`.
