# Studio mobile edition 3

Rebuild the four existing Studio presentation pages with a compact mobile layout, a new launchpad, clearer section hierarchy, paired measurement fields, and isolated primary submit actions. Desktop retains the two-column working view with a sticky photo preview. The existing v2 record-backed controller and card renderer remain the runtime contract.

## Validation

- 38 Studio backend/renderer tests pass.
- Four integrated Chromium tests pass with real LINE Seed Thai fonts and synthetic fixtures, including upload, review, PNG export, failed commits, recovery and source replacement.
- Existing responsive assertions pass at 360, 390, 768 and 1440 px: no horizontal overflow, text contrast at least 4.5:1, tap targets at least 44 px and visible keyboard focus.
- Visually reviewed the 390 px home screenshot.
- Four Webflow head blocks and primary embeds read back exactly against the built package; active embeds are visible.

## Release state

Webflow drafts updated only; not published. No production data was written. Live authenticated production acceptance remains pending publication. API flow_version stays 2; presentation data-design-version is 3.

Rebuild using `node scripts/build-studio-flow-v2.mjs /tmp/studio-mobile-v3-package`. This presentation update does not require new API behavior. Keep the existing backend authentication and publication boundaries.
