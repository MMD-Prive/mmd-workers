# Route Owner Decision Log

Status: Phase 1B ready for human review.
Base: `origin/main` at `dbc4669`

## Decision Principles Applied

- Webflow is preferred for public information and form surfaces.
- Worker page ownership is locked only with exact route evidence and a server-side reason.
- API ownership follows the Worker implementing the business contract.
- `mmd-redirect-worker` is deprecated and receives no new canonical ownership.
- `immigrate-worker` is legacy/temporary bridge only.
- Aliases stay compatibility-only until Phase 6 approval.
- Catch-all routes and workers.dev fallbacks are never canonical ownership.

## Resolution Matrix

| Conflict | Resolution | Chosen canonical route | Chosen owner | Rejected alternatives | Evidence | Reason | Risk | Implementation phase | Acceptance tests | Rollback dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Booking page owner | RESOLVED | `/sigil/booking` | Route: `sigil-booking-proxy-worker`; UI source: Webflow | `mmd-redirect-worker` catch-all, direct stale Webflow as canonical route owner | `workers/sigil-booking-proxy-worker/*`, existing registry | Exact route config and proxy contract exist. | stale/default Webflow page | Phase 2B | apex/www redirect, sigil proxy, query allowlist, stale markers absent | keep proxy rollback to Webflow source |
| SIGIL apply owner | RESOLVED | `/sigil/apply` | `sigil-worker` via front gate until direct route migration | Webflow fallback, Telegram brief page, catch-all | `mmd-redirect-worker/src/index.js`, registry | Existing owner headers and delegation contract. | front gate dependency | Phase 4A | exact/slash/query, owner headers, no stale Telegram content | keep front gate until direct owner proven |
| Renewal route owner | RESOLVED | `/sigil/pay/renewal` | `member-dashboard-chat-worker` | Webflow stale page, `member-pages-worker` manual legacy safety page | `member-dashboard-chat-worker/wrangler.toml`, renderer | Exact routes and renderer exist. | Webflow bridge still stale outside canonical route | Phase 3/7 | exact/slash/query/HEAD, canonical 200, Webflow bridge redirect | keep `/pay/renewal` alias |
| Membership page owner | RESOLVED | `/member/membership` | `member-pages-worker` | Webflow, admin-worker, payment worker | `member-pages-worker/src/index.js`, `mmd-redirect-worker/src/index.js` | Worker page exists and does not own payment truth. | front gate dependency | Phase 3A | query preservation, no auto-renewal redirect | keep aliases |
| Payment evidence page owner | RESOLVED | `/pay/membership` | Page: `member-pages-worker`; API truth: `payments-worker` target | frontend activation, admin-only page | `member-pages-worker/src/index.js` | UI evidence submission is separate from payment truth. | API owner not fully enumerated | Phase 2/7 | proof does not activate membership; pending page works | keep admin review backend |
| Board page/API split | RESOLVED | `/sigil/board` page, `/sigil/board/runtime*` APIs | Page: Webflow; APIs: `sigil-board-worker` | `sigil-worker`, `immigrate-worker`, catch-all | registry, `workers/sigil-board-worker/*` | Visible route and API routes have different owners. | API Worker swallowing visible page | Phase 5/10 | visible page not JSON; runtime read-only; POST auth | keep Webflow page |
| Trust/login aliases | TEMPORARY_DECISION | `/sigil/start` | TBD Webflow target; current aliases via `mmd-redirect-worker` | independent alias pages | `mmd-redirect-worker/src/index.js` | Canonical visible owner not yet proven. | alias sprawl | Phase 2A then 6A | prove `/sigil/start`, query behavior | keep current aliases |
| Member dashboard owner | BLOCKED | `/member/dashboard` | TBD non-legacy owner | `immigrate-worker` canonical, generic recovery shell | `mmd-redirect-worker/src/index.js`, `immigrate-worker/src/index.ts` | Current owner is legacy bridge. | member status/auth truth risk | Phase 3A | login/session, `mmd_member_id`, dashboard state | retain front gate/legacy until replacement |
| Member application | BLOCKED | `/sigil/member/apply` | UI: Webflow; API owner TBD | `/member/apply` as canonical, frontend-only submission | `webflow/member/apply/*`, no backend route found | Backend `/v1/member/applications` not proven. | application data loss or frontend truth | Phase 3B | POST API, reference, auth/context | keep `/member/apply` alias |
| Recovery APIs | BLOCKED | `/sigil/recovery` family | TBD | simultaneous `mmd-care-intake-worker` and `sigil-worker` ownership | both source files contain recovery handling | Duplicate implementations. | private care data route collision | Phase 2A/6 | choose one owner, status/evidence API tests | do not change routes |
| Public model apply API overlap | BLOCKED | TBD | TBD between `sigil-worker` and `partners-worker` route families | locking both as canonical | `sigil-worker/src/index.js`, `partners-worker/src/index.ts` | Overlapping public-model API concepts. | write/API collision | Phase 4 | exact method/route/API contract tests | retain current routes |
| Generic `/sigil/pay` | DEFERRED_TO_PHASE | none | none | invented page owner | no evidence | No real implementation. | false canonical route | Phase 7 | implementation evidence required | none |
| Model console | BLOCKED | `/sigil/model/console` target | TBD | `/model/console` shell canonical | `mmd-redirect-worker` shell only | Current evidence is legacy shell. | model private data/auth risk | Phase 4B | auth, model session, brief access tests | keep shell until replacement |
| Admin visible pages | BLOCKED | internal route family | `admin-worker` target | migrate to `immigrate-worker`, unsigned cookies | admin API evidence, visible routes incomplete | APIs exist, visible route ownership incomplete. | admin data/auth risk | Phase 5A/5B | signed session, auth, audit | no route changes |
| Kenji Knowledge admin route | DEFERRED_TO_PHASE | `/sigil/internal/admin/kenji-knowledge` | `admin-worker` target | modifying PR #209 here | attachment says PR #209 separate | Separate Phase 5 workstream. | mixing Phase 1 and PR #209 | Phase 5 | PR #209 review/merge separately | keep alias |

## Owner Decisions By Family

| Family | Decision |
| --- | --- |
| Public route family | Mostly UNRESOLVED/TEMPORARY pending Phase 2A evidence; no new owner invented. |
| Booking | `/sigil/booking` LOCKED to `sigil-booking-proxy-worker` route plus Webflow UI source; booking APIs TEMPORARY to `sigil-booking-worker` until exact endpoint acceptance. |
| Member | `/member/membership` LOCKED to `member-pages-worker`; dashboard/login/payments/application remain BLOCKED or UNRESOLVED. |
| Payment | `/pay/membership`, `/pay/pending-verification`, `/sigil/pay/renewal` LOCKED by current evidence; payment API namespaces TEMPORARY to `payments-worker` target until exact enumeration. |
| Model/apply | `/sigil/apply` and `/sigil/api/private-model/apply` LOCKED to `sigil-worker`; console/client brief/confirm routes BLOCKED. |
| Internal/admin | `/v1/admin/*` LOCKED to `admin-worker`; visible admin routes BLOCKED pending Phase 5. |
| SIGIL Board | Visible `/sigil/board` LOCKED to Webflow; runtime/actions/audit LOCKED to `sigil-board-worker`. |
| System APIs | Admin, realtime, Telegram locked; member/job/public/Kenji namespaces have explicit blockers. |

## Stop Line

No runtime implementation was performed.
No route mutation was performed.
No deploy or Webflow publish was performed.

