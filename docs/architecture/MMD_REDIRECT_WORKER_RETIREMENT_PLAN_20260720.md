# MMD Redirect Worker Retirement Plan — 2026-07-20

## 1. Decision lock

`mmd-redirect-worker` is **DEPRECATED** as of 2026-07-20. New features, route ownership, inline pages, API proxy behavior, and service bindings are forbidden. Emergency production fixes are the only permitted runtime changes. Target state: **REMOVE COMPLETELY**.

Phase 1 is documentation-only. It does not prove production state and does not authorize deploy, merge, Webflow publication, Cloudflare changes, route migration, identity migration, or worker deletion.

Audit baseline: local `main` commit `616c37de2e454e354ba24ed5ab5a381dfaaaa906`. The worktree was already on dirty branch `hotfix/admin-kenji-knowledge-shell` at `fa2e954d870a851deac32eb5a65176e96c73a9b8`; it was not switched or cleaned. Newer branch evidence is called out separately. Local `main` is ahead of `origin/main` by 6 and behind by 28, so remote/prod parity is **PRODUCTION VERIFICATION REQUIRED**.

## 2. Why it is being removed

The Worker globally claims `mmdbkk.com/*` and `www.mmdbkk.com/*`, then guesses ownership through ordered handlers, service bindings, inline recovery pages, redirects, and generic origin fetches. That architecture obscures the canonical owner, makes route precedence safety-critical, forces unrelated pages and APIs through one runtime, and turns a front-gate outage or mistake into a site-wide failure.

The locked target is explicit ownership: Webflow for customer pages, the relevant Worker for each application/API namespace, Cloudflare rules for simple redirects, public unknown paths falling through normally, and JSON 404 responses from API namespace owners.

## 3. Current responsibilities

Sixteen responsibility classes were found in audited main source/config/tests:

1. Canonicalize protocol and managed hosts to `https://mmdbkk.com` for safe page requests.
2. Redirect legacy domains listed in source.
3. Apply 11 exact legacy path mappings.
4. Apply two folder/suffix redirects.
5. Normalize duplicate and trailing slashes.
6. Preserve query strings on redirects and most delegated/page links.
7. Pass unsafe methods through instead of redirecting them.
8. Render inline Black Card HTML.
9. Render inline Public Hall HTML.
10. Render inline Model Console recovery HTML.
11. Render a generic inline shell for unknown `/member/*` GET/HEAD paths.
12. Proxy member dashboard/page/API traffic through three service bindings, including an API path rewrite and query allow-list.
13. Proxy SIGIL apply page/API through `SIGIL_WORKER`.
14. Bridge LINE webhook aliases through an environment URL when configured.
15. Add universal/front-gate, route-owner, page, origin, worker, and temporary-shell headers.
16. Own two global catch-all routes and perform generic origin pass-through.

Ordering matters. LINE, private-model API, member dashboard API, and LIFF API are handled before the GET/HEAD safety gate. Unsafe methods otherwise pass through with front headers. Protected prefixes and exact paths suppress legacy redirects. Generic pass-through uses `redirect: "follow"`; service-binding requests preserve the request unless the dashboard API path/query is intentionally rewritten.

## 4. Full route ownership matrix

The machine-readable companion is [mmd-redirect-worker-route-inventory-20260720.json](./mmd-redirect-worker-route-inventory-20260720.json). It contains 38 route families and, for every row, host, methods, current owner/behavior, target owner/surface, auth, query/body handling, upstream, inline HTML, exact-route evidence, production-verification flag, blockers, risk, action, and PR phase.

Abbreviations: `PV` = production verification required (all rows: yes); `Q all` = preserve the entire query; `B` = request body must be preserved; `ER` = an exact/more-specific repository route exists. Risk is removal risk.

