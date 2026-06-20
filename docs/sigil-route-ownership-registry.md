# MMD SIGIL Route Ownership Registry

Status: audit registry, no route changes.
Last audited: 2026-06-21 Asia/Bangkok.
Branch: `codex/sigil-route-ownership-registry`.

This file is the canonical place to check route/page ownership before redesign,
worker patch, decommission, recovery, or migration work. It records what the
repository and a read-only production probe currently show; it does not change
runtime behavior.

## Audit Rules

- No deploy.
- No route changes.
- No UI redesign.
- No worker rewrite.
- No decommission.
- No secret changes.
- No payment renewal changes.
- No HYPE changes.
- No `/member/dashboard` behavior changes.

## Owner Vocabulary

| Owner | Meaning |
| --- | --- |
| Webflow | Webflow/public site is the content source of truth. Workers may front-gate, redirect, or pass through. |
| `mmd-redirect-worker` | Front gate, canonical host/path redirector, temporary shell renderer, or pass-through guard. |
| `member-pages-worker` | Lightweight member page renderer currently used for `/member/membership`. |
| `immigrate-worker` | Migration/member/admin bridge worker; owns current member dashboard and SIGIL admin login/control-room logic. |
| `member-dashboard-chat-worker` | Legacy/tmp dashboard-chat implementation; not canonical unless explicitly re-promoted. |
| `admin-worker` | Admin/API facade for payment proofs, pricing review, model/session/member operational APIs. |
| legacy/migration only | Historical code, tmp snapshots, or migration support. Not a design source of truth. |
| unknown / needs decision | Evidence conflicts or no explicit owner exists yet. Freeze redesign until decided. |

## Evidence Read

Repository evidence:

- `mmd-redirect-worker/wrangler.toml` routes `mmdbkk.com/*` and `www.mmdbkk.com/*`, plus exact `/member/dashboard`, `/member/membership`, and `/sigil/admin*` catches.
- `mmd-redirect-worker/src/index.js` sends `/member/dashboard` to `IMMIGRATE_WORKER`, `/member/membership` to `MEMBER_PAGES_WORKER`, `/member/payments` to `ADMIN_WORKER`, renders temporary shells for unknown `/member/*`, redirects `/inme` to `/trust/inme`, and passes `/sigil/*` through.
- `member-pages-worker/src/index.js` renders only `/member/membership` and returns 404 for `/member/dashboard`.
- `immigrate-worker/src/index.ts` still contains legacy/current renderers for `/member/dashboard`, `/member/membership`, and SIGIL admin login/control-room paths.
- `admin-worker/index.js` owns admin APIs such as `/v1/admin/payment/proof` and pricing review APIs.
- `webflow/sigil/access/*`, `webflow/sigil/private-models/*`, and Webflow production probes show Webflow-owned SIGIL content surfaces.
- `tmp/cloudflare-member-dashboard-chat-worker` is not present on `origin/main`; references to dashboard-chat behavior should be treated as legacy/migration unless a later branch explicitly promotes it.

Read-only production probe:

- `HEAD /member/dashboard?t=rt&code=c&promo=p` returned 200 HTML, no redirect, no-store.
- `GET /member/dashboard?...` matched `Member Home / Status Hub` and `data-mmd-member-dashboard`.
- `GET /member/membership?...` matched `MMD Prive | Membership`, package content, and preserved `t/code/promo` in `/member/dashboard` and `/pay/membership` links.
- `GET /member/profile`, `/member/login`, `/member/upgrade`, `/member/points`, and `/member/sessions` matched the temporary `MMD Prive | Member` shell.
- `HEAD /member/payments?...` returned 401 JSON.
- `HEAD /pay/renewal?...` and `/sigil/pay/renewal?...` returned 200 HTML, no-store.
- `HEAD /trust/inme?...` returned 302 to `/sigil/pay/renewal?...`, preserving `t/code/promo`.
- `HEAD /inme?...` returned 301 to `/trust/inme?...`, preserving `t/code/promo`.
- `HEAD /sigil/admin/login?...` returned 200 HTML, no-store.
- `HEAD /sigil/member-intelligence/test?...` returned 404 HTML.
- `GET /sigil/access?...` and `/sigil/blackcard?...` matched Webflow markers.
- `HEAD https://sigil.mmdbkk.com/api/pay/renewal/proof?...` returned 404 JSON.
- `HEAD /pay/renewal/review?...` returned 404 JSON.

## Customer / Member Routes

