# Front-Gate Temporary Page Migration Plan

## Context

`mmd-redirect-worker` currently protects several production routes with polished
temporary HTML pages:

- `/hall`
- unknown `/member/*`, including `/member/kenji-20-ai`
- `/model/console`

These pages should remain in place until each route has a canonical page owner.
The redirect worker should stay a front gate: route protection, canonicalization,
safe pass-through, and emergency shells only.

`immigrate-worker` is deprecated migration-only legacy. Do not add new member,
hall, or model console pages there.

## Discovery Summary

Candidate owners found:

- `admin-worker/src/memberDashboard.js`
  - Owns the current member dashboard/payment facade and renderer.
  - Handles `/member/dashboard`, `/member/payments`, `/api/member/dashboard`,
    `/api/member/dashboard/view`, `/api/member/payments/summary`, and
    `/api/member/kenji/chat`.
- `member-dashboard-chat-worker/wrangler.toml`
  - Historical deployed bundle for member APIs and public/member-adjacent routes,
    backed by `tmp/cloudflare-member-dashboard-chat-worker/index.js`.
  - Useful as evidence of route patterns, but not a clean canonical source for
    new page ownership.
- `sigil-worker/src/index.ts`
  - Owns SIGIL namespace migration/proxy behavior and first-wave model/apply
    routes.
  - Current model-console smoke tests treat `/sigil/model/console` as canonical
    under `sigil-worker`.
- `webflow/model-console/*`
  - Existing model-console page package for `/sigil/model/console`.
  - JS reads `t` from query params and calls `admin-worker` model session APIs.
- `admin-worker/src/index.js`
  - Owns `/v1/model/session/*` facade routes used by the model console frontend.
- `docs/architecture/ROUTES_AND_SURFACES.md`
  - Defines client-facing, model-facing, and public experience surface doctrine.

No clear existing `mmd-pages-worker`, static page worker, or Cloudflare Pages
project was found in the repo scan.

## Recommended Canonical Owners

### `/hall`

Recommended owner: future `mmd-pages-worker` or Cloudflare Pages/Webflow public
experience route.

Reasoning:

- `/hall` is a public/member-adjacent experience surface, not an admin,
  migration, or system route.
- `/hall` is the MMD Privé Public Hall: a browse-first, access-later public
  surface for understanding the MMD Privé world before private entry.
- The old MMD Hall member gateway copy and its member dashboard/payment shortcut
  renderer have been removed from `mmd-redirect-worker`.

Current state:

- `mmd-redirect-worker` owns the safe Public Hall response for `/hall`.
- Member status remains `/member/dashboard`.
- Payment and confirmation flows remain `/member/payments` or
  `/confirm/payment-confirmation` depending on the flow.
- Trust entry remains `/trust/inme`.

### Unknown `/member/*`

Recommended owner: `admin-worker` member facade for authenticated/member-linked
surfaces, plus a future page owner for static member content.

Reasoning:

- `admin-worker/src/memberDashboard.js` already owns the member dashboard,
  payments page, payments summary, and Kenji chat facade.
- Unknown static member slugs such as `/member/kenji-20-ai` are not currently
  canonical admin pages, but they are member-facing and should not live in
  `immigrate-worker`.
- A first step can route known authenticated member surfaces through
  `admin-worker`; static/non-auth member pages should move to a lightweight
  page owner when one exists.

Temporary state:

- Keep unknown `/member/*` emergency pages in `mmd-redirect-worker` until each
  slug is classified as either an admin-worker member facade route or a static
  page route.

### `/model/console`

Recommended owner: `sigil-worker` alias to canonical `/sigil/model/console`,
or Webflow route backed by the existing `webflow/model-console/*` package.

Reasoning:

- Existing model-console assets and notes define `/sigil/model/console` as the
  model lane page.
- `sigil-worker` smoke tests call `/sigil/model/console` canonical and assert
  `x-mmd-sigil-owner: sigil-worker`.
- The frontend calls `admin-worker` model session APIs under `/v1/model/session/*`.

Temporary state:

- Keep `/model/console` in `mmd-redirect-worker` until a safe alias/route plan
  maps it to `/sigil/model/console` without losing query params.

## Proposed Phases

1. Route inventory PR
   - Add a small route ownership table for `/hall`, `/member/*`, and
     `/model/console`.
   - Confirm whether `/model/console` should remain a public alias or redirect
     to `/sigil/model/console`.
   - Confirm whether `/member/kenji-20-ai` is authenticated member content,
     public member marketing, or Webflow/static content.

2. Model console ownership PR
   - Move `/model/console` handling out of the front gate by adding a safe alias
     to the existing canonical model console owner.
   - Preserve all query params, including `t`.
   - Keep `mmd-redirect-worker` protection until production headers prove the
     canonical owner is serving the route.

3. Member static classification PR
   - Add an explicit allowlist/registry for known member slugs and owners.
   - Route authenticated/dashboard-like member surfaces to `admin-worker`.
   - Leave unknown slugs protected by the front gate until a static page owner
     exists.

4. Hall canonical page PR
   - Keep `/hall` as the Public Hall surface.
   - Do not restore the old member gateway copy or dashboard/payment shortcut
     shell.
   - If `/hall` later moves to Webflow/Pages, keep the same Public Hall identity
     and preserve `/member/dashboard`, `/member/payments`, and `/trust/inme`
     as separate lanes.

## Risks

- Moving `/model/console` too quickly could break signed model session links if
  query params are not preserved exactly.
- Treating unknown `/member/*` as one category may mix authenticated member
  surfaces with public/static content.
- Moving `/hall` into `admin-worker` would blur public experience and admin/member
  facade ownership.
- Removing front-gate shells before production route bindings are verified can
  reintroduce black-screen failures.

## Smallest Safe First PR

Create a route ownership registry/documentation PR only:

- document owners for `/hall`, `/member/*`, and `/model/console`;
- add no runtime route changes;
- leave `mmd-redirect-worker` shells active;
- do not touch `immigrate-worker`;
- use only `t` and preserve query params in all future route moves.
