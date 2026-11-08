# Admin Console rebuild — 8 November 2026

## Scope

The owner requested a full code rebuild of `/internal/admin/console`. The old
Webflow page showed fixed task counts, invented payment totals, placeholder
records, stale `/sigil/internal/admin/*` links, and browser-only “done” toggles.

This change replaces that one page with a Worker-owned, authenticated workspace
for viewing jobs and opening the existing operational tools. The canonical owner
map stays `/internal/admin/control-room`; existing jobs, payment, customer,
membership and recovery tools keep their responsibilities.

Implementation is complete for review when the linked PR checks pass. This
document does not establish a production deployment or permission to deploy.

## Presentation and data

- Compact Thai-first layout uses the approved SĪGIL System vector, LINE Seed
  Sans TH, white surfaces and soft orange actions. No poster hero or demo data.
- Desktop and mobile show the same job records, filters and links.
- The 130 stable Thai copy keys are mirrored in `MMD-Prive/mmd-i18n#54`.
  Its base dictionary, Console extension and existing v2.1 runtime are pinned
  to commit `9bca16e2bcd82eb9ba2f39001fdf8b3197f8edd7` with verified SRI.
  Deferred canonical scripts retain their order; the independent client can
  read jobs immediately using its Thai fallback if those assets are delayed.
- The only browser data read is the existing credential-bound
  `GET /v1/admin/dashboard?view=jobs` endpoint.
- Global job counts are explicitly distinct from the filtered result total.
- Dates use `Asia/Bangkok`; the date filter, search and canonical job/customer
  scope survive pagination and login.
- Optional `q` searches names saved in the Job/Session, Job IDs and Session IDs
  across the projected record set before pagination. It is never interpolated
  into an Airtable formula. A saved customer name is not proof of current
  canonical Per Rename; the customer tool remains the identity destination.
- Missing finance values stay unknown. An explicit zero remains a real zero.
  Recorded prices and payment status are shown without treating a price as
  verified cash, and without synthesizing a revenue total.
- Loading, empty, unavailable, malformed and expired-session states remain
  distinct. Failed reads never become a zero count or a successful completion.

## Boundary and login

The active entrypoint is `admin-worker/src/admin-login-hero-worker.js`. It handles
only the exact normalized Console pathname and uses the existing credential-bound
admin gate. MMS partner scope remains excluded. The page supports GET and HEAD;
mutation methods are rejected. No API credentials are exposed in the page.

The Console branch returns before generic background LINE contact backfill
scheduling. Its page render has no upstream data reads or side effects. The
existing jobs-view GET/HEAD also skips that scheduler, so opening this workspace
and loading its first result cannot initiate a background identity write.

The existing next-destination allowlist includes this exact path. Successful
owner login resumes this Console task, while unrelated destinations retain the
existing dashboard-first behavior and Refund Ops retains its existing exception.

The page includes its scoped theme once. The shared decorator recognizes the
existing theme marker, preserving one navigation and one set of page controls.
The inline client is self-contained under the deployment bundler, including
esbuild's name helper when function source is serialized into the browser.

## Route and release contract

Both Wrangler and the explicit route-sync list include:

```text
mmdbkk.com/internal/admin/console*
www.mmdbkk.com/internal/admin/console*
```

The suffix supports Cloudflare query-string matching; it does not widen the page
handler to neighboring paths. Existing deployment SHA/owner/environment approval
gates remain in place. No workflow is dispatched by this change.

Before production release, compare the admin-worker version currently deployed
with the approved source SHA and review all intervening runtime changes. A full
admin-worker deployment also carries that Worker's existing scheduled behavior;
Console approval alone must not be treated as approval for unrelated changes.

## Verification

Run the focused Admin Console CI workflow. It verifies credential gating on apex
and www, signed-out/forged/partner requests, login return, GET/HEAD behavior,
non-mutating render, existing job projection/search, browser state and safe
links. Browser inspection uses deterministic synthetic job records, never live
customer sessions or payment mutations.

Real Chromium checks cover 320, 390, 768 and 1440px layouts with the actual
nonce-based CSP, pinned canonical language scripts and LINE Seed font files.
The checks exercise server search, canonical job navigation, unavailable/retry
and expired-session states, plus text enlarged to 200%. They verify no horizontal
page overflow or unexpected script/network requests. API failure checks explicitly
allow their deliberately injected 503 and 401 responses.

Manual production acceptance after an approved release:

1. Open Console signed out and confirm login returns to the selected Console
   filter. A signed-out HEAD must fail closed.
2. With an owner session, confirm the page marker is `rebuild-v1`, the favicon
   is the canonical SĪGIL icon, and the jobs response is authenticated JSON.
3. Confirm a real known job/customer scope and search result against the existing
   Jobs tool. Verify prices and missing values without changing a record.
4. Check mobile filters, pagination, tool navigation and session-expired recovery.
5. Roll back the approved Worker version if page/auth/data behavior regresses;
   remove only the two new Console route bindings if restoring Webflow ownership
   is explicitly required. Never broaden or replace other route owners.