| Route | Canonical owner | Current production behavior | Future owner | Action status |
| --- | --- | --- | --- | --- |
| `/` | Webflow | 200 HTML on `mmdbkk.com`; front gate route exists globally, but content appears public/Webflow-origin. Query preservation not route-critical. Customer-facing. | Keep Webflow/public origin. | locked |
| `/member/login` | `mmd-redirect-worker` temporary shell | 200 HTML temporary member shell, no redirect, `t/code/promo` preserved in shell links. Customer-facing but not true auth. | Needs decision: either Webflow login/start page or real member auth worker. | needs source recovery |
| `/member/dashboard` | `immigrate-worker` | `mmd-redirect-worker` delegates to `IMMIGRATE_WORKER`; 200 HTML `Member Home / Status Hub`; no redirect; `t/code/promo` preserved. Customer-facing. | Keep current owner until explicit migration. | locked, do not touch |
| `/member/profile` | `mmd-redirect-worker` temporary shell | 200 temporary member shell; no redirect; query preserved in shell links. Customer-facing placeholder. | Move to new member worker or admin/member facade after product decision. | needs source recovery |
| `/member/membership` | `member-pages-worker` today; intended owner needs decision | `mmd-redirect-worker` delegates to `MEMBER_PAGES_WORKER`; 200 membership packages page; no redirect; `t/code/promo` preserved in dashboard/payment links. Customer-facing. | Unknown / needs decision: keep `member-pages-worker` temporarily or move to Webflow if Webflow is declared canonical. | needs route fix only after decision |
| `/member/upgrade` | `mmd-redirect-worker` temporary shell | 200 temporary member shell; no redirect; query preserved in shell links. Customer-facing placeholder. | Move to new member worker or Webflow/member page source after decision. | needs source recovery |
| `/member/points` | `mmd-redirect-worker` temporary shell | 200 temporary member shell; no redirect; query preserved in shell links. Customer-facing placeholder. | Move to new member worker or member API/page source after decision. | needs source recovery |
| `/member/payments` | `admin-worker` | `mmd-redirect-worker` delegates to `ADMIN_WORKER`; production probe returned 401 JSON for unauthenticated HEAD; route is protected/member-private, query reaches worker. | Keep admin/member facade until a dedicated member worker exists. | locked |
| `/member/sessions` | `mmd-redirect-worker` temporary shell | 200 temporary member shell; no redirect; query preserved in shell links. Customer-facing placeholder. | Move to new member worker or session/member facade after decision. | needs source recovery |
| `/pay/renewal` | Webflow/payment renewal page with backend worker APIs | 200 renewal payment HTML, no redirect, no-store; `t/code/promo` accepted/preserved at page URL. Customer-facing payment renewal. | Keep current payment renewal owner; do not touch under this registry task. | do not touch |
| `/trust/inme` | Webflow/public trust entry, currently redirects to renewal flow | Production returns 302 to `/sigil/pay/renewal` with `t/code/promo` preserved. Customer-facing front door, but currently routes into renewal payment. | Needs product decision: restore/keep trust-entry behavior vs renewal redirect. | needs route fix / needs page decision |
| `/inme` | `mmd-redirect-worker` legacy redirect | 301 to `/trust/inme` with `t/code/promo` preserved. Customer-facing alias. | Keep redirect alias once `/trust/inme` owner is confirmed. | locked |

## SIGIL / Private / Admin Routes

| Route | Canonical owner | Current production behavior | Future owner | Action status |
| --- | --- | --- | --- | --- |
| `/sigil/admin/*` | `immigrate-worker` for browser gate/admin bridge; `admin-worker` for underlying admin APIs | `mmd-redirect-worker` catches `/sigil/admin*` only to pass through; `/sigil/admin/login` returns 200 HTML no-store from SIGIL admin login. Admin/private. | Keep current SIGIL admin bridge until Admin Console ownership is redesigned explicitly. | locked |
| `/sigil/member-intelligence/*` | unknown / needs decision | Production probe for `/sigil/member-intelligence/test` returned 404 HTML. No clear route owner on `origin/main`. Private/admin-adjacent. | Move to new worker or Admin Console module only after route spec exists. | needs source recovery |
| `/sigil/access/*` | Webflow | Webflow files exist under `webflow/sigil/access/*`; production `/sigil/access` returns Webflow-marked HTML. Private/SIGIL-facing content surface. | Keep Webflow as content source unless auth-gating requirements require a worker wrapper. | locked |
| `/sigil/blackcard/*` | Webflow | Production `/sigil/blackcard` returns Webflow-marked Blackcard HTML. Private/SIGIL-facing content surface. | Keep Webflow as content source unless Black Card gating moves to a worker. | locked |
| `sigil.mmdbkk.com/api/pay/renewal/proof` | unknown / needs decision | Production probe returned 404 JSON. `admin-worker` has `POST /v1/admin/payment/proof`; no matching public SIGIL proof API found on `origin/main`. Private/system endpoint. | Route alias should be specified before implementation; likely admin-worker or a dedicated payment-proof facade. | needs route fix / needs source recovery |
| `/pay/renewal/review` | unknown / needs decision | Production probe returned 404 JSON. No canonical page/API route found on `origin/main`. Admin/private review surface. | If needed, move to Admin Console/admin-worker or explicit private Webflow page with auth gate. | needs source recovery |