| # | Host / route family | Methods | Current front-gate behavior / upstream | Target owner · surface | Auth · preservation | ER | Blockers | Risk | Action / PR |
|---:|---|---|---|---|---|:---:|---|:---:|---|
| 1 | apex `/` | GET, HEAD | origin pass-through + headers | Webflow · page | none · Q all | no | G,J | P0 | prove origin fall-through / I |
| 2 | www `/*` | GET, HEAD | 301 to apex except protected paths | Cloudflare · redirect | none · Q all/order | no | G,J | P0 | host rule / G |
| 3 | legacy hosts `/*` | GET, HEAD | source-level 301 to apex | Cloudflare · redirect | none · Q all/order | no | G | P1 | verify attachment/DNS, rule / G |
| 4 | `/blackcard`, `/blackcard/black-card` | GET, HEAD | inline HTML | Webflow · page | none · Q all in links | yes | D,G,J | P0 | publish equivalent / C |
| 5 | `/hall` | GET, HEAD | inline HTML | Webflow · page | none · Q all in links | no | D,G,J | P0 | publish equivalent / C |
| 6 | `/model/console` | GET, HEAD | inline recovery | unresolved canonical console | token expected · preserve `t` + required | no | A,E,G,H | P0 | verify `/sigil/model/console` owner / D |
| 7 | Trust/login/member-start aliases | GET, HEAD | 301 `/sigil/start` | Cloudflare · redirect | none · Q all/order | no | G,J | P1 | exact rules / G |
| 8 | `/member` | GET, HEAD | 301 dashboard | Cloudflare · redirect | none · Q all/order | no | G,H | P1 | verify dashboard then rule / G |
| 9 | membership aliases | GET, HEAD | 301 member membership | Cloudflare · redirect | none · Q all/order | no | G,H | P1 | verify owner then rules / G |
| 10 | `/renew`, `/renewal` | GET, HEAD | 301 SIGIL membership | Cloudflare · redirect | none · Q all/order | no | G,H | P1 | verify destination then rules / G |
| 11 | old folder aliases | GET, HEAD | suffix redirect | Cloudflare · bulk redirect | none · Q all + suffix | no | G | P2 | verify destination / G |
| 12 | `/member/apply`, `/member/promotion` | GET, HEAD | origin pass-through + headers | Webflow · page | none · Q all | yes | G,J | P1 | verify without gate / I |
| 13 | `/member/dashboard` | GET, HEAD | `IMMIGRATE_WORKER`; workers.dev fallback | unresolved non-legacy owner | member contract unproven · Q all | yes | A,C,G,H,I | P0 | select owner/exact routes / E |
| 14 | `/api/member/dashboard` | all | rewrite to admin `/v1/member/dashboard` | admin-worker · API | contract unproven · Q allow-list; B | no | B,C,G,H | P0 | exact API route/tests / E |
| 15 | membership/profile/pay pages | GET, HEAD | `MEMBER_PAGES_WORKER`; workers.dev fallback | member-pages pending approval · page | varies · Q all | yes | B,C,G,H | P0 | approve/add exact routes / E |
| 16 | `/member/api/liff/identify` | POST, OPTIONS | `MEMBER_PAGES_WORKER` | member-pages pending identity review · API | LIFF/Memberstack review · Q all; B | no | B,C,G,H | P0 | audit; no identity migration / E |
| 17 | `/member/payments` | GET, HEAD | `ADMIN_WORKER`; workers.dev fallback | unresolved member page | member unproven · Q all | no | A,C,G,H | P0 | decide owner/exact route / E |
| 18 | points/sessions/security/unknown member | GET, HEAD | generic inline member shell | explicit owners; unknown -> public 404 | unknown · Q all in links | no | A,D,E,G,H | P0 | assign real pages/remove shell / E,H |
| 19 | renewal page families | all | main/current/config contradiction; specific chat-worker routes | member-dashboard-chat pending proof · page | renewal token · Q all; B | yes | F,G,H,J | P0 | reconcile and verify winner / F |
| 20 | `/sigil/pay/membership` | GET, HEAD | generic pass-through | Webflow or member-pages unresolved | membership · Q all | no | A,F,G,H | P0 | decide page owner / F |
| 21 | `/v1/pay/*`, `/v1/payments/*` | API-specific | generic pass-through | payments-worker · API | endpoint-specific · Q all; B | no | B,G,H,J | P0 | exact namespaces / F |
| 22 | `/sigil/start` | GET, HEAD | generic pass-through + headers | Webflow pending proof · page | optional entry token · preserve required | no | G,H,J | P0 | finish production proof / F,I |
| 23 | `/sigil/apply` | GET, HEAD | `SIGIL_WORKER`; SIGIL-host fallback | sigil-worker · page | entry context · Q all | yes | B,C,G,J | P0 | exact owner route / F |
| 24 | private-model apply API | POST, OPTIONS | `SIGIL_WORKER`; SIGIL-host fallback | sigil-worker · API | endpoint contract · Q all; B | no | B,C,G,H | P0 | exact API route/tests / F |
| 25 | `/sigil/booking*` | all | more-specific proxy route expected | booking proxy/canonical booking · page/API | booking token · Q all; B | yes | F,G,H,J | P0 | parity + precedence proof / F |
| 26 | `/sigil/model/console` | GET, HEAD | generic SIGIL pass-through | unresolved console owner | signed `t` expected · preserve required | no | A,G,H | P0 | identify owner / D |
| 27 | `/sigil/admin/*` | all | explicit front-gate route but pass-through; legacy implementation | admin-worker · page | admin · Q all; B | yes | A,F,G,H,I | P0 | migrate exact pages / B,F |
| 28 | SIGIL board families | all | pass-through; possible specific worker | canonical board owner unresolved | admin/board · Q all; B | no | F,G,H,J | P0 | reconcile registry/config/prod / F |
| 29 | `/internal/admin/*` | all | pass-through; admin/legacy overlap | admin-worker · page | admin · Q all; B | no | B,F,G,H,I,J | P0 | enumerate exact routes / B,F |
| 30 | Kenji Knowledge admin | all captured; GET/HEAD shell only | canonical `/sigil/internal/admin/kenji-knowledge`; old `/internal/admin/kenji-knowledge` retained as `temporary_compatibility_alias`; terminating wildcards cover query URLs, while exact pathname classification passes suffixes/subpaths unchanged to origin | admin-worker · page; origin for non-exact siblings | same shell; unchanged auth · Q all; suffix method/body preserved | yes | G,H | P0 | verify canonical apex/www/slash/query/auth/API/assets/logs and origin pass-through before explicit alias removal approval / B1.2 |
| 31 | `/v1/admin/*` | all | generic pass-through | admin-worker · API | endpoint-specific admin · Q all; B | no | B,G,H,J | P0 | exact API ownership / F |
| 32 | LINE webhook aliases | POST, OPTIONS, GET passthrough | env bridge; specific route only for plural path | chat worker canonical; alias unresolved · API | LINE signature · Q all; B | yes | F,G,H,J | P0 | verify signature/body/alias / F |
| 33 | Rich Menu publisher routes | POST | generic pass-through | admin-worker/internal LINE owner · API | internal/admin · Q all; B | no | B,F,G,H | P0 | enumerate exact endpoints / F |
| 34 | public-model apply | POST, OPTIONS | specific partners route should win | partners-worker · API | public controls · Q all; B | yes | G,H,J | P0 | precedence smoke / F |
| 35 | `/v1/partner/*` | all | only upload has specific route | partners-worker implemented endpoints · API | partner-specific · Q all; B | partial | B,F,G,H | P0 | route implemented endpoints only / F |
| 36 | `/v1/model/*`, model sessions | all | generic pass-through | per-endpoint admin/dedicated owner · API | model/admin · Q all; B | no | A,B,F,G,H | P0 | split exact ownership / D,F |
| 37 | unknown public path | GET, HEAD | origin pass-through + headers | Webflow/normal 404 | none · Q all | no | G,J | P0 | prove public 404 / I |
| 38 | unknown API path | all | origin pass-through + headers | namespace owner JSON 404 | namespace auth · Q all; B | no | A,B,G,J | P0 | prove JSON 404s / F,I |

