# Phase 1B: Canonical Route And Worker Owner Lock

Status: ready for human review, not final mainline lock.
Base: `origin/main` at `dbc4669`
Input: `docs/architecture/ROUTE_INVENTORY_NORMALIZED.md`

This document records Phase 1B owner decisions for route families. It is
documentation only. It does not deploy Workers, publish Webflow, change
Cloudflare routes, remove aliases, or modify runtime source.

Do not use `PHASE 1 ROUTE OWNERSHIP LOCKED` until this PR is reviewed,
approved, merged, and this document exists on `main`.

## Owner Principles

| Principle | Lock |
| --- | --- |
| Public informational pages | Webflow owns visible UI unless dynamic/authenticated server state is required. |
| Worker pages | Allowed only for proven server-rendered, authenticated, dynamic, or intentionally proxied exact routes. |
| API routes | Owned by the Worker implementing the business contract. |
| Simple redirects | Target owner is Cloudflare Redirect Rules or Bulk Redirects in Phase 6, not new `mmd-redirect-worker` code. |
| `mmd-redirect-worker` | Deprecated front gate. No new canonical ownership. |
| `immigrate-worker` | Legacy or temporary bridge only. No new canonical ownership. |
| Catch-all routes | Never canonical ownership. |
| workers.dev | Never canonical ownership. |
| Aliases | Compatibility only; must point at one canonical route. |
| Frontend truth | Frontend never owns membership, payment, approval, job/session state, model readiness, or admin authorization truth. |
| Member identity target | `mmd_member_id`; do not restore Memberstack as target architecture. |

## Canonical Route Records

