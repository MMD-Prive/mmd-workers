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

See `IMMIGRATE_WORKER_DECOMMISSION_PLAN.md` for the phased freeze, route
inventory, and owner map for draining `immigrate-worker`.

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

## Migration Priority

Priority 1: `/member/*`

Priority 2: `/model/console`

Priority 3: `/hall`

`/member/*` is first because it affects customer and member access directly.
The member route family includes dashboard, membership, payment, profile,
sessions, points, upgrade, and member-only pages. These routes are more
business-critical than `/hall`, which is a public/member-adjacent discovery
surface.

## Recommended Canonical Owners

### `/member/*`

Recommended owner: `admin-worker` member facade for authenticated/member-linked
surfaces, plus a future page owner for static member content.

Reasoning:

- `admin-worker/src/memberDashboard.js` already owns the member dashboard,
  payments page, payments summary, and Kenji chat facade.
- Member system pages are tied to customer access, payment state, session
  continuity, and upgrade flows. They should move out of front-gate temporary
  rendering first.
- Member static/content pages such as `/member/kenji-20-ai` are not currently
  canonical admin pages, but they are member-facing and should not permanently
  live in `mmd-redirect-worker` or `immigrate-worker`.

Member route categories:

#### A. Member system pages

- `/member/dashboard`
- `/member/membership`
- `/member/payments`
- `/member/profile`
- `/member/sessions`
- `/member/points`
- `/member/upgrade`

These should be owned by the canonical member system owner, likely
`admin-worker` or an existing member app/facade if confirmed.

#### B. Member static/content pages

- `/member/kenji-20-ai`
- unknown member content pages
- future member-only narrative/static pages

These need a canonical content/page owner decision, such as:

- future `member-pages-worker`
- future `mmd-pages-worker`
- Cloudflare Pages/Webflow route
- content registry backed by a worker

Temporary state:

- Keep unknown `/member/*` emergency pages in `mmd-redirect-worker` until each
  slug is classified as either an admin-worker member facade route or a static
  page route.
- `mmd-redirect-worker` should remain only the front gate and emergency fallback.
  It should not permanently render user-visible `/member/*` pages.

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

### `/hall`

Recommended owner: future `mmd-pages-worker` or Cloudflare Pages/Webflow public
experience route.

Reasoning:

- `/hall` is a public/member-adjacent experience surface, not an admin,
  migration, or system route.
- Existing chat knowledge confirms `/hall` as the MMD Hall public browsing
  interest route.
- No current worker has a clean canonical Hall page renderer.

Temporary state:

- Keep the `mmd-redirect-worker` shell until a public page owner exists.

## Proposed Phases

1. Member system ownership PR
   - Decide canonical owner for known member system routes.
   - Route confirmed member system pages out of front-gate temporary shells.
   - Keep unknown member static/content pages on the polished temporary shell
     until a content owner exists.
   - Preserve all query params, especially canonical `t`.
   - Never introduce `token`.
   - Add tests for routing ownership and fallback behavior.
   - Do not touch `/hall` or `/model/console` in the first implementation PR.

2. Member static/content decision PR
   - Decide whether member static/content pages live in `admin-worker`, a new
     `member-pages-worker`, a new `mmd-pages-worker`, Cloudflare Pages/Webflow,
     or a content registry backed by a worker.
   - Classify `/member/kenji-20-ai` and future member-only narrative/static
     pages before moving them out of the emergency shell.

3. Model console ownership PR
   - Move `/model/console` handling out of the front gate by adding a safe alias
     to the existing canonical model console owner.
   - Preserve all query params, including `t`.
   - Keep `mmd-redirect-worker` protection until production headers prove the
     canonical owner is serving the route.

4. Hall canonical page PR
   - Create or wire the smallest public page owner for `/hall`.
   - Prefer existing Webflow/Pages/static deployment patterns if confirmed.
   - Only after production verification, remove the `/hall` emergency shell from
     `mmd-redirect-worker`.

## Risks

- Moving `/model/console` too quickly could break signed model session links if
  query params are not preserved exactly.
- Treating `/member/*` as one category may mix authenticated member system
  surfaces with member static/content pages.
- Leaving member system pages in temporary front-gate shells too long can
  affect customer access, payment continuity, session visibility, points, and
  upgrade flows.
- Moving `/hall` into `admin-worker` would blur public experience and admin/member
  facade ownership.
- Removing front-gate shells before production route bindings are verified can
  reintroduce black-screen failures.

## Recommended Smallest Safe First Implementation PR

Title: `Route canonical member pages out of front-gate temporary shell`

Scope:

- Decide canonical owner for known member system routes.
- Keep unknown member static/content pages on polished temporary shell until a
  content owner exists.
- Preserve query params, especially canonical `t`.
- Never introduce `token`.
- Add tests for routing ownership and fallback behavior.
- Do not touch `/hall` or `/model/console` in the first implementation PR.

## Open Decision

Should member static/content pages live in:

- `admin-worker`
- new `member-pages-worker`
- new `mmd-pages-worker`
- Cloudflare Pages/Webflow
- a content registry

Until this decision is made, `mmd-redirect-worker` should keep emergency
fallback shells for unknown member content routes, but it should not become the
permanent user-visible page renderer.