## 5. Removal blocker list

The Worker **cannot be deleted now**.

- **A — no canonical owner:** model console/alias, dashboard, member payments/points/sessions/security, SIGIL board reconciliation, parts of partner/model namespaces, and unknown API namespace fall-through.
- **B — owner lacks exact route:** member-pages, admin APIs/pages, SIGIL page/API, payments namespaces, and several model/partner routes have implementations without sufficient custom-route evidence.
- **C — service-binding-only access:** dashboard, member pages/LIFF, member payments, dashboard API, and SIGIL apply/API.
- **D — front-gate-only inline content:** Black Card, Hall, and generic unknown-member shell.
- **E — recovery shell dependency:** model console and unknown member pages.
- **F — contradictory evidence:** renewal handling differs between audited main and dirty current patch; `/sigil/pay/membership`, admin, board, LINE alias, model, and route precedence have source/config/docs ambiguity.
- **G — production state unknown:** applies to all 38 families. Repository declarations do not prove the deployed route table, Rulesets, Webflow publication, DNS, or current scripts.
- **H — preservation unproven:** signed `t`, auth/session cookies, LINE signatures, API bodies, `code`, `promo`, `payment_ref`, and unknown required parameters need route-by-route proof.
- **I — legacy owner:** `immigrate-worker` currently backs dashboard and SIGIL admin-related behavior but must not receive new ownership.
- **J — more-specific interception:** catch-all behavior cannot be inferred where chat, booking, partner, or other exact routes may win in Cloudflare.

