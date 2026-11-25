# SĪGIL NOW — private editorial publishing contract

MMD NOW uses the existing published Webflow CMS collection and routes. SĪGIL NOW uses an independent, private R2 binding `SIGIL_NOW_PRIVATE_R2`. Existing public content stays in the original collection; do not publish private posts or covers to the Webflow collection or its publicly reachable CDN.

## Runtime

- The existing authenticated GET endpoint accepts `world=sigil` for private editorial content. The default remains the existing MMD NOW feed. Do not infer private access from the selector, UI theme, or membership label.
- Both list and cover reads independently require a verified canonical entitlement snapshot, an active private visibility envelope, `new_model_reveals_allowed`, and no hard block or provisional fast-trust grant.
- Invalid, unavailable, inactive, grace-only and blocked entitlement states fail closed. Private storage errors do not fall back to MMD NOW. Stale/unpublished covers are unavailable even with a previously issued URL. Private responses use no-store.
- MY MMD renders the SĪGIL label and requests the SĪGIL feed only after the existing verified brand projection selects Private. A failed private request never shows the shared Public feed as a substitute; account switches discard old cards.

## Publishing

The private R2 bucket is `mmd-private-sigil-now`. Keep r2.dev disabled and no public custom domains. The Worker binding must be provisioned and independently verified before release.

An authorized editorial operator updates only the private index `sigil-now/v1/index.json`. The manifest schema is:

```json
{"schema":"sigil_now_v1","items":[{"id":"example-slug","title":"Editorial title","summary":"Short summary","published":false,"published_at":"2026-11-25T00:00:00Z","cover_extension":"webp","image_alt":"Editorial photograph"}]}
```

Use unique lowercase slugs with hyphens. Upload an approved opaque cover at `sigil-now/v1/covers/<id>.<extension>` first; supported types are JPEG (`jpg`), PNG and WebP, maximum 5 MiB, with matching HTTP content-type. Use a fresh manifest read before replacement; changing publish state or deleting the row withdraws it. Never publish the same private image via the public collection, an unrestricted asset URL or a static frontend bundle.

## Release checks

1. Test public feed stays separate, private list and covers require canonical access, and withdrawn and unauthorized covers return no media.
2. Confirm production remains service-bound behind the current member front gate; no new zone route is needed.
3. Verify the binding, private bucket domain settings and object metadata. Deploy only through the reviewed, currently active member-pages release mechanism, preserving any live delta and current bindings; do not replace the running Worker with stale repository contents.
4. Verify unauthenticated and active Public access cannot retrieve private cards or cover images; verify a legitimate active Private session can retrieve the intended feed and cover and that MY SĪGIL shows the new heading. Verify unrelated member flows and account switches before declaring production acceptance.