| Route family | Canonical candidate | Aliases | Hosts | Methods | Current owner | Current front gate | UI location | Backend owner | Current status | Production verification | Conflicts | Risk | Candidate owner | Confidence | Decision | Compatibility | Migration phase | Acceptance requirements |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public home | `/` | none | apex, www, Webflow | GET, HEAD | Webflow | unknown/current front gate if routed through apex | Webflow | none | UNRESOLVED | not verified in Phase 1B | not in Phase 1A evidence | product IA not normalized | Webflow | LOW | UNRESOLVED | none | Phase 2A | Verify apex/www/Webflow route, headers, and no Worker truth. |
| Public hall | `/hall` | none | apex, www | GET, HEAD | `mmd-redirect-worker` temporary page | `mmd-redirect-worker` | front-gate shell | none | ROUTE ONLY / REDIRECT | not verified in Phase 1B | should be Webflow long-term | catch-all dependency | Webflow | MEDIUM | TEMPORARY | keep current front-gate shell until Webflow owner exists | Phase 2A | Prove Webflow page and canonical redirect before removing shell. |
| Profiles | `/profiles` | none | apex, www, Webflow | GET, HEAD | none proven | unknown | none proven | none | UNRESOLVED | not verified | no implementation evidence | public catalog IA blocked | Webflow or catalog Worker | BLOCKED | UNRESOLVED | none | Phase 2A | Identify existing page/API owner or create approved future task. |
| Companion services | `/services/companion` | none | apex, www, Webflow | GET, HEAD | none proven | unknown | none proven | none | UNRESOLVED | not verified | no implementation evidence | product IA blocked | Webflow | BLOCKED | UNRESOLVED | none | Phase 2A | Prove current route or remove from canonical scope by approval. |
| Booking shortcut | `/booking` | `/sigil/booking` target candidate | apex, www | GET, HEAD | not explicitly proven | likely `mmd-redirect-worker` or Webflow | unknown | none | UNRESOLVED | not verified | canonical target is `/sigil/booking` | stale public shortcut possible | Redirect Rule to `/sigil/booking` | LOW | TEMPORARY | preserve if present | Phase 2B or 6A | Verify current behavior and query policy before redirect rule migration. |
| Public access | `/public/access` | `/sigil/access` product-adjacent | apex, www, Webflow | GET, HEAD | none proven for visible page | unknown | `webflow/sigil/access/*` evidence only | `public-access-worker` implements `POST /public/api/access/intake` with `sigil.mmdbkk.com/public/api/*` route config | API READY / UI MISSING | page not verified; API production smoke pending | visible page route missing; API handler/config proven in repository | public intake must remain evidence-only and cannot grant access | Webflow page, `public-access-worker` API | MEDIUM | TEMPORARY | none | Phase 2A | Prove visible page and live smoke `POST /public/api/access/intake`; unknown `/public/api/*` subpaths must fail closed. |
| SIGIL start | `/sigil/start` | `/trust/inme`, `/inme`, `/login`, `/trust`, `/members` | apex, www | GET, HEAD | partial `immigrate-worker` shell evidence | `mmd-redirect-worker` aliases | `immigrate-worker` shell evidence | none | ROUTE ONLY / REDIRECT | not verified | owner not normalized | legacy shell/catch-all dependency | Webflow | LOW | UNRESOLVED | retain aliases | Phase 2A | Prove exact page owner and query preservation. |
| Trust aliases | `/sigil/start` | `/trust/inme`, `/inme`, `/login`, `/trust`, `/members` | apex, www | GET, HEAD | `mmd-redirect-worker` | `mmd-redirect-worker` | none | none | ROUTE ONLY / REDIRECT | not verified | no Cloudflare Redirect Rule yet | front gate retained | Cloudflare Redirect Rules later | HIGH | TEMPORARY | keep aliases | Phase 6A | Verify canonical `/sigil/start` live before migration/removal. |
| SIGIL access | `/sigil/access` | possible `/public/access` IA | apex, www, Webflow | GET, HEAD | Webflow artifact only | unknown | `webflow/sigil/access/*` | future public access API | UI READY / BACKEND MISSING | not verified | route name conflict with `/public/access` | aftercare redirect in JS must not become truth | Webflow | MEDIUM | TEMPORARY | keep as UI artifact until IA decision | Phase 2A | Verify published route and blocked frontend state writes. |
| Recovery | `/sigil/recovery` | recovery complaint/coupon subroutes | apex, www, Webflow | GET, HEAD, POST for APIs | split evidence | unknown | `immigrate-worker/public/sigil/recovery/*` | `mmd-care-intake-worker` or `sigil-worker` APIs | UNRESOLVED | not verified | duplicate API implementations | private care data exposure if wrong owner | Webflow page plus explicit recovery API Worker | BLOCKED | UNRESOLVED | none | Phase 2A or 6 | Choose one API owner; prove no generic shell. |
| Aftercare | `/sigil/aftercare` | `/aftercare` | apex, www, Webflow | GET, HEAD | none proven | unknown | JS references only | none proven | UNRESOLVED | not verified | no exact implementation evidence | IA only | Webflow | BLOCKED | UNRESOLVED | none | Phase 2A | Prove route exists or defer/remove by approval. |
| Booking page | `/sigil/booking` | `/sigil/booking/`, `/booking` | apex, www, sigil host | GET, HEAD | `sigil-booking-proxy-worker` | direct route config, older front gate not canonical | Webflow page proxied through Worker | `sigil-booking-worker` for APIs | LIVE CONNECTED | registry evidence only; live not reverified here | stale/default page risk | Webflow source must stay current | `sigil-booking-proxy-worker` for route, Webflow for visible UI | HIGH | LOCKED | keep `/booking` if present | Phase 2B | Verify apex/www redirect, sigil host proxy, safe query allowlist, stale marker absence. |
| Booking APIs | `/sigil/api/*` booking subset | none | sigil host | GET, POST | `sigil-booking-worker` implementation only | workers.dev config only; custom-host attachment missing/unverified | none | `sigil-booking-worker` repository handlers | PARTIAL INTEGRATION | not verified; custom-host route attachment absent from `sigil-booking-worker/wrangler.toml` | namespace may include non-booking APIs later; route attachment unproven | API route family broadness; workers.dev must not become canonical production owner | `sigil-booking-worker` handler candidate pending route binding | MEDIUM | UNRESOLVED | none | Phase 2B | Add/prove exact custom-host binding for `/sigil/api/client/resolve`, `/sigil/api/models/search`, and `/sigil/api/booking/intake`; production acceptance must prove methods and fail-closed unknown subpaths. |
| Member login | `/member/login` | none | apex, www | GET, HEAD, POST/API TBD | none proven | unknown | none proven | auth/session owner TBD | UNRESOLVED | not verified | target login contract absent | Memberstack must not return as target | `admin-worker` or auth Worker TBD | BLOCKED | UNRESOLVED | none | Phase 3A | Define `mmd_member_id` login/session contract. |
| Member dashboard | `/member/dashboard` | `/member` | apex, www | GET, HEAD | `immigrate-worker` temporary | `mmd-redirect-worker` | legacy dashboard shell | backend API contract missing: `/v1/member/dashboard` and `/api/member/dashboard` handlers/mapping not proven | UNRESOLVED | page source/config evidence only; API not verified | legacy page dependency; backend API missing/unverified | cannot lock legacy page or nonexistent API as canonical | TBD non-legacy page owner; API owner unresolved | BLOCKED | UNRESOLVED | keep `/member` alias | Phase 3A | Separate page route from API contract; select dashboard owner/auth, implement/prove `/v1/member/dashboard` or approved replacement, and keep `mmd_member_id` target. |
| Member membership | `/member/membership` | `/membership`, benefits aliases | apex, www | GET, HEAD | `member-pages-worker` | `mmd-redirect-worker` | Worker-rendered page | payment APIs separate | LIVE CONNECTED | not live verified here | front gate dependency | page is not payment truth | `member-pages-worker` | HIGH | LOCKED | keep aliases | Phase 3A | Verify query preservation and no auto-renewal redirect. |
| Member payments | `/member/payments` | none | apex, www | GET, HEAD | `admin-worker` currently | `mmd-redirect-worker` | admin/member payment surface | `payments-worker` and `admin-worker` review | UNRESOLVED | not verified | member page vs admin owner ambiguity | exposing admin context to member route | TBD page owner; APIs server-side | BLOCKED | UNRESOLVED | none | Phase 3A/5 | Separate member payment status UI from admin review APIs. |
| Member profile | `/member/profile` | none | apex, www | GET, HEAD | `member-pages-worker` | `mmd-redirect-worker` | Worker-rendered placeholder/status page | member status backend TBD | UI READY / BACKEND MISSING | not verified | status truth not fully defined | profile page may imply active state | `member-pages-worker` temporary | MEDIUM | TEMPORARY | none | Phase 3A | Verify trusted state source before LOCKED. |
| Member points | `/member/points` | none | apex, www | GET, HEAD | none proven | unknown | none | none | UNRESOLVED | not verified | future IA only | points logic protected | TBD | BLOCKED | NOT_IMPLEMENTED | none | Phase 3 | Implement only after approved member points contract. |
| Member sessions | `/member/sessions` | none | apex, www | GET, HEAD | none proven | unknown | none | none | UNRESOLVED | not verified | future IA only | session data sensitive | TBD | BLOCKED | NOT_IMPLEMENTED | none | Phase 3 | Implement only after approved member session contract. |
| Member security | `/member/security` | none | apex, www | GET, HEAD | none proven | unknown | none | none | UNRESOLVED | not verified | future IA only | auth/security sensitive | TBD | BLOCKED | NOT_IMPLEMENTED | none | Phase 3 | Implement only after approved auth/security contract. |
| Member apply canonical | `/sigil/member/apply` | `/member/apply` | apex, www, Webflow | GET, HEAD, POST API separate | Webflow artifact only | unknown | `webflow/member/apply/*` | `/v1/member/applications` missing | UI READY / BACKEND MISSING | not verified | backend absent | member application data cannot rely on frontend | Webflow page plus explicit backend TBD | BLOCKED | UNRESOLVED | keep `/member/apply` alias | Phase 3B | Add/prove backend owner before live lock. |
| Member apply alias | `/member/apply` | target `/sigil/member/apply` | apex, www | GET, HEAD | `mmd-redirect-worker` pass-through | `mmd-redirect-worker` | Webflow pass-through | none | ROUTE ONLY / REDIRECT | not verified | alias currently not canonical | alias may mask missing canonical route | Redirect/pass-through compatibility | MEDIUM | TEMPORARY | keep | Phase 6A | Remove/migrate only after canonical apply route is live. |
| Payment membership page | `/pay/membership` | none | apex, www | GET, HEAD, POST form -> API | `member-pages-worker` | `mmd-redirect-worker` | Worker-rendered payment evidence page | `payments-worker` APIs expected | LIVE CONNECTED | not verified | payment API ownership not fully mapped | proof cannot activate membership | `member-pages-worker` page, `payments-worker` APIs | HIGH | LOCKED | none | Phase 2/7 | Verify evidence submission owner and pending state. |
| Payment pending | `/pay/pending-verification` | none | apex, www | GET, HEAD | `member-pages-worker` | `mmd-redirect-worker` | Worker-rendered pending page | `payments-worker`/admin review | LIVE CONNECTED | not verified | backend pending status API separate | user may infer approval | `member-pages-worker` page | HIGH | LOCKED | none | Phase 2/7 | Verify no activation from proof alone. |
| Renewal canonical | `/sigil/pay/renewal` | `/pay/renewal` | apex, www, sigil host | GET, HEAD | `member-pages-worker` manual legacy safety via front gate; `member-dashboard-chat-worker` renderer candidate | `mmd-redirect-worker` on current repo evidence | manual legacy safety page; renderer candidate unverified | payment/review APIs separate | PARTIAL INTEGRATION | not verified; exact production route owner unresolved | direct chat-worker route config absent in current `member-dashboard-chat-worker/wrangler.toml`; Webflow bridge pending | route precedence and production attachment not proven; renewal UI must not verify payment | `member-dashboard-chat-worker` candidate renderer pending route proof | MEDIUM | TEMPORARY | keep `/pay/renewal` compatibility until audit | Phase 3/7 | Audit exact route config, production winner, GET/HEAD/slash/query behavior, and Webflow bridge before locking owner. |
| Renewal alias | `/pay/renewal` | target `/sigil/pay/renewal` | apex, www, sigil host | GET, HEAD | none proven in current route config; historical chat-worker renderer evidence only | unknown or route precedence outside current front-gate proof | renderer candidate unverified | payment/review APIs separate | UNRESOLVED | not verified; exact production route owner unresolved | alias route lacks direct proof in current `member-dashboard-chat-worker/wrangler.toml` | alias removal or ownership would be unsafe before route audit | `member-dashboard-chat-worker` candidate renderer pending route proof | BLOCKED | UNRESOLVED | keep compatibility until Phase 6 after route proof | Phase 6A | Verify exact route attachment, production winner, query preservation, GET/HEAD/slash behavior, then decide alias owner. |
| SIGIL membership payment | `/sigil/pay/membership` | none | apex, www | GET, HEAD | `member-pages-worker` safety page | `mmd-redirect-worker` never-redirect | Worker safety/fallback page | payment API separate | ROUTE ONLY / REDIRECT | not verified | may be Webflow target later | route lock can be mistaken as final payment owner | `member-pages-worker` temporary lock | MEDIUM | TEMPORARY | none | Phase 2/7 | Decide final membership payment UI/API split. |
| Generic SIGIL pay | `/sigil/pay` | none | apex, www, sigil host | GET, HEAD | none proven | unknown | none | none | UNRESOLVED | not verified | no implementation | must not be invented | none | BLOCKED | NOT_IMPLEMENTED | none | Phase 7 | Do not lock without real implementation. |
| Private model apply page | `/sigil/apply` | `/sigil/apply/` | apex, www | GET, HEAD | `mmd-redirect-worker` delegates to `SIGIL_WORKER`; target handler absent in current `sigil-worker/src/index.js` | `mmd-redirect-worker` | UI/page handler missing or unverified in `sigil-worker` | `sigil-worker` candidate target only | PARTIAL INTEGRATION | not verified; target handler and production route incomplete | front gate delegation without matching target handler | target Worker currently falls through to not_found; private model entry must not lock without handler proof | `sigil-worker` candidate target pending implementation | BLOCKED | UNRESOLVED | slash alias retained only as compatibility | Phase 4A | Implement/prove GET/HEAD handler, slash/query behavior, owner headers, and no stale Telegram brief. |
| Private model apply API | `/sigil/api/private-model/apply` | slash variant | apex, www | POST, OPTIONS | `mmd-redirect-worker` delegates to `SIGIL_WORKER`; target handler absent in current `sigil-worker/src/index.js` | `mmd-redirect-worker` | none | `sigil-worker` candidate target only | PARTIAL INTEGRATION | not verified; target handler and request contract incomplete | front gate delegation without matching target handler | POST/OPTIONS/body preservation cannot be locked until target API exists | `sigil-worker` candidate target pending implementation | BLOCKED | UNRESOLVED | slash alias retained only as compatibility | Phase 4A | Implement/prove POST/OPTIONS handler, auth, body preservation, route attachment, and no Webflow pass-through. |
| Model confirm | `/sigil/apply/private-model-confirm` | model confirmation routes | apex, www, sigil host | GET, POST TBD | none proven | unknown | none proven | admin/model session APIs exist | UNRESOLVED | not verified | incomplete evidence | model identity sensitive | TBD | BLOCKED | UNRESOLVED | none | Phase 4A | Define confirm route contract and owner. |
| Model console canonical | `/sigil/model/console` | `/model/console` | apex, www, sigil host | GET, HEAD | none proven | unknown | none proven | `admin-worker` model session APIs | UNRESOLVED | not verified | current shell is `/model/console` only | contradictory evidence | TBD Worker or Webflow | BLOCKED | UNRESOLVED | keep `/model/console` temporary | Phase 4B | Choose visible console owner; prove auth. |
| Model console legacy | `/model/console` | target `/sigil/model/console` later | apex, www | GET, HEAD | `mmd-redirect-worker` recovery shell | `mmd-redirect-worker` | temporary shell | model session APIs elsewhere | LEGACY | not verified | not canonical | generic recovery shell not valid page | alias/remove later | MEDIUM | REMOVE_LATER | keep until replacement live | Phase 6 | Remove only after canonical console passes acceptance. |
| Model client brief | `/sigil/model/client-brief` | none | sigil host | GET, HEAD | none proven | unknown | none | admin/model session APIs | UNRESOLVED | not verified | no route owner | private brief sensitive | TBD | BLOCKED | UNRESOLVED | none | Phase 4B | Prove route, auth, private data boundaries. |
| Internal admin login | `/internal/admin/login` | `/internal/admin/login/session`, `/sigil/internal/admin/*` legacy redirects | apex, www | GET, HEAD, POST session | `admin-worker` | exact apex/www routes in `admin-worker/wrangler.toml` | admin login page | `admin-worker` signed-session handler | LIVE CONNECTED | source/config verified; live production smoke pending | no broad `/internal/admin/*` route; exact login/session only | admin auth sensitive; cookie security must follow source behavior | `admin-worker` | HIGH | LOCKED | keep legacy SIGIL redirects only where proven | Phase 5A | Live-smoke GET login and POST session without exposing credentials; confirm HMAC-signed HttpOnly Secure SameSite=Lax host-only cookie behavior. |
| Internal admin dashboard | `/internal/admin/dashboard` | none | internal hosts | GET, HEAD | none proven | unknown | none proven | `admin-worker` | UNRESOLVED | not verified | surface owner missing | admin data sensitive | `admin-worker` | BLOCKED | UNRESOLVED | none | Phase 5A | Prove explicit owner and no unsigned cookies. |
| Internal admin create session | `/internal/admin/jobs/create-session` | `/internal/jobs/create-job` | internal hosts | GET, POST | none proven | unknown | none proven | `admin-worker` create job API | UNRESOLVED | not verified | UI route missing | job creation sensitive | `admin-worker` | BLOCKED | UNRESOLVED | none | Phase 5B | Prove UI/API split and audit trail. |
| Kenji Knowledge canonical | `/internal/admin/kenji-knowledge` | `/sigil/internal/admin/kenji-knowledge` legacy compatibility redirect | apex, www | GET, HEAD | `admin-worker` | exact apex/www route config in `admin-worker/wrangler.toml` | admin shell | `admin-worker` readiness APIs | LIVE CONNECTED | source/config verified; live production smoke pending | PR #209 remains separate; SIGIL-prefixed path is legacy redirect, not canonical | do not reverse canonical/legacy relationship | `admin-worker` | HIGH | LOCKED | keep legacy SIGIL redirect until Phase 6 | Phase 5 | Live-smoke canonical GET/HEAD, legacy 308 redirect, query preservation, owner headers, and no broad internal wildcard route. |
| Admin APIs | `/v1/admin/*` | route-level exceptions: `POST /v1/admin/access/grant`; `immigrate-worker` bridge ingress for `/v1/admin/ping`, `/v1/admin/clients/lineage-lookup`, `/v1/admin/clients/recent`, `/v1/admin/models/search`, `/v1/admin/job/draft`, `/v1/admin/create-session`, `/v1/admin/create-job`, `/v1/admin/jobs/create-session`, `/v1/admin/line/push`; `/v1/admin/line/liff-renewal-queue` | API hosts | GET, POST | `admin-worker` default; explicit exceptions keep current owners | direct, proxy, or exception-specific route | none | `admin-worker` default; `auth-worker` owns grant; `immigrate-worker` owns listed legacy/admin-page ingress bridges; member-pages LIFF renewal queue remains exception pending source confirmation | LIVE CONNECTED | bridge routes source/config verified; namespace not fully enumerated here | wildcard can swallow implemented non-admin-worker contracts | admin secrets/auth; route specificity must win over namespace default | `admin-worker` default namespace; `immigrate-worker` bridge only for listed ingress routes | HIGH | LOCKED_DEFAULT_WITH_EXCEPTIONS | exceptions retained until migrated/proxied | Phase 5 | Verify bearer/session/auth per endpoint family and maintain route-level exceptions before any wildcard route migration; `immigrate-worker` bridge ingress may be removed only after direct canonical clients and acceptance migration complete. |
| SIGIL board page | `/sigil/board` | none | sigil host/Webflow | GET, HEAD | Webflow visible surface | none | Webflow | `sigil-board-worker` for APIs | LIVE CONNECTED | registry evidence | must not be swallowed by API Worker | page cannot imply write auth | Webflow | HIGH | LOCKED | none | Phase 5/10 | Verify visible page remains Webflow. |
| SIGIL board APIs | `/sigil/board/runtime`, `/runtime/dry-run`, `/runtime/rollback`, `/actions/*`, `/audit*` | none | sigil host | GET, POST | `sigil-board-worker` | direct route config | none | `sigil-board-worker` | LIVE CONNECTED | registry evidence | POST auth requirements | board control safety | `sigil-board-worker` | HIGH | LOCKED | none | Phase 5/10 | Verify read-only runtime and server-auth POST controls. |