### P0 blockers

All except legacy-host/folder redirect rows are P0 because a wrong removal can replace a page with Webflow 404/405, send an API to HTML, drop a signed token/body, bypass the intended auth owner, or expose a latent route conflict. P0 does not mean an incident is confirmed; it means removal must stop until verified.

## 6. Inline page migration list

| Route | Function | Purpose/assets | Links/query | Equivalent found | Destination/action | Deletion prerequisite |
|---|---|---|---|---|---|---|
| Black Card aliases | `renderPublicBlackcardPage` | full HTML/CSS; Webflow CDN SIGIL wall and MMD logo | membership/dashboard; appends complete query | no equivalent package found in inspected Webflow tree | Webflow; recreate and publish in PR C | visual/content/query smoke on both aliases |
| `/hall` | `renderPublicHallPage` | full Public Hall HTML/CSS; Webflow CDN SIGIL wall | Trust path/membership; appends complete query | branch history suggests a Hall deployment, but audited main still renders inline and production is unknown | Webflow; use verified published page in PR C | production Webflow page and no catch-all dependency |
| `/model/console` | `renderModelConsoleRecovery` via `renderRouteRecoveryShell` | shared embedded CSS; no external assets | model session dashboard/member dashboard; appends complete query | repository has a model-console Webflow bundle in history, but no verified owner/route in audited evidence | exact alias to verified `/sigil/model/console` owner in PR D | token/query/auth parity and canonical owner route |
| unknown `/member/*` | `renderMemberStaticRecovery` via `renderRouteRecoveryShell` | generic temporary member shell/CSS | dashboard/membership; appends complete query | no valid equivalent for arbitrary member paths | assign real member pages; unknowns fall through to normal 404 | all real member pages owned; unknown behavior verified |

No Kenji Knowledge HTML exists in audited `mmd-redirect-worker/src/index.js`; PR B1 did not create or alter a front-gate fallback. The existing admin handler is reached through the configured `src/dashboard-worker.js` entry point and loads CSS/JS from `models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/`. Repository ownership is prepared, but production remains unverified.

## 7. Service binding migration list

| Binding | Target | Delegated routes | Fallback | Explicit production routes found? | Status | Required migration |
|---|---|---|---|---|---|---|
| `IMMIGRATE_WORKER` | `immigrate-worker` | `/member/dashboard` | `https://immigrate-worker.malemodel-bkk.workers.dev` | no apex member route in its wrangler; only `sigil.mmdbkk.com/trust/*` | legacy; forbidden expansion | choose a non-legacy member owner, add exact apex/www routes, prove auth/query, then remove binding use |
| `MEMBER_PAGES_WORKER` | `member-pages-worker` | membership/profile/pay/pending/SIGIL membership/renewal on main; LIFF API | `https://member-pages-worker.malemodel-bkk.workers.dev` | no custom routes | plausible but architecture approval required | declare exact page/API routes, reconcile renewal and identity dependencies, verify methods/query/body |
| `ADMIN_WORKER` | `admin-worker` | member payments and rewritten dashboard API | `https://admin-worker.malemodel-bkk.workers.dev` | no custom routes; configured entry point is `src/dashboard-worker.js`, while newer Kenji code is in `src/index.js` | canonical admin API/page owner, wiring contradictory | settle entry point, add exact routes, prove admin/member auth and path rewrite |
| `SIGIL_WORKER` | `sigil-worker` | `/sigil/apply`, private-model apply API | `https://sigil.mmdbkk.com` | deliberately absent; wrangler records a route conflict | canonical SIGIL owner but route-blocked | resolve Cloudflare conflict, add exact routes, prove GET/HEAD/POST/OPTIONS and query/body, then remove binding |

