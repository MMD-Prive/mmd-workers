# MMD Studio Webflow Embed Source

Canonical source for the Studio Webflow page-level embeds.

Production page IDs:

- `/studio` — `6a6e22f9f96d8a3a8fd56969`
- `/internal/admin/studio/upload` — `6a1be738a8018a51046e5335`
- `/internal/admin/studio/review` — `6a189ff7358e501d524bcce8`
- `/internal/admin/studio/model-preview` — `6a137a1836f0137aa0e08da9`

These snippets are source only until Boss Per approves Webflow publish.
They must not redesign the pages or expose admin credentials.

Studio uploads use private R2 staging assets through `/studio/api/upload`.
The browser receives only opaque `asset_id` values and must never receive R2 bucket
names, object keys, direct object links, or temporary signed object links.

`STUDIO_ASSET_SIGNING_SECRET` is required in Cloudflare before deploy. It must be
set with the approved Cloudflare secret mechanism only; do not place a value in
GitHub, Webflow, URLs, logs, or source files.

R2 lifecycle cleanup for `studio-staging/assets/` is a separate infrastructure
step and is not mutated by this source patch. Recommended staging retention is
30 days.