## API Namespace Ownership

| Namespace | Canonical Worker | Access | Auth requirement | Source of truth | Known overlap | Temporary proxy | Target direct route | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/v1/admin/*` | `admin-worker` default owner with explicit route exceptions | internal/admin | `ADMIN_BEARER`, signed session, confirm key, or service binding per endpoint | Admin Worker and backend stores; route-specific exception Workers where documented | admin pages not all normalized; `POST /v1/admin/access/grant` remains `auth-worker`; nine exact `immigrate-worker` admin bridge ingress routes remain temporary exceptions; `/v1/admin/line/liff-renewal-queue` remains non-default/pending source confirmation | possible front gate/service proxy | direct admin route/service binding; exceptions must keep exact owners until migrated/proxied | LOCKED default, exceptions retained |
| `/v1/pay/*` | `payments-worker` | public submit plus internal review | endpoint-specific token/origin/auth | Payments ledger/provider truth | member-pages evidence forms | unknown current proxy | `payments-worker` | TEMPORARY |
| `/v1/payments/*` | `payments-worker` | public/internal depending endpoint | endpoint-specific token/origin/auth | Payments ledger/provider truth | legacy payment routes | unknown current proxy | `payments-worker` | TEMPORARY |
| `/v1/member/*` | unresolved default; route-specific handlers only when proven | member/internal | token `t`, signed session, `mmd_member_id` target after contract exists | trusted Worker state | `/v1/member/applications` missing; `/v1/member/dashboard` handler missing; `/api/member/dashboard` alias mapping unproven | none proven for dashboard API | TBD | UNRESOLVED |
| `/v1/job/*` | `events-worker` or `admin-worker` depending operation | internal/admin | server-side auth | job/session backend | create-job currently in admin-worker | none proven | explicit owner per endpoint | UNRESOLVED |
| `/v1/rt/*` | `realtime-worker` | internal/realtime client | room token / server auth | Durable Object room state | none found | none | `realtime-worker` | LOCKED |
| `/public/api/*` | `public-access-worker` target for implemented intake route | public submit | allowed Origin, form validation, evidence file limits/type allowlist; no automatic access grant | `public-access-worker/src/index.js` and `public-access-worker/wrangler.toml` | only `POST /public/api/access/intake` and OPTIONS are implemented; unknown subpaths fail closed | none | `sigil.mmdbkk.com/public/api/*` route config, live smoke pending | LOCKED for repo implementation, production verification pending |
| `/sigil/api/*` | unknown canonical namespace owner; implemented booking handlers are `sigil-booking-worker` candidate, private-model apply candidate target is `sigil-worker` | public/internal by endpoint | endpoint-specific | SIGIL booking/apply contracts after route attachment is proven | broad route family can collide; private-model apply exact route remains unresolved | `mmd-redirect-worker` for private apply only | explicit route partitions; no workers.dev canonical ownership | UNRESOLVED |
| `/kenji/*` | `chat-worker` target where public AI/access is proven | public/member/internal varies | endpoint-specific | chat/AI backend | Kenji Knowledge admin is separate PR #209 | none | explicit route partitions | UNRESOLVED |
| Telegram endpoints | `telegram-worker` | webhook/internal | Telegram secret token or internal auth | Telegram Bot API and internal message contract | aliases `/v1/webhook`, `/v1/send` | none | `telegram-worker` | LOCKED |
| LINE endpoints | `member-dashboard-chat-worker` for current proven webhook/rich-menu continuity | webhook/internal | LINE signature, internal token/confirm key | LINE event and trusted Worker state | admin rich menu APIs in `admin-worker` | `mmd-redirect-worker` webhook bridge legacy | explicit route partitions | TEMPORARY |
| Generic webhooks | Endpoint-specific Worker | webhook/internal | provider signature | provider event truth | `/webhook/line` aliases | front gate bridge legacy | explicit provider routes | TEMPORARY |

Namespace exception notes:

- `/v1/admin/*` default owner is `admin-worker`; route-level specificity wins before any wildcard migration.
- `POST /v1/admin/access/grant` remains an `auth-worker` exception for the MVP, guarded by `ADMIN_BEARER`, until formally migrated or proxied.
- `/v1/admin/ping`, `/v1/admin/clients/lineage-lookup`, `/v1/admin/clients/recent`, `/v1/admin/models/search`, `/v1/admin/job/draft`, `/v1/admin/create-session`, `/v1/admin/create-job`, `/v1/admin/jobs/create-session`, and `/v1/admin/line/push` are explicit temporary bridge exceptions attached to `immigrate-worker` on apex and www. The bridge forwards cookies plus bridge headers through the `ADMIN_WORKER` binding and strips inbound Authorization. The three create-session/create-job aliases additionally normalize JSON payloads when applicable and target `/v1/admin/job/create`; the other listed admin bridge routes preserve the same path and query for the upstream admin-worker operation. `admin-worker` owns the canonical backend operations, but these ingress routes must not be captured by a wildcard until accepted migration/proxy removal is complete.
- `/v1/admin/line/liff-renewal-queue` remains a non-default exception candidate; current source scan did not find an exact handler, so it must be confirmed before migration, removal, or wildcard capture.
- `/public/api/*` is locked only for the implemented `POST /public/api/access/intake` and OPTIONS behavior in `public-access-worker`; unknown subpaths are not implemented and must fail closed.
- `/sigil/api/*` is partitioned and unresolved at namespace level. `sigil-booking-worker` has repository handlers for `POST /sigil/api/client/resolve`, `GET|POST /sigil/api/models/search`, and `POST /sigil/api/booking/intake`, but its current Wrangler file has `workers_dev = true` and no custom-host `[[routes]]`; `sigil-worker` is only a candidate target for `/sigil/api/private-model/apply` until matching handler and custom route evidence exist.
- `/member/dashboard` is a page route/member surface; `/v1/member/dashboard` is a backend API contract. A working legacy page route does not prove the dashboard API, and current source does not prove `/api/member/dashboard` rewrites to `/v1/member/dashboard`.

## Redirect And Alias Decisions

| Source route | Target route | Redirect type | Query preservation | Host behavior | Current implementation | Target implementation | Keep until | Removal phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `www.*` | apex or canonical host | host canonicalization | preserve full query unless route allowlist says otherwise | www to apex for front-gated routes | `mmd-redirect-worker` | Cloudflare Redirect Rules | all canonical owners proven | Phase 6A |
| `/inme` | `/sigil/start` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | `/sigil/start` live and approved | Phase 6A |
| `/login` | `/sigil/start` or future `/member/login` after auth decision | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule after owner lock | login IA resolved | Phase 6A |
| `/trust` | `/sigil/start` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | `/sigil/start` live and approved | Phase 6A |
| `/trust/inme` | `/sigil/start` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | `/sigil/start` live and approved | Phase 6A |
| `/members` | `/sigil/start` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | `/sigil/start` live and approved | Phase 6A |
| `/member` | `/member/dashboard` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | dashboard owner/auth live | Phase 6A |
| `/membership` | `/member/membership` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | membership page verified | Phase 6A |
| `/membership/benefits` | `/member/membership` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | membership page verified | Phase 6A |
| `/member/membership/benefits` | `/member/membership` | 301 compatibility | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule | membership page verified | Phase 6A |
| `/renew` | `/sigil/membership` | 301 legacy | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule or remove | renewal/membership contracts proven | Phase 6A |
| `/renewal` | `/sigil/membership` | 301 legacy | preserve query | apex/www | `mmd-redirect-worker` | Redirect Rule or remove | renewal/membership contracts proven | Phase 6A |
| `/model/console` | `/sigil/model/console` future | temporary shell now | preserve query in shell links | apex/www | `mmd-redirect-worker` recovery shell | Redirect Rule after replacement | canonical console live | Phase 6B |
| `/sigil/internal/admin/kenji-knowledge` | `/internal/admin/kenji-knowledge` | legacy compatibility redirect | preserve query | apex/www | `admin-worker` 308 redirect from SIGIL-prefixed legacy route | canonical `admin-worker` shell | canonical route live; legacy retained until Phase 6 approval | Phase 6 |
| Black Card aliases | `/blackcard` canonical public review page TBD | compatibility | preserve query | apex/www | `mmd-redirect-worker` public page | Webflow or explicit Worker after decision | Black Card architecture approved | Phase 6 |
| `/old-academy/*` | `/academy/*` | folder redirect | preserve suffix/query | apex/www | `mmd-redirect-worker` | Bulk Redirect | academy owner proven | Phase 6A |
| `/old-trust/*` | `/trust/*` | folder redirect | preserve suffix/query | apex/www | `mmd-redirect-worker` | Bulk Redirect | trust owner proven | Phase 6A |

## Unresolved Table

| Area | Blocker | Required next phase |
| --- | --- | --- |
| `/`, `/profiles`, `/services/companion` | Not proven in Phase 1A evidence. | Phase 2A |
| `/public/access` and `/sigil/access` | UI artifacts exist, but exact visible page route is not proven; `POST /public/api/access/intake` implementation/config owner is `public-access-worker`, live smoke pending. | Phase 2A |
| `/sigil/start` | Alias target exists, but canonical visible owner is not proven. | Phase 2A |
| `/sigil/recovery` | Duplicate recovery API evidence and no normalized visible owner. | Phase 2A or Phase 6 |
| `/sigil/aftercare` | JS reference only, no exact owner. | Phase 2A |
| `/sigil/api/*` booking handlers | Repository handlers exist in `sigil-booking-worker`, but custom-host route attachment and production reachability are missing/unverified. | Phase 2B |
| `/member/login` | Login/session contract not normalized. | Phase 3A |
| `/member/dashboard` | Current legacy `immigrate-worker` dependency cannot be canonical. | Phase 3A |
| `/member/payments` | Current admin-worker page delegation mixes member UI and admin review ownership. | Phase 3A/5 |
| `/sigil/member/apply` | UI exists but `/v1/member/applications` backend owner missing. | Phase 3B |
| `/sigil/pay`, generic | No implementation evidence. | Phase 7 |
| `/sigil/model/console`, `/sigil/model/client-brief` | No exact visible owner; current `/model/console` is legacy shell. | Phase 4B |
| model confirmation routes | Contract/owner not proven. | Phase 4A |
| internal admin visible pages | Admin login and Kenji shell are source/config proven; remaining admin visible pages still need exact route owner locks. | Phase 5A/5B |
| public model apply API overlap | `sigil-worker` and `partners-worker` route families overlap conceptually. | Phase 4 |

## Remove-Later Table

| Item | Current owner | Replacement condition | Removal gate |
| --- | --- | --- | --- |
| `mmd-redirect-worker` catch-all | `mmd-redirect-worker` | Every dependent route has live direct owner or Redirect Rule. | Phase 6 proof sequence and rollback plan. |
| `/model/console` shell | `mmd-redirect-worker` | `/sigil/model/console` live with auth and model session acceptance. | Phase 6 after Phase 4B. |
| trust/login aliases | `mmd-redirect-worker` | `/sigil/start` live and approved. | Phase 6A. |
| membership aliases | `mmd-redirect-worker` | `/member/membership` and dashboard flow live. | Phase 6A. |
| `/renew`, `/renewal` aliases | `mmd-redirect-worker` | Renewal and membership route contracts proven. | Phase 6A. |
| old academy/trust folder redirects | `mmd-redirect-worker` | Destination owners proven. | Phase 6A Bulk Redirect migration. |
| workers.dev fallbacks | multiple Workers | Production routes/service bindings proven. | Per-worker Phase 6 cleanup. |

## Worker Classification

| Worker | Classification | Decision |
| --- | --- | --- |
| `mmd-redirect-worker` | deprecated front gate | No new scope; retire in Phase 6 only. |
| `immigrate-worker` | legacy/temporary bridge | Cannot become canonical owner; member dashboard dependency is blocker. Owns temporary ingress bridge exceptions for the listed exact `/v1/admin/*` admin-page/API routes until direct canonical clients and acceptance migration complete. |
| `admin-worker` | canonical active API owner | Owns default `/v1/admin/*`, model session/admin APIs, exact admin login/session, Kenji Knowledge canonical shell, and canonical backend operations; route-level `/v1/admin/*` exceptions retain current ingress owners until migration/proxy. |
| `member-dashboard-chat-worker` | active LINE worker and renewal renderer candidate | Renewal route ownership is TEMPORARY or UNRESOLVED until exact route attachment and production winner are proven; LINE webhook/rich-menu routes are temporary/proven-only. |
| `member-pages-worker` | canonical active for member membership/payment evidence pages | Does not own payment truth or dashboard truth. |
| `payments-worker` | canonical active payment API target | API map remains TEMPORARY until exact `/v1/pay*` route evidence is enumerated. |
| `sigil-worker` | candidate target for SIGIL apply/private model APIs; active for other implemented APIs | SIGIL apply/private model apply remain UNRESOLVED until matching handlers and route attachment are proven; it is not the canonical current owner of the `/sigil/api/*` namespace. Recovery/public model API overlap still requires future lock. |
| `sigil-booking-proxy-worker` | canonical active page route proxy | Owns `/sigil/booking` route behavior; Webflow owns visible source. |
| `sigil-booking-worker` | booking API implementation owner | Implements current booking API subset under `/sigil/api/*`, but custom-host route ownership is missing/unverified because the current Wrangler file has `workers_dev = true` and no `[[routes]]`. |
| `public-access-worker` | active public access intake API owner | Repo-proven owner for `POST /public/api/access/intake` under `sigil.mmdbkk.com/public/api/*`; production smoke remains pending and unknown subpaths are not implemented. |
| `sigil-board-worker` | canonical active API owner | Owns board runtime/actions/audit. |
| `chat-worker` | active but unresolved for `/kenji/*` | Do not lock Kenji public routes without evidence. |
| `telegram-worker` | canonical active messaging owner | Owns Telegram webhook/internal send. |
| `events-worker` | active but migration pending | Job/events ownership needs exact route lock. |
| `realtime-worker` | canonical active realtime owner | Owns `/v1/rt/*`. |

## Phase Handoff

| Phase | Handoff |
| --- | --- |
| Phase 2A | Verify public Webflow pages, `/public/access`, public access API live smoke, `/sigil/start`, recovery/aftercare route truth. |
| Phase 2B | Verify booking acceptance: apex/www redirect, sigil proxy, safe query allowlist, stale page protection. |
| Phase 3A | Decide member login/dashboard/payments owner with `mmd_member_id` target. |
| Phase 3B | Implement/prove `/sigil/member/apply` backend owner for `/v1/member/applications`. |
| Phase 4A | Implement/prove `/sigil/apply` and private model apply APIs; decide model confirmation route. |
| Phase 4B | Select and prove model console/client brief owner. |
| Phase 5A/5B | Lock admin visible pages and create-session flow. Keep Kenji Knowledge PR #209 separate. |
| Phase 6A/6B | Migrate redirects and retire front gate only after acceptance proof. |

## Status Enum Mapping

Human-readable Markdown labels use spaces and slashes for readability.
JSON uses uppercase underscore machine enums.
The mapping is one-to-one and does not change route meaning.

## Phase 1B Stop Line

Documentation only.
Source/config unchanged.
No deploy.
No Cloudflare route mutation.
No Webflow publish.
No alias removal.
No legacy Worker removal.