`ADMIN_WORKER` is present in both config and source; it is not merely an environment expectation. No other `[[services]]` binding exists in audited main.

## 8. Headers and observability migration

| Header/marker | Created by | Tests/docs dependence | Retirement treatment |
|---|---|---|---|
| `x-mmd-front-gate` | `withFrontGateHeaders`; inline shells | redirect, LIFF, LINE, SIGIL, member, Hall and generic tests assert it | remove only with each route; absent after final retirement |
| `x-mmd-front-version` | same; inline shells | redirect/SIGIL tests assert current version | replace with owner version/telemetry where useful |
| `x-mmd-route-owner` | `withRouteOwnerHeaders`; Black Card/Hall inline | SIGIL and public-page tests assert it | each canonical Worker emits its own owner; Webflow/redirects need none |
| `x-mmd-page` | route-owner wrapper and inline shells; upstream workers also emit it | many page tests assert page identity | page owner may retain it; never fabricate front-gate ownership |
| `x-mmd-origin` | SIGIL wrapper and public inline pages | SIGIL/Hall tests assert service/fallback origin | replace with owner-local tracing, not public universal metadata |
| `x-mmd-worker` | inline pages/recovery and upstream Workers | page tests use it for debugging/ownership | canonical Worker only; Webflow pages need none |
| `x-mmd-temporary-route` | shared recovery shell | unknown-member/model-console tests assert `true`; Hall asserts absent | delete with recovery shells |
| recovery DOM markers | `data-mmd-page-shell` | polish/recovery tests inspect them | migrate only where the destination page needs its own marker |

Monitoring integrations are not visible in the repository, so external log dashboards, uptime checks, and alert predicates are **PRODUCTION VERIFICATION REQUIRED**. Replacement strategy: propagate/generate request IDs, emit `x-mmd-route-owner` from canonical Workers, use Worker-specific logs/metrics, and do not require fake owner headers on Webflow or Cloudflare redirects.

## 9. Cloudflare production verification requirements

Before any route migration, export or inspect without mutation:

1. Current deployed scripts and versions for all candidate owners.
2. Full zone Worker route order/patterns for apex, www, and SIGIL hosts.
3. Redirect Rules, Rulesets, Bulk Redirects, Page Rules, DNS/proxy state, and origin configuration.
4. Service binding targets and environment variables, especially LINE upstream.
5. Webflow published slugs and response content types.
6. Traffic/log evidence by route, method, status, owner, and upstream; include zero-traffic evidence before deletion.
7. External monitors depending on front-gate headers.
8. Route precedence for chat renewal, booking, partner APIs, SIGIL/admin/board, and catch-alls.

Record account/route identifiers in an approved private operational system, not this repository document.

## 10. Safe phased removal plan

Every PR is small and reversible.

### PR A — Route inventory and deprecation lock (this Phase 1)

- Files: this plan, JSON inventory, `mmd-redirect-worker/README.md`.
- Routes: none changed.
- Tests: JSON parse, Markdown review, front-gate baseline tests, governance validation, diff checks.
- Production verification: none performed; gaps recorded.
- Rollback: revert documentation commit.
- Non-goals: all runtime, route, deploy, Webflow, Cloudflare, identity work.

### PR B — Kenji Knowledge admin exact ownership

