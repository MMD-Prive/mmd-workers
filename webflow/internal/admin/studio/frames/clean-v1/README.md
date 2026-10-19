# Owner-edited Studio frames — preparation, not installed

These are the seven exact Library PNG originals supplied by the owner on
2026-10-19. They are 1316 × 1195 and opaque. `manifest.json` retains their
Library identities, original filenames, SHA-256 digests and content-addressed
deployment filenames. No raster edits, re-encoding or generated replacements
have been made. Files 6–7 are the corrected versions with Run Number boxes.

## Mapping gate

| Owner asset | Accent | Studio field | Existing stable template ID |
| --- | --- | --- | --- |
| 1 | cyan | EN / Travel | `mmd-prive-travel` |
| 2 | red | EX / Extreme | `mmd-prive-extreme` |
| 3 | purple | awaiting owner | unassigned |
| 4 | purple | awaiting owner | unassigned |
| 5 | purple | awaiting owner | unassigned |
| 6 | purple | EMs | `sigil-ems-aureate` |
| 7 | gold | GWs | `sigil-gws-nightwave` |

The pending fields are ST (`sigil-straight-bronze`), GY (`sigil-gay-plum`) and
FR (`sigil-foreigner-emerald`). Do not assign them from color, appearance or
filename order. The manifest intentionally contains null fields for 3–5.
No model classification is changed by this work.

## Prepared renderer and local verification

`../../studio-clean-frame-renderer.js` draws the exact artwork behind a
contained photo inset at left 7%, top 12%, width 64%, height 76%. The frame uses
its native aspect ratio. The entire original source photo remains visible,
with no filters or transformations beyond proportional sizing. Typography
sits in the reserved right area. The baked EMs/GWs label is not duplicated;
only the editable zero-padded digits are drawn inside its original empty box.
Missing digits remain blank. No logos or extra divider lines are added.

This is a standalone preparatory renderer. The existing Studio selector,
Review handoff and Final Preview have **not** been wired to it yet because
three asset mappings remain unconfirmed. Stable IDs and existing persisted
state must be retained when integrating it.

```sh
npm ci --ignore-scripts
node --test webflow/internal/admin/studio/studio-clean-frame-renderer.test.mjs admin-worker/studio-webflow-source.test.mjs
node scripts/studio-clean-frame-preview.mjs
```

Local visual QA: `http://127.0.0.1:4179`. All seven assets use a synthetic
checkerboard source; the page does not represent model classification or
create any backend records. Changing Run Number checks both original boxes.

## Exact hosting and release path

The established repository asset publisher uses Cloudflare R2 bucket
`mmd-models`, account `b176eda1172b741fd2e58904cc9d77c5`, exposed through
`https://models.mmdbkk.com/`. Existing reference:
`.github/workflows/deploy-kenji-admin-assets.yml`. Its published
`/webflow/internal/admin/kenji/kenji-admin-v1.js` returned HTTP 200,
`application/javascript`, on 2026-10-19. This verifies the established host,
not deployment of these new files.

Reserved new object prefix:
`webflow/internal/admin/studio/frames/clean-v1/`.
Each intended public URL is `manifest.hosting.public_base + '/' + asset_file`.
Upload the content-addressed PNGs using the existing dedicated R2 publisher
credential, `Content-Type: image/png`, and immutable caching. Read each object
back and compare its digest before changing a Webflow loader. Do not expose
Library transfer URLs or embed PNG base64 in Webflow code.

Release remains pending, in this order:

1. Obtain the owner's 3–5 mapping; update the manifest and integration tests.
2. Wire the selector tiles and manual Upload/Final Preview to this renderer,
   retaining all seven stable template IDs, canonical run state and
   decision-driven Review → Final Preview handoff. Replace the old added logo
   and CSS frame paths completely for these manual clean templates.
3. Bundle and host the small renderer/selector JavaScript beside the static
   art with an immutable release URL. Read back exact bytes. No Worker deploy
   or route change is required for this presentation-only path.
4. Read current Webflow code and verify site
   `68f879d546d2f4e2ab186e90`, Upload page `6a1be738a8018a51046e5335`, and the
   corresponding Final Preview page. Replace only the current selector block
   with its small hosted loader. Preserve unrelated code; the documented
   footer was already 49,881 characters. Check current publish scope and any
   unrelated pending Webflow drafts before requesting publication approval.
5. Request the required merge/release/publication approval for the concrete
   completed change. Publish only the reviewed presentation scope. Verify
   authenticated live Upload, Review handoff and Final Preview for every
   confirmed mapping, image loading, name/metric placement, blank and filled
   EMs/GWs boxes and absence of duplicate logos/labels. Installation is not
   complete until those live checks pass.

This preparatory PR does not upload to R2, modify Webflow drafts, merge,
publish, send Telegram, run paid generation or repair the file chooser.

## Separate automatic pipeline

`admin-worker/src/model-card-design.js` is a different 1322 × 1200 renderer
used by automatic profile-card generation. It currently draws the previous
CSS frame and approved runtime logo. It will not inherit these manual PNGs.
It requires a separate reviewed reconciliation to show the same clean art
and omit the old logo, including an explicit 1316 × 1195 → 1322 × 1200 sizing
decision. This PR does not change it or activate automatic generation.
`MODEL_CARD_AUTO_ENABLED` and all release gates remain unchanged.
