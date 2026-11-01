# Canonical Booking Release review

Prepared 2026-10-23 for Draft PR review. Push and Draft PR creation are authorized; merge, deployment, publish, and route mutation are not authorized.

## Baseline

- Candidate source base: `d5e38228a055c3a83e2500ea8b9983aee5d2903e` (mmd-workers/main).
- Last live readback in this conversation (2026-10-23 21:57 Asia/Bangkok): proxy version `68b5971d-d137-4451-84d3-41732a805275`, 100% traffic, deployment `066bfd76-9014-48bd-b743-bcabe165d41c`.
- Production served `https://mmdprive.webflow.io/sigil/booking`, runtime marker `20260702-sigil-booking-canonical-proxy`.
- Release receipt: `cade4b57-7bc6-4fba-9ee2-3325c4d8bc05`, commit `af3e3d2367bd0bd34a4894c3cd3d42686aa5f594`, success 2026-10-23 21:01:41 Asia/Bangkok.
- Release HTML references `/sigil-booking-release/assets/index-DIROw3nX.js` and `index-DkECae4A.css`. These same-origin paths need the asset route already declared in source but absent from the last live inventory.

## Candidate

Existing opt-in selects `/sigil-booking-release`; false/unset retains the legacy page. Config stays false in this patch. Asset paths remain under the existing release mount; no HTML or JavaScript URL rewriting is introduced. Static extensions are allowed, application paths and source maps are not. Assets stream through with range/revalidation support; cookies and authorization are not forwarded. Redirects and HTML fallback fail closed. Runtime marker identifies this candidate.

The Webflow Release mount is mutable, not an immutable commit pin. Recheck its deployment/commit and asset list immediately before any future rollout. If it changes, review again. This patch does not resolve historical source-to-production-version provenance.

## Approval and rollout plan (not executed)

1. Review candidate diff/tests. Refresh main, active proxy version/allocation, exact routes, Release receipt and assets. Stop on unexplained drift. Capture sanitized baseline binding/settings metadata and a usable rollback version; never record secret values.
2. Obtain explicit approval for the exact candidate artifact, preserved bindings/settings, activation flag, and the **additional** route `sigil.mmdbkk.com/sigil-booking-release/*`. Existing booking routes and API ownership remain unchanged. Do not run a blanket deploy that silently applies all repository config.
3. Under that approval, release the proxy with the flag OFF, retaining existing runtime bindings/secrets/settings. Verify legacy HTML and redirects. Record new version and traffic.
4. Add the approved asset route and enable the flag under the same explicit rollout scope. Record any versions created by configuration changes. Test canonical page + referenced JS/CSS/images, content types, query preservation, Public/Private gates, confirmation empty state and 390px/desktop rendering. Block booking intake during browser checks; do not create a booking.
5. Compare canonical assets with Release bytes, and separately record Cloudflare version/traffic and Webflow deployment SHA. A passing unit test or HTTP 200 alone is not production acceptance.

## Rollback plan (requires rollout/rollback approval)

- Trigger: blank page, asset/MIME failures, unintended redirects, auth boundary regression, unexpected upstream/Release SHA, or failed focused smoke.
- First disable `SIGIL_BOOKING_CLOUD_RELEASE_ENABLED`; verify canonical source returns to `webflow-live` and legacy `/sigil/booking` while preserving query handling. Asset requests fail closed with the flag off.
- If candidate runtime itself fails, restore the freshly captured prior known-good version at 100% traffic (last observed version above is a reference, not a substitute for rollout-time refresh).
- Restore the asset route to its captured pre-rollout state only under explicit route rollback approval. Worker version rollback does not itself restore route ownership/settings. Verify all three booking host patterns and legacy source readback.
- Do not roll back Webflow globally or change API Workers, data, secrets, or booking records. Record versions, allocation, route readback, and failure evidence without sensitive values.

## Validation

Focused Node tests: 11/11; syntax check and diff whitespace check passed. Tests cover legacy default, explicit Release flag, safe redirects, write rejection, static path scope, 206 byte ranges, 304 revalidation, credential isolation, and HTML/redirect rejection. These are mocked tests, not production deployment evidence.