- Files: admin-worker handler/tests/wrangler as proven necessary; front-gate handler/tests only after production proof.
- Canonical route: `/sigil/internal/admin/kenji-knowledge`; temporary compatibility alias: `/internal/admin/kenji-knowledge`.
- Tests: GET/HEAD, admin auth, loader asset URLs, content type, query/cookie handling, 404 siblings.
- Production verification: deployed admin entry point, exact route, asset availability, auth, winning owner.
- Rollback: restore previous exact route/handler; do not use catch-all as the long-term rollback.
- Non-goals: other admin routes, board changes, immigrate expansion.

PR B1.2 repository state is `prepared_not_live_verified`: canonical and alias paths share one shell implementation; six canonical patterns are added while six alias patterns remain; route-kind and canonical headers distinguish them. Cloudflare requires each terminating wildcard to match query-bearing URLs, so admin-worker classifies the pathname exactly and uses the proven Route-origin `fetch(request)` behavior for captured non-exact suffixes/subpaths. Those sibling URLs receive the origin response unchanged—not the Kenji shell or admin JSON 404—and same-zone recursion is avoided because `global_fetch_strictly_public` is not enabled. The global catch-alls remain unchanged. Alias removal requires canonical production deploy, authenticated apex/www smokes, API and asset MIME passes, browser acceptance, an observation window, and explicit approval. Do not mark the alias retired before that gate.

### PR C — Public inline pages

- Systems/files: Webflow Black Card/Hall pages; later remove only their front-gate renderers/tests.
- Routes: Black Card aliases and `/hall`.
- Tests: visual/content, query links, HTML type, HEAD, mobile, normal 404 siblings.
- Production verification: published Webflow slugs and routing without front gate.
- Rollback: restore prior specific route to existing Worker during a bounded window.
- Non-goals: generic page Worker, member/payment behavior.

### PR D — Model console alias

- Files: verified canonical console owner route/tests and alias mechanism.
- Routes: `/model/console`, `/sigil/model/console`.
- Tests: signed `t`, all required query parameters, auth, loop prevention, GET/HEAD.
- Production verification: canonical implementation and exact route owner.
- Rollback: restore prior exact alias/recovery route.
- Non-goals: model APIs/session logic changes.

### PR E — Canonical member surfaces

- Files: selected non-legacy owner(s), exact route configs/tests, then front-gate handlers.
- Routes: dashboard, profile, membership, points, payments, sessions, security, required member APIs.
- Tests: auth/cookies, `t`/`code`/`promo`/unknown query, HTML types, unknown member 404, no Memberstack target architecture expansion.
- Production verification: each exact owner and route precedence.
- Rollback: route-by-route restoration to prior verified owner.
- Non-goals: `mmd_member_id` migration, membership/points/payment/session logic change, immigrate expansion.

### PR F — Exact payment, SIGIL, admin, partner, model, LINE owners

- Files: owner configs/tests and only corresponding front-gate handlers after verification.
- Routes: payment APIs/pages, SIGIL apply/booking/board/admin APIs, admin APIs, LINE webhook, partner/model namespaces.
- Tests: POST/OPTIONS/body/signature/auth, JSON content type/404, route precedence, no Webflow 405.
- Production verification: every exact/more-specific owner and observed winner.
- Rollback: restore each prior exact route independently.
- Non-goals: business logic, tokens/secrets, generic namespace claims without implementation.

### PR G — Simple redirects to Cloudflare rules

- Systems: Redirect Rules/Bulk Redirects; later delete source mappings.
- Routes: hosts, legacy exact aliases, folder aliases.
- Tests: query/order/suffix, one-hop/no-loop, unsafe methods not redirected.
- Production verification: rule priority and destination owners.
- Rollback: disable individual rules and restore prior exact behavior.
- Non-goals: page/API proxying or Cloudflare catch-all removal.

### PR H — Remove recovery shells and service bindings

- Files: front-gate source/tests/wrangler bindings after all owners are live.
- Routes: model/member recoveries and all bound delegations.
- Tests: owner-specific smoke matrix and no recovery markers.
- Production verification: sustained successful traffic at canonical owners.
- Rollback: restore one binding/handler at a time during bounded window.
- Non-goals: catch-all detachment or worker deletion.