## Special Decision: `/member/membership`

### Is `/member/membership` intended to be Webflow-owned?

Not confirmed by the current repository state. On `origin/main`, the explicit
production route is:

```txt
mmd-redirect-worker /member/membership
  -> MEMBER_PAGES_WORKER service binding
  -> member-pages-worker/src/index.js
```

The live production probe also matches the package content rendered by
`member-pages-worker`, including `Standard`, `Premium`, `VIP`, `BLACK CARD NOTE`,
and preserved `t/code/promo` links.

Therefore the registry does not mark Webflow as the confirmed owner yet. It
marks the future owner as `unknown / needs decision`.

### Is `member-pages-worker` only a temporary renderer?

Likely yes, but not formally locked by a registry before this file. Evidence:

- It only renders `/member/membership`.
- It is a lightweight HTML renderer, not a broad member system.
- `immigrate-worker` still contains a legacy membership renderer.
- Webflow content exists for nearby SIGIL/public surfaces, but not as a confirmed
  canonical `/member/membership` source in this repo.

Treat `member-pages-worker` as the current production owner and probable
temporary renderer until Per/product explicitly confirms Webflow or another
member layer as canonical.

### Should future design edits happen in Webflow or in a Worker source file?

Do not edit either until the owner decision is made.

- If the decision is Webflow-owned, future design edits happen in Webflow, and
  `member-pages-worker` becomes rollback/legacy only.
- If the decision is worker-owned, future design edits happen in
  `member-pages-worker/src/index.js` or its replacement worker, not Webflow.

### What exact route change is needed, if any?

No route change should be made as part of this registry PR.

If Per confirms Webflow as canonical, the route fix should be:

1. In `mmd-redirect-worker/src/index.js`, stop calling `fetchMemberPage()` for
   `isMemberMembershipPath(url)`.
2. Replace that behavior with Webflow-origin pass-through/fetch while preserving
   the incoming path and query string.
3. Keep `/member/dashboard` delegated to `IMMIGRATE_WORKER` exactly as today.
4. Keep `member-pages-worker` deployed as rollback/legacy until cleanup is
   explicitly approved.
5. Update regression tests to prove `/member/membership` no longer hits
   `MEMBER_PAGES_WORKER`, preserves `t/code/promo`, and does not redirect to
   `/pay/membership`, `/trust/inme`, or legacy pages.

If Per confirms `member-pages-worker` as canonical, no route change is needed;
the page source should be worker-owned and Webflow edits should not be treated
as production edits for `/member/membership`.

## Temporary / Legacy Sources

| Source | Registry status | Notes |
| --- | --- | --- |
| `immigrate-worker` membership renderer | legacy/migration only for `/member/membership` while front gate points at `member-pages-worker` | Do not redesign here unless route ownership changes back. |
| `member-dashboard-chat-worker` / tmp Cloudflare snapshots | legacy/migration only | Not present as canonical source on `origin/main`; do not base new route decisions on snapshots. |
| `mmd-redirect-worker` unknown member shells | temporary recovery only | Useful for safe 200s, but not a design source of truth. |
| Legacy migration scripts/docs | legacy/migration only | Evidence for history, not production owner. |

## PR Summary Table

| Area | Locked now | Needs decision | Do not touch |
| --- | --- | --- | --- |
| Member dashboard | `/member/dashboard` -> `immigrate-worker` | none for this task | behavior unchanged |
| Member membership | current owner `member-pages-worker` | Webflow vs worker canonical source | no route change in this PR |
| Member placeholders | none | `/member/login`, `/member/profile`, `/member/upgrade`, `/member/points`, `/member/sessions` | no redesign in this PR |
| Payment renewal | current renewal page/API behavior | none in this task | `/pay/renewal`, payment renewal work |
| Trust entry | `/inme` alias redirects | `/trust/inme` currently redirects to renewal; product decision needed | no route change in this PR |
| SIGIL admin/private | `/sigil/admin/*`, `/sigil/access/*`, `/sigil/blackcard/*` | `/sigil/member-intelligence/*`, proof/review aliases | no decommission in this PR |
