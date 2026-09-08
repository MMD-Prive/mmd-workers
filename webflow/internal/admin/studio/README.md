# MMD Studio — Webflow Closeout Contract

Canonical Studio flow:

1. Upload → `/internal/admin/studio/upload`
2. Review → `/internal/admin/studio/review`
3. Final Preview → `/internal/admin/studio/model-preview`

Studio has no Publish step. Boss/backend review and production publication happen after Studio.

## Closeout lock — 2026-09-08

- `/internal/admin/studio` is a three-step launchpad only.
- The legacy site-wide `Send to Preview` injection is retired. Review reaches Final Preview only through the canonical decision-driven handoff.
- The Review top navigation must not provide an independent Preview bypass.
- Studio controls use the SF-first stack after global internal-admin CSS:
  `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `SF Pro Display`, `Helvetica Neue`, `Noto Sans Thai`, `Noto Sans`, `Arial`, `sans-serif`.
- GWs/EMs Title Bar remains editable in Upload and Review only. Final Preview consumes it as display/read-only state.
- Missing GWs/EMs Title Bar remains fail-closed in Review and Final Preview.
- Preserve `?t=...` across internal Studio navigation where present.

## Authority boundary

Webflow Studio prepares presentation state only. It must not publish production profiles, issue authentication, hold bearer tokens or confirmation keys, mutate payment or entitlement truth, or grant protected access.

GitHub remains source truth; Workers remain runtime authority; Webflow remains presentation/compatibility.

## Files

- `studio-launchpad.html` — source mirror of the canonical three-step Webflow launchpad.
- `studio-final-lock.js` — scoped runtime final lock for typography, query continuity, and Review bypass removal.