### PR I — Detach global catch-alls

- Systems: Cloudflare Worker routes only, with explicit approval.
- Routes: `mmdbkk.com/*`, `www.mmdbkk.com/*`, then redundant front-gate specifics.
- Tests: full smoke matrix, logs, Webflow/public 404, namespace JSON 404, no front headers.
- Production verification: live monitoring and route-hit decline/zero; keep Worker deployed but unreachable for rollback window.
- Rollback: reattach exact validated catch-all configuration temporarily.
- Non-goals: Worker/repository deletion.

### PR J — Delete Worker and repository folder

- Files/systems: worker folder, deployment, bindings/secrets, stale tests/docs; preserve one retirement record.
- Routes: none should remain attached.
- Tests: repository governance and zero-traffic evidence.
- Production verification: rollback window complete and zero traffic.
- Rollback: redeploy the last tagged artifact only under incident approval.
- Non-goals: unrelated route ownership or application logic.

## 11. Rollback principles

- Change one route family/owner at a time; never combine catch-all detachment with owner implementation.
- Capture the prior route configuration and deployed artifact before each approved production change.
- Prefer restoring an exact route over reintroducing global ownership.
- Never roll back by expanding `immigrate-worker`, adding a generic page Worker, or weakening auth/body/signature checks.
- Use an explicit observation window and objective error/traffic thresholds. A repository revert alone is not a Cloudflare/Webflow rollback.

## 12. Smoke-test matrix

| Case | Required assertion |
|---|---|
| apex host | HTTPS page/owner correct; no loop |
| www host | one-hop canonical redirect, query preserved |
| canonical public pages | Webflow HTML, expected content, no JSON/front-gate marker |
| legacy aliases | correct destination, query/order/suffix, unsafe method policy |
| member pages | correct owner, auth/cookies, HTML, no recovery shell |
| payment pages | correct owner/type; no automatic renewal rewrite |
| SIGIL pages | exact owner, token/query, no generic proxy |
| admin pages | admin auth, HTML, sibling route isolation |
| LINE webhook POST | signature verified, byte-equivalent body, query preserved, correct status |
| OPTIONS | CORS/status from API owner; never Webflow 405 |
| API JSON | JSON content type for success/error/404 |
| Webflow HTML | HTML content type; never API JSON |
| unknown public | normal Webflow/public 404 |
| unknown API | namespace-owner JSON 404 |
| query preservation | repeated/unknown parameters as contract requires |
| body preservation | method, headers, bytes, content type unchanged through ownership handoff |
| signed token | `t` remains exact and is validated only by canonical owner |
| named query | `code`, `promo`, `payment_ref` survive required redirects/proxies |
| no loop | maximum expected redirect count and canonical terminal URL |
| no front gate | `x-mmd-front-gate` absent after final retirement |

Run the matrix on apex and www where applicable, plus SIGIL host for routes declared there. Capture status, location, content type, owner header, request ID, and deployed version. Do not place real tokens or personal data in test evidence.

## 13. Completion definition

Retirement is complete only when every inventory blocker is closed with evidence; all customer pages, application pages, APIs, webhooks, and redirects have verified explicit owners; unknown public/API behavior matches the architecture lock; bindings and recovery shells are gone; global catch-alls have been detached through an approved monitored change; the Worker has zero traffic through the observation window; deployed Worker/secrets/bindings and repository implementation are removed; and one non-secret retirement record remains.

## 14. Phase 1 files and systems that must not change

Only these files may change in Phase 1:

- `docs/architecture/MMD_REDIRECT_WORKER_RETIREMENT_PLAN_20260720.md`
- `docs/architecture/mmd-redirect-worker-route-inventory-20260720.json`
- `mmd-redirect-worker/README.md`

Do not change runtime source, tests, wrangler files, bindings, routes, DNS, Rulesets/Redirect Rules/Bulk Redirects/Page Rules, secrets, Cloudflare configuration, Webflow, worker deployments, or payment/points/membership/renewal/session/LINE/Telegram/Airtable/auth/profile behavior. Do not merge or delete anything in Phase 1.
