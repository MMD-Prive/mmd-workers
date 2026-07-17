# MMD R2 Deployment Note: SIGIL Private Models Webflow Assets

Documentation date: 2026-07-15
Deployment date/time: not recorded in this repo note

This note records the completed Cloudflare R2 upload for SIGIL Private Models Webflow assets. These assets belong to the SIGIL Private Models page family and related Webflow embeds, such as `/sigil/private-models`.

This is not a Kenji Knowledge V9.1 deployment. Do not confuse these assets with `webflow/internal/admin/kenji-knowledge/`, the Kenji Knowledge V9.1 Webflow Loader, Kenji Board bridge assets, or PR #170 Kenji Knowledge assets.

## R2 Location

- Bucket: `mmd-models`
- Public domain: `https://models.mmdbkk.com`
- Prefix: `webflow/sigil/private-models/`

## Uploaded Files

- `sigil-private-models.css`
- `sigil-private-models-v2-polish.css`
- `sigil-private-models-v3.css`
- `sigil-private-models.js`
- `sigil-private-models-v3.js`
- `sigil-private-models-webflow-snippet.html`

## Public URLs

- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models.css`
- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models-v2-polish.css`
- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models-v3.css`
- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models.js`
- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models-v3.js`
- `https://models.mmdbkk.com/webflow/sigil/private-models/sigil-private-models-webflow-snippet.html`

## Validation Reported

- All 6 public URLs returned `HTTP/2 200`.
- CSS assets served as `text/css`.
- JS assets served as `application/javascript`.
- HTML snippet served as `text/html`.
- `Cache-Control` was set to `public, max-age=300`.

## Operational Notes

- No repo files were changed as part of the original R2 upload.
- No commit or push was part of the original R2 upload.
- No Worker deploy was part of the original R2 upload.
- No deploy commands were run as part of this documentation note.
- No worker files touched as part of this documentation note.
- No Webflow publish was part of the original R2 upload.
- Existing dirty worktree files were left untouched.
